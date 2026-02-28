import ChatPageClient from '@/components/chat/ChatPageClient';

export default async function ChatPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return <ChatPageClient businessId={businessId ?? ''} />;
}
