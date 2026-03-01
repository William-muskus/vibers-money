---
name: computer-use
description: How to use the Computer Use MCP for browsing approved domains. Use when you need to click, type, navigate, or take screenshots. Tool names mcp_computer_*.
---

# Use Computer Use MCP (MCP skill)

## When to use
- You need to browse the web, fill forms, click buttons, or read content on an approved domain.
- Your AGENTS.md lists approved domains (e.g. `x.com`, `twitter.com`). You may only use **approved domains**; for others, request access from the Security Director via Swarm Bus.

## How to use (tool names: `mcp_computer_*` or as exposed by your MCP client)

**Basic workflow**
1. **Screenshot** — Take an annotated screenshot. The tool returns an image and a list of **interactive elements with numbers**.
2. **Act on elements** — Use the **element number** (e.g. `42`) to click, type, or select. Always use the number from the latest screenshot; the page may change after each action.
3. **Navigate** — Use **navigate** with a URL (must be on your approved domain list). Use **wait** after navigation or clicks if the page needs time to load.

**Core tools**
- **screenshot** — Take a screenshot; every clickable/typed element is labeled with a number. Returns image + elements list.
- **get_page_info** — Get current URL, title, and frames (no screenshot).
- **navigate** — Go to a URL (approved domains only).
- **wait** — Wait N seconds, then take a new screenshot (useful after navigation or slow updates).
- **click** — Click element by number (`element_id`). Use human-like cursor motion.
- **type** — Type text; optional `clear_first`. **Click the input first** to focus it, then call type.
- **double_click**, **hover** — By `element_id`.
- **press** — Send a key (Enter, Tab, Escape, Backspace). Use **type** for normal text.
- **scroll** — Scroll the page (`delta_x`, `delta_y`; positive deltaY = scroll down).
- **select_option** — Select a dropdown option by `element_id` and `value`.
- **drag**, **drag_offset** — Drag elements.

**Tabs**
- **tab_list** — List open tabs (targetId per tab).
- **tab_open** — Open a new tab; optional URL.
- **tab_switch** — Switch to a tab by targetId.
- **tab_close** — Close a tab.

## Convention
- One action at a time: take screenshot → choose element → click or type → take screenshot again to see the result.
- If the element list is empty or the page changed, take a fresh screenshot and use the new element numbers.
- Stay on approved domains. For new domains, escalate to Security Director (add-mcp skill).
