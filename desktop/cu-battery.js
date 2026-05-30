// Hard-test battery for the computer-use harness. Runs a diverse set of SAFE,
// self-contained tasks (fresh apps only — nothing saved, sent, or touching the
// user's real files/work) and prints per-task results so we can see where OURS
// breaks across capability types. Invoke: electron cu-battery.js
const { app } = require("electron");
const { execFileSync } = require("child_process");

const loop = require("./computer-loop");

// Each: a distinct capability. expect = a short note on what success looks like.
const TASKS = [
  { id: "type-multiline", goal: "Open Notepad and type exactly these three lines, each on its own line: milk, then eggs, then bread.", expect: "Notepad shows 3 lines: milk / eggs / bread" },
  { id: "calc-parens", goal: "Open the Windows Calculator and compute (15 + 27) * 3, then report the result.", expect: "result 126" },
  { id: "explorer-read", goal: "Open File Explorer, go to This PC, and tell me which disk drive letters are listed.", expect: "reports drive letters e.g. C:" },
  { id: "multi-app", goal: "Open Notepad and type the word hello, then open the Windows Calculator and compute 12 times 12, and report the calculator's result.", expect: "calculator result 144 (and notepad had 'hello')" },
];

function cleanupApps() {
  for (const name of ["notepad", "CalculatorApp", "Calculator"]) {
    try {
      execFileSync("taskkill", ["/F", "/IM", `${name}.exe`, "/T"], { stdio: "ignore" });
    } catch {
      /* not running */
    }
  }
}

app.whenReady().then(async () => {
  for (const t of TASKS) {
    cleanupApps();
    await new Promise((r) => setTimeout(r, 800));
    console.log(`\n=== TASK [${t.id}] ${t.goal}`);
    console.log(`    expect: ${t.expect}`);
    const start = Date.now();
    let res;
    try {
      res = await loop.runComputerUse({ goal: t.goal, maxSteps: 16, onStep: () => {} });
    } catch (e) {
      res = { error: e && e.message };
    }
    const secs = Math.round((Date.now() - start) / 1000);
    console.log(
      `RESULT [${t.id}] ` +
        JSON.stringify({ done: !!res.done, steps: res.steps, replayed: !!res.replayed, error: res.error, secs, text: (res.text || "").replace(/\s+/g, " ").slice(0, 240) }),
    );
  }
  cleanupApps();
  console.log("\n=== BATTERY DONE");
  app.quit();
});
