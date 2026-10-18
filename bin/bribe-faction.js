import {getCorporationBribeReserve} from '../speedrun-policy.js';

/** Quote and execute synchronously so corporation upgrades cannot consume the protected budget between them. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Corporation bribe helper exited before reporting';
  ns.atExit(() => port.write(result));
  try {
    const [faction, targetRep] = ns.args;
    if (typeof faction !== 'string' || !faction.trim() || !Number.isFinite(targetRep) || targetRep <= 0)
      throw new Error('Invalid faction reputation milestone');
    const corporation = ns.corporation.getCorporation();
    const constants = ns.corporation.getConstants();
    const round = corporation.public ? 5 : ns.corporation.getInvestmentOffer().round;
    const reserve = getCorporationBribeReserve(corporation, round);
    const currentRep = ns.singularity.getFactionRep(faction);
    const costPerRep = constants.bribeAmountPerReputation;
    if (!Number.isFinite(currentRep) || !Number.isFinite(costPerRep) || costPerRep <= 0 ||
      !Number.isFinite(corporation.valuation) || !Number.isFinite(constants.bribeThreshold))
      throw new Error('Invalid corporation bribe quote');
    const amount = Math.ceil(Math.max(0, targetRep - currentRep) * costPerRep);
    result = {success: currentRep >= targetRep, amount: 0, currentRep, updatedRep: currentRep};
    if (!amount || !Number.isFinite(amount) || corporation.valuation < constants.bribeThreshold ||
      corporation.funds - reserve < amount) return;
    if (ns.corporation.bribe(faction, amount) === true) {
      result = {success: true, amount, currentRep, updatedRep: ns.singularity.getFactionRep(faction)};
    }
  } catch (error) { result = `ERROR:${String(error)}`; }
}
