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

function observedNodeFinish(runs, node, start) {
  if (!Array.isArray(runs)) return 0;
  const timing = r => Array.isArray(r?.milestones) ? r.milestones.find(m=>m?.kind==='bn-finish-ready')?.sinceNodeMs : null;
  const elapsed = timing(runs.find(r=>r?.runKey===node+':'+start));
  if (Number.isFinite(elapsed) && elapsed>0) return start+elapsed;
  const peers = runs.filter(r=>r?.node===node && r.endTime && r.startTime<start)
    .map(timing).filter(ms=>Number.isFinite(ms) && ms>0).slice(-3).sort((a,b)=>a-b);
  if (!peers.length) return 0;
  return start+(peers[Math.floor((peers.length-1)/2)]+peers[Math.floor(peers.length/2)])/2;
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
    if (fn === 'hasCorporation' && args[0] === '--bribe-phase') {
      if (!ns.corporation.hasCorporation()) { response = false; return; }
      const corp = ns.corporation.getCorporation();
      response = {round: corp.public ? 5 : ns.corporation.getInvestmentOffer().round, investorShares: corp.investorShares};
      return;
    }
    if ((fn === 'getInvestmentOffer' && args[0] === '--bn3-review') || (fn === 'getCorporation' && args[0] === '--cash-plan')) {
      // Both information reads fit the ordinary helper budget. Optional plans live on home.
      const read = path => { try { return JSON.parse(ns.read(path) || 'null'); } catch { return null; } };
      const data = read('/Temp/affordable-augs.txt');
      const corporation = ns.corporation.getCorporation();
      let finishAt;
      if (corporation.public && Number.isInteger(args[1]) && Number.isFinite(args[2]) && args[2]>0)
        finishAt = observedNodeFinish(read('/data/bn-run-log.json')?.runs,args[1],args[2]);
      response = {offer: corporation.public ? {round:5, funds:0, shares:0} : ns.corporation.getInvestmentOffer(), corporation,
        snapshot: data && {current_node: data.current_node, last_aug_reset: data.last_aug_reset,
          generated_at: data.generated_at, stock_value_known: data.stock_value_known, reset_planning: data.reset_planning},
        route: read('/Temp/infiltration-target.txt'), finishAt};
      return;
    }
    if (fn === 'upgradeOfficeSize' && ['--second-design','--earning-line','--first-design'].includes(args[0])) {
      const [policy, division, quotedCost, kept, phase, expected] = args;
      const city = policy === '--earning-line' ? args[6] : 'Sector-12';
      response = false;
      if (!(Number.isFinite(quotedCost) && quotedCost > 0 && Number.isFinite(kept) && kept >= 0)) return;
      const methods = ['getCorporation','getDivision','getProduct','getOfficeSizeUpgradeCost',fn];
      const ram = methods.reduce((n,m) => n + ns.getFunctionRamCost(`corporation.${m}`), ns.getFunctionRamCost('baseCost'));
      if (ns.ramOverride(ram) < ram) return;
      const corp = ns.corporation.getCorporation();
      const first = policy === '--first-design', seats = first ? args[6] : 3;
      if (!Number.isSafeInteger(seats) || seats<=0 || (first ? corp.public!==false : corp.public!==true) ||
          corp.nextState!==phase || !corp.divisions.includes(division)) return;
      const all = corp.divisions.map(d => ns.corporation.getDivision(d));
      const line = all.find(d => d.name === division);
      if (!line?.cities.includes(city)) return;
      if (first) {
        if (!Number.isSafeInteger(expected) || corp.investorShares!==expected || line.industry!=='Tobacco') return;
        for (const n of line.products) {
          if (n!=='Prod v1') return;
          const p=ns.corporation.getProduct(division,city,n).developmentProgress;
          if (!(p>=0 && p<100 && Number.isFinite(p))) return;
        }
      } else if (policy === '--second-design') {
        if (line.products.length !== 2 || !line.products.includes('Prod v1') || !line.products.includes('Prod v2')) return;
        const progress = ns.corporation.getProduct(division,city,'Prod v2').developmentProgress;
        if (!(progress >= 0 && progress < 100 && progress <= expected)) return;
      } else if (line.industry !== 'Tobacco' || JSON.stringify(line.products) !== expected ||
        line.products.filter(n => ns.corporation.getProduct(division,city,n).developmentProgress === 100).length < 2) return;
      const cost = ns.corporation.getOfficeSizeUpgradeCost(division,city,seats);
      const bills = all.reduce((n,d) => d.thisCycleExpenses >= 0 ? n + d.thisCycleExpenses : NaN,0);
      if (!(cost > 0 && cost === quotedCost && corp.funds - bills - kept >= cost)) return;
      if (policy==='--earning-line' && (!(Number.isFinite(args[7]) && args[7]>=0) ||
        (corp.funds-bills>=args[7] && corp.funds-bills-cost<args[7]))) return;
      ns.corporation[fn](division,city,seats);
      response = true;
      return;
    }
    if (fn === 'makeProduct' && args[0] === '--cash-project') {
      const [, division, city, name, investment, retire, kept, phase] = args;
      response = false;
      if (![division,city,name].every(v => typeof v === 'string' && v.trim() === v && v.length) ||
        /[<>]/.test(name) || typeof retire !== 'string' || retire === name ||
        !(Number.isFinite(investment) && investment > 0 && Number.isFinite(kept) && kept >= 0)) return;
      const methods = ['getCorporation', 'getDivision', fn, ...(retire ? ['discontinueProduct'] : [])];
      const ram = methods.reduce((n, method) => n + ns.getFunctionRamCost(`corporation.${method}`), ns.getFunctionRamCost('baseCost'));
      if (ns.ramOverride(ram) < ram) return; // Keep producing; try the project next cycle.
      const corp = ns.corporation.getCorporation();
      if (corp.nextState !== phase || !corp.divisions.includes(division)) return;
      const all = corp.divisions.map(d => ns.corporation.getDivision(d));
      const line = all.find(d => d.name === division);
      const bills = all.reduce((n,d) => d.thisCycleExpenses >= 0 ? n + d.thisCycleExpenses : NaN,0);
      if (!Number.isFinite(bills) || !(corp.funds - bills - kept >= investment * 2) || !line?.makesProducts ||
        !line.cities.includes(city) || line.products.includes(name) ||
        (retire ? line.products.length !== line.maxProducts || !line.products.includes(retire) : line.products.length >= line.maxProducts)) return;
      if (retire) ns.corporation.discontinueProduct(division, retire);
      ns.corporation[fn](division, city, name, investment, investment);
      response = true;
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
