/**
 * Shared types for Swarm Bus MCP.
 */

export type RoleType = 'ceo' | 'department_manager' | 'specialist';
export type Lifecycle = 'infinite_loop' | 'task_based';
export type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

export interface AgentRegistration {
  agent_id: string;
  business_id: string;
  role: string;
  role_type: RoleType;
  lifecycle: Lifecycle;
  parent: string | null;
  children: string[];
  wake_endpoint?: string;
  wake_payload?: Record<string, unknown>;
}

export interface Message {
  id: string;
  type: 'message' | 'broadcast' | 'escalation' | 'escalation_response' | 'budget_request' | 'budget_response' | 'scheduled_event' | 'external_event';
  from_agent_id: string;
  from_role: string;
  to_agent_id: string;
  business_id: string;
  content: string;
  priority: MessagePriority;
  timestamp: string;
  read: boolean;
  metadata?: Record<string, unknown>;
}

export interface BudgetState {
  agent_id: string;
  business_id: string;
  allocated: number;
  spent: number;
  transactions: Array<{ id: string; amount: number; description: string; category?: string; timestamp: string }>;
}
