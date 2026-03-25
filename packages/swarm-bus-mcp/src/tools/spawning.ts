/**
 * swarm_spawn_agent: forward spawn request to Orchestrator webhook.
 */
import { z } from 'zod';
import { getIdentity } from '../context.js';
import { getAgent } from '../core/registry.js';
import { logger } from '../logger.js';

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? 'http://localhost:3000';

export function createSpawningTools() {
  return {
    swarm_spawn_agent: {
      description: 'Spawn a new agent (e.g. department manager or specialist). Pass a mission brief and 3–5 macro objectives so the agent can self-configure and build their initial task list. Forwards to Orchestrator to create workspace and launch Vibe. Only CEO or department managers can spawn; hierarchy is enforced.',
      inputSchema: {
        role: z.string().describe(
          'Role in kebab-case (e.g. security-director, marketing-director). Display titles like "Security Director" are normalized to the same slug.',
        ),
        business: z.string().describe('Business ID (must match your business)'),
        mission: z.string().describe('Mission brief for the new agent (2–4 sentences).'),
        macro_objectives: z.array(z.string()).min(1).describe('Required. List of 3–5 macro objectives (concrete outcomes). The agent uses these to write skills and create their initial todo list.'),
        browser_domains: z.array(z.string()).optional().describe('Allowed domains for browser tools (e.g. ["x.com", "twitter.com"])'),
        skills: z.array(z.string()).optional().describe('Skill names to copy into agent workspace'),
        lifecycle: z.enum(['infinite_loop', 'task_based']).optional().describe('Default: infinite_loop'),
      },
      handler: async (args: {
        role: string;
        business: string;
        mission: string;
        macro_objectives: string[];
        browser_domains?: string[];
        skills?: string[];
        lifecycle?: 'infinite_loop' | 'task_based';
      }) => {
        const { businessId, agentId } = getIdentity();
        const from = await getAgent(agentId);
        if (!from) throw new Error('Agent not registered');
        if (from.role_type !== 'ceo' && from.role_type !== 'department_manager') {
          throw new Error('Only CEO or department managers can spawn agents');
        }
        logger.info('tool', { tool: 'swarm_spawn_agent', agentId, role: args.role, business: args.business });
        if (args.business !== businessId) throw new Error('business must match your business_id');

        const res = await fetch(`${ORCHESTRATOR_URL}/api/agents/spawn`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: args.role,
            business: args.business,
            mission: args.mission,
            macro_objectives: args.macro_objectives,
            browser_domains: args.browser_domains ?? [],
            skills: args.skills ?? [],
            lifecycle: args.lifecycle ?? 'infinite_loop',
            parent_agent_id: agentId,
          }),
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Orchestrator spawn failed: ${res.status} ${text}`);
        }
        const data = (await res.json()) as { agent_key?: string; error?: string };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
        };
      },
    },
  };
}
