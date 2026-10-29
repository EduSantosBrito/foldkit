---
'foldkit': minor
'@foldkit/ui': minor
'@foldkit/devtools': minor
'@foldkit/devtools-mcp': minor
'@foldkit/markdown': minor
'@foldkit/node': minor
'@foldkit/vite-plugin': minor
'create-foldkit-app': minor
'@foldkit/oxlint-plugin': patch
---

Upgrade Effect and its browser, Node, and test adapters to `4.1.0`. Update all installed Effect packages together. Packages with exact Effect peers require `4.1.0`, and generated applications use the same version.

Mounts register their per-element fiber before setup starts and suppress Messages after removal. Effect 4.1.0 callback Stream producers register listeners immediately. A live replacement waits for the replay-owned Mount's cleanup before it starts. An acquisition that has already started inside `Effect.acquireRelease` can finish after removal and then releases its resource.

Effect 4.1 replaces the root `Crypto` service with the `effect/crypto` modules. For UUIDs, import `SecureRandom` from `effect/crypto`, acquire `SecureRandom.SecureRandom`, call `uuidV4()`, and provide `SecureRandom.layerWebCrypto` in browser code. The Vite plugin uses `NodeCrypto.layerSecureRandom` for its relay IDs and tokens. Update app code that imports `Crypto` from `effect`.
