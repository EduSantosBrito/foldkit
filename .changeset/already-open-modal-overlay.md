---
'@foldkit/ui': patch
---

Opening an already open Popover, Menu, Listbox, or Combobox returns the current Model without Commands. Popover emits no additional `Opened` OutMessage; Menu and Listbox preserve the typeahead query and active item. For modal overlays, this prevents repeated locks from leaving the page scroll-locked after one close.
