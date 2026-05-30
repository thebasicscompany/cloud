// Computer-use "hands" — OS-level mouse/keyboard injection for LOCAL runs.
//
// The agent's eyes are screen capture (desktopCapturer / Lens) and its brain is
// the harness/model; this module is the actuation half: it moves the real
// cursor, clicks, types, and presses keys on the user's machine. Cross-platform
// by dispatch — Windows is implemented via PowerShell P/Invoke (no native
// modules to rebuild); macOS via osascript/JXA; Linux via xdotool. A nut.js
// backend can replace these later behind the same interface.
//
// SAFETY: only ever driven by an explicit LOCAL computer-use run the user
// started. The loop that calls this is gated + interruptible.
const { execFile } = require("child_process");

const PLATFORM = process.platform;

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(String(stdout || "").trim());
    });
    if (input != null) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

// ── Windows (PowerShell + user32 P/Invoke) ────────────────────────────────
const PS_PREAMBLE = `Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class BHInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, int extra);
}
"@ | Out-Null
$DOWN=@{left=0x0002;right=0x0008;middle=0x0020}; $UP=@{left=0x0004;right=0x0010;middle=0x0040}
function BHMove($x,$y){ [BHInput]::SetCursorPos([int]$x,[int]$y) | Out-Null }
function BHClick($x,$y,$b,$n){ BHMove $x $y; for($i=0;$i -lt $n;$i++){ [BHInput]::mouse_event($DOWN[$b],0,0,0,0); Start-Sleep -Milliseconds 25; [BHInput]::mouse_event($UP[$b],0,0,0,0); Start-Sleep -Milliseconds 40 } }
function BHScroll($d){ [BHInput]::mouse_event(0x0800,0,0,[uint32][int]$d,0) }
`;

function psRun(script) {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", PS_PREAMBLE + script]);
}

// SendKeys treats +^%~(){}[] as special — escape to type literal text.
function sendKeysEscape(text) {
  return text.replace(/([+^%~(){}\[\]])/g, "{$1}");
}

// ── macOS (osascript / JXA) ───────────────────────────────────────────────
// Keystrokes via System Events; coordinate clicks via JXA + CoreGraphics.
function jxaClick(x, y, n) {
  return `ObjC.import('CoreGraphics');
const p = $.CGPointMake(${x}, ${y});
function ev(t){ const e=$.CGEventCreateMouseEvent($(), t, p, 0); $.CGEventPost(0, e); }
for (let i=0;i<${n};i++){ ev($.kCGEventLeftMouseDown); delay(0.03); ev($.kCGEventLeftMouseUp); delay(0.05); }`;
}

// ── public interface ──────────────────────────────────────────────────────
async function move(x, y) {
  if (PLATFORM === "win32") return psRun(`BHMove ${x} ${y}`);
  if (PLATFORM === "darwin")
    return run("osascript", ["-l", "JavaScript", "-e", `ObjC.import('CoreGraphics'); $.CGWarpMouseCursorPosition($.CGPointMake(${x},${y}));`]);
  return run("xdotool", ["mousemove", String(x), String(y)]);
}

async function click(x, y, button = "left", count = 1) {
  if (PLATFORM === "win32") return psRun(`BHClick ${x} ${y} ${button} ${count}`);
  if (PLATFORM === "darwin") return run("osascript", ["-l", "JavaScript", "-e", jxaClick(x, y, count)]);
  return run("xdotool", ["mousemove", String(x), String(y), "click", "--repeat", String(count), button === "right" ? "3" : "1"]);
}

async function doubleClick(x, y) {
  return click(x, y, "left", 2);
}

async function type(text) {
  if (!text) return "";
  if (PLATFORM === "win32") return psRun(`[System.Windows.Forms.SendKeys]::SendWait("${sendKeysEscape(text).replace(/"/g, '`"')}")`);
  if (PLATFORM === "darwin")
    return run("osascript", ["-e", `tell application "System Events" to keystroke ${JSON.stringify(text)}`]);
  return run("xdotool", ["type", "--", text]);
}

// Press a key combo: "enter", "tab", "cmd+a"/"ctrl+a", "escape", "down" ...
const WIN_KEYS = { enter: "{ENTER}", tab: "{TAB}", escape: "{ESC}", esc: "{ESC}", backspace: "{BS}", delete: "{DEL}", up: "{UP}", down: "{DOWN}", left: "{LEFT}", right: "{RIGHT}", space: " ", home: "{HOME}", end: "{END}", pageup: "{PGUP}", pagedown: "{PGDN}" };
const WIN_MODS = { ctrl: "^", control: "^", alt: "%", shift: "+", cmd: "^", meta: "^", win: "^" };

async function key(combo) {
  const parts = String(combo).toLowerCase().split("+").map((p) => p.trim());
  const base = parts.pop();
  if (PLATFORM === "win32") {
    const mods = parts.map((m) => WIN_MODS[m] || "").join("");
    const k = WIN_KEYS[base] || base;
    return psRun(`[System.Windows.Forms.SendKeys]::SendWait("${mods}${k}")`);
  }
  if (PLATFORM === "darwin") {
    const using = parts
      .map((m) => ({ cmd: "command down", meta: "command down", ctrl: "control down", control: "control down", alt: "option down", option: "option down", shift: "shift down" }[m]))
      .filter(Boolean);
    const usingClause = using.length ? ` using {${using.join(", ")}}` : "";
    // Special keys use `key code` (works WITH modifiers too — fixes Cmd+Enter
    // etc.); regular characters use `keystroke`.
    const code = macKeyCode(base);
    if (code != null) return run("osascript", ["-e", `tell application "System Events" to key code ${code}${usingClause}`]);
    return run("osascript", ["-e", `tell application "System Events" to keystroke ${JSON.stringify(base)}${usingClause}`]);
  }
  return run("xdotool", ["key", parts.concat(base).join("+")]);
}

function macKeyCode(k) {
  // Returns a key code for special keys, or undefined for regular characters
  // (which go through `keystroke`). Must NOT default — defaulting to Return
  // would turn every unknown key into Enter.
  return { enter: 36, return: 36, tab: 48, space: 49, escape: 53, esc: 53, backspace: 51, delete: 51, left: 123, right: 124, down: 125, up: 126 }[k];
}

async function scroll(amount) {
  if (PLATFORM === "win32") return psRun(`BHScroll ${amount}`);
  if (PLATFORM === "darwin") return run("osascript", ["-e", `tell application "System Events" to scroll ${amount > 0 ? "up" : "down"}`]).catch(() => "");
  return run("xdotool", ["click", amount > 0 ? "4" : "5"]);
}

/** Execute one normalized computer-use action. */
async function act(action) {
  const a = action || {};
  switch (a.type) {
    case "move": return move(a.x, a.y);
    case "click": return click(a.x, a.y, a.button || "left", a.count || 1);
    case "double_click": return doubleClick(a.x, a.y);
    case "type": return type(a.text || "");
    case "key": return key(a.key || a.combo || "");
    case "scroll": return scroll(a.amount ?? a.delta ?? (a.direction === "up" ? 3 : -3));
    case "wait": return new Promise((r) => setTimeout(r, Math.min(5000, a.ms || 500)));
    default: throw new Error(`unknown action: ${a.type}`);
  }
}

module.exports = { act, move, click, doubleClick, type, key, scroll, supported: ["win32", "darwin", "linux"].includes(PLATFORM) };
