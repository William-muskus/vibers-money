/**
 * Display titles for agent role slugs (kebab-case in keys).
 * Keep in sync with packages/orchestrator/src/role-slug.ts
 */

const ACRONYM_SLUGS = new Set(['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'cio', 'ciso']);

/** Normalize role string to slug (same rules as orchestrator). */
export function slugifyRole(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : 'agent';
}

/** Display title for a role slug (e.g. security-director → Security Director). */
export function roleTitleFromSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (ACRONYM_SLUGS.has(s)) return s.toUpperCase();
  return s
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Format a role for UI: accepts slug or free text from tools, returns a consistent title.
 */
export function formatRoleForDisplay(raw: string): string {
  if (!raw.trim()) return raw;
  return roleTitleFromSlug(slugifyRole(raw));
}
