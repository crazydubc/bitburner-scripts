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
  let response = `ERROR:corporation.${String(fn)} exited before returning a result`;
  let clearBuys;

  ns.atExit(() => {
    // Buy rates persist in the game. Even an interrupted one-phase order must be cancelled.
    if (clearBuys) clearBuys();
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
        if (!calls.every(a => a.length === 4 && typeof a[3] === 'number' && a[3] >= 0))
          throw new Error('Invalid material purchase orders');
        clearBuys = () => {
          for (const a of calls) {
            try { f(a[0], a[1], a[2], 0); } catch { /* A division may have been removed. */ }
          }
        };
      }
      const results = [];
      for (const a of calls) results.push(prepareCorporationResultForPort(fn, await f(...a)));
      if (once) {
        const state = await ns.corporation.nextUpdate();
        clearBuys();
        clearBuys = undefined;
        response = state === 'PURCHASE';
      } else response = results;
    } else response = prepareCorporationResultForPort(fn, await f(...args));
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
