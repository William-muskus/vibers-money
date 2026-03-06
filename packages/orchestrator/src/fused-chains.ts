/**
 * Fused chain config: which agent→agent message paths use the fused sidecar
 * (bypass Vibe process spawn, run A→B inference in one pipeline).
 * Enable entries as fused models become available.
 */

export interface FusedChain {
  from: string;
  to: string;
  enabled: boolean;
}

export const FUSED_CHAINS: FusedChain[] = [
  // Enable as fused models become available
  // { from: 'ceo', to: 'marketing-director', enabled: false },
  // { from: 'marketing-director', to: 'community-manager', enabled: false },
];

export function isFusedChain(fromRole: string, toRole: string): boolean {
  return FUSED_CHAINS.some(
    (c) => c.enabled && c.from === fromRole && c.to === toRole,
  );
}
