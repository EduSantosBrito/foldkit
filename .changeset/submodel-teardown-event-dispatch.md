---
'foldkit': patch
---

Fix `dispatchAcrossBoundary missing wrap` when a focused element is removed during Submodel teardown. Boundary wrapping remains available while the subtree's destroy hooks run, allowing `blur` and other teardown events to reach `update`. This covers a focused, portaled Popover panel that closes while its Submodel is removed.
