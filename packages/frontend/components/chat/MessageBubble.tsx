'use client';

type MessageBubbleProps = {
  role: 'user' | 'assistant';
  content: string;
};

export default function MessageBubble({ role, content }: MessageBubbleProps) {
  return (
    <div
      className={
        role === 'user'
          ? 'self-end max-w-[85%] rounded-2xl rounded-br-md bg-blue-600 px-4 py-2 text-white'
          : 'self-start max-w-[85%] rounded-2xl rounded-bl-md bg-gray-200 px-4 py-2 text-gray-900 dark:bg-gray-700 dark:text-gray-100'
      }
    >
      <p className="whitespace-pre-wrap break-words text-sm">{content}</p>
    </div>
  );
}
