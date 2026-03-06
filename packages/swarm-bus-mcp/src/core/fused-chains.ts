/**
 * Fused chain config for Swarm Bus: which from→to pairs use the fused sidecar.
 * Mirror of orchestrator fused-chains; keep in sync when enabling chains.
 */
const FUSED_CHAINS: { from: string; to: string; enabled: boolean }[] = [
  // { from: 'ceo', to: 'marketing-director', enabled: false },
];

export function isFusedChain(fromRole: string, toRole: string): boolean {
  return FUSED_CHAINS.some(
    (c) => c.enabled && c.from === fromRole && c.to === toRole,
  );
}
