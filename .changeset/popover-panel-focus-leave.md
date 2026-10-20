---
'@foldkit/ui': minor
---

A default Popover stays open while focus moves within its panel. It closes when focus leaves the panel, including when focus moves into DevTools. With `contentFocus: true`, the panel has no tab stop and focus leaving it does not close the Popover. The consumer focuses a descendant and handles focus leaving the content.

The panel now handles focus leave instead of blur. Replace `Scene.blur(panel)` with `Scene.focusLeave(panel)` in Scene tests.
