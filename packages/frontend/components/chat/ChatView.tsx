'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { sendMessage, ceoStreamUrl } from '@/lib/api';
import { subscribeBusinessStream } from '@/lib/sse';
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
        {q.options.map((opt) => (
          <button
            key={opt.label}
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
      : []
  );
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [waitingForReply, setWaitingForReply] = useState(false);
  const [showTypingIndicator, setShowTypingIndicator] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionFailed, setConnectionFailed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef(new Set<string>());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamUrl = ceoStreamUrl(businessId);

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
        if (!content.trim()) return;
        if (role !== 'user' && role !== 'assistant') return;

        if (role === 'user') {
          // CEO stream echoes "The founder sent you a message: \"...\"" — that's the inject to the agent, not a chat message.
          // We already show the user's message from the composer; don't add this internal event to the thread.
          const founderMatch = content.match(/The founder sent you a message:\s*"([^"]*)"/);
          if (founderMatch) {
            if (messageId) seenIdsRef.current.add(messageId);
            return;
          }
          if (/^Continue\.?\s*$/i.test(content.trim())) return;
          if (/Read your AGENTS\.md/i.test(content)) return;
          if (/Check your messages and todos/i.test(content)) return;
          return;
        }

        if (messageId) {
          if (seenIdsRef.current.has(messageId)) return;
          seenIdsRef.current.add(messageId);
        }

        setWaitingForReply(false);
        setShowTypingIndicator(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        setMessages((prev) => [...prev, { kind: 'text', id: messageId, role, content }]);
      },
      () => setConnectionFailed(true),
    );
    return unsubscribe;
  }, [businessId, streamUrl]);

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
                  {!connected && (
                    <p className="animate-soft-pulse text-sm text-gray-500 dark:text-gray-400">
                      Connecting to CEO...
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
                {(sending || waitingForReply) && (
                  <div className="flex w-full justify-end">
                    <div className="flex items-start gap-3 animate-fade-in">
                      <div className="rounded-2xl rounded-br-md border border-indigo-200/80 bg-indigo-50/90 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-indigo-400/25 dark:bg-indigo-950/60">
                        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-200">
                          {showTypingIndicator ? 'Typing...' : 'Thinking...'}
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
