# Update Skill (meta-skill)

## When to use
- An existing skill in `.vibe/skills/` is outdated or wrong.
- Requirements changed (e.g. brand voice pivot, new workflow).
- You discovered a better way to do something and want to codify it.

## How to use
1. Open the existing skill file (e.g. `.vibe/skills/post-tweet/SKILL.md`).
2. Use `read_file` to get the current content.
3. Use `search_replace` or `write_file` to update the relevant sections (When to use, How to use, Convention).
4. Preserve the overall structure (title, sections) so the skill remains parseable.
5. If the skill is obsolete, you may remove or replace it; document the change in your status or a decision log.

## Convention
- Prefer small, targeted edits over rewriting the whole file.
- After updating, continue your work cycle; the new content applies on the next reference to that skill.
