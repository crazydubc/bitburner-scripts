export function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  const duration = ns.getHackTime(ns.args[0]) / 4;
  ns.atExit(() => port.write(duration));
}
