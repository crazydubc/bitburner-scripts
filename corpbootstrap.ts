import { log } from "./helpers";

export async function main(ns: NS): Promise<void> {
  log(ns, `Bootstrapping started...`, true, 'info');
  const hacknetName = "hacknet-server-1";
  let ramNeeded = 0;
  let runValuation = ns.getBitNodeMultipliers().CorporationValuation >= 0.85;
  let scripts = ["corporationOptimizer.ts", "priorityQueue.js", 
  "ceres.js", "helpers.js", "corpconsts.ts", "heap.js", "corputils.ts", "smartsupply.ts", "spend-hacknet-hashes.js"];
  let scriptName;
  if (runValuation)
    scriptName = "corp3.ts";
  else
    scriptName = "corporation.ts";
  
  scripts.push(scriptName);

  for (const script of scripts) {
    ramNeeded += ns.getScriptRam(script);
    await ns.sleep(100);
  }
  do {
    let home = ns.getServer("home");
    if (home.maxRam-home.ramUsed > ramNeeded*1.5) {
      ns.spawn(scriptName);
    } else if (ns.serverExists(hacknetName)) {
      let hacknet = ns.getServer(hacknetName);
      if (hacknet.maxRam > ramNeeded && ns.scp(scripts, hacknetName, "home") && exec_on_server(ns, hacknet, scriptName)) return;
    }
    await ns.sleep(5000);
  } while (true);
}

function exec_on_server(ns:NS, server: Server, scriptName: string) : boolean {
  if (ns.exec(scriptName, server.hostname, 1) == 0) {
    log(ns, `Failed to exec ${scriptName} on ${server.hostname}!`, true, 'info');
  } else {
    ns.exec("smartsupply.ts", server.hostname, 1);
    log(ns, `Bootstrapping complete!`, true, 'info');
    return true;
  }
  return false;
}