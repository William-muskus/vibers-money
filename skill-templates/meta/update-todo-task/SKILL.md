---
name: update-todo-task
description: Mark a todo complete or refine your list. Use todo_complete when done; to refine, complete the old task and todo_add with updated description. Keep list accurate.
---

# Update Todo Task (meta-skill)

## When to use
- You finished a task — mark it complete so it no longer appears as pending.
- A task is obsolete or no longer relevant — complete it or drop it and document why.
- You need to refine or split a task (e.g. scope changed) — complete the old one and add a new one with the updated description.

## How to use
1. **Mark done**: Call **`todo_complete`** with the task **id** (or the identifier returned when you added it). Use this as soon as you finish the work for that task.
2. **Refine a task**: If the task description no longer fits, call `todo_complete` for the old task, then **`todo_add`** with the new description. Avoid leaving stale or duplicate tasks.
3. **End of cycle**: After working through your list, complete all tasks you finished, add any new ones for follow-up, then report back to your manager.

## Convention
- Update your todo list every cycle: complete what you did, add what you discovered, remove or replace what’s obsolete.
- A clean todo list (no duplicates, no vague items) keeps the next cycle focused. Use this skill to keep the list accurate.
