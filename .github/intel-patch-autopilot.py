from pathlib import Path

path = Path("autopilot.js")
text = path.read_text()


def replace_once(old, new, label):
    global text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one anchor, found {count}")
    text = text.replace(old, new, 1)


replace_once(
    "  getServers, runScriptSomewhere, runScriptLocal, doSCP, gangRun, sleeveRun, stanekRun, bbRun, bitflume\n",
    "  getServers, runScriptSomewhere, runScriptLocal, doSCP, gangRun, sleeveRun, stanekRun, bbRun\n",
    "remove BN8 bitflume import",
)
replace_once(
    "} from './donation-favor.js'\n",
    "} from './donation-favor.js'\nimport {\n"
    "  CASHROOT, CASHROOT_FACTION, CORPORATE_FACTIONS, INTEL_FARM_MAX_INT, INTEL_FARM_STATS_FILE,\n"
    "  IntelFarmPhase, createIntelFarmState, isIntelFarmActive, isIntelFarmPrep,\n"
    "  missingCorporateFactions, readIntelFarmState, shouldStartIntelFarm,\n"
    "  stateMatchesCurrentBitNode, writeIntelFarmState\n"
    "} from './intel-farm-state.js';\n",
    "add lifecycle import",
)
replace_once(
    "  let lastFactionManagerWarning = 0;\n  const lastRestart = Date.now();",
    "  let lastFactionManagerWarning = 0;\n"
    "  let intelFarmState = readIntelFarmState(ns);\n"
    "  let cashRootCost = 125_000_000;\n"
    "  let lastIntelFarmStatus = '';\n"
    "  let lastIntelFarmWorkerMode = '';\n"
    "  const lastRestart = Date.now();",
    "add lifecycle state",
)
replace_once(
    "  let playerInGang = false;\n\n  //in order by importance!",
    "  let playerInGang = false;\n\n"
    "  const cashRootPrepActive = () => [IntelFarmPhase.CashRoot, IntelFarmPhase.CashRootInstalling]\n"
    "    .includes(intelFarmState?.phase);\n"
    "  const intelFarmWorkArgs = () => {\n"
    "    if (intelFarmState?.phase === IntelFarmPhase.CashRoot ||\n"
    "      intelFarmState?.phase === IntelFarmPhase.CashRootInstalling) return ['--intel-farm-cashroot'];\n"
    "    if (intelFarmState?.phase === IntelFarmPhase.CorporateFactions) return ['--intel-farm-corporate'];\n"
    "    return 2 in unlockedSFs && !playerInGang ?\n"
    "      ['--fast-crimes-only', '--get-invited-to-every-faction', '--crime-focus',\n"
    "        '--training-stat-per-multi-threshold', 200, '--prioritize-invites'] :\n"
    "      ['--fast-crimes-only', '--get-invited-to-every-faction'];\n"
    "  };\n\n"
    "  //in order by importance!",
    "add worker mode selector",
)
replace_once(
    "      args: () => 2 in unlockedSFs && !playerInGang ? ['--fast-crimes-only', '--get-invited-to-every-faction', \"--crime-focus\",\n"
    "        \"--training-stat-per-multi-threshold\", 200, \"--prioritize-invites\"] : ['--fast-crimes-only', '--get-invited-to-every-faction']",
    "      args: intelFarmWorkArgs",
    "select preparation worker arguments",
)
replace_once(
    "      shouldRun: () => (reqRam(3000) || !shouldImproveHacking(ns)) && (getTimeInAug() > 20000 || resetInfo.currentNode == 8),",
    "      shouldRun: () => !cashRootPrepActive() &&\n"
    "        (reqRam(3000) || !shouldImproveHacking(ns)) &&\n"
    "        (getTimeInAug() > 20000 || resetInfo.currentNode == 8),",
    "protect CashRoot budget from stockmaster",
)
replace_once(
    "      shouldRun: () => 7 in unlockedSFs && bitNodeMults.BladeburnerRank > 0,",
    "      shouldRun: () => !isIntelFarmPrep(intelFarmState) &&\n"
    "        7 in unlockedSFs && bitNodeMults.BladeburnerRank > 0,",
    "give preparation ownership of player work",
)
old_detour = """    //this gets up about 12.25% boost to stats in a short time.
    if ((5 in unlockedSFs) && player.skills.intelligence > 1 && player.skills.intelligence < 200) {
      if (resetInfo.currentNode != 8) {
        await bitflume(ns, 8, 'autopilot.js')
      } else {
        await launchScriptHelper(ns, 'farm-intel.js');
      }
    }
"""
replace_once(old_detour,
             "    // Same-BitNode INT preparation and farming are advanced by handleIntelFarmLifecycle().\n",
             "remove BN8 detour")

lifecycle = r'''
  function updateIntelFarmState(patch) {
    intelFarmState = writeIntelFarmState(ns, {...intelFarmState, ...patch});
    return intelFarmState;
  }

  function logIntelFarmStatus(message, style = 'info') {
    if (message === lastIntelFarmStatus) return;
    lastIntelFarmStatus = message;
    log(ns, message, true, style);
  }

  async function ensureIntelFarmWorkerMode() {
    let expectedFlag = null;
    if ([IntelFarmPhase.CashRoot, IntelFarmPhase.CashRootInstalling].includes(intelFarmState?.phase))
      expectedFlag = '--intel-farm-cashroot';
    else if (intelFarmState?.phase === IntelFarmPhase.CorporateFactions)
      expectedFlag = '--intel-farm-corporate';
    if (!expectedFlag || expectedFlag === lastIntelFarmWorkerMode) return;

    const servers = await getServers(ns);
    for (const server of servers) {
      for (const process of ns.ps(server.hostname)) {
        if (process.filename === 'work-for-faction2.js' && !process.args.includes(expectedFlag)) ns.kill(process.pid);
      }
    }
    lastIntelFarmWorkerMode = expectedFlag;
  }

  async function joinPendingCorporateInvitations() {
    const invitations = await singRun(ns, 'checkFactionInvitations');
    if (Array.isArray(invitations)) {
      for (const faction of invitations) {
        if (CORPORATE_FACTIONS.includes(faction)) await singRun(ns, 'joinFaction', faction);
      }
    }
    player = await getPlayerInfo(ns);
    return missingCorporateFactions(player.factions ?? []);
  }

  async function handleIntelFarmLifecycle(ns) {
    if (!intelFarmState && 4 in unlockedSFs && shouldStartIntelFarm({
      state: intelFarmState,
      resetInfo,
      ownedSourceFiles: dictOwnedSourceFiles,
      intelligence: player.skills.intelligence,
    })) {
      intelFarmState = writeIntelFarmState(ns, createIntelFarmState(resetInfo, player.skills.intelligence));
      logIntelFarmStatus(`Starting one-time INT preparation in BN${resetInfo.currentNode}; acquiring ${CASHROOT} first.`,
        'success');
    }

    if (!intelFarmState || intelFarmState.phase === IntelFarmPhase.Complete) return false;
    if (!stateMatchesCurrentBitNode(intelFarmState, resetInfo)) {
      intelFarmState = writeIntelFarmState(ns, {
        ...intelFarmState,
        phase: IntelFarmPhase.Complete,
        completedAt: Date.now(),
        completionReason: 'bitnode-changed-before-completion',
      });
      logIntelFarmStatus('INT farm state belongs to another BitNode run; abandoning it instead of redirecting this run.',
        'warning');
      return false;
    }

    await ensureIntelFarmWorkerMode();
    const installedResult = await getOwnedAugs(ns, false);
    const ownedResult = await getOwnedAugs(ns, true);
    const installed = Array.isArray(installedResult) ? installedResult : [];
    const owned = Array.isArray(ownedResult) ? ownedResult : [];

    if (intelFarmState.phase === IntelFarmPhase.CashRootInstalling) {
      if (installed.includes(CASHROOT)) {
        updateIntelFarmState({
          phase: IntelFarmPhase.CorporateFactions,
          cashRootInstalledAt: Date.now(),
          repairReason: undefined,
        });
        lastIntelFarmStatus = '';
        logIntelFarmStatus(`${CASHROOT} is installed; collecting all ${CORPORATE_FACTIONS.length} corporate factions.`,
          'success');
        return false;
      }
      if (owned.includes(CASHROOT)) {
        logIntelFarmStatus(`Installing ${CASHROOT} and returning to BN${resetInfo.currentNode} autopilot.`, 'info');
        await singRun(ns, 'installAugmentations', ns.getScriptName());
        return true;
      }
      updateIntelFarmState({phase: IntelFarmPhase.CashRoot, repairReason: 'queued CashRoot disappeared'});
    }

    if (intelFarmState.phase === IntelFarmPhase.CashRoot) {
      if (installed.includes(CASHROOT)) {
        updateIntelFarmState({phase: IntelFarmPhase.CorporateFactions, cashRootInstalledAt: Date.now()});
        lastIntelFarmStatus = '';
        return false;
      }

      const price = Number(await singRun(ns, 'getAugmentationPrice', CASHROOT));
      const repRequirement = Number(await singRun(ns, 'getAugmentationRepReq', CASHROOT));
      if (Number.isFinite(price) && price > 0) cashRootCost = price;

      if (owned.includes(CASHROOT)) {
        updateIntelFarmState({phase: IntelFarmPhase.CashRootInstalling, cashRootPurchasedAt: Date.now()});
        logIntelFarmStatus(`Installing queued ${CASHROOT} before corporate company reputation is earned.`, 'success');
        await singRun(ns, 'installAugmentations', ns.getScriptName());
        return true;
      }

      const incompatibleCities = ['Chongqing', 'New Tokyo', 'Ishima', 'Volhaven'];
      if (!player.factions.includes(CASHROOT_FACTION) &&
        incompatibleCities.some(faction => player.factions.includes(faction))) {
        logIntelFarmStatus(`A mutually-exclusive city faction blocks ${CASHROOT_FACTION}; soft-resetting in place before prep.`,
          'warning');
        await singRun(ns, 'softReset', ns.getScriptName());
        return true;
      }

      let factionRep = 0;
      if (player.factions.includes(CASHROOT_FACTION))
        factionRep = Number(await singRun(ns, 'getFactionRep', CASHROOT_FACTION)) || 0;
      if (player.factions.includes(CASHROOT_FACTION) && Number.isFinite(repRequirement) &&
        factionRep >= repRequirement && player.money >= cashRootCost) {
        if (await singRun(ns, 'purchaseAugmentation', CASHROOT_FACTION, CASHROOT)) {
          updateIntelFarmState({phase: IntelFarmPhase.CashRootInstalling, cashRootPurchasedAt: Date.now()});
          logIntelFarmStatus(`Purchased ${CASHROOT}; installing it before the corporate-faction grind.`, 'success');
          await singRun(ns, 'installAugmentations', ns.getScriptName());
          return true;
        }
      }

      const repText = Number.isFinite(repRequirement) ? `${Math.floor(factionRep).toLocaleString()}/` +
        `${Math.ceil(repRequirement).toLocaleString()} rep` : 'waiting for augmentation metadata';
      logIntelFarmStatus(`Preparing ${CASHROOT}: ${repText}, ${formatMoney(player.money)}/${formatMoney(cashRootCost)}.`);
      return false;
    }

    if (intelFarmState.phase === IntelFarmPhase.CorporateFactions) {
      const missing = await joinPendingCorporateInvitations();
      if (missing.length === 0) {
        ns.rm(INTEL_FARM_STATS_FILE, 'home');
        updateIntelFarmState({
          phase: IntelFarmPhase.Farming,
          corporateFactionsReadyAt: Date.now(),
          corporateFactions: CORPORATE_FACTIONS.slice(),
          repairReason: undefined,
        });
        logIntelFarmStatus(`All ${CORPORATE_FACTIONS.length} corporate factions are joined. ` +
          'Starting maintained-invitation INT resets in this BitNode.', 'success');
        await singRun(ns, 'softReset', 'farm-intel.js');
        return true;
      }
      logIntelFarmStatus(`Corporate INT prep: ${CORPORATE_FACTIONS.length - missing.length}/${CORPORATE_FACTIONS.length} ` +
        `joined; remaining [${missing.join(', ')}].`);
      return false;
    }

    if (intelFarmState.phase === IntelFarmPhase.Farming) {
      logIntelFarmStatus('Resuming the same-BitNode INT farming loop.', 'info');
      await singRun(ns, 'softReset', 'farm-intel.js');
      return true;
    }
    return false;
  }

'''.replace('\\t', '\t')
replace_once(
    "  /** Logic run periodically througho   the BN\n",
    lifecycle + "  /** Logic run periodically througho   the BN\n",
    "insert lifecycle",
)
replace_once(
    "    if (player.skills.hacking > playerHackLevel || ownedCracks.length > numCracksOwned) await crackHosts(ns);\n    \n    have4sApi = ns.stock.has4SDataTixApi();",
    "    if (player.skills.hacking > playerHackLevel || ownedCracks.length > numCracksOwned) await crackHosts(ns);\n"
    "    if (await handleIntelFarmLifecycle(ns)) return false;\n"
    "    \n    have4sApi = ns.stock.has4SDataTixApi();",
    "advance lifecycle in main loop",
)
replace_once(
    "    await maybeInstallAugmentations(ns, player);",
    "    if (!isIntelFarmPrep(intelFarmState)) await maybeInstallAugmentations(ns, player);",
    "suppress ordinary installs during preparation",
)
replace_once(
    "  function manageReservedMoney(ns, player, stocksValue) {\n    if (reservedPurchase) return;",
    "  function manageReservedMoney(ns, player, stocksValue) {\n"
    "    if (cashRootPrepActive()) {\n"
    "      const currentReserve = Number(ns.read('reserve.txt') || 0);\n"
    "      const reserve = Math.ceil(cashRootCost);\n"
    "      return currentReserve == reserve ? true : ns.write('reserve.txt', reserve, 'w');\n"
    "    }\n"
    "    if (reservedPurchase) return;",
    "reserve CashRoot budget",
)
replace_once(
    "  async function checkIfBnIsComplete(ns) {\n    // Check if there is some reason not to automatically destroy this BN",
    "  async function checkIfBnIsComplete(ns) {\n"
    "    if (isIntelFarmActive(intelFarmState)) return false;\n"
    "    // Check if there is some reason not to automatically destroy this BN",
    "hold World Daemon completion",
)
old_completion = """        if ((5 in unlockedSFs) && player.skills.intelligence > 1 && player.skills.intelligence < 200) {
          const ascendArgs = buildAscendArgs(ns.getScriptName(), allowSoftReset);
          await runScriptLocal(ns, "ascend.js", false, ascendArgs);
        } else if (!(4 in unlockedSFs)) {
"""
replace_once(old_completion,
             "        if (!(4 in unlockedSFs)) {\n",
             "remove completion reset detour")

path.write_text(text)

assert "bitflume(ns, 8" not in text
assert "--intel-farm-cashroot" in text
assert "--intel-farm-corporate" in text
assert "purchaseAugmentation', CASHROOT_FACTION, CASHROOT" in text
assert "softReset', 'farm-intel.js'" in text
