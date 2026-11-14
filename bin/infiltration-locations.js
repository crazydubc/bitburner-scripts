/** Quote local locations only; the 15 GB quote API need not stay in the UI runner. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Infiltration quotes unavailable';
  ns.atExit(() => port.write(result));
  try {
    result = ns.infiltration.getPossibleLocations().filter(location => location.city === ns.args[0])
      .map(location => ns.infiltration.getInfiltration(location.name));
  } catch (error) { result = `ERROR:${String(error)}`; }
}
