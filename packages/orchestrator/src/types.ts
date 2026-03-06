/**
 * Shared types for the Orchestrator.
 */

export interface AgentConfig {
  apiKey?: string;
  /** When using USE_AWS_BEDROCK: API key for the Bedrock gateway (injected as BEDROCK_GATEWAY_API_KEY). */
  bedrockGatewayApiKey?: string;
  workdir: string;
  vibeHome: string;
  maxTurns?: number;
  maxPrice?: string;
  /** Prompt for the very first vibe cycle (before any session exists). */
  initialPrompt?: string;
  /** When 'task_based', start() runs one cycle then returns; wake webhook triggers another run. */
  lifecycle?: 'infinite_loop' | 'task_based';
  /** Called when agent enters circuit-break after max consecutive failures. Used to notify CEO via swarm bus. */
  onCircuitBreak?: (businessId: string, agentKey: string, role: string, failureCount: number) => void | Promise<void>;
}

export interface BusinessConfig {
  id: string;
  name: string;
  agentIds: string[];
}

/** One line of Vibe streaming NDJSON output. */
export interface NDJSONMessage {
  type: string;
  role?: string;
  name?: string;
  content?: string;
  data?: unknown;
  [key: string]: unknown;
}

/** SSE event sent to clients. */
export interface StreamEvent {
  type: 'activity' | 'mode_switch' | 'raw' | 'error' | 'screencast_frame' | 'ask_user' | 'lifecycle';
  msg?: NDJSONMessage;
  data?: string;
  mode?: 'terminal' | 'browser';
  frame?: string;
  /** Structured question from ask_user_question tool. */
  questions?: AskUserQuestion[];
  agent: string;
  /** For type 'lifecycle': progress stage during cold start. */
  stage?: 'agent_spawning' | 'agent_tools_loaded' | 'agent_thinking';
}

export interface AskUserQuestion {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multi_select?: boolean;
}
