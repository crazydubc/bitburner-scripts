/** Keep the deployed script's startup configuration consistent with home. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let success = false;
  ns.atExit(() => port.write(success));
  const [script, destination] = ns.args;
  const config = `${script}.config.txt`;
  if (ns.fileExists(config, 'home')) success = await ns.scp(config, destination, 'home');
  else success = !ns.fileExists(config, destination) || ns.rm(config, destination);
}
