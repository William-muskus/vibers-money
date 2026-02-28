'use client';

import { useEffect, useRef, useState } from 'react';

export default function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder = 'Ask anything',
  className = '',
  variant = 'default',
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  variant?: 'default' | 'hero';
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [focused, setFocused] = useState(false);
  const isHero = variant === 'hero';

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  return (
    <form
      className={`transition-transform duration-300 ${className}`}
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <div
        className={`flex w-full max-w-3xl items-end gap-2 rounded-3xl border px-4 py-2.5 shadow-lg backdrop-blur-sm transition-all duration-300 ${
          isHero
            ? `bg-gray-900/80 ${focused ? 'border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.1)]' : 'border-white/20 hover:border-white/30'}`
            : `bg-white/90 dark:bg-[#14151c]/90 ${
                focused
                  ? 'border-indigo-400/50 shadow-[0_0_0_1px_rgba(99,102,241,0.15),0_8px_32px_-8px_rgba(99,102,241,0.25)] dark:border-indigo-400/40'
                  : 'border-gray-200/80 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20'
              }`
        }`}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder={placeholder}
          rows={1}
          disabled={disabled}
          className={`max-h-[200px] min-h-[24px] flex-1 resize-none bg-transparent py-1.5 text-base outline-none ${
            isHero
              ? 'text-white placeholder:text-gray-400'
              : 'text-gray-900 placeholder:text-gray-400 dark:text-gray-100 dark:placeholder:text-gray-500'
          }`}
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200 hover:scale-105 disabled:scale-100 disabled:opacity-40 ${
            isHero
              ? 'bg-white text-gray-900 hover:bg-gray-100'
              : 'bg-indigo-500 text-white hover:bg-indigo-600 dark:bg-indigo-400 dark:text-gray-900 dark:hover:bg-indigo-300'
          }`}
          aria-label="Send"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2L11 13" />
            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
          </svg>
        </button>
      </div>
    </form>
  );
}
