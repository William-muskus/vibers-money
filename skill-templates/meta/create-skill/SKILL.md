---
name: create-skill
description: Create a new skill in .vibe/skills/<name>/SKILL.md when you need a repeatable workflow not covered by existing skills. Use write_file and standard skill format.
---

# Create Skill (meta-skill)

## When to use
- You need a new capability that isn't covered by existing skills.
- Your mission requires a repeatable workflow (e.g. post-tweet, write landing copy, analyze competitors).

## How to use
1. Create a new file under `.vibe/skills/<skill-name>/SKILL.md`.
2. Use the standard skill format:
   - **Title**: Short name of the skill.
   - **When to use**: Conditions under which this skill applies.
   - **How to use**: Step-by-step instructions (tools, MCP calls, file paths).
   - **Convention**: Any team or business conventions to follow.

3. Write in clear Markdown. Reference tools by their MCP names (e.g. `mcp_swarm_send_message`, `mcp_computer_click`).
4. Keep the skill focused on one workflow. Split into multiple skills if needed.
5. **Update AGENTS.md**: Add the new skill's name to the **My skills (self-maintained)** section in `AGENTS.md`. Use `read_file` to read AGENTS.md, then `search_replace` (or `write_file`) to append the skill name to the list (e.g. add a line like `- my-skill-name` under that section).

## Example structure
```markdown
# My Skill Name

## When to use
...

## How to use
1. ...
2. ...

## Convention
...
```

Skills are read by you (and by the create-skill meta-skill) on each session. Create skills that match your AGENTS.md mission and your department's responsibilities.
