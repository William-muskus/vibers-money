import ChatPageClient from '@/components/chat/ChatPageClient';

export default async function ChatPage(props: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await props.params;
  return <ChatPageClient businessId={businessId ?? ''} />;
}
