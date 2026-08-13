from pathlib import Path


def patch_file(path, replacements):
    file = Path(path)
    text = file.read_text()
    for label, old, new in replacements:
        count = text.count(old)
        if count != 1:
            raise RuntimeError(f"{path} / {label}: expected one anchor, found {count}")
        text = text.replace(old, new, 1)
    file.write_text(text)


patch_file("autopilot.js", [
    (
        "import corporate faction list",
        "  CASHROOT_AUG, INTEL_FARM_STATE_FILE, INTEL_FARM_TARGET, getMissingCorporateFactions,\n",
        "  CASHROOT_AUG, CORPORATE_FACTIONS, INTEL_FARM_STATE_FILE, INTEL_FARM_TARGET, getMissingCorporateFactions,\n",
    ),
    (
        "CashRoot reserve state",
        "  let cachedIntelFarmState = null;\n",
        "  let cachedIntelFarmState = null;\n  let intelFarmCashRootPrice = 125_000_000;\n",
    ),
    (
        "conflicting player-work helpers",
        "        if (process.filename === \"work-for-faction2.js\") ns.kill(process.pid);",
        "        const ownsPlayerWork = process.filename === \"work-for-faction2.js\" ||\n"
        "          ([\"cashroot\", \"corporate-invites\"].includes(phase) && process.filename === \"bladeburner.js\");\n"
        "        if (ownsPlayerWork) ns.kill(process.pid);",
    ),
    (
        "direct CashRoot purchase and install",
        "    const installedOnly = await getOwnedAugs(ns, false);\n",
        '''    const installedOnly = await getOwnedAugs(ns, false);
    const ownedWithQueued = await getOwnedAugs(ns, true);
    if (!Array.isArray(installedOnly) || !Array.isArray(ownedWithQueued))
      throw new Error(`Unable to read augmentation ownership during INT preparation.`);

    if (!installedOnly.includes(CASHROOT_AUG)) {
      const price = Number(await singRun(ns, "getAugmentationPrice", CASHROOT_AUG));
      if (Number.isFinite(price) && price > 0) intelFarmCashRootPrice = price;

      if (ownedWithQueued.includes(CASHROOT_AUG)) {
        logIntelFarmStatus(ns, "cashroot-installing",
          `Installing ${CASHROOT_AUG} before earning corporate company reputation.`, "success");
        await persistIntelFarmState(ns, {
          phase: "cashroot-installing",
          currentNode: resetInfo.currentNode,
          lastNodeReset: resetInfo.lastNodeReset,
          missingCorporateFactions: [],
        });
        await singRun(ns, "installAugmentations", ns.getScriptName());
        return "handoff";
      }

      const incompatibleCityFactions = ["Chongqing", "New Tokyo", "Ishima", "Volhaven"];
      if (!player.factions.includes("Sector-12") &&
        incompatibleCityFactions.some(faction => player.factions.includes(faction))) {
        logIntelFarmStatus(ns, "cashroot-city-reset",
          `A mutually-exclusive city faction blocks Sector-12. Soft-resetting in place before CashRoot prep.`,
          "warning");
        await persistIntelFarmState(ns, {
          phase: "cashroot",
          currentNode: resetInfo.currentNode,
          lastNodeReset: resetInfo.lastNodeReset,
          missingCorporateFactions: [],
        });
        await singRun(ns, "softReset", ns.getScriptName());
        return "handoff";
      }

      if (player.factions.includes("Sector-12")) {
        const repRequirement = Number(await singRun(ns, "getAugmentationRepReq", CASHROOT_AUG));
        const factionRep = Number(await singRun(ns, "getFactionRep", "Sector-12"));
        if (Number.isFinite(repRequirement) && Number.isFinite(factionRep) &&
          factionRep >= repRequirement && player.money >= intelFarmCashRootPrice &&
          await singRun(ns, "purchaseAugmentation", "Sector-12", CASHROOT_AUG) === true) {
          logIntelFarmStatus(ns, "cashroot-purchased",
            `Purchased ${CASHROOT_AUG}; installing it before corporate invitation preparation.`, "success");
          await persistIntelFarmState(ns, {
            phase: "cashroot-installing",
            currentNode: resetInfo.currentNode,
            lastNodeReset: resetInfo.lastNodeReset,
            missingCorporateFactions: [],
          });
          await singRun(ns, "installAugmentations", ns.getScriptName());
          return "handoff";
        }
      }
    }
''',
    ),
    (
        "require joined corporate factions",
        '''    const pendingInvites = await singRun(ns, "checkFactionInvitations");
    if (!Array.isArray(pendingInvites))
      throw new Error(`checkFactionInvitations returned ${String(pendingInvites)}`);
    const missingCorporateFactions = getMissingCorporateFactions(player.factions, pendingInvites);
''',
        '''    const pendingInvites = await singRun(ns, "checkFactionInvitations");
    if (!Array.isArray(pendingInvites))
      throw new Error(`checkFactionInvitations returned ${String(pendingInvites)}`);
    let joinedCorporateFaction = false;
    for (const faction of pendingInvites.filter(faction => CORPORATE_FACTIONS.includes(faction))) {
      if (await singRun(ns, "joinFaction", faction) === true) joinedCorporateFaction = true;
    }
    if (joinedCorporateFaction) player = await getPlayerInfo(ns);
    // Invitations alone are not sufficient: company reputation is reset, so every company faction must be joined
    // before the farming reset can recreate it as a maintained invitation.
    const missingCorporateFactions = getMissingCorporateFactions(player.factions, []);
''',
    ),
    (
        "same-BitNode farming handoff",
        '''    if (await isScriptRunning(ns, "farm-intel.js")) return "handoff";

    await singRun(ns, "stopAction");
    const farmRam = ns.getScriptRam("farm-intel.js", "home");
    const freeHomeRam = ns.getServerMaxRam("home") - ns.getServerUsedRam("home");
    if (!(farmRam > 0) || freeHomeRam < farmRam) {
      logIntelFarmStatus(ns, "waiting-home-ram",
        `Waiting to start farm-intel.js on home: ${farmRam.toFixed(1)} GB required, ` +
        `${freeHomeRam.toFixed(1)} GB free.`, "warning");
      return "preparing";
    }
    const pid = ns.exec("farm-intel.js", "home", {threads: 1, temporary: true});
    if (pid > 0) {
      await persistIntelFarmState(ns, {
        phase: "running",
        farmPid: pid,
        currentNode: resetInfo.currentNode,
        lastNodeReset: resetInfo.lastNodeReset,
        missingCorporateFactions: [],
      });
      logIntelFarmStatus(ns, "running",
        `CashRoot and all corporate invitations are ready. Starting the intelligence farm in ` +
        `BitNode ${resetInfo.currentNode}.`, "success");
      return "handoff";
    }

    logIntelFarmStatus(ns, "launch-failed",
      "Unable to launch farm-intel.js on home; retaining preparation state and retrying.", "warning");
    return "preparing";
''',
        '''    await singRun(ns, "stopAction");
    await persistIntelFarmState(ns, {
      phase: "running",
      currentNode: resetInfo.currentNode,
      lastNodeReset: resetInfo.lastNodeReset,
      missingCorporateFactions: [],
    });
    logIntelFarmStatus(ns, "running",
      `CashRoot and all corporate factions are joined. Resetting in BitNode ${resetInfo.currentNode} ` +
      `so the first farm cycle can accept every maintained invitation.`, "success");
    await singRun(ns, "softReset", "farm-intel.js");
    return "handoff";
''',
    ),
    (
        "protect preparation from ordinary resets",
        '''    const intelFarmAction = await manageIntelFarm(ns);
    if (intelFarmAction === "handoff") return false;
    const preparingIntelFarm = intelFarmAction === "preparing";
    manageReservedMoney(ns, player, stocksValue);
    if (!preparingIntelFarm) {
      await checkOnDaedalusStatus(ns, player, stocksValue);
      await checkIfBnIsComplete(ns);
    }
    await maybeAcceptStaneksGift(ns);
    await runPeriodicScripts(ns);
    await checkOnRunningScripts(ns);
    await maybeInstallAugmentations(ns, player);
''',
        '''    const intelFarmAction = await manageIntelFarm(ns);
    if (intelFarmAction === "handoff") return false;
    const preparingIntelFarm = intelFarmAction === "preparing";
    manageReservedMoney(ns, player, stocksValue);
    if (!preparingIntelFarm) {
      await checkOnDaedalusStatus(ns, player, stocksValue);
      await checkIfBnIsComplete(ns);
      await maybeAcceptStaneksGift(ns);
    }
    await runPeriodicScripts(ns);
    await checkOnRunningScripts(ns);
    if (!preparingIntelFarm) await maybeInstallAugmentations(ns, player);
''',
    ),
    (
        "reserve CashRoot money",
        '  function manageReservedMoney(ns, player, stocksValue) {\n    if (reservedPurchase) return;',
        '  function manageReservedMoney(ns, player, stocksValue) {\n'
        '    if (intelFarmPhase === "cashroot") {\n'
        '      const currentReserve = Number(ns.read("reserve.txt") || 0);\n'
        '      const reserve = Math.ceil(intelFarmCashRootPrice);\n'
        '      return currentReserve == reserve ? true : ns.write("reserve.txt", reserve, "w");\n'
        '    }\n'
        '    if (reservedPurchase) return;',
    ),
    (
        "keep CashRoot reserve out of stocks",
        '      shouldRun: () => (reqRam(3000) || !shouldImproveHacking(ns)) && (getTimeInAug() > 20000 || resetInfo.currentNode == 8),',
        '      shouldRun: () => intelFarmPhase !== "cashroot" &&\n'
        '        (reqRam(3000) || !shouldImproveHacking(ns)) &&\n'
        '        (getTimeInAug() > 20000 || resetInfo.currentNode == 8),',
    ),
    (
        "give preparation ownership of player work",
        '      shouldRun: () => 7 in unlockedSFs && bitNodeMults.BladeburnerRank > 0,',
        '      shouldRun: () => !["cashroot", "corporate-invites"].includes(intelFarmPhase) &&\n'
        '        7 in unlockedSFs && bitNodeMults.BladeburnerRank > 0,',
    ),
    (
        "hold World Daemon completion",
        '  async function checkIfBnIsComplete(ns) {\n    // Check if there is some reason not to automatically destroy this BN',
        '  async function checkIfBnIsComplete(ns) {\n'
        '    if (!["inactive", "complete"].includes(intelFarmPhase)) return false;\n'
        '    // Check if there is some reason not to automatically destroy this BN',
    ),
])

patch_file("farm-intel.js", [
    (
        "hard INT target import",
        '  INTEL_FARM_STATS_FILE, getMissingCorporateFactions, writeIntelFarmState\n',
        '  INTEL_FARM_STATS_FILE, INTEL_FARM_TARGET, getMissingCorporateFactions, writeIntelFarmState\n',
    ),
    (
        "hard INT target",
        '  let stopForLowROI = false;\n',
        '  let stopForLowROI = intelligence >= INTEL_FARM_TARGET;\n',
    ),
])

patch_file("work-for-faction2.js", [
    (
        "CashRoot shared constant",
        "import {CORPORATE_FACTIONS} from './intel-farm.js';",
        "import {CASHROOT_AUG, CORPORATE_FACTIONS} from './intel-farm.js';",
    ),
    (
        "CashRoot preparation mode",
        '  const namedDesiredAugs = [...new Set([...priorityAugs, ...DEFAULT_DESIRED_AUGS, ...desiredAugOverrides])];\n',
        '  const namedDesiredAugs = [...new Set([...priorityAugs, ...DEFAULT_DESIRED_AUGS, ...desiredAugOverrides])];\n'
        '  const collectCashRoot = priorityAugs.includes(CASHROOT_AUG);\n',
    ),
    (
        "preparation owns player work",
        '    if (await isBladeburnerInterruption()) return true;\n    if (collectAllCompanyInvites) {',
        '    if (!collectCashRoot && !collectAllCompanyInvites && await isBladeburnerInterruption()) return true;\n'
        '    if (collectAllCompanyInvites) {',
    ),
])
