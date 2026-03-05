---
name: computer-use
description: Complete reference for the Computer Use MCP. Covers all tools — screenshot, navigation, clicking, typing, keyboard, scrolling, drag, tabs. Tool names are mcp_computer_use_* (server name "computer-use").
---

# Computer Use MCP — Complete Reference

The Computer Use MCP gives you a real Chrome browser. You can navigate websites, read content, fill forms, and interact with UI elements — **only on approved domains**.

Tool prefix: `mcp_computer_use_*` (server name: `computer-use`).

---

## Core workflow (always follow this loop)

1. **`mcp_computer_use_screenshot`** — see the current page. Every interactive element is labeled with a number.
2. **Choose the element** by its number from the list returned.
3. **Act** — click, type, press, scroll, etc. — using that number.
4. **`mcp_computer_use_screenshot`** again to verify the result before the next action.

> One action at a time. Never guess element IDs — always take a fresh screenshot if the page changed.

---

## Vision

### `mcp_computer_use_screenshot`
Take an annotated screenshot of the current page.
```
(no parameters)
```
Returns: `{ image, url, title, elements: [{ id, tag, text, role, ... }] }`

Every interactive element (links, buttons, inputs, selects, checkboxes…) gets a unique number. Use that number for all subsequent actions.

### `mcp_computer_use_get_page_info`
Get current URL, title, and frames — no screenshot.
```
(no parameters)
```
Returns: `{ url, title, frames }`.

---

## Navigation

### `mcp_computer_use_navigate`
Go to a URL. Waits ~1.5 s then returns an annotated screenshot.
```
url: string   # full URL, e.g. "https://x.com" — must be on your approved domain list
```
Returns: same as `screenshot`.

> If the URL is not on your approved domain list, the call is rejected. To request access to a new domain, escalate to the Security Director (see **add-mcp** skill or **request-mcp** skill).

### `mcp_computer_use_wait`
Wait N seconds, then take a new annotated screenshot. Use after navigation or slow UI updates.
```
seconds?: number   # default 2
```
Returns: same as `screenshot`.

---

## Interaction

### `mcp_computer_use_click`
Click an element by its annotation number. Uses human-like Bezier cursor motion.
```
element_id: number   # number from the screenshot elements list
```
Returns: annotated screenshot after the click.

### `mcp_computer_use_type`
Type text with human-like key timing. **Click the input first** to focus it, then call type.
```
text: string           # text to enter
clear_first?: boolean  # clear the field before typing (default false)
```
Returns: annotated screenshot after typing.

### `mcp_computer_use_double_click`
Double-click an element.
```
element_id: number
```
Returns: annotated screenshot.

### `mcp_computer_use_hover`
Move the mouse over an element (trigger tooltips, hover menus, etc.).
```
element_id: number
```
Returns: annotated screenshot.

### `mcp_computer_use_press`
Press a special key. Use `type` for regular text; use `press` for control keys.
```
key: string   # e.g. "Enter", "Tab", "Escape", "Backspace", "ArrowDown", "ArrowUp"
```
Returns: annotated screenshot.

### `mcp_computer_use_scroll`
Scroll the page by pixel delta. Positive `delta_y` = scroll down.
```
delta_x?: number   # horizontal scroll (default 0)
delta_y?: number   # vertical scroll (default 300)
```
Returns: annotated screenshot.

### `mcp_computer_use_select_option`
Select a dropdown option in a `<select>` element.
```
element_id: number   # annotation number of the <select> element
value: string        # option value attribute to select
```
Returns: annotated screenshot.

### `mcp_computer_use_drag`
Drag from one element to another.
```
from_element_id: number
to_element_id: number
```
Returns: annotated screenshot.

### `mcp_computer_use_drag_offset`
Drag an element by a pixel offset from its current position.
```
element_id: number
delta_x: number
delta_y: number
```
Returns: annotated screenshot.

---

## Tabs

Each agent gets its own isolated browser context. You can open multiple tabs.

### `mcp_computer_use_tab_list`
List your open tabs.
```
(no parameters)
```
Returns: `{ tabs: [{ targetId, ... }] }`.

### `mcp_computer_use_tab_open`
Open a new tab, optionally navigating to a URL (must be on approved domain list).
```
url?: string   # optional — navigate immediately after opening
```
Returns: `{ targetId, image, url, title, elements }`.

### `mcp_computer_use_tab_switch`
Switch the active tab.
```
target_id: string   # targetId from tab_list
```
Returns: annotated screenshot of the switched-to tab.

### `mcp_computer_use_tab_close`
Close a tab.
```
target_id: string   # targetId from tab_list
```

---

## Conventions

- **Approved domains only.** Your `AGENTS.md` lists allowed domains. Never attempt to navigate elsewhere; the call will fail. To request a new domain, use the `request-mcp` skill or escalate to the Security Director.
- **Always screenshot before acting.** Element IDs change whenever the page re-renders; never reuse an old ID without a fresh screenshot.
- **Prefer `type` over `press`** for text. Use `press` only for non-character keys (Enter, Tab, Escape, etc.).
- **After navigation or slow transitions**, call `mcp_computer_use_wait` with a few seconds before interacting.
- **Captchas**: use the `solve-captcha` skill when you encounter a CAPTCHA.
