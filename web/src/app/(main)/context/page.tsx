import type { Metadata } from "next";

import { ContextConsole } from "./_components/context-console";

export const metadata: Metadata = {
  title: "Context | basichome",
  description: "Local Lens status, distilled context, and privacy boundaries for basichome.",
};

export default function Page() {
  return <ContextConsole />;
}
