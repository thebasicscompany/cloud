import { AgentChatRun } from "./_components/agent-chat";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AgentDetailPage({ params }: Props) {
  const { id } = await params;
  return <AgentChatRun id={id} />;
}
