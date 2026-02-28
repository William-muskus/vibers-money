/**
 * POST /api/register — Agent registration (Orchestrator calls at spawn time).
 * POST /api/deregister — Remove agent from org chart.
 */
import type { Request, Response } from 'express';
import { register as regAgent, deregister as deregAgent } from '../core/registry.js';
import { clearInbox } from '../core/store.js';
import { broadcastEvent } from '../core/events.js';
import type { AgentRegistration, RoleType, Lifecycle } from '../types.js';
import { logger } from '../logger.js';

const roleTypeSchema = ['ceo', 'department_manager', 'specialist'] as const;
const lifecycleSchema = ['infinite_loop', 'task_based'] as const;

export function handleRegister(req: Request, res: Response): void {
  const body = req.body as Record<string, unknown>;
  const agent_id = body.agent_id as string;
  const business_id = body.business_id as string;
  const role = body.role as string;
  const role_type = body.role_type as string;
  const lifecycle = body.lifecycle as string;
  const parent = body.parent as string | null;
  const children = Array.isArray(body.children) ? (body.children as string[]) : [];
  const wake_endpoint = body.wake_endpoint as string | undefined;
  const wake_payload = body.wake_payload as Record<string, unknown> | undefined;

  if (!agent_id || !business_id || !role || !role_type || !lifecycle) {
    logger.warn('register_missing_fields', { hasAgentId: !!agent_id, hasBusinessId: !!business_id });
    res.status(400).json({ error: 'Missing required fields: agent_id, business_id, role, role_type, lifecycle' });
    return;
  }
  if (!roleTypeSchema.includes(role_type as RoleType)) {
    res.status(400).json({ error: 'role_type must be ceo, department_manager, or specialist' });
    return;
  }
  if (!lifecycleSchema.includes(lifecycle as Lifecycle)) {
    res.status(400).json({ error: 'lifecycle must be infinite_loop or task_based' });
    return;
  }

  const reg: AgentRegistration = {
    agent_id,
    business_id,
    role,
    role_type: role_type as RoleType,
    lifecycle: lifecycle as Lifecycle,
    parent: parent ?? null,
    children: [...children],
    wake_endpoint,
    wake_payload,
  };
  regAgent(reg);
  broadcastEvent({ type: 'agent_registered', agent_id: agent_id, business_id, role, role_type });
  logger.info('register_ok', { agent_id, business_id, role, role_type });
  res.status(200).json({ ok: true, agent_id });
}

export function handleDeregister(req: Request, res: Response): void {
  const body = req.body as Record<string, unknown>;
  const agent_id = body.agent_id as string;
  if (!agent_id) {
    res.status(400).json({ error: 'Missing agent_id' });
    return;
  }
  clearInbox(agent_id);
  deregAgent(agent_id);
  broadcastEvent({ type: 'agent_deregistered', agent_id });
  logger.info('deregister_ok', { agent_id });
  res.status(200).json({ ok: true });
}
