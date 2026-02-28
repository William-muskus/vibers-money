/**
 * POST /api/inject — External events + founder messages into an agent's inbox.
 */
import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { resolveRole } from '../core/registry.js';
import { addToInbox } from '../core/store.js';
import { scheduleWake } from '../core/wake.js';
import type { Message } from '../types.js';
import { logger } from '../logger.js';

export function handleInject(req: Request, res: Response): void {
  const body = req.body as Record<string, unknown>;
  const business_id = body.business_id as string;
  const target_role = body.target_role as string;
  const event_type = (body.event_type as string) || 'external_event';
  const content = body.content as string;
  const metadata = body.metadata as Record<string, unknown> | undefined;

  if (!business_id || !target_role || content == null) {
    logger.warn('inject_missing_fields', { business_id, target_role, hasContent: content != null });
    res.status(400).json({ error: 'Missing required fields: business_id, target_role, content' });
    return;
  }

  const to_agent_id = resolveRole(business_id, target_role);
  if (!to_agent_id) {
    logger.warn('inject_target_not_found', { business_id, target_role });
    res.status(404).json({ error: `No agent found for business ${business_id} and role ${target_role}` });
    return;
  }
  logger.info('inject', { business_id, target_role, to_agent_id, event_type, contentLength: String(content).length });

  const msg: Message = {
    id: `msg-${uuidv4()}`,
    type: 'external_event',
    from_agent_id: 'system',
    from_role: 'system',
    to_agent_id,
    business_id,
    content,
    priority: 'normal',
    timestamp: new Date().toISOString(),
    read: false,
    metadata: { event_type, ...metadata },
  };
  addToInbox(to_agent_id, msg);
  scheduleWake(to_agent_id);
  logger.debug('inject_delivered', { message_id: msg.id, to_agent_id });
  res.status(200).json({ ok: true, message_id: msg.id, to: target_role });
}
