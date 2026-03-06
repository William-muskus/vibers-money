'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { sendMessage, ceoStreamUrl } from '@/lib/api';
import { subscribeBusinessStream } from '@/lib/sse';
import {
  getCeoChatMessagesFromIdb,
  setCeoChatMessagesInIdb,
  type ChatMessage as IdbChatMessage,
} from '@/lib/idb-ceo-chat';
import MessageBubble from './MessageBubble';
import Composer from './Composer';

type ChatMessage =
  | { kind: 'text'; id?: string; role: 'user' | 'assistant'; content: string }
  | { kind: 'ask_user'; id?: string; questions: AskUserQuestion[] };

interface AskUserQuestion {
  question: string;
  header?: string;
  options: { label: string; description?: string }[];
  multi_select?: boolean;
}

function QuestionCard({
  q,
  onAnswer,
}: {
  q: AskUserQuestion;
  onAnswer: (answer: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl rounded-bl-md border border-indigo-200/80 bg-indigo-50/80 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-indigo-400/20 dark:bg-indigo-950/50">
      {q.header && (
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400">
          {q.header}
        </p>
      )}
      <p className="text-sm font-medium text-gray-900 dark:text-white">{q.question}</p>
      <div className="flex flex-wrap gap-2">
        {q.options.map((opt, oi) => (
          <button
            key={opt.label ? String(opt.label) : `opt-${oi}`}
            type="button"
            onClick={() => onAnswer(opt.label)}
            className="rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-medium text-indigo-700 shadow-sm transition-all duration-200 hover:scale-[1.02] hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-500/40 dark:bg-[#14151c]/80 dark:text-indigo-300 dark:hover:bg-indigo-400/20"
          >
            {opt.label}
            {opt.description && (
              <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                — {opt.description}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ChatView({
  businessId,
  initialMessage,
}: {
  businessId: string;
  initialMessage?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    initialMessage?.trim()
      ? [{ kind: 'text', role: 'user', content: initialMessage.trim() }]
      : [],
  );

  // Load full thread from IndexedDB (all user + CEO messages); restore on mount / business change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    getCeoChatMessagesFromIdb(businessId).then((stored) => {
      if (stored.length > 0) {
        stored.forEach((m) => {
          const id = (m as { id?: string }).id;
          if (id) seenIdsRef.current.add(id);
        });
        setMessages(stored as ChatMessage[]);
      }
    });
  }, [businessId]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingForReply, setWaitingForReply] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [progressStage, setProgressStage] = useState<'agent_spawning' | 'agent_tools_loaded' | 'agent_thinking' | 'agent_tools' | null>(null);
  const [thinkingStuckHint, setThinkingStuckHint] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamUrl = ceoStreamUrl(businessId);
  const thinkingStuckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed seen IDs from restored cache so we don't duplicate assistant messages from stream
  const seededRef = useRef(false);
  if (!seededRef.current && messages.length > 0) {
    seededRef.current = true;
    messages.forEach((m) => {
      const id = (m as { id?: string }).id;
      if (id) seenIdsRef.current.add(id);
    });
  }

  const handleAnswer = useCallback(
    async (answer: string) => {
      setMessages((prev) => [...prev, { kind: 'text', role: 'user', content: answer }]);
      setSending(true);
      setWaitingForReply(true);
      setShowTypingIndicator(false);
      typingTimeoutRef.current = setTimeout(() => setShowTypingIndicator(true), 800);
      try {
        await sendMessage(businessId, answer);
      } catch (err) {
        setWaitingForReply(false);
        setShowTypingIndicator(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        setMessages((prev) => [
          ...prev,
          { kind: 'text', role: 'assistant', content: 'Error: ' + (err as Error).message },
        ]);
      } finally {
        setSending(false);
      }
    },
    [businessId],
  );

  useEffect(() => {
    setConnectionFailed(false);
    const unsubscribe = subscribeBusinessStream(
      businessId,
      streamUrl,
      (event) => {
        setConnected(true);
        if (process.env.NODE_ENV === 'development') {
          console.debug('[stream]', event.type, event.type === 'activity' ? (event as { msg?: { role?: string; content?: unknown } }).msg?.role : '', (event as { msg?: { content?: unknown } }).msg?.content ? String((event as { msg?: { content?: unknown } }).msg?.content).slice(0, 80) : '');
        }

        if (event.type === 'lifecycle') {
          const stage = (event as { stage?: string }).stage;
          if (stage === 'agent_spawning' || stage === 'agent_tools_loaded' || stage === 'agent_thinking') {
            setProgressStage(stage);
            setThinkingStuckHint(false);
            if (thinkingStuckTimeoutRef.current) {
              clearTimeout(thinkingStuckTimeoutRef.current);
              thinkingStuckTimeoutRef.current = null;
            }
            if (stage === 'agent_thinking') {
              thinkingStuckTimeoutRef.current = setTimeout(() => {
                thinkingStuckTimeoutRef.current = null;
                setThinkingStuckHint(true);
              }, 90_000);
            }
          }
          return;
        }

        if (event.type === 'activity' && event.msg && (event.msg as { type?: string }).type === 'tool_use') {
          setProgressStage('agent_tools');
          return;
        }

        if (event.type === 'ask_user') {
          const questions = (event as { questions?: AskUserQuestion[] }).questions;
          if (questions && questions.length > 0) {
            setWaitingForReply(false);
            setShowTypingIndicator(false);
            if (typingTimeoutRef.current) {
              clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = null;
            }
            setMessages((prev) => [...prev, { kind: 'ask_user', questions }]);
          }
          return;
        }

        if (event.type !== 'activity' || !event.msg) return;

        const msg = event.msg;
        const role = msg.role as string | undefined;
        const rawContent = msg.content;
        const content =
          typeof rawContent === 'string'
            ? rawContent
            : Array.isArray(rawContent)
              ? (rawContent as { type?: string; text?: string }[])
                  .map((p) => (p?.type === 'text' && typeof p?.text === 'string' ? p.text : ''))
                  .join('')
              : '';
        const messageId = (msg as { message_id?: string }).message_id;

        if (role === 'system') return;
        if (role !== 'user' && role !== 'assistant') return;

        // Clear "Thinking" as soon as we see assistant activity (even empty chunk), so we don't stay stuck
        if (role === 'assistant') {
          setWaitingForReply(false);
          setShowTypingIndicator(false);
          setProgressStage(null);
          setThinkingStuckHint(false);
          if (thinkingStuckTimeoutRef.current) {
            clearTimeout(thinkingStuckTimeoutRef.current);
            thinkingStuckTimeoutRef.current = null;
          }
          if (!content.trim()) return; // wait for first non-empty chunk to add message
        }

        if (role === 'user') {
          // CEO stream echoes "The founder sent you a message: \"...\"" — that's the inject to the agent, not a chat message.
          const founderMatch = content.match(/The founder sent you a message:\s*"([^"]*)"/);
          if (founderMatch) {
            if (messageId) seenIdsRef.current.add(messageId);
            return;
          }
          if (/^Continue\.?\s*$/i.test(content.trim())) return;
          if (/Read your AGENTS\.md/i.test(content)) return;
          if (/Check your messages and todos/i.test(content)) return;
          if (/Check your swarm bus inbox/i.test(content)) return;
          return;
        }

        if (!content.trim()) return;

        // Ignore assistant messages that are just the prompt echoed back (local model bug)
        if (role === 'assistant' && /^You are the CEO of this business\.\s*Read your AGENTS\.md/i.test(content.trim())) return;

        // Merge streaming chunks: if this assistant message has the same message_id as the last assistant message, append content
        if (messageId && seenIdsRef.current.has(messageId)) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.kind === 'text' && last.role === 'assistant' && (last as { id?: string }).id === messageId) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: (last.content || '').trimEnd() + '\n\n' + content.trim() },
              ];
            }
            return [...prev, { kind: 'text' as const, id: messageId, role, content }];
          });
          return;
        }
        if (messageId) seenIdsRef.current.add(messageId);

        setMessages((prev) => [...prev, { kind: 'text', id: messageId, role, content }]);
      },
      () => setConnectionFailed(true),
    );
    return unsubscribe;
  }, [businessId, streamUrl]);

  // Persist full thread (all user + CEO messages) in IndexedDB
  useEffect(() => {
    if (messages.length === 0) return;
    setCeoChatMessagesInIdb(businessId, messages as IdbChatMessage[]).catch(() => {});
  }, [businessId, messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Show Thinking/typing indicator when opening a new conversation from landing page (initialMessage)
  useEffect(() => {
    if (!initialMessage?.trim()) return;
    setWaitingForReply(true);
    setShowTypingIndicator(false);
    typingTimeoutRef.current = setTimeout(() => setShowTypingIndicator(true), 800);
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, [initialMessage]);

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (thinkingStuckTimeoutRef.current) clearTimeout(thinkingStuckTimeoutRef.current);
    };
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { kind: 'text', role: 'user', content: text }]);
    setSending(true);
    setWaitingForReply(true);
    setShowTypingIndicator(false);
    typingTimeoutRef.current = setTimeout(() => setShowTypingIndicator(true), 800);
    try {
      await sendMessage(businessId, text);
    } catch (err) {
      setWaitingForReply(false);
      setShowTypingIndicator(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      setMessages((prev) => [
        ...prev,
        { kind: 'text', role: 'assistant', content: 'Error: ' + (err as Error).message },
      ]);
    } finally {
      setSending(false);
    }
  }, [businessId, input, sending]);

  const hasMessages = messages.length > 0;
  const showEmptyState = !hasMessages && !connectionFailed;

  return (
    <div className="flex h-full flex-col bg-transparent">
      <div ref={threadRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 pb-12 pt-10 align-bottom">
          {connectionFailed ? (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
              <p className="animate-fade-in text-sm text-amber-600 dark:text-amber-400">
                Can&apos;t connect — business may not exist or services aren&apos;t running.
              </p>
              <Link href="/" className="text-sm font-medium text-indigo-600 underline dark:text-indigo-400">
                Go home and create a business
              </Link>
            </div>
          ) : (
            <div className="contents">
              {showEmptyState && (
                <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center">
                  <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-2xl">
                    What business we launching today?
                  </h2>
                  {!connected && !progressStage && (
                    <p className="animate-soft-pulse text-sm text-gray-500 dark:text-gray-400">
                      Connecting to CEO...
                    </p>
                  )}
                  {progressStage && (
                    <p className="animate-soft-pulse text-sm text-indigo-600 dark:text-indigo-400">
                      {progressStage === 'agent_spawning' && 'Starting CEO agent...'}
                      {progressStage === 'agent_tools_loaded' && 'Loading tools...'}
                      {progressStage === 'agent_thinking' && 'Thinking about your business...'}
                      {progressStage === 'agent_tools' && 'Using tools (e.g. Swarm Bus)...'}
                    </p>
                  )}
                  {thinkingStuckHint && (
                    <p className="text-sm text-amber-600 dark:text-amber-400">
                      Still working — the CEO can take a minute with the local model. Check the orchestrator terminal for progress.
                    </p>
                  )}
                </div>
              )}
              <div className="flex flex-col gap-6">
                {messages.map((m, i) =>
                  m.kind === 'ask_user' ? (
                    <div key={`ask-${i}`} className="animate-scale-in flex flex-col gap-2">
                      {m.questions.map((q, qi) => (
                        <QuestionCard key={qi} q={q} onAnswer={handleAnswer} />
                      ))}
                    </div>
                  ) : (
                    <MessageBubble key={m.id ?? `msg-${i}`} role={m.role} content={m.content} />
                  ),
                )}
                {progressStage && !messages.some((m) => m.kind === 'text' && m.role === 'assistant') && (
                  <div className="flex w-full justify-end">
                    <div className="rounded-2xl rounded-br-md border border-indigo-200/80 bg-indigo-50/90 px-4 py-3 shadow-sm dark:border-indigo-400/25 dark:bg-indigo-950/60">
                      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-200">
                        {progressStage === 'agent_spawning' && 'Starting CEO agent...'}
                        {progressStage === 'agent_tools_loaded' && 'Loading tools...'}
                        {progressStage === 'agent_thinking' && 'Thinking about your business...'}
                        {progressStage === 'agent_tools' && 'Using tools...'}
                      </span>
                    </div>
                  </div>
                )}
                {thinkingStuckHint && (
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-2 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200">
                    Still working — the CEO can take a minute with the local model. Check the orchestrator terminal for progress.
                  </div>
                )}
                {(sending || waitingForReply) && (
                  <div className="flex w-full justify-end">
                    <div className="flex items-start gap-3 animate-fade-in">
                      <div className="rounded-2xl rounded-br-md border border-indigo-200/80 bg-indigo-50/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-indigo-400/25 dark:bg-indigo-950/60">
                        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-200">
                          {progressStage ? (progressStage === 'agent_thinking' ? 'Thinking...' : progressStage === 'agent_tools' ? 'Using tools...' : progressStage === 'agent_spawning' ? 'Starting...' : 'Loading...') : showTypingIndicator ? 'Typing...' : 'Thinking...'}
                        </span>
                      </div>
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-500/25 dark:bg-indigo-400/25 ring-2 ring-indigo-400/30 dark:ring-indigo-300/30">
                        <span className="animate-soft-pulse text-sm font-medium text-indigo-600 dark:text-indigo-300">…</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div ref={bottomRef} />
            </div>
          )}
        </div>
      </div>

      {!connectionFailed && (
        <div className="shrink-0 px-4 py-4 text-transparent">
          <div className="mx-auto max-w-3xl">
            <Composer
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={sending}
              placeholder="Ask anything"
            />
          </div>
        </div>
      )}
    </div>
  );
}
