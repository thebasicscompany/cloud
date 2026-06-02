#!/usr/bin/env node
// macOS dev-only: make the bundled Electron.app actually handle the
// basicsoftware-app:// deep link (the landing page's "Sign in via browser"
// fallback). Without this, LaunchServices routes the URL to whichever
// Electron.app it picks from the bundle-id pool (com.github.electron is
// shared by every Electron install on disk), so on a machine with multiple
// Electron checkouts it opens the wrong one and the user sees the
// "To run a local app..." help screen.
//
// Idempotent: safe to run on every `pnpm dev:electron`.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";

const run = promisify(execFile);

if (process.platform !== "darwin") process.exit(0);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronApp = join(
  root,
  "desktop",
  "node_modules",
  ".pnpm",
  "electron@33.4.11",
  "node_modules",
  "electron",
  "dist",
  "Electron.app",
);
const plist = join(electronApp, "Contents", "Info.plist");
const SCHEME = "basicsoftware-app";
const LSREGISTER =
  "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";

if (!existsSync(plist)) {
  console.warn(`[setup-mac-deeplink] ${plist} not found — skipping`);
  process.exit(0);
}

async function pb(...args) {
  try {
    const { stdout } = await run("/usr/libexec/PlistBuddy", ["-c", args.join(" "), plist]);
    return stdout.trim();
  } catch (err) {
    return { error: err };
  }
}

async function hasScheme() {
  // The scheme is registered if any CFBundleURLTypes entry contains our scheme.
  const out = await pb("Print :CFBundleURLTypes");
  if (typeof out !== "string") return false;
  return out.includes(SCHEME);
}

async function addScheme() {
  // Ensure the URL types array exists, then append our entry.
  const exists = await pb("Print :CFBundleURLTypes");
  if (typeof exists !== "string") {
    await pb("Add :CFBundleURLTypes array");
  }
  // Append a new dict at the end.
  const idx = typeof exists === "string" ? exists.split("\n").filter((l) => l.trim() === "Dict {").length : 0;
  await pb(`Add :CFBundleURLTypes:${idx} dict`);
  await pb(`Add :CFBundleURLTypes:${idx}:CFBundleURLName string ${SCHEME}`);
  await pb(`Add :CFBundleURLTypes:${idx}:CFBundleTypeRole string Editor`);
  await pb(`Add :CFBundleURLTypes:${idx}:CFBundleURLSchemes array`);
  await pb(`Add :CFBundleURLTypes:${idx}:CFBundleURLSchemes:0 string ${SCHEME}`);
}

async function setString(key, value) {
  const current = await pb(`Print :${key}`);
  if (current === value) return false;
  if (typeof current === "string") {
    await pb(`Set :${key} ${value}`);
  } else {
    await pb(`Add :${key} string ${value}`);
  }
  return true;
}

try {
  if (!(await hasScheme())) {
    console.log("[setup-mac-deeplink] patching Info.plist with", SCHEME);
    await addScheme();
  }
  // Rename the app from "Electron" → "Basics" so the macOS app menu (first
  // item, the dock, About box) shows the product name in dev too.
  const renamed = await setString("CFBundleName", "Basics");
  const renamedDisplay = await setString("CFBundleDisplayName", "Basics");
  // Identify this dev Electron as `com.basics-hub` — same as the packaged
  // Basics Hub install. macOS/MCP tools that index by bundle id treat the
  // dev build as the same product, so already-granted permissions
  // (Accessibility, Screen Recording, computer-use access) carry over.
  // Do not run packaged Basics Hub and the dev build at the same time.
  const reidentified = await setString("CFBundleIdentifier", "com.basics-hub");
  if (renamed || renamedDisplay || reidentified) {
    console.log("[setup-mac-deeplink] renamed bundle to Basics");
  }
  // Force re-register so LaunchServices picks up the new URL type + name +
  // bundle id, then bounce Dock so its cached app labels refresh.
  await run(LSREGISTER, ["-f", electronApp]);
  try {
    await run("killall", ["Dock"]);
  } catch {
    /* Dock auto-restarts; ignore if it wasn't running */
  }
  console.log("[setup-mac-deeplink] registered", electronApp);
} catch (err) {
  console.warn("[setup-mac-deeplink] failed (non-fatal):", err && err.message);
}
