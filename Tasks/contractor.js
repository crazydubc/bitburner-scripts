import { disableLogs, getServersLight, runScriptLocal } from '../utils.js'
const scriptSolver = "/Tasks/contractor.js.solver.js";
BigInt.prototype.toJSON = function () {
    return this.toString();
};
/** @param {NS} ns **/
export async function main(ns) {
    disableLogs(ns, ["scan"]);
    ns.print("Getting server list...");
    const servers = await getServersLight(ns);
    ns.print(`Got ${servers.length} servers. Searching for contracts on each...`);
    // Retrieve all contracts and convert them to objects with the required information to solve
    const contractsDb = servers.map(hostname => ({ hostname, contracts: ns.ls(hostname, '.cct') }))
        .filter(o => o.contracts.length > 0)
        .map(o => o.contracts.map(contract => ({ contract, hostname: o.hostname }))).flat();
    if (contractsDb.length == 0)
        return ns.print("Found no contracts to solve.");

    // Spawn temporary scripts to gather the remainder of contract data required for solving
    ns.print(`Found ${contractsDb.length} contracts to solve. Gathering contract data via separate scripts..."`);

    for (const c of contractsDb) {
        c.type = ns.codingcontract.getContractType(c.contract, c.hostname);
        c.data = ns.codingcontract.getData(c.contract, c.hostname);
    }

    // Let this script die to free up ram, and start up a new script (after a delay) that will solve all these contracts using the minimum ram footprint of 11.6 GB
    await runScriptLocal(ns, scriptSolver, true, [JSON.stringify(contractsDb)]);
}