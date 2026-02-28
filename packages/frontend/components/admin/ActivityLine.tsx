'use client';

type ActivityMsg = { role?: string; content?: string; type?: string; name?: string; input?: unknown; data?: string };

export default function ActivityLine({ msg }: { msg: ActivityMsg }) {
  if (msg.role === 'assistant' && msg.content) {
    const s = String(msg.content).slice(0, 120);
    const more = (msg.content as string).length > 120 ? '…' : '';
    return <div className="text-xs text-gray-700 dark:text-gray-300">{s}{more}</div>;
  }
  if (msg.type === 'tool_use' && msg.name) {
    const inputStr = typeof msg.input === 'object' ? JSON.stringify(msg.input).slice(0, 60) : '';
    return <div className="text-xs text-blue-600 dark:text-blue-400">▶ {msg.name}({inputStr})</div>;
  }
  if (msg.type === 'tool_result' && msg.name) {
    return <div className="text-xs text-green-600 dark:text-green-400">✓ {msg.name} completed</div>;
  }
  if (msg.type === 'raw' || msg.type === 'error') {
    return <div className="text-xs text-gray-500 dark:text-gray-400">{msg.type}: {msg.data?.slice(0, 80)}</div>;
  }
  return null;
}
