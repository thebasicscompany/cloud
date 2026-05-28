import { CloudAutomationDetail } from "../_components/cloud-automations-workbench";

type Params = { id: string };

export default async function AutomationPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return <CloudAutomationDetail id={id} />;
}
