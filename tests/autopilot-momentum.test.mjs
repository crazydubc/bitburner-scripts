import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import vm from "node:vm";

// SourceTextModule still requires this Node flag. Re-exec transparently so the test also works
// when the repository's tests are invoked as plain `node tests/*.test.mjs` commands.
if (typeof vm.SourceTextModule !== "function") {
  const child = spawnSync(process.execPath, ["--experimental-vm-modules", import.meta.filename, "--vm-child"], {
    encoding: "utf8",
  });
  process.stdout.write(child.stdout);
  process.stderr.write(child.stderr);
  process.exit(child.status ?? 1);
}

const autopilotSource = fs.readFileSync(new URL("../autopilot.js", import.meta.url), "utf8");
const donationFavorSource = fs.readFileSync(new URL("../donation-favor.js", import.meta.url), "utf8");
const FOUR_HOURS = 4 * 60 * 60 * 1000;
const STARTED_AT = 1_800_000_000_000; // Non-zero epoch exposes accidental duration/epoch comparisons.

async function runMomentumScenario({
  firstAugAfter = 0,
  accelerated = false,
  has4sApi = true,
  cycleAgeAtStart = 0,
  snapshotAge = 0,
}) {
  let now = STARTED_AT;
  const augmentationResetAt = STARTED_AT - cycleAgeAtStart;
  let loops = 0;
  let firstQueuedAt = null;
  const logs = [];
  const launches = [];

  const player = {
    money: 1e12,
    factions: ["CyberSec"],
    skills: { hacking: 100, intelligence: 200 },
  };
  const baseFactionManagerOutput = {
    current_node: 4,
    last_aug_reset: augmentationResetAt,
    donation_favor_progress: [],
    affordable_count_ex_nf: 0,
    awaiting_install_count_ex_nf: 0,
    affordable_count_nf: 0,
    awaiting_install_count_nf: 0,
    affordable_augs: [],
    awaiting_install_augs: [],
    total_rep_cost: 0,
    total_aug_cost: 1,
  };

  const context = vm.createContext({
    console,
    Date: class extends Date {
      static now() { return now; }
    },
    Math,
    Number,
    Object,
    Array,
    Set,
    Map,
    JSON,
    String,
    Boolean,
    Error,
    Promise,
  });

  const utilityNames = [
    "log", "getReset", "getPlayerInfo", "getBNMults", "getErrorInfo", "isScriptRunning", "getStocksValue", "destroyWD",
    "launchScriptHelper", "crackHosts", "getActiveSourceFiles", "formatDuration", "disableLogs", "getOwnedAugs", "getFacInvReqs",
    "singRun", "formatMoney", "getServerMaxRam", "getPortCrackers", "getServers", "runScriptSomewhere", "runScriptLocal", "doSCP",
    "gangRun", "sleeveRun", "stanekRun", "bbRun",
  ];
  const utilities = {
    log: (_ns, message) => logs.push(String(message)),
    getReset: async () => ({ currentNode: 4, lastNodeReset: STARTED_AT, lastAugReset: augmentationResetAt }),
    getPlayerInfo: async () => player,
    getBNMults: async () => ({
      DaedalusAugsRequirement: 30,
      HacknetNodeMoney: 1,
      ScriptHackMoneyGain: 1,
      ScriptHackMoney: 1,
      FourSigmaMarketDataApiCost: 1,
      FourSigmaMarketDataCost: 1,
      BladeburnerRank: 1,
    }),
    getErrorInfo: error => error?.stack ?? String(error),
    isScriptRunning: async () => true,
    getStocksValue: async () => 0,
    destroyWD: async () => {},
    launchScriptHelper: async () => 1,
    crackHosts: async () => {},
    getActiveSourceFiles: async () => ({ 4: 3 }),
    formatDuration: value => `${Math.round(value)}ms`,
    disableLogs: () => {},
    getOwnedAugs: async () => ["CashRoot Starter Kit"],
    getFacInvReqs: async () => ({}),
    singRun: async (_ns, command) => command === "getCurrentWork" ? null : false,
    formatMoney: value => `$${value}`,
    getServerMaxRam: async () => 1024,
    getPortCrackers: async () => [],
    getServers: async () => [{ hostname: "home", hasAdminRights: true, maxRam: 1024 }],
    runScriptSomewhere: async () => 1,
    runScriptLocal: async (_ns, script, persistent, args) => {
      launches.push({ script, persistent, args, at: now });
      return 123;
    },
    doSCP: async () => true,
    gangRun: async () => false,
    sleeveRun: async () => false,
    stanekRun: async () => false,
    bbRun: async () => false,
  };
  const utilityModule = new vm.SyntheticModule(utilityNames, function () {
    for (const name of utilityNames) this.setExport(name, utilities[name]);
  }, { context });
  const loggerModule = new vm.SyntheticModule(["recordBnStart", "printBnRunSummary", "RUNLOG_FILE"], function () {
    this.setExport("recordBnStart", async () => {});
    this.setExport("printBnRunSummary", () => {});
    this.setExport("RUNLOG_FILE", "runlog.txt");
  }, { context });
  const donationFavorModule = new vm.SourceTextModule(donationFavorSource, {
    context,
    identifier: "donation-favor.js",
  });
  const autopilotModule = new vm.SourceTextModule(autopilotSource, {
    context,
    identifier: "autopilot.js",
  });
  await autopilotModule.link(async specifier => {
    if (specifier === "./utils.js") return utilityModule;
    if (specifier === "./logger.js") return loggerModule;
    if (specifier === "./donation-favor.js") return donationFavorModule;
    throw new Error(`Unexpected import: ${specifier}`);
  });
  await autopilotModule.evaluate();

  const ns = {
    ramOverride: () => {},
    getHostname: () => "home",
    getScriptName: () => "autopilot.js",
    getServerMoneyAvailable: () => player.money,
    stock: {
      has4SDataTixApi: () => has4sApi,
      has4SData: () => has4sApi,
    },
    corporation: { hasCorporation: () => false },
    fileExists: () => false,
    read: path => {
      if (path !== "/Temp/affordable-augs.txt") return "0";
      const queued = now - STARTED_AT >= firstAugAfter;
      if (queued && firstQueuedAt === null) firstQueuedAt = now;
      return JSON.stringify({
        ...baseFactionManagerOutput,
        generated_at: now - snapshotAge,
        affordable_count_ex_nf: queued ? 3 : 0,
        affordable_augs: queued ? ["BitWire", "Synaptic Enhancement Implant", "Neurotrainer I"] : [],
      });
    },
    write: () => true,
    scan: () => [],
    getServerRequiredHackingLevel: () => Infinity,
    hasRootAccess: () => false,
    sleep: async milliseconds => {
      if (launches.some(call => call.script === "ascend.js")) throw new Error("HARNESS_COMPLETE");
      // Five-minute main-loop ticks make the >4-hour scenario finish in under 50 iterations.
      now += accelerated && milliseconds === 1000 ? 5 * 60 * 1000 : milliseconds;
      if (++loops > 500) throw new Error("HARNESS_TIMEOUT");
    },
  };

  try {
    await autopilotModule.namespace.main(ns);
  } catch (error) {
    if (!String(error).includes("HARNESS_COMPLETE") && !String(error).includes("HARNESS_TIMEOUT")) throw error;
  }

  return {
    logs,
    firstQueuedAt,
    ascend: launches.filter(call => call.script === "ascend.js"),
  };
}

const ordinary = await runMomentumScenario({ firstAugAfter: 0 });
assert.equal(ordinary.logs.filter(line => line.includes("Pending augs: 3")).length, 1,
  "ordinary momentum tracking should report the three queued augmentations");
assert.equal(ordinary.ascend.length, 1,
  "three queued augmentations should trigger a diminishing-return reset after the expected wait");
const ordinaryResetDelay = ordinary.ascend[0].at - ordinary.firstQueuedAt;
assert.ok(ordinaryResetDelay >= 100_000 && ordinaryResetDelay <= 102_000,
  `the normal reset should honor the 100-second minimum next-augmentation wait (observed ${ordinaryResetDelay}ms)`);
assert.equal(ordinary.ascend[0].args.includes("--allow-soft-reset"), false,
  "an ordinary augmentation reset must not request a soft reset");

const late = await runMomentumScenario({ firstAugAfter: FOUR_HOURS + 1, accelerated: true });
assert.ok(late.logs.some(line => line.includes("Pending augs: 3")),
  "augmentations first queued after the four-hour deadline must still be reported");
assert.equal(late.ascend.length, 1,
  "augmentations first queued after the four-hour deadline must trigger a reset");
assert.equal(late.ascend[0].at, late.firstQueuedAt,
  "the four-hour maximum should launch ascend in the same cycle that queued augmentations are observed");
assert.equal(late.ascend[0].args.includes("--allow-soft-reset"), false,
  "the forced four-hour augmentation reset must remain an ordinary install");

const optimizationBlocked = await runMomentumScenario({ accelerated: true, has4sApi: false });
assert.equal(optimizationBlocked.ascend.length, 1,
  "the four-hour hard cap must eventually override the ordinary 4S optimization delay");
assert.ok(optimizationBlocked.ascend[0].at - STARTED_AT >= FOUR_HOURS,
  "the 4S optimization should still be honored until the hard cap is reached");
assert.equal(optimizationBlocked.ascend[0].args.includes("--allow-soft-reset"), false);

const restartedOldCycle = await runMomentumScenario({ cycleAgeAtStart: FOUR_HOURS + 1 });
assert.equal(restartedOldCycle.ascend.length, 1,
  "restarting autopilot must not restart an already-old augmentation cycle's four-hour clock");
assert.equal(restartedOldCycle.ascend[0].at, STARTED_AT,
  "an already-expired augmentation cycle should ascend on the first observed queue");

const staleQueue = await runMomentumScenario({ snapshotAge: 2 * 60_000 + 1 });
assert.equal(staleQueue.ascend.length, 0,
  "metadata-bearing stale faction-manager output must not trigger an augmentation reset");
assert.ok(staleQueue.logs.some(line => line.includes("Ignoring a faction-manager augmentation queue")),
  "stale queue output should produce a visible diagnostic instead of failing silently");

console.log("autopilot augmentation momentum tests passed");
