// One read API per process: repeated calls share its RAM charge, even at SF4.1/4.2.
const reads = new Set(['getAugmentationsFromFaction', 'getFactionFavor', 'getFactionRep',
  'getAugmentationRepReq', 'getAugmentationStats', 'getAugmentationPrereq', 'getAugmentationPrice', 'getCrimeChance']);

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(6.6);
  const port = ns.getPortHandle(ns.pid);
  let response = 'ERROR:Singularity bulk read exited before reporting its result';
  ns.atExit(() => {
    try { port.write(response); }
    catch (error) { port.write(`ERROR:Unable to serialize Singularity bulk read: ${String(error)}`); }
  });
  try {
    const [fn, encoded] = ns.args;
    if (!reads.has(fn)) throw new Error(`Unsupported Singularity read: ${String(fn)}`);
    const items = JSON.parse(encoded);
    if (!Array.isArray(items) || items.length > 512 || !items.every(item => typeof item === 'string' && item.length > 0))
      throw new Error('Invalid Singularity bulk read names');
    const ram = Math.max(6.6, ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`singularity.${fn}`));
    if (ns.ramOverride(ram) < ram) throw new Error(`Insufficient RAM for singularity.${fn}; requires ${ram} GB`);
    const read = ns.singularity[fn];
    if (typeof read !== 'function') throw new Error(`Singularity read is unavailable: ${fn}`);
    response = Object.fromEntries(items.map(item => [item, read(item)]));
  } catch (error) { response = `ERROR:${String(error?.stack ?? error)}`; }
}
