import { Context, Effect, Function, Queue, Stream } from 'effect'
import { afterEach, beforeEach, expect, vi } from 'vitest'

import { describe, it } from '@effect/vitest'

import { defineMessageUnion } from '../message/index.js'
import * as Mount from '../mount/index.js'
import type { MountAction } from '../mount/index.js'
import { MountTracker } from '../mount/index.js'
import { propsModule } from '../propsModule.js'
import { noOpDispatch } from '../runtime/crashUI.js'
import { Dispatch } from '../runtime/index.js'
import {
  attributesModule,
  classModule,
  datasetModule,
  eventListenersModule,
  init,
  styleModule,
  toVNode,
} from '../snabbdom/index.js'
import type { VNode } from '../vdom.js'
import {
  __htmlBuilder,
  __clearRuntime as clearHtmlRuntime,
  __setRuntime as setHtmlRuntime,
} from './index.js'
import type { MountRenderOwner } from './runtimeSingleton.js'

const patch = init([
  attributesModule,
  classModule,
  datasetModule,
  eventListenersModule,
  propsModule,
  styleModule,
])

const Message = defineMessageUnion({
  MountedRoot: {},
})

const WAIT_FOR_INTERRUPT_PROPAGATION_MS = 50

/** Test fixture that constructs a Mounted MountAction directly with a custom
 *  Stream factory. Each test wires up its own factory body, so the production
 *  `Mount.define` shape (which binds one `execute` at definition time) doesn't
 *  fit. The runtime only reads `name`, `args`, and `f` from a MountAction. */
const makeMounted = <E = never>(
  f: (element: Element) => Stream.Stream<typeof Message.MountedRoot.Type, E>,
): MountAction<typeof Message.MountedRoot.Type, E> => ({ name: 'Mounted', f })

/** Helper that builds the canonical one-shot-with-cleanup Stream for a Mount
 *  using `Stream.callback` + `Effect.acquireRelease`. Emits the Message once,
 *  registers the cleanup, and keeps the stream's scope open until interrupted. */
const oneShotStream = (
  cleanup: () => void = () => {},
): Stream.Stream<typeof Message.MountedRoot.Type> =>
  Stream.callback<typeof Message.MountedRoot.Type>(queue =>
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => {
          Queue.offerUnsafe(queue, Message.MountedRoot())
        }),
        () => Effect.sync(cleanup),
      )
      return yield* Effect.never
    }),
  )

const createCapturingDispatch = () => {
  const dispatched: Array<unknown> = []
  const dispatch = Dispatch.of({
    dispatchAsync: () => Effect.void,
    dispatchSync: message => {
      dispatched.push(message)
    },
  })
  return { dispatch, dispatched }
}

const renderView = (
  buildView: () => VNode | null,
  dispatch: typeof Dispatch.Service,
  mountRenderOwner: MountRenderOwner = 'Live',
): VNode => {
  const testContext = Context.make(Dispatch, dispatch).pipe(
    Context.add(MountTracker, {
      started: () => {},
      ended: () => {},
    }),
  )

  setHtmlRuntime(
    dispatch.dispatchSync,
    testContext,
    undefined,
    mountRenderOwner,
  )
  let vnode: VNode | null
  try {
    vnode = buildView()
  } finally {
    clearHtmlRuntime()
  }
  if (vnode === null) {
    throw new Error('renderView received a null VNode')
  }
  return vnode
}

const makeRootContainer = (): HTMLElement => document.createElement('div')

describe('OnMount', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('dispatches a synchronous Stream result during insertion', () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()

    const EmitMounted = Mount.defineStream('EmitMounted', {
      messages: [Message.MountedRoot],
      execute: () => Stream.succeed(Message.MountedRoot()),
    })
    const view = () => h.div([], [h.span([h.OnMount(EmitMounted())])])
    const vnode = renderView(view, dispatch)

    patch(toVNode(makeRootContainer()), vnode)

    expect(dispatched).toStrictEqual([Message.MountedRoot()])
  })

  it('does not dispatch the emitted Message when rendered with a no-op dispatch', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    let streamRan = false

    const view = () =>
      h.div(
        [],
        [
          h.span([
            h.OnMount(
              makeMounted(() => {
                streamRan = true
                return oneShotStream()
              }),
            ),
          ]),
        ],
      )
    const vnode = renderView(view, Dispatch.of(noOpDispatch))

    patch(toVNode(makeRootContainer()), vnode)

    await vi.waitFor(() => {
      expect(streamRan).toBe(true)
    })
  })

  it('contains synchronous Stream factory failures inside the Mount fiber', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch } = createCapturingDispatch()

    const view = () =>
      h.div(
        [],
        [
          h.span([
            h.OnMount(
              makeMounted(() => {
                throw new Error('Stream factory failed')
              }),
            ),
          ]),
        ],
      )
    const vnode = renderView(view, dispatch)

    expect(() => patch(toVNode(makeRootContainer()), vnode)).not.toThrow()
    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledOnce()
    })
  })

  it('passes the inserted Element into the Stream factory', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    const seenIds: Array<string> = []

    const view = () =>
      h.div(
        [],
        [
          h.span([
            h.Id('mounted'),
            h.OnMount(
              makeMounted(element => {
                seenIds.push(element.id)
                return oneShotStream()
              }),
            ),
          ]),
        ],
      )
    const vnode = renderView(view, dispatch)

    patch(toVNode(makeRootContainer()), vnode)

    await vi.waitFor(() => {
      expect(dispatched).toStrictEqual([Message.MountedRoot()])
    })
    expect(seenIds).toStrictEqual(['mounted'])
  })

  it('dispatches every Message a streaming Stream emits over the element lifetime', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()

    const view = () =>
      h.div(
        [],
        [
          h.span([
            h.OnMount(
              makeMounted(() =>
                Stream.fromIterable([
                  Message.MountedRoot(),
                  Message.MountedRoot(),
                  Message.MountedRoot(),
                ]),
              ),
            ),
          ]),
        ],
      )
    const vnode = renderView(view, dispatch)

    patch(toVNode(makeRootContainer()), vnode)

    await vi.waitFor(() => {
      expect(dispatched).toStrictEqual([
        Message.MountedRoot(),
        Message.MountedRoot(),
        Message.MountedRoot(),
      ])
    })
  })

  it('dispatches async events from a listener attached inside acquireRelease and detaches on destroy', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    let listenerAttached = false
    let listenerDetached = false
    let externalEmit: () => void = Function.constVoid

    const ListenForMountEvents = Mount.defineStream('ListenForMountEvents', {
      messages: [Message.MountedRoot],
      execute: () =>
        Stream.callback<typeof Message.MountedRoot.Type>(queue =>
          Effect.gen(function* () {
            yield* Effect.acquireRelease(
              Effect.sync(() => {
                listenerAttached = true
                externalEmit = () =>
                  Queue.offerUnsafe(queue, Message.MountedRoot())
              }),
              () =>
                Effect.sync(() => {
                  listenerDetached = true
                  externalEmit = Function.constVoid
                }),
            )
            return yield* Effect.never
          }),
        ),
    })

    const withChild = () =>
      h.div([], [h.span([h.OnMount(ListenForMountEvents())])])
    const withoutChild = () => h.div([])

    const mounted = patch(
      toVNode(makeRootContainer()),
      renderView(withChild, dispatch),
    )

    expect(listenerAttached).toBe(true)

    externalEmit()
    externalEmit()
    externalEmit()

    await vi.waitFor(() => {
      expect(dispatched).toHaveLength(3)
    })

    patch(mounted, renderView(withoutChild, dispatch))

    await vi.waitFor(() => {
      expect(listenerDetached).toBe(true)
    })

    externalEmit()
    await new Promise(resolve =>
      setTimeout(resolve, WAIT_FOR_INTERRUPT_PROPAGATION_MS),
    )
    expect(dispatched).toHaveLength(3)
  })

  it('runs the cleanup when the element is removed by a key change', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    let cleanupCalls = 0

    const buildView = (key: string) => () =>
      h.div(
        [],
        [
          h.span([
            h.Key(key),
            h.OnMount(
              makeMounted(() =>
                oneShotStream(() => {
                  cleanupCalls += 1
                }),
              ),
            ),
          ]),
        ],
      )

    const firstVNode = renderView(buildView('a'), dispatch)
    const mounted = patch(toVNode(makeRootContainer()), firstVNode)

    await vi.waitFor(() => {
      expect(dispatched).toHaveLength(1)
    })
    expect(cleanupCalls).toBe(0)

    const secondVNode = renderView(buildView('b'), dispatch)
    patch(mounted, secondVNode)

    await vi.waitFor(() => {
      expect(cleanupCalls).toBe(1)
    })
  })

  it('runs the cleanup when the element is removed by a parent re-render', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    let cleanupCalls = 0

    const withChild = () =>
      h.div(
        [],
        [
          h.span([
            h.OnMount(
              makeMounted(() =>
                oneShotStream(() => {
                  cleanupCalls += 1
                }),
              ),
            ),
          ]),
        ],
      )
    const withoutChild = () => h.div([])

    const mounted = patch(
      toVNode(makeRootContainer()),
      renderView(withChild, dispatch),
    )

    await vi.waitFor(() => {
      expect(dispatched).toHaveLength(1)
    })

    patch(mounted, renderView(withoutChild, dispatch))

    await vi.waitFor(() => {
      expect(cleanupCalls).toBe(1)
    })
  })

  it('logs a failing Stream and dispatches nothing', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()

    const view = () =>
      h.div(
        [],
        [
          h.span([
            h.OnMount(
              makeMounted(() =>
                Stream.fromEffect(Effect.fail(new Error('boom'))),
              ),
            ),
          ]),
        ],
      )
    const vnode = renderView(view, dispatch)

    patch(toVNode(makeRootContainer()), vnode)

    await vi.waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        '[OnMount Mounted] unhandled failure',
        expect.anything(),
      )
    })
    expect(dispatched).toStrictEqual([])
  })

  it('runs exactly once across repeated patches of the same element', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    let streamRunCount = 0
    let cleanupRunCount = 0

    const buildView = () => () =>
      h.div(
        [],
        [
          h.span([
            h.OnMount(
              makeMounted(() => {
                streamRunCount += 1
                return oneShotStream(() => {
                  cleanupRunCount += 1
                })
              }),
            ),
          ]),
        ],
      )

    const firstVNode = renderView(buildView(), dispatch)
    const mounted = patch(toVNode(makeRootContainer()), firstVNode)

    await vi.waitFor(() => {
      expect(dispatched).toHaveLength(1)
    })

    const secondVNode = renderView(buildView(), dispatch)
    const afterSecond = patch(mounted, secondVNode)

    const thirdVNode = renderView(buildView(), dispatch)
    patch(afterSecond, thirdVNode)

    await vi.waitFor(() => {
      expect(streamRunCount).toBe(1)
    })
    expect(dispatched).toStrictEqual([Message.MountedRoot()])
    expect(cleanupRunCount).toBe(0)
  })

  it('releases a replay Mount before acquiring its live replacement through a controlled-property postpatch', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    const lifecycle: Array<string> = []
    const releaseReplay = await Effect.runPromise(Queue.unbounded<void>())

    const makeOwnedMount = (
      owner: MountRenderOwner,
    ): MountAction<typeof Message.MountedRoot.Type> =>
      Mount.defineStream('AcquireOwnedMount', {
        messages: [Message.MountedRoot],
        execute: () =>
          Stream.callback<typeof Message.MountedRoot.Type>(queue =>
            Effect.gen(function* () {
              yield* Effect.acquireRelease(
                Effect.sync(() => lifecycle.push(`${owner} acquired`)),
                () =>
                  Effect.gen(function* () {
                    if (owner === 'Replay') {
                      yield* Queue.take(releaseReplay)
                    }
                    yield* Effect.sync(() => {
                      lifecycle.push(`${owner} released`)
                    })
                  }),
              )
              if (owner === 'Live') {
                Queue.offerUnsafe(queue, Message.MountedRoot())
              }
              return yield* Effect.never
            }),
          ),
      })()

    const replayVNode = renderView(
      () => h.input([h.Value('replay'), h.OnMount(makeOwnedMount('Replay'))]),
      Dispatch.of(noOpDispatch),
      'Replay',
    )
    const mounted = patch(toVNode(makeRootContainer()), replayVNode)

    await vi.waitFor(() => {
      expect(lifecycle).toEqual(['Replay acquired'])
    })
    const replayElement = mounted.elm

    const liveVNode = renderView(
      () => h.input([h.Value('live'), h.OnMount(makeOwnedMount('Live'))]),
      dispatch,
    )
    const live = patch(mounted, liveVNode)

    expect(lifecycle).toEqual(['Replay acquired'])
    expect(dispatched).toEqual([])
    Queue.offerUnsafe(releaseReplay, undefined)

    await vi.waitFor(() => {
      expect(lifecycle).toEqual([
        'Replay acquired',
        'Replay released',
        'Live acquired',
      ])
      expect(dispatched).toEqual([Message.MountedRoot()])
    })
    expect(live.elm).toBe(replayElement)
    if (!(live.elm instanceof HTMLInputElement)) {
      throw new Error('Expected the live Mount host to be an input')
    }
    expect(live.elm.value).toBe('live')
  })

  it('does not acquire the live replacement when the element unmounts during replay cleanup', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch } = createCapturingDispatch()
    const cleanupGate = await Effect.runPromise(Queue.unbounded<void>())
    let isReplayAcquired = false
    let isCleanupStarted = false
    let isLiveAcquired = false

    const replayMount = makeMounted(() =>
      Stream.callback<typeof Message.MountedRoot.Type>(() =>
        Effect.acquireRelease(
          Effect.sync(() => {
            isReplayAcquired = true
          }),
          () =>
            Effect.sync(() => {
              isCleanupStarted = true
            }).pipe(Effect.andThen(Queue.take(cleanupGate))),
        ).pipe(Effect.andThen(Effect.never)),
      ),
    )
    const liveMount = makeMounted(() =>
      Stream.callback<typeof Message.MountedRoot.Type>(() =>
        Effect.sync(() => {
          isLiveAcquired = true
        }).pipe(Effect.andThen(Effect.never)),
      ),
    )
    const withMount = (mount: MountAction<typeof Message.MountedRoot.Type>) =>
      h.div([], [h.span([h.OnMount(mount)])])

    const replayVNode = renderView(
      () => withMount(replayMount),
      Dispatch.of(noOpDispatch),
      'Replay',
    )
    const mounted = patch(toVNode(makeRootContainer()), replayVNode)
    await vi.waitFor(() => {
      expect(isReplayAcquired).toBe(true)
    })

    const awaitingCleanup = patch(
      mounted,
      renderView(() => withMount(liveMount), dispatch),
    )
    await vi.waitFor(() => {
      expect(isCleanupStarted).toBe(true)
    })
    expect(isLiveAcquired).toBe(false)

    patch(
      awaitingCleanup,
      renderView(() => h.div([]), dispatch),
    )
    Queue.offerUnsafe(cleanupGate, undefined)
    await new Promise(resolve =>
      setTimeout(resolve, WAIT_FOR_INTERRUPT_PROPAGATION_MS),
    )

    expect(isLiveAcquired).toBe(false)
  })

  it('releases the replacement and suppresses its result when setup synchronously removes the host', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    let removeHost = Function.constVoid
    let releaseCount = 0
    const ReplayMount = Mount.defineStream('ReplayMount', {
      messages: [Message.MountedRoot],
      execute: () => Stream.never,
    })
    const LiveMount = Mount.defineStream('LiveMount', {
      messages: [Message.MountedRoot],
      execute: () =>
        Stream.callback<typeof Message.MountedRoot.Type>(queue =>
          Effect.gen(function* () {
            yield* Effect.acquireRelease(
              Effect.sync(() => removeHost()),
              () =>
                Effect.sync(() => {
                  releaseCount += 1
                }),
            )
            Queue.offerUnsafe(queue, Message.MountedRoot())
            return yield* Effect.never
          }),
        ),
    })
    const withMount = (mount: MountAction<typeof Message.MountedRoot.Type>) =>
      h.div([], [h.span([h.OnMount(mount)])])
    const mounted = patch(
      toVNode(makeRootContainer()),
      renderView(
        () => withMount(ReplayMount()),
        Dispatch.of(noOpDispatch),
        'Replay',
      ),
    )
    removeHost = () => {
      patch(
        mounted,
        renderView(() => h.div([]), dispatch),
      )
    }

    patch(
      mounted,
      renderView(() => withMount(LiveMount()), dispatch),
    )

    await vi.waitFor(() => {
      expect(releaseCount).toBe(1)
    })
    expect(dispatched).toEqual([])
  })

  it.each([false, true])(
    'releases only started acquisition after removal (isAcquireStarted: %s)',
    async isAcquireStarted => {
      const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
      const { dispatch, dispatched } = createCapturingDispatch()
      let cleanupCalls = 0
      let acquireCompleted = false
      let acquireStarted = false
      let setupStarted = false

      let resolveAcquire: (value: void) => void = Function.constVoid
      const acquireGate = new Promise<void>(resolve => {
        resolveAcquire = resolve
      })

      const AcquireResource = Mount.defineStream('AcquireResource', {
        messages: [Message.MountedRoot],
        execute: () =>
          Stream.callback<typeof Message.MountedRoot.Type>(queue =>
            Effect.gen(function* () {
              setupStarted = true
              if (!isAcquireStarted) {
                yield* Effect.promise(() => acquireGate)
              }
              yield* Effect.acquireRelease(
                Effect.promise(() => {
                  acquireStarted = true
                  return acquireGate
                }).pipe(
                  Effect.map(() => {
                    acquireCompleted = true
                    Queue.offerUnsafe(queue, Message.MountedRoot())
                  }),
                ),
                () =>
                  Effect.sync(() => {
                    cleanupCalls += 1
                  }),
              )
              return yield* Effect.never
            }),
          ),
      })

      const withChild = () =>
        h.div([], [h.span([h.OnMount(AcquireResource())])])
      const withoutChild = () => h.div([])

      const mounted = patch(
        toVNode(makeRootContainer()),
        renderView(withChild, dispatch),
      )
      await vi.waitFor(() => {
        expect(setupStarted).toBe(true)
        expect(acquireStarted).toBe(isAcquireStarted)
      })
      patch(mounted, renderView(withoutChild, dispatch))

      resolveAcquire()

      await new Promise(resolve =>
        setTimeout(resolve, WAIT_FOR_INTERRUPT_PROPAGATION_MS),
      )

      expect(acquireCompleted).toBe(isAcquireStarted)
      expect(acquireStarted).toBe(isAcquireStarted)
      expect(cleanupCalls).toBe(isAcquireStarted ? 1 : 0)
      expect(dispatched).toStrictEqual([])
    },
  )

  it('Mount.define wraps an Effect: dispatches the result Message and holds the scope open until destroy for acquireRelease finalizers', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    let acquired = false
    let released = false

    const WrappedEffect = Mount.define('WrappedEffect', {
      messages: [Message.MountedRoot],
      execute: () =>
        Effect.gen(function* () {
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              acquired = true
            }),
            () =>
              Effect.sync(() => {
                released = true
              }),
          )
          return Message.MountedRoot()
        }),
    })

    const withChild = () => h.div([], [h.span([h.OnMount(WrappedEffect())])])
    const withoutChild = () => h.div([])

    const mounted = patch(
      toVNode(makeRootContainer()),
      renderView(withChild, dispatch),
    )

    await vi.waitFor(() => {
      expect(dispatched).toStrictEqual([Message.MountedRoot()])
    })
    expect(acquired).toBe(true)
    expect(released).toBe(false)

    patch(mounted, renderView(withoutChild, dispatch))

    await vi.waitFor(() => {
      expect(released).toBe(true)
    })
  })

  it('runs cleanup on unmount even after multiple re-renders', async () => {
    const h = __htmlBuilder<typeof Message.MountedRoot.Type>()
    const { dispatch, dispatched } = createCapturingDispatch()
    let cleanupRunCount = 0

    const withChild = () =>
      h.div(
        [],
        [
          h.span([
            h.OnMount(
              makeMounted(() =>
                oneShotStream(() => {
                  cleanupRunCount += 1
                }),
              ),
            ),
          ]),
        ],
      )
    const withoutChild = () => h.div([])

    const mounted = patch(
      toVNode(makeRootContainer()),
      renderView(withChild, dispatch),
    )

    await vi.waitFor(() => {
      expect(dispatched).toHaveLength(1)
    })

    const afterSecond = patch(mounted, renderView(withChild, dispatch))
    const afterThird = patch(afterSecond, renderView(withChild, dispatch))

    patch(afterThird, renderView(withoutChild, dispatch))

    await vi.waitFor(() => {
      expect(cleanupRunCount).toBe(1)
    })
  })
})
