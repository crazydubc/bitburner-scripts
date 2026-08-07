import assert from "node:assert/strict";
import { filterDownloadableFiles } from "../git-pull.js";

assert.deepEqual(filterDownloadableFiles(
  ["autopilot.js", "donation-favor.js", "notes.md", "Temp/stale.js", "Tasks/task.ts"],
  [".js", ".ts"],
  ["Temp/"],
), ["autopilot.js", "donation-favor.js", "Tasks/task.ts"]);

console.log("git-pull fallback filtering test passed");
