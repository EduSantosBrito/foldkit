---
'@foldkit/ui': patch
---

Remove an empty shared portal root when an overlay closes. A later modal Popover, Menu, Listbox, or Combobox then creates a fresh root, keeping its panel focusable and available to pointer input and assistive technology. If another portaled element occupies the root when a modal overlay opens, the root can still become inert; this change covers reopen flows where the root becomes empty.
