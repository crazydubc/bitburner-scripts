/** @param {NS} ns */
export async function main(ns) {
  const fragments = JSON.parse(ns.args[0]);

  for (const frag of fragments) {
    if (frag.id < 100)
      await ns.stanek.chargeFragment(frag.x, frag.y);
  }
}