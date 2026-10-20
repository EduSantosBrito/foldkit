---
'@foldkit/ui': minor
---

Decide Popover, Menu, and Listbox trigger clicks in update using the current Model. When a mouse press and click arrive before the next render, the click does not request a second open. A modal overlay acquires its scroll lock once, and focus leaving the panel can close it.

Trigger clicks dispatch `ClickedButton`. Add this variant to exhaustive Message matches for Popover, Menu, and Listbox. Scene tests that assert the Message emitted by a trigger click must expect `ClickedButton`, including the click following a mouse press. Popover clicks previously emitted `RequestedOpen`, `RequestedClose`, or `IgnoredMouseClick`; Menu and Listbox clicks emitted `Opened`, `Closed`, or `IgnoredMouseClick`.
