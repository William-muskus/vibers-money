/**
 * Canonical role keys use kebab-case slugs (e.g. security-director).
 * Human-facing titles use Title Case or acronyms (e.g. Security Director, CEO).
 * Keep in sync with packages/frontend/lib/role-title.ts
 */

/** Normalize any role string to a stable slug for paths, agent keys, and Swarm Bus `role`. */
export function slugifyRole(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : 'agent';
}

const ACRONYM_SLUGS = new Set(['ceo', 'cto', 'cfo', 'coo', 'cmo', 'cpo', 'cio', 'ciso']);

/** Display title for a role slug (e.g. security-director → Security Director, cto → CTO). */
export function roleTitleFromSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (ACRONYM_SLUGS.has(s)) return s.toUpperCase();
  return s
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
