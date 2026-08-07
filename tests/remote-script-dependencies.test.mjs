import assert from "node:assert/strict";
import fs from "node:fs";
import { getRemoteScriptFiles, remoteScriptDependencies, runScriptSomewhere } from "../utils.js";

const factionManagerFiles = getRemoteScriptFiles("faction-manager.js");
assert.ok(factionManagerFiles.includes("faction-manager.js"));
assert.ok(factionManagerFiles.includes("donation-favor.js"),
  "remote faction-manager launches must copy the new imported favor module");
assert.ok(factionManagerFiles.includes("utils.js"));
assert.equal(new Set(factionManagerFiles).size, factionManagerFiles.length,
  "the remote runtime bundle should not copy duplicate paths");
assert.ok(remoteScriptDependencies.includes("donation-favor.js"));

const source = fs.readFileSync(new URL("../utils.js", import.meta.url), "utf8");
assert.match(source, /for \(const dependency of getRemoteScriptFiles\(script\)\)/,
  "runScriptSomewhere must use the complete runtime dependency bundle");
assert.match(source, /Date\.now\(\) - startedWaiting >= remoteLaunchTimeout/,
  "a failed non-persistent remote launch must eventually return control to autopilot");

const portResults = new Map();
const copied = [];
let nextPid = 100;
const ns = {
  print: () => {},
  getScriptRam: () => 24,
  hasRootAccess: () => true,
  sleep: async () => {},
  exec(script, host, _options, ...args) {
    if (script === "bin/getServerAvailRam.js") {
      const pid = nextPid++;
      portResults.set(pid, args[0] === "home" ? 0 : 64);
      return pid;
    }
    if (script === "bin/getServersLight.js") {
      const pid = nextPid++;
      portResults.set(pid, ["home", "n00dles"]);
      return pid;
    }
    if (script === "bin/scp.js") {
      const pid = nextPid++;
      copied.push(args[0]);
      portResults.set(pid, true);
      return pid;
    }
    if (script === "faction-manager.js" && host === "n00dles")
      return copied.includes("donation-favor.js") ? 999 : 0;
    return 0;
  },
  nextPortWrite: async () => {},
  readPort: pid => portResults.get(pid),
};
const launchedPid = await runScriptSomewhere(ns, "faction-manager.js", false, []);
assert.equal(launchedPid, 999, "faction-manager should launch successfully away from home");
assert.deepEqual(copied, factionManagerFiles,
  "the remote launch must copy the target and every shared runtime dependency before ns.exec");

console.log("remote script dependency tests passed");
