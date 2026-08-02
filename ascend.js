import {
  log, getConfiguration, getFilePath, launchScriptHelper, singRun, runScriptSomewhere,
  getActiveSourceFiles, getOwnedAugs, stockRun, getServers, runScriptLocal, getReset
} from './utils.js'

const argsSchema = [
  ['install-augmentations', true], // By default, augs will only be purchased. Set this flag to install (a.k.a reset)
    /* OR */['reset', false], // An alias for the above flag, does the same thing.
  ['allow-soft-reset', false], // If set to true, allows ascend.js to invoke a **soft** reset (installs no augs) when no augs are affordable. This is useful e.g. when ascending rapidly to grind hacknet hash upgrades.
  ['skip-staneks-gift', false], // By default, we get stanek's gift before our first install (except in BN8). If set to true, skip this step.
    /* Deprecated */['bypass-stanek-warning', false], // (Obsoleted by the above option) Used to warn you if you were installing augs without accepting stanek's gift
  // Spawn this script after installing augmentations (Note: Args not supported by the game)
  ['on-reset-script', 'autopilot.js'], // By default, will start with `stanek.js` if you have stanek's gift, otherwise `daemon.js`.
  ['ticks-to-wait-for-additional-purchases', 10], // Don't reset until we've gone this many game ticks without any new purchases being made (10 * 200ms (game tick time) ~= 2 seconds)
  ['max-wait-time', 60000], // The maximum number of milliseconds we'll wait for external scripts to purchase whatever permanent upgrades they can before we ascend anyway.
  ['prioritize-home-ram', false], // If set to true, will spend as much money as possible on upgrading home RAM before buying augmentations
    /* Deprecated */['prioritize-augmentations', true], // (Legacy flag, now ignored - left for backwards compatibility)
    ['script-delay', 0], // script delay in seconds.
];

export function autocomplete(data, args) {
  data.flags(argsSchema);
  const lastFlag = args.length > 1 ? args[args.length - 2] : null;
  if (["--on-reset-script"].includes(lastFlag))
    return data.scripts;
  return [];
}

async function countOwnedStocks(ns, stkSymbols) {
  let owned = 0;
  for (const sym of stkSymbols) {
    const pos = await stockRun(ns, "getPosition", sym); // [long, avgLong, short, avgShort]
    if (pos[0] > 0 || pos[2] > 0) owned++;
  }
  return owned;
}
/** @param {NS} ns
 * This script is meant to do all the things best done when ascending (in a generally ideal order) **/
export async function main(ns) {
  const options = getConfiguration(ns, argsSchema);
  if (!options) return; // Invalid options, or ran in --help mode.
  for (let i = 0; i < options['script-delay']; i++) await ns.sleep(1000);
  let dictSourceFiles = await getActiveSourceFiles(ns); // Find out what source files the user has unlocked
  if (!(4 in dictSourceFiles))
    return log(ns, "ERROR: You cannot automate installing augmentations until you have unlocked singularity access (SF4).", true, 'error');
  ns.disableLog('sleep');
  if (options['prioritize-augmentations'])
    log(ns, "INFO: The --prioritize-augmentations flag is deprecated, as this is now the default behaviour. Use --prioritize-home-ram to get back the old behaviour.")

  // Kill every script except this one, since it can interfere with out spending
  const servers = await getServers(ns);
  for (const server of servers) {
    ns.ps(server.hostname).filter(s => s.filename != ns.getScriptName()).forEach(s => ns.kill(s.pid));
  }

  // Stop the current action so that we're no longer spending money (if training) and can collect rep earned (if working)
  await singRun(ns, 'stopAction');

  // Clear any global reserve so that all money can be spent
  ns.write("reserve.txt", 0, "w");

  // STEP 1: Liquidate Stocks and (SF9) Hacknet Hashes
  log(ns, 'Sell stocks and hashes...', true, 'info');
  let pid = ns.run(getFilePath('spend-hacknet-hashes.js'), 1, '--liquidate');

  // If we do not have tix api access, we cannot automate checking on or selling stocks, so skip this
  const hasTixApiAccess = ns.stock.hasTixApiAccess();
  if (hasTixApiAccess) {
    const stkSymbols = await stockRun(ns, "getSymbols");
    let ownedStocks = await countOwnedStocks(ns, stkSymbols);
    while (ownedStocks > 0) {
      //log(ns, `INFO: Waiting for ${ownedStocks} owned stocks to be sold...`, false, "info");
      pid = await launchScriptHelper(ns, 'stockmaster.js', ["--liquidate"])
      //pid = ns.run(getFilePath("stockmaster.js"), 1, "--liquidate");
      while (ns.isRunning(pid))
        await ns.sleep(10);
      ownedStocks = await countOwnedStocks(ns, stkSymbols);
      await ns.sleep(10);
    }
  }

  // STEP 2: Buy Home RAM Upgrades (more important than squeezing in a few extra augs)
  const spendOnHomeRam = async () => {
    log(ns, 'Try Upgrade Home RAM...', true, 'info');
    ns.run(getFilePath('Tasks/ram-manager.js'), 1, '--reserve', '0', '--budget', '0.8');
  };
  if (options['prioritize-home-ram']) await spendOnHomeRam();

  // STEP 3: (SF13) STANEK'S GIFT
  // There is now an API to accept stanek's gift without resorting to exploits. We must do this before installing augs for the first time
  if (13 in dictSourceFiles) {
    // By feature request: Auto-skip stanek in BN8 (requires a separate API check to get current BN)
    let isInBn8 = 8 === (await getReset(ns)).currentNode;

    if (options['skip-staneks-gift'])
      log(ns, 'INFO: --skip-staneks-gift was set, we will not accept it.');
    else if (isInBn8) {
      log(ns, 'INFO: Stanek\'s gift is useless in BN8, setting the --skip-staneks-gift argument automatically.');
      options['skip-staneks-gift'] = true;
    } else {
      log(ns, 'Accepting Stanek\'s Gift (if this is the first reset)...', true, 'info');
      const haveStanek = ns.stanek.acceptGift();
      if (haveStanek) log(ns, 'INFO: Confirmed that we have Stanek\'s Gift', true, 'info');
      else {
        log(ns, 'WARNING: It looks like we can\'t get Stanek\'s Gift. (Did you manually purchase some augmentations?)', true, 'warning');
        options['skip-staneks-gift'] = true; // Nothing we can do, no point in failing our augmentation install
      }
    }
  }

  // STEP 4: Buy as many desired augmentations as possible
  log(ns, 'Purchasing augmentations...', true, 'info');
  const facmanArgs = ['--purchase', '-v'];
  if (options['skip-staneks-gift']) {
    log(ns, 'INFO: Sending the --ignore-stanek argument to faction-manager.js')
    facmanArgs.push('--ignore-stanek');
  }
  pid = await runScriptSomewhere(ns, 'faction-manager.js', true, facmanArgs);
  while (ns.isRunning(pid)) await ns.sleep(1000);
  //pid = ns.run(getFilePath('faction-manager.js'), 1, ...facmanArgs);

  // If we are not slated to install any augmentations, ABORT
  // Get owned + purchased augmentations, then installed augmentations. Ensure there's a difference
  let purchasedAugmentations = await getOwnedAugs(ns, true);
  let installedAugmentations = await getOwnedAugs(ns, false);
  log(ns, `Augs: ${purchasedAugmentations} ${installedAugmentations}`, true)
  let noAugsToInstall = purchasedAugmentations.length == installedAugmentations.length;
  if (noAugsToInstall && !options['allow-soft-reset']) {
    await launchScriptHelper(ns, 'autopilot.js');
    return;
  }

  // STEP 2 (If Deferred): Upgrade home RAM after purchasing augmentations if this option was set.
  if (!options['prioritize-home-ram']) await spendOnHomeRam();

  // STEP 5: Try to Buy 4S data / API if we haven't already and can afford it (although generally stockmaster.js would have bought these if it could)
  log(ns, 'Checking on Stock Market upgrades...', true, 'info');
  await stockRun(ns, 'purchaseWseAccount')
  //ns.stock.purchaseWseAccount();
  let hasStockApi = await stockRun(ns, 'purchaseTixApi');
  if (hasStockApi) {
    await stockRun(ns, 'purchase4SMarketData')
    await stockRun(ns, 'purchase4SMarketDataTixApi')
  }

  // STEP 6: (SF10) Buy whatever sleeve upgrades we can afford
  if (10 in dictSourceFiles) {
    log(ns, 'Try Upgrade Sleeves...', true, 'info');
    ns.run(getFilePath('sleeve.js'), 1, '--reserve', '0', '--aug-budget', '1', '--min-aug-batch', '1', '--buy-cooldown', '0', '--disable-training');
    await ns.sleep(500); // Give it time to make its initial purchases. Note that we do not block on the process shutting down - it will keep running.
  }

  // STEP 7: (SF2) Buy whatever gang equipment we can afford
  if (2 in dictSourceFiles) {
    log(ns, 'Try Upgrade Gangs...', true, 'info');
    ns.run(getFilePath('gangs.js'), 1, '--reserve', '0', '--augmentations-budget', '1', '--equipment-budget', '1');
    await ns.sleep(500); // Give it time to make its initial purchases. Note that we do not block on the process shutting down - it will keep running.
  }

  // STEP 8: Buy whatever home CPU upgrades we can afford
  log(ns, 'Try Upgrade Home Cores...', true, 'info');
  while (await singRun(ns, 'upgradeHomeCores')); { await ns.sleep(10); }
  //await waitForProcessToComplete(ns, pid, true); // Wait for the script to shut down, indicating it has bought all it can.

  // STEP 9: Join every faction we've been invited to (gives a little INT XP)
  let invites = await singRun(ns, 'checkFactionInvitations');
  if (invites.length > 0) {
    for (const inv of invites)
      await singRun(ns, 'joinFaction', inv)
  }

  // TODO: If in corporation, and buyback shares is available, buy as many as we can afford

  // STEP 10: WAIT: For money to stop decreasing, so we know that external scripts have bought what they could.
  log(ns, 'Waiting for purchasing to stop...', true, 'info');
  let money = 0, lastMoney = 0, ticksWithoutPurchases = 0;
  const maxWait = Date.now() + options['max-wait-time'];
  while (ticksWithoutPurchases < options['ticks-to-wait-for-additional-purchases'] && (Date.now() < maxWait)) {
    const start = Date.now(); // Used to wait for the game to tick.
    const refreshMoney = async () => money =
      ns.getServerMoneyAvailable("home");
    while ((Date.now() - start <= 200) && lastMoney == await refreshMoney())
      await ns.sleep(10); // Wait for game to tick (money to change) - might happen sooner than 200ms
    ticksWithoutPurchases = money < lastMoney ? 0 : ticksWithoutPurchases + 1;
    lastMoney = money;
  }

  // TODO STEP 11: Accept any outstanding faction invitations, and claim our +1 free favour if available    /    const factionInvites = ns.singularity.checkFactionInvitations(    if (factionInvites.length > 0        factionInvites.forEach(factionName => ns.singularity.joinFaction(factionName))    if (ns.singularity.exportGameBonus()        ns.singularity.exportGame()    // TODO: No way to close the pop-up save dialog, which is a deal-breaker for me    */

  // STEP 4 REDUX: If somehow we have money left over and can afford some junk augs that weren't on our desired list, grab them too
  log(ns, 'Seeing if we can afford any other augmentations...', true, 'info');
  facmanArgs.push('--stat-desired', '_'); // Means buy any aug with any stats
  pid = await runScriptSomewhere(ns, getFilePath('faction-manager.js'), true, facmanArgs);
  while (ns.isRunning(pid)) await ns.sleep(100);
  //ns.run(getFilePath('faction-manager.js'), 1, ...facmanArgs);

  // Clean up our temp folder - it's good to do this once in a while to reduce the save footprint
  // As well as to ensure that data written out on this bitnode don't confuse scripts in the next one.
  pid = await runScriptLocal(ns, getFilePath('cleanup.js'), true);
  while (ns.isRunning(pid)) await ns.sleep(100);

  // FINALLY: If configured, soft reset
  if (options.reset || options['install-augmentations']) {
    log(ns, '\nCatch you on the flippity-flip\n', true, 'success');
    await ns.sleep(1000); // Pause for effect?
    const resetScript = options['on-reset-script'] ??
      // Default script (if none is specified) is stanek.js if we have it (which in turn will spawn daemon.js when done)
      (purchasedAugmentations.includes(`Stanek's Gift - Genesis`) ? getFilePath('stanek.js') : getFilePath('daemon.js'));
    await singRun(ns, noAugsToInstall ? 'softReset' : 'installAugmentations', resetScript)
  } else
    log(ns, `SUCCESS: Ready to ascend. In the future, you can run with --reset (or --install-augmentations) ` +
      `to actually perform the reset automatically.`, true, 'success');
}