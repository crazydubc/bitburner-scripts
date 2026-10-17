/** The complete connection/start sequence is synchronous, so concurrent children cannot steal its target. */
export async function main(ns) {
  const [target, routeJson] = ns.args;
  if (typeof target !== 'string' || target === 'home' || target === 'w0r1d_d43m0n') throw new Error('Invalid automatic backdoor target');
  const route = JSON.parse(routeJson);
  if (!Array.isArray(route) || route[0] !== 'home' || route.at(-1) !== target) throw new Error('Invalid backdoor route');
  if (ns.getServer(target).backdoorInstalled) return;
  try {
    for (const hop of route) if (ns.singularity.connect(hop) !== true) throw new Error(`Could not connect to ${hop}`);
    // installBackdoor captures the connected server before its first await in the official engine.
    await ns.singularity.installBackdoor();
  } finally {
    ns.singularity.connect('home');
  }
  if (!ns.getServer(target).backdoorInstalled) throw new Error(`Backdoor did not complete on ${target}`);
  ns.toast(`Backdoored ${target}`, 'success');
}
