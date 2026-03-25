/**
 * One-time first-turn prompt chunk for the CEO. Persisted delivery state in .vibe/orchestrator-ceo-onboarding.json
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const STATE_BASENAME = 'orchestrator-ceo-onboarding.json';

export interface CeoOnboardingState {
  firstFounderTurnHandled: boolean;
}

function statePath(workdir: string): string {
  return join(workdir, '.vibe', STATE_BASENAME);
}

export function readCeoOnboardingState(workdir: string): CeoOnboardingState {
  const p = statePath(workdir);
  try {
    if (!existsSync(p)) {
      return { firstFounderTurnHandled: false };
    }
    const raw = readFileSync(p, 'utf-8');
    const j = JSON.parse(raw) as Partial<CeoOnboardingState>;
    return { firstFounderTurnHandled: Boolean(j.firstFounderTurnHandled) };
  } catch {
    return { firstFounderTurnHandled: false };
  }
}

export function markCeoOnboardingFirstFounderTurnHandled(workdir: string): void {
  const dir = join(workdir, '.vibe');
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      statePath(workdir),
      JSON.stringify({ firstFounderTurnHandled: true } satisfies CeoOnboardingState, null, 2),
      'utf-8',
    );
  } catch {
    // best-effort
  }
}

export const CEO_ONBOARDING_SECTION = `--- Onboarding (once) ---
1. Ask 1–3 questions (name, positioning, audience) in chat, then use the \`mcp_orchestrator_set_awaiting_founder\` tool with \`{ "wait": true }\`.
2. Use the \`swarm_spawn_agent\` tool to spawn the directors one by one in  this order: Security Director → CTO → Marketing, Product, Finance, one by one. Mission + \`macro_objectives\` JSON.  \`swarm_list_agents\` if unsure a role exists. Never spawn "ceo", as YOU ARE THE CEO.
---`;
