export function prepareCorporationResultForPort(fn, result) {
  if (fn !== 'getDivision' || result === null || typeof result !== 'object' || Array.isArray(result))
    return result;
  // Ports clone enumerable values, which invokes the deprecated .type getter.
  // Filter keys before reading values; spread/Object.entries would invoke it too.
  const division = {};
  for (const key of Object.keys(result))
    if (key !== 'type') division[key] = result[key];
  return division;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(23.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  const exitFallback = `ERROR:corporation.${String(fn)} exited before returning a result`;
  let response = exitFallback;
  let restoreBuys;

  ns.atExit(() => {
    // The engine can run this hook before a killed helper's await/catch resumes.
    // A verified cleanup makes an interrupted booster order safe to skip, never to replay.
    if (restoreBuys) {
      try {
        restoreBuys();
        if (response === exitFallback) response = false;
      } catch (error) { response = `ERROR:Could not restore material buy rates: ${String(error)}`; }
    }
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from corporation.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const once = args[0] === '--once';
    const batch = once || args[0] === '--batch';
    if (once && fn !== 'buyMaterial') throw new Error('One-phase orders require buyMaterial');
    if (fn === 'getInvestmentOffer' && args[0] === '--bn3-review') {
      // Both information reads fit the ordinary helper budget. Optional plans live on home.
      const read = path => { try { return JSON.parse(ns.read(path) || 'null'); } catch { return null; } };
      const data = read('/Temp/affordable-augs.txt');
      response = {offer: ns.corporation.getInvestmentOffer(), corporation: ns.corporation.getCorporation(),
        snapshot: data && {current_node: data.current_node, last_aug_reset: data.last_aug_reset,
          generated_at: data.generated_at, stock_value_known: data.stock_value_known, reset_planning: data.reset_planning},
        route: read('/Temp/infiltration-target.txt')};
      return;
    }
    if (fn === 'acceptInvestmentOffer' && args[0] === '--if-current') {
      const [, investorShares, valuation, balance, phase] = args;
      // The manager can be offloaded or waiting on RAM. Do not sell a different tranche or
      // take a lower offer or ignore a new bill. No await between check and sale.
      const needed = ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost('corporation.getCorporation') +
        ns.getFunctionRamCost('corporation.acceptInvestmentOffer');
      response = false;
      if (ns.ramOverride(needed) < needed) { response = 'deferred'; return; }
      if (!Number.isSafeInteger(investorShares) || investorShares < 0 || !(Number.isFinite(valuation) && valuation > 0) || !Number.isFinite(balance)) return;
      const corp = ns.corporation.getCorporation();
      // In a private company each accepted tranche increases investorShares; within that
      // tranche the offer is directly proportional to valuation. One info API suffices.
      if (!corp.public && corp.investorShares === investorShares && corp.valuation >= valuation && corp.funds >= balance && corp.nextState === phase)
        response = ns.corporation.acceptInvestmentOffer();
      return;
    }
    const required = Math.max(23.6, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`corporation.${fn}`) +
      (once ? ns.getFunctionRamCost('corporation.nextUpdate') : 0));
    if (ns.ramOverride(required) < required) throw new Error(`Insufficient RAM for corporation.${fn}: ${required} GB required`);
    const f = ns.corporation?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid corporation function: ${String(fn)}`);

    if (batch) {
      const calls = JSON.parse(args[1]);
      if (!Array.isArray(calls) || !calls.every(a => Array.isArray(a) && a.every(v =>
        typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v)))))
        throw new Error('Invalid corporation batch');
      if (once) {
        if (!calls.every(a => (a.length === 4 || a.length === 5) && typeof a[3] === 'number' && a[3] >= 0 &&
          (a.length === 4 || (typeof a[4] === 'number' && a[4] >= 0 && a[4] <= a[3]))))
          throw new Error('Invalid material purchase orders');
        let applied = 0;
        restoreBuys = () => {
          let failure;
          for (let i = 0; i < applied; i++) {
            const [div, city, material, , inputRate = 0] = calls[i];
            try { f(div, city, material, inputRate); } catch (error) { failure = error; }
          }
          if (failure !== undefined) throw failure;
        };
        // buyMaterial is synchronous in Netscript. Arm the cleanup before waiting for the phase.
        for (const [div, city, material, rate] of calls) { f(div, city, material, rate); applied++; }
        const state = await ns.corporation.nextUpdate();
        restoreBuys();
        restoreBuys = undefined;
        response = state === 'PURCHASE';
      } else {
        const results = [];
        for (const a of calls) results.push(prepareCorporationResultForPort(fn, await f(...a)));
        response = results;
      }
    } else response = prepareCorporationResultForPort(fn, await f(...args));
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
