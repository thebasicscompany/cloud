"use client";

import { useState } from "react";

import { Plug } from "@/icons";

import { cn } from "@/lib/utils";

/**
 * Real brand logo for a connection/integration so users recognize it instantly.
 * Maps known Composio toolkit slugs (and hosts) to a brand domain, then renders
 * that domain's favicon. Falls back to a generic plug icon if the logo fails to
 * load or the slug is unknown.
 */
const TOOLKIT_DOMAIN: Record<string, string> = {
  gmail: "gmail.com",
  googlesheets: "sheets.google.com",
  "google sheets": "sheets.google.com",
  googlecalendar: "calendar.google.com",
  "google calendar": "calendar.google.com",
  googledrive: "drive.google.com",
  "google drive": "drive.google.com",
  googledocs: "docs.google.com",
  slack: "slack.com",
  hubspot: "hubspot.com",
  linkedin: "linkedin.com",
  notion: "notion.so",
  github: "github.com",
  salesforce: "salesforce.com",
  stripe: "stripe.com",
  quickbooks: "quickbooks.intuit.com",
  zendesk: "zendesk.com",
  shopify: "shopify.com",
  youtube: "youtube.com",
  x: "x.com",
  twitter: "x.com",
  discord: "discord.com",
  airtable: "airtable.com",
  anthropic: "anthropic.com",
  openai: "openai.com",
};

function domainFor(slug: string): string {
  const key = slug.toLowerCase().trim();
  if (TOOLKIT_DOMAIN[key]) return TOOLKIT_DOMAIN[key];
  // Already a host like "linkedin.com"? use it. Else guess "<slug>.com".
  if (key.includes(".")) return key.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return `${key.replace(/[^a-z0-9]/g, "")}.com`;
}

export function ConnectionLogo({ slug, className }: { slug: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !slug) return <Plug className={cn("text-muted-foreground", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domainFor(slug))}&sz=64`}
      alt=""
      aria-hidden
      className={cn("rounded-sm object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}
