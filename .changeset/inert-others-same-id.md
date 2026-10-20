---
'foldkit': patch
---

Fix elements remaining inert after `Dom.restoreInert` when `Dom.inertOthers` is called repeatedly with the same id. Each repeated call acquires the replacement isolation before releasing the previous one, so shared elements keep `inert` and `aria-hidden` throughout. One restore releases that id's isolation.
