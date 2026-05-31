import type { Metadata } from "next";

import { ContextConsole } from "./_components/context-console";

export const metadata: Metadata = {
  title: "Context | Basics",
  description: "Local Lens status, distilled context, and privacy boundaries for Basics.",
};

export default function Page() {
  return <ContextConsole />;
}
