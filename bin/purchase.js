import { executePurchase, purchaseRam } from '../purchase-guard.js';
export function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let response = 'ERROR:Purchase helper exited before reporting its result';
  ns.atExit(() => port.write(response));
  try {
    const [namespace, method, args, policy] = ns.args;
    const required = purchaseRam(ns, namespace, method);
    if (ns.ramOverride(required) < required) throw new Error(`Purchase helper requires ${required} GB`);
    response = executePurchase(ns, namespace, method, JSON.parse(args), JSON.parse(policy));
  } catch (error) { response = `ERROR:${String(error)}`; }
}
