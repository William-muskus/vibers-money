---
name: create-todo-task
description: Add a new task to your todo list. Use when you identify new work, receive a directive, or break down a goal. Call todo_add with one clear description per task.
---

# Create Todo Task (meta-skill)

## When to use
- You identify new work that should be tracked across cycles.
- You receive a directive (from CEO, manager, or macro objectives) that needs a concrete task.
- You break down a goal into an actionable item.

## How to use
1. Call **`todo_add`** with a **description**: one clear, actionable sentence (e.g. "Draft security policy v1", "Create first content calendar for Q1").
2. One task per call. If you have several items, call `todo_add` once per item.
3. Keep descriptions short and outcome-focused so the next cycle (or you later) knows what "done" looks like.

## Convention
- Create todos at the start of a cycle (from messages or macro objectives) and whenever new work emerges mid-cycle.
- Your todo list is the single source of truth; creating a task here ensures it gets worked through in a future cycle.
- Prefer 3–7 high-impact tasks; avoid vague or duplicate entries.
