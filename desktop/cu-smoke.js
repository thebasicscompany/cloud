// Standalone smoke test for the FULL computer-use loop (eyes→brain→hands).
// Runs ONE contained, safe goal end-to-end on the real machine, prints each
// step + the result, then quits. Invoke with:  electron cu-smoke.js
// Override the goal with CU_GOAL. Keep goals harmless + low-step for testing.
const { app } = require("electron");

const loop = require("./computer-loop");

app.whenReady().then(async () => {
  const goal = process.env.CU_GOAL || "Open the Windows Start menu, then stop.";
  const maxSteps = Number(process.env.CU_MAX_STEPS || 4);
  console.log("CU-SMOKE goal:", goal, "| maxSteps:", maxSteps);
  try {
    const res = await loop.runComputerUse({
      goal,
      maxSteps,
      onStep: (s) => console.log("STEP", JSON.stringify(s)),
    });
    console.log("CU-SMOKE RESULT:", JSON.stringify(res));
  } catch (e) {
    console.log("CU-SMOKE ERROR:", e && e.message);
  }
  app.quit();
});
