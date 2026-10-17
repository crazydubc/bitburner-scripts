import { log, formatMoney, getPlayerInfo, sleeveRun } from "./utils.js";

async function sleeveCall(ns, method, ...args) {
  try { return await sleeveRun(ns, method, ...args); }
  catch (error) { log(ns, `Sleeve ${method} failed; will retry: ${String(error)}`, false, 'warning'); return undefined; }
}

/** @param {NS} ns */
export async function main(ns) {
  // Buy sleeves until the game reports no more can be bought (cost becomes Infinity)
  let player = await getPlayerInfo(ns);

  while (!player.factions.includes(ns.enums.FactionName.TheCovenant)) {
    await ns.sleep(5000);
    player = await getPlayerInfo(ns);
  }
  while (true) {
    const sleeveCost = await sleeveCall(ns, "getSleeveCost");
    if (sleeveCost === Number.POSITIVE_INFINITY) break;
    player = await getPlayerInfo(ns); // Income and competing purchases change cash while we wait.
    if (!Number.isFinite(sleeveCost) || sleeveCost < 0) {
      log(ns, `Unable to read the next sleeve cost: ${String(sleeveCost)}. Will retry.`, true, "warning");
    } else if (player.money >= sleeveCost) {
      const result = await sleeveCall(ns, "purchaseSleeve");
      if (purchaseSucceeded(result)) log(ns, `Purchased a sleeve for ${formatMoney(sleeveCost)}.`, true, "info");
      else log(ns, `Sleeve purchase failed: ${result?.message ?? String(result)}. Will retry.`, true, "warning");
    }
    await ns.sleep(5000);
  }

  log(ns, `Upgrading sleeve memory...`, true, "info");

  while (true) {
    let player = await getPlayerInfo(ns);

    const numSleeves = await sleeveCall(ns, "getNumSleeves");
    for (let i = 0; i < numSleeves; i++) {
      const sleeve = await sleeveCall(ns, "getSleeve", i);
      if (!Number.isFinite(sleeve?.memory)) continue;

      if (sleeve.memory < 100) {

        const amt = await maxAffordableMemoryUpgrades(ns, i, sleeve.memory, player.money);
        if (amt > 0) {
          const cost = await sleeveCall(ns, "getMemoryUpgradeCost", i, amt);
          if (!Number.isFinite(cost) || cost < 0) continue;
          const ok = await sleeveCall(ns, "upgradeMemory", i, amt);

          if (purchaseSucceeded(ok)) {
            // sleeve.memory doesn't auto-update; compute expected new value or re-fetch sleeve
            const newMem = sleeve.memory + amt;
            log(ns, `Sleeve${i} +${amt} memory for ${formatMoney(cost)} -> ${newMem}/100`, true, "info");
          } else {
            log(ns, `Sleeve${i} failed to upgrade memory by ${amt}.`, true, "warn");
          }

          player = await getPlayerInfo(ns); // refresh money after spending
        }
      }
    }

    await ns.sleep(1000);
  }
}

// Accept explicit success only; failed result objects and RPC error strings are also truthy.
function purchaseSucceeded(result) {
  return result === true || result?.success === true;
}

/** @param {NS} ns */
async function maxAffordableMemoryUpgrades(ns, sleeveNum, memory, money) {
  const remaining = 100 - memory;
  if (remaining <= 0) return 0;

  // Quick check: can we afford at least 1?
  const cost1 = await sleeveCall(ns, "getMemoryUpgradeCost", sleeveNum, 1);
  if (!Number.isFinite(cost1) || cost1 < 0 || money < cost1) return 0;

  // Exponential search for high bound
  let lo = 1;
  let hi = 2;
  while (hi < remaining) {
    const costHi = await sleeveCall(ns, "getMemoryUpgradeCost", sleeveNum, hi);
    if (!Number.isFinite(costHi) || costHi < 0) return 0;
    if (money >= costHi) {
      lo = hi;
      hi *= 2;
    } else {
      break;
    }
  }
  if (hi > remaining) hi = remaining;

  // Binary search between lo..hi
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const costMid = await sleeveCall(ns, "getMemoryUpgradeCost", sleeveNum, mid);
    if (!Number.isFinite(costMid) || costMid < 0) return 0;
    if (money >= costMid) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
