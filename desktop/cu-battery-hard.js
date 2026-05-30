// HARD test battery — tasks that stress the harness where a simple loop tends to
// break: web navigation + reading dynamic content, a long cross-app workflow
// that carries data between apps, and dense nested-UI navigation with precise
// reads. Safe + self-contained (public pages, fresh apps, nothing saved/sent).
// Invoke: electron cu-battery-hard.js
const { app } = require("electron");
const { execFileSync } = require("child_process");

const loop = require("./computer-loop");

const TASKS = [
  {
    id: "web-extract",
    goal: "Open Microsoft Edge, navigate to en.wikipedia.org/wiki/Computer, and report the exact first sentence of the article's body text.",
    expect: "first sentence of the Wikipedia 'Computer' article (defines a computer)",
  },
  {
    id: "long-cross-app",
    goal: "In Notepad, type 'Shopping' on the first line, then on new lines type apples, bananas, and cherries (each on its own line). Then open the Windows Calculator and compute 3 times 250. Then switch back to Notepad and add a final line that says 'Budget: ' followed by the calculator's result.",
    expect: "Notepad has Shopping/apples/bananas/cherries/Budget: 750",
  },
  {
    id: "dense-read",
    goal: "Open Windows Settings, go to System and then About, and report the exact Device name and the Installed RAM shown on that page.",
    expect: "exact device name + RAM (e.g. '16.0 GB')",
  },
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
      res = await loop.runComputerUse({ goal: t.goal, maxSteps: 22, onStep: () => {} });
    } catch (e) {
      res = { error: e && e.message };
    }
    const secs = Math.round((Date.now() - start) / 1000);
    console.log(
      `RESULT [${t.id}] ` +
        JSON.stringify({ done: !!res.done, steps: res.steps, error: res.error, secs, text: (res.text || "").replace(/\s+/g, " ").slice(0, 320) }),
    );
  }
  cleanupApps();
  console.log("\n=== HARD BATTERY DONE");
  app.quit();
});
