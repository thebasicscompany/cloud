import type { Metadata } from "next";

import { OnboardingFlow } from "./onboarding-flow";

export const metadata: Metadata = {
  title: "Set up Basics",
  description: "Set up Basics local-first workspace, device, capture, engines, and safety defaults.",
};

export default function OnboardingPage() {
  return <OnboardingFlow />;
}
