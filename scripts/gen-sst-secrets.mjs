// Maps Doppler backend/dev secrets -> SST secret names declared in sst.config.ts.
// Reads Doppler JSON from stdin, writes a dotenv file for `sst secret load`.
// Generates safe values for secrets that don't exist in Doppler. Local-only;
// the output file is deleted right after loading and is never committed.
import { randomBytes } from "node:crypto";
import { writeFileSync, readFileSync } from "node:fs";

const raw = readFileSync(0, "utf8");
const doppler = JSON.parse(raw);
const get = (k) => {
  const v = doppler[k];
  if (v == null) return undefined;
  // doppler --format json gives { KEY: "value" } (strings)
  return typeof v === "string" ? v : v.computed ?? v.raw ?? undefined;
};

// SST secret name -> Doppler key (or a generator for missing ones)
const map = {
  SupabaseUrl: "SUPABASE_URL",
  SupabaseServiceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
  SupabaseAnonKey: "SUPABASE_ANON_KEY",
  SupabaseJwtSecret: "SUPABASE_JWT_SECRET",
  WorkspaceJwtSecret: "WORKSPACE_JWT_SECRET",
  ManagedGatewayRateLimitRedisUrl: "MANAGED_GATEWAY_RATE_LIMIT_REDIS_URL",
  DeepgramApiKey: "DEEPGRAM_API_KEY",
  GoogleGenerativeAiApiKey: "GEMINI_API_KEY",
  AnthropicApiKey: "ANTHROPIC_API_KEY",
  DatabaseUrl: "DATABASE_URL",
  DatabaseUrlPooler: "DATABASE_URL_POOLER",
  BrowserbaseApiKey: "BROWSERBASE_API_KEY",
  BrowserbaseProjectId: "BROWSERBASE_PROJECT_ID",
  ComposioApiKey: "COMPOSIO_API_KEY",
  ComposioWebhookSecret: "COMPOSIO_WEBHOOK_SECRET",
  SendblueApiKey: "SENDBLUE_API_KEY",
  SendblueApiSecret: "SENDBLUE_API_SECRET",
  SendblueSigningSecret: "SENDBLUE_SIGNING_SECRET",
  SesFromEmail: "SES_FROM_EMAIL",
};

// Secrets declared in sst.config.ts but not present in Doppler — safe defaults.
const fallbacks = {
  // optional in api/src/config.ts (min 16); generate a strong value
  WorkspaceApiKeyHashSecret: randomBytes(24).toString("hex"),
  // not used by api boot; placeholder so the declared sst.Secret resolves
  SendblueFromNumber: get("SENDBLUE_FROM_NUMBER") ?? "+10000000000",
};

const lines = [];
const missing = [];
for (const [sstName, dopKey] of Object.entries(map)) {
  let val = get(dopKey);
  if (val == null || val === "") {
    // SST rejects empty values; use a single space placeholder so deploy
    // can resolve .value (api treats empty/placeholder as "not configured")
    val = "unset";
    missing.push(`${sstName} (<- ${dopKey})`);
  }
  lines.push(`${sstName}=${val}`);
}
for (const [sstName, val] of Object.entries(fallbacks)) {
  lines.push(`${sstName}=${val}`);
}

writeFileSync(process.argv[2], lines.join("\n") + "\n", "utf8");
console.error(`Wrote ${lines.length} secrets to ${process.argv[2]}`);
if (missing.length) console.error("Placeholder (missing in Doppler): " + missing.join(", "));
