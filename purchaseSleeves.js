import {
    getActiveSourceFiles, log
} from './helpers.js'


const MaxSleevesFromCovenant = 5;
const BaseCostPerSleeve = 10e12;

/* THis cheeky little script simulates the act of buying sleeves and memory upgrades
by getting the player object, checking if the play has enough money, charging them, 
and manually setting thier data to show they bought the upgrade.

Is it cheating? Probably. But since there is no API call for this, I do what I want.*/

/** @param {NS} ns */
export async function main(ns) {
  globalThis.webpack_require ?? webpackChunkbitburner.push([[-1], {}, w => globalThis.webpack_require = w]);
  
  let p;
  Object.keys(webpack_require.m).forEach(k => Object.values(webpack_require(k)).find(f => { if (typeof f?.giveExploit === "function") p = f }
  ))
  let unlockedSFs = await getActiveSourceFiles(ns, true);
  const maxSleeves = MaxSleevesFromCovenant + unlockedSFs[10] - 1;
  log(ns, `Attempting to upgrade all sleeves... currently ${p.sleevesFromCovenant} of ${p.sleeves.length}`, true, "info");
  while (p.sleeves.length < maxSleeves) {
    const sleeveCost = Math.pow(10, p.sleevesFromCovenant) * BaseCostPerSleeve;
    if (p.canAfford(sleeveCost)) {
      log(ns, `Purchasing sleeve #${p.sleevesFromCovenant+2}.`, true, "info");
      //charge the player
      p.loseMoney(sleeveCost, "sleeves");
      //increase the sleeve purchase count
      p.sleevesFromCovenant += 1;
      //copy the first sleeve into a new one
      p.sleeves.push(p.sleeves[0]);

      //change values to default to simulate a fresh sleeve
      p.sleeves[p.sleevesFromCovenant].memory = 0;
      p.sleeves[p.sleevesFromCovenant].shock = 100;
      p.sleeves[p.sleevesFromCovenant].exp.hacking = 0;
      p.sleeves[p.sleevesFromCovenant].exp.strength = 0;
      p.sleeves[p.sleevesFromCovenant].exp.defense = 0;
      p.sleeves[p.sleevesFromCovenant].exp.dexterity = 0;
      p.sleeves[p.sleevesFromCovenant].exp.agility = 0;
      p.sleeves[p.sleevesFromCovenant].exp.charisma = 0;
      p.sleeves[p.sleevesFromCovenant].exp.intelligence = 0;
    }
    await ns.sleep(5000);
  }

  log(ns, `Upgrading sleeve memory...`, true, "info");
  let allUpgraded = false;
  while (!allUpgraded) {
    allUpgraded = true;
    for (let i = 0; i < p.sleeves.length; i++) {

      if (p.sleeves[i].memory < 100) {
        allUpgraded = false;
        const amt = maxAffordableMemoryUpgrades(p, p.sleeves[i].memory);
        if (amt > 0) {
          const cost = getMemoryUpgradeCost(amt, p.sleeves[i].memory);
          p.loseMoney(cost, "sleeves");
          p.sleeves[i].memory += amt;
          log(ns, `Sleeve${i} +${amt} memory -> ${p.sleeves[i].memory}/100`, true, "info");
        }
      }
    }
    await ns.sleep(1000);
  }
}

function maxAffordableMemoryUpgrades(p, memory) {
  const remaining = 100 - memory;
  if (remaining <= 0) return 0;

  // Quick check: can we afford at least 1?
  if (!p.canAfford(getMemoryUpgradeCost(1, memory))) return 0;

  //Exponential search for high bound
  let lo = 1;
  let hi = 2;
  while (hi < remaining && p.canAfford(getMemoryUpgradeCost(hi, memory))) {
    lo = hi;
    hi *= 2;
  }
  if (hi > remaining) hi = remaining;

  //Binary search between lo..hi
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (p.canAfford(getMemoryUpgradeCost(mid, memory))) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function getMemoryUpgradeCost(n, memory) {
  const amt = Math.round(n);
  if (amt < 0) {
    return 0;
  }

  if (memory + amt > 100) {
    return getMemoryUpgradeCost(100 - memory, memory);
  }

  const mult = 1.02;
  const baseCost = 1e12;
  let currCost = 0;
  let currMemory = memory;
  for (let i = 0; i < amt; ++i) {
    currCost += Math.pow(mult, currMemory);
    ++currMemory;
  }

  return currCost * baseCost;
}