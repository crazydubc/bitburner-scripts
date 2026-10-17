/** Authoritative home-only reserve storage. The caller never needs remote file copies. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let response = 'ERROR:reserve helper exited before returning';
  ns.atExit(() => port.write(response));
  try {
    if (ns.getHostname() !== 'home') throw new Error('Reserve helper must run on home');
    const [operation, value] = ns.args;
    if (operation === 'write') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
        throw new Error('Reserve must be a finite nonnegative number');
      await ns.write('reserve.txt', value, 'w');
    } else if (operation !== 'read') throw new Error(`Unknown reserve operation: ${operation}`);
    response = Number(ns.read('reserve.txt') || 0);
    if (!Number.isFinite(response) || response < 0) throw new Error('Invalid reserve.txt on home');
  } catch (error) { response = `ERROR:${String(error)}`; }
}
