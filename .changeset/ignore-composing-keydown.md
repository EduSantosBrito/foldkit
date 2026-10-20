---
foldkit: patch
---

Allow input methods to confirm Japanese, Chinese, and Korean conversions in Combobox and other views using `OnKeyDown` attributes. Composing keydowns do not call the handler or prevent the browser default. `Subscription.keyBindings` also ignores keydowns reported with `keyCode` 229 and `isComposing` false, preventing shortcuts from intercepting conversion confirmation.
