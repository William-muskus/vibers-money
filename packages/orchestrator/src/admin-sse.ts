/**
 * Long-lived GET /api/admin/stream connections: subscribe each new AgentProcess
 * so the mosaic receives activity from agents spawned after the SSE connection opened.
 */
import type { Response } from 'express';
import type { AgentProcess } from './agent-process.js';

const adminSseConnections = new Set<Response>();

export function registerAdminSseConnection(res: Response): void {
  adminSseConnections.add(res);
  res.on('close', () => {
    adminSseConnections.delete(res);
  });
}

export function attachNewAgentToAdminStreams(process: AgentProcess): void {
  for (const res of adminSseConnections) {
    if (res.writableEnded) {
      adminSseConnections.delete(res);
      continue;
    }
    try {
      process.subscribe(res);
    } catch {
      adminSseConnections.delete(res);
    }
  }
}
