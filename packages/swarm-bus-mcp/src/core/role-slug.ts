/**
 * Same normalization as orchestrator `role-slug.ts` — used to resolve `to` in messaging.
 */
export function slugifyRole(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s.length > 0 ? s : 'agent';
}
