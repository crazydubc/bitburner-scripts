// Cost checks and the purchase run synchronously in one home process: no stale remote reserve snapshot.
const costMethods = {
  cloud: {purchaseServer: 'getServerCost', upgradeServer: 'getServerUpgradeCost'},
  hacknet: {purchaseNode: 'getPurchaseNodeCost', upgradeLevel: 'getLevelUpgradeCost', upgradeRam: 'getRamUpgradeCost',
    upgradeCore: 'getCoreUpgradeCost', upgradeCache: 'getCacheUpgradeCost'},
  singularity: {upgradeHomeRam: 'getUpgradeHomeRamCost', upgradeHomeCores: 'getUpgradeHomeCoresCost',
    purchaseProgram: 'getDarkwebProgramCost', purchaseAugmentation: 'getAugmentationPrice'},
  gang: {purchaseEquipment: 'getEquipmentCost'},
  sleeve: {purchaseSleeveAug: 'getSleevePurchasableAugs', purchaseSleeve: 'getSleeveCost', upgradeMemory: 'getMemoryUpgradeCost'},
  stock: {buyStock: 'getPurchaseCost', buyShort: 'getPurchaseCost'},
};
const fixedPurchases = new Set(['stock.purchaseWseAccount', 'stock.purchaseTixApi', 'stock.purchase4SMarketData',
  'stock.purchase4SMarketDataTixApi', 'singularity.purchaseTor', 'corporation.createCorporation']);
export function purchaseRam(ns, namespace, method) {
  if (!costMethods[namespace]?.[method] && !fixedPurchases.has(`${namespace}.${method}`))
    throw new Error(`Unsupported guarded purchase: ${namespace}.${method}`);
  const apis = new Set(['baseCost', 'getHostname', 'getServerMoneyAvailable', `${namespace}.${method}`]);
  if (costMethods[namespace]?.[method]) apis.add(`${namespace}.${costMethods[namespace][method]}`);
  if (namespace === 'stock' && ['buyStock', 'buyShort'].includes(method)) apis.add('getMoneySources');
  return [...apis].reduce((ram, name) => ram + ns.getFunctionRamCost(name), 0);
}
export function executePurchase(ns, namespace, method, args, policy = {}) {
  if (ns.getHostname() !== 'home') throw new Error('Purchase checks must run on home');
  const budget = policy.budget ?? Number.MAX_VALUE;
  const reserve = policy.reserve ?? Number(ns.read('reserve.txt') || 0);
  if (!Number.isFinite(budget) || budget < 0 || !Number.isFinite(reserve) || reserve < 0)
    throw new Error('Invalid purchase budget/reserve');
  const api = ns[namespace], costMethod = costMethods[namespace]?.[method];
  let cost;
  if (namespace === 'stock' && costMethod)
    cost = api[costMethod](...args, method === 'buyStock' ? ns.enums.PositionType.Long : ns.enums.PositionType.Short);
  else if (namespace === 'sleeve' && method === 'purchaseSleeveAug')
    cost = api[costMethod](args[0]).find(aug => aug.name === args[1])?.cost ?? Infinity;
  else if (namespace === 'cloud' && method === 'purchaseServer') cost = api[costMethod](args[1]);
  else if (namespace === 'gang' || (namespace === 'singularity' && method === 'purchaseAugmentation')) cost = api[costMethod](args[1]);
  else if (costMethod) cost = api[costMethod](...args);
  else if (namespace === 'corporation' && method === 'createCorporation') cost = args[1] === false ? 0 : 150e9;
  else if (namespace === 'singularity' && method === 'purchaseTor') cost = 200e3;
  else if (fixedPurchases.has(`${namespace}.${method}`)) cost = policy.quotedCost; // Fixed BN-scaled stock access price, supplied by its caller.
  else throw new Error(`Unsupported guarded purchase: ${namespace}.${method}`);
  const money = ns.getServerMoneyAvailable('home');
  if (!Number.isFinite(money) || money < 0) throw new Error('Invalid home cash balance');
  const fraction = policy.ignoreReserveBelowFraction ?? 0;
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) throw new Error('Invalid reserve exception');
  const available = Math.min(budget, Math.max(money - reserve, money * fraction, 0));
  const buyingShares = namespace === 'stock' && ['buyStock', 'buyShort'].includes(method);
  const failure = buyingShares ? 0 : namespace === 'cloud' && method === 'purchaseServer' ? '' :
    namespace === 'hacknet' && method === 'purchaseNode' ? -1 : false;
  // Optional first-BN1 controller briefly holds spending for cash goals/installations.
  // Its atExit clears this record; the heartbeat also bounds stale records after a crash.
  const controller = globalThis['window']?.__bitburnerBn1Cycle;
  if (controller?.spendLock && !controller.stop && controller.expires > Date.now())
    return {result: failure, spent: 0, cost, reason: 'bn1-cash-goal'};
  if (!Number.isFinite(cost) || cost < 0 || cost > available ||
      (buyingShares && !(ns.getMoneySources().sinceInstall?.casino >= 10e9)))
    return {result: failure, spent: 0, cost, reason: 'budget-or-casino'};
  // All supported purchase APIs mutate synchronously; there must be no await between these reads and the call.
  const result = api[method](...args);
  if (result && typeof result.then === 'function') throw new Error('Guarded purchase unexpectedly returned a Promise');
  const success = namespace === 'hacknet' && method === 'purchaseNode' ? Number.isInteger(result) && result >= 0 :
    namespace === 'cloud' && method === 'purchaseServer' ? typeof result === 'string' && result.length > 0 :
    buyingShares ? typeof result === 'number' && result > 0 : result === true || result?.success === true;
  return {result, spent: success ? cost : 0, cost};
}
