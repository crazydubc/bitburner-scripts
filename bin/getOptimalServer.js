let weakenStrength = 0.05

export function printProfit(ns, tm, take, batches, threads, chance) {
  //tm is in milliseconds...
  tm = tm / 1000
  //Profit per second
  let profit = (take / tm) * batches
  profit = profit / threads * chance
  return tm === 0 || take === 0 || isNaN(profit) ? 0 : profit
}

/** @param {NS} ns **/
export async function main(ns) {
  /** @type {Server[]} servers */
  const servers = getServers(ns);
  const first = ns.args[0];
  const player = ns.getPlayer();
  weakenStrength = ns.weakenAnalyze(1);
  let bestratio = 0
  let bestsec = Infinity
  let bestserver;
  for (const server of servers) {
    if (server.minDifficulty === 100 || server.requiredHackingSkill > player.skills.hacking || !server.hasAdminRights || server.hostname === "home" || server.moneyMax === 0 || server.purchasedByPlayer) continue
    const batchinfo = getHackP(ns, server, -1, -1, 1)
    const hchance = getHackChance(ns, server.hostname, server.minDifficulty)
    const hackingTime = getHckTime(ns, server.hostname, server.minDifficulty)

    //Weaken time at minimal difficulty
    let weaktime = hackingTime * 4
    weaktime = (weaktime === 0) ? 4 : weaktime
    const totalthreads = (batchinfo.H1 + batchinfo.G1 + batchinfo.W2 + batchinfo.W1)
    const ratio = printProfit(ns, weaktime, batchinfo.Take, 1, totalthreads, hchance)
    
    if (first && server.hackDifficulty - server.minDifficulty < bestsec) {
      bestsec = server.hackDifficulty - server.minDifficulty
      bestratio = ratio
      bestserver = server
    }
    else if (first && server.hackDifficulty - server.minDifficulty === bestsec && ratio > bestratio) {
      bestsec = server.hackDifficulty - server.minDifficulty
      bestratio = ratio
      bestserver = server
    }
    else if (!first && ratio > bestratio) {
      bestratio = ratio
      bestserver = server
    }


  }
  const port = ns.getPortHandle(ns.pid)
  ns.atExit(() => port.write(bestserver))
}

/** @param {NS} ns */
export function getServers(ns) {
  const serverList = new Set(["home"])
  for (const server of serverList) {
    for (const connection of ns.scan(server)) {
      serverList.add(connection)
    }
  }
  const serverDetails = []
  for (const server of serverList) {
    serverDetails.push(ns.getServer(server))
  }
  return serverDetails
}
/** @param {NS} ns */
export function getHackP(ns, server, batches, threads, starthacks) {
  const hack_chance = getHackChance(ns, server.hostname, server.minDifficulty)
  const hackperc = getHackPercent(ns, server.hostname, server.minDifficulty)
  let moneytotake = 0
  let hytotalbatches = 1
  let hgwtotalbatches = 1
  let hwgwtotalbatches = 1
  let besttake = 0
  let besth1threads = 0
  let bestw1threads = 0
  let bestg1threads = 0
  let bestw2threads = 0
  let besttype = "HGW"
  let bestratio = 0

  for (let testthreads = starthacks; testthreads <= Math.min(Math.ceil(1 / hackperc), starthacks); testthreads++) {
    moneytotake = hackperc * testthreads >= 1 ? server.moneyMax - 1 : hackperc * server.moneyMax * testthreads
    // Hybrid hacking threads and it's security threads
    let hysechack = testthreads * .002 //Security added from hacking
    const hyw1threads = Math.floor(hysechack / weakenStrength) //Take out the hybrid amount - just enough
    hysechack -= hyw1threads * weakenStrength
    // HGW hacking threads and it's security threads
    const hgwsechack = testthreads * .002 //Security added from hacking which will carry over
    // HWGW hacking threads and it's security threads
    let hwgwsechack = testthreads * .002 //Security added from hacking
    const hwgww1threads = Math.ceil(hwgwsechack / weakenStrength) //Take it all out   
    //Hybrid and HGW have some security left.  HWGW does not
    const hygthreads = getGrowThreads(ns, server.hostname, server.moneyMax - moneytotake, server.minDifficulty + hysechack)
    const hgwgthreads = getGrowThreads(ns, server.hostname, server.moneyMax - moneytotake, server.minDifficulty + hgwsechack)
    const hwgwgthreads = getGrowThreads(ns, server.hostname, server.moneyMax - moneytotake, server.minDifficulty)

    moneytotake *= hack_chance
    //Last weaken threads for the grows and remaining from hacks
    const hysecgrow = hygthreads * .004
    const hgwsecgrow = hgwgthreads * .004
    const hwgwsecgrow = hwgwgthreads * .004

    //Get weaken threads
    const hyw2threads = Math.ceil((hysecgrow + hysechack) / weakenStrength)
    const hgww2threads = Math.ceil((hgwsecgrow + hgwsechack) / weakenStrength)
    const hwgww2threads = Math.ceil((hwgwsecgrow) / weakenStrength)

    //Get total thread count
    const hytotalthreads = testthreads + hyw1threads + hygthreads + hyw2threads
    const hgwtotalthreads = testthreads + hgwgthreads + hgww2threads
    const hwgwtotalthreads = testthreads + hwgww1threads + hwgwgthreads + hwgww2threads

    if (threads > 0) {
      hytotalbatches = Math.floor(threads / hytotalthreads) > batches || batches < 1 ? 0 : Math.floor(threads / hytotalthreads)
      hgwtotalbatches = Math.floor(threads / hgwtotalthreads) > batches || batches < 1 ? 0 : Math.floor(threads / hgwtotalthreads)
      hwgwtotalbatches = Math.floor(threads / hwgwtotalthreads) > batches || batches < 1 ? 0 : Math.floor(threads / hwgwtotalthreads)
    }

    let VALIDTEST = false
    let hyratio = 0
    let hgwratio = 0
    let hwgwratio = 0

    if (batches === -1 && threads === -1) { //Simply get the best.  Assume unlimited batches/threads
      hyratio = moneytotake / hytotalthreads
      hgwratio = moneytotake / hgwtotalthreads
      hwgwratio = moneytotake / hwgwtotalthreads
    }
    else {
      hyratio = moneytotake / hytotalthreads * hytotalbatches
      hgwratio = moneytotake / hgwtotalthreads * hgwtotalbatches
      hwgwratio = moneytotake / hwgwtotalthreads * hwgwtotalbatches
    }
    if (hyratio || hgwratio || hwgwratio) VALIDTEST = true

    // Just cascade the possibilities
    let failed = 0
    //HGW
    if (hgwratio > bestratio) {
      bestratio = hgwratio
      besttake = moneytotake
      besth1threads = testthreads
      bestw1threads = 0
      bestg1threads = hgwgthreads
      bestw2threads = hgww2threads
      besttype = "HGW"
    }
    else failed++
    //Hybrid
    if (hyratio > bestratio) {
      bestratio = hyratio
      besttake = moneytotake
      besth1threads = testthreads
      bestw1threads = hyw1threads
      bestg1threads = hygthreads
      bestw2threads = hyw2threads
      besttype = "Hybrid"
    }
    else failed++
    //HWGW
    if (hwgwratio > bestratio || (testthreads === Math.min(Math.ceil(1 / hackperc), starthacks) && bestratio === 0)) {// || testthreads == Math.ceil(1 / hackperc)) { //Our default for the highest possible
      bestratio = hwgwratio
      besttake = moneytotake
      besth1threads = testthreads
      bestw1threads = hwgww1threads
      bestg1threads = hwgwgthreads
      bestw2threads = hwgww2threads
      besttype = "HWGW"
    }
    else failed++
    if (failed === 3 && VALIDTEST) break//We are done.  Nothing better
  } // for loop to max threads

  let takemult = 1
  try {
    const mults = ns.getBitNodeMultipliers()
    takemult = mults.ScriptHackMoneyGain
  } catch { }
  //Create return object
  const record = {
    "H1": besth1threads,
    "W1": bestw1threads,
    "G1": bestg1threads,
    "W2": bestw2threads,
    "Type": besttype,
    "Take": besttake * takemult,
    "HackP": hackperc,
    "Chance": hack_chance
  }
  return record
}

/** @param {NS} ns */
function getHckTime(ns, server, sec) {
  const host = ns.getServer(server)
  /** @type {Person} person */
  const person = ns.getPlayer()

  host.hackDifficulty = sec
  let hackingTime = 0
  try {
    return ns.formulas.hacking.hackTime(host, person)
  }
  catch {
    const { hackDifficulty, requiredHackingSkill } = host;
    if (hackDifficulty >= 100 || requiredHackingSkill > person.skills.hacking) {
      hackingTime = Number.POSITIVE_INFINITY
      return hackingTime
    }
    const difficultyMult = requiredHackingSkill * hackDifficulty;

    const baseDiff = 500;
    const baseSkill = 50;
    const diffFactor = 2.5;
    let skillFactor = diffFactor * difficultyMult + baseDiff;
    skillFactor /= person.skills.hacking + baseSkill;

    const hackTimeMultiplier = 5;
    try {
      hackingTime = 1000 *
        (hackTimeMultiplier * skillFactor) /
        (person.mults.hacking_speed *
          1 + Math.pow(person.skills.intelligence, 0.8) / 600)
    }
    catch { hackingTime = 1000 * hackTimeMultiplier * skillFactor / person.mults.hacking_speed }
  }
  return hackingTime
}
/** @param {NS} ns */
function getHackPercent(ns, server, sec) {
  const host = ns.getServer(server)
  host.hackDifficulty = sec
  const player = ns.getPlayer()
  let hackperc = 0
  try {
    hackperc = ns.formulas.hacking.hackPercent(host, player)
    return hackperc
  }
  catch {
    const hackDifficulty = host.minDifficulty ?? 100
    if (hackDifficulty >= 100) {
      hackperc = 0
      return hackperc
    }
    const requiredHackingSkill = host.requiredHackingSkill ?? 1e9
    const balanceFactor = 240
    const difficultyMult = (100 - hackDifficulty) / 100
    const skillMult = (player.skills.hacking - (requiredHackingSkill - 1)) / player.skills.hacking

    let percentMoneyHacked = 0
    try {
      /** @type {BitNodeMultipliers} mults */
      const mults = getBNMults(ns)
      percentMoneyHacked = difficultyMult * skillMult * player.mults.hacking_money * mults.ScriptHackMoney / balanceFactor
    }
    catch { percentMoneyHacked = difficultyMult * skillMult * player.mults.hacking_money / balanceFactor }
    hackperc = Math.min(1, Math.max(percentMoneyHacked, 0))
  }
  return hackperc
}
/** @param {NS} ns */
function getGrowThreads(ns, server, money, sec) {
  const player = ns.getPlayer()
  const host = ns.getServer(server)
  host.hackDifficulty = sec
  host.moneyAvailable = money
  let gthreads = 0
  try {
    gthreads = ns.formulas.hacking.growThreads(host, player, host.moneyMax)
    return gthreads
  }
  catch {
    const server = host
    const targetMoney = host.moneyMax
    let startMoney = host.moneyAvailable
    const cores = 1
    const person = player
    /*
          if (!server.serverGrowth) {
            gthreads = Infinity
          }
      */
    const moneyMax = server.moneyMax ?? 1;
    const hackDifficulty = server.hackDifficulty ?? 100;

    if (startMoney < 0) startMoney = 0; // servers "can't" have less than 0 dollars on them
    if (targetMoney > moneyMax) targetMoney = moneyMax; // can't grow a server to more than its moneyMax
    if (targetMoney <= startMoney) {
      gthreads = 0; // no growth --> no threads
      return gthreads
    }
    // exponential base adjusted by security
    const adjGrowthRate = 1 + (1.03 - 1) / hackDifficulty;
    const exponentialBase = Math.min(adjGrowthRate, 1.0035); // cap growth rate

    // total of all grow thread multipliers
    const serverGrowthPercentage = server.serverGrowth / 100.0;
    const coreMultiplier = 1 + (cores - 1) / 16
    let threadMultiplier = 0
    try {
      /** @type {BitNodeMultipliers} mults */
      const mults = getBNMults(ns)
      threadMultiplier = serverGrowthPercentage * person.mults.hacking_grow * coreMultiplier * mults.ServerGrowthRate
    }
    catch { threadMultiplier = serverGrowthPercentage * person.mults.hacking_grow * coreMultiplier }

    const x = threadMultiplier * Math.log(exponentialBase)
    const y = startMoney * x + Math.log(targetMoney * x)
    let w;
    if (y < Math.log(2.5)) {
      const ey = Math.exp(y);
      w = (ey + (4 / 3) * ey * ey) / (1 + (7 / 3) * ey + (5 / 6) * ey * ey);
    } else {
      w = y;
      if (y > 0) w -= Math.log(y);
    }
    let cycles = w / x - startMoney;
    let bt = exponentialBase ** threadMultiplier;
    if (bt == Infinity) bt = 1e300;
    let corr = Infinity;
    // Two sided error because we do not want to get stuck if the error stays on the wrong side
    do {
      // c should be above 0 so Halley's method can't be used, we have to stick to Newton-Raphson
      let bct = bt ** cycles;
      if (bct == Infinity) bct = 1e300;
      const opc = startMoney + cycles;
      let diff = opc * bct - targetMoney;
      if (diff == Infinity) diff = 1e300;
      corr = diff / (opc * x + 1.0) / bct;
      cycles -= corr;
    } while (Math.abs(corr) >= 1);

    const fca = Math.floor(cycles);
    if (targetMoney <= (startMoney + fca) * Math.pow(exponentialBase, fca * threadMultiplier)) {
      gthreads = fca;
      return gthreads
    }
    const cca = Math.ceil(cycles);
    if (targetMoney <= (startMoney + cca) * Math.pow(exponentialBase, cca * threadMultiplier)) {
      gthreads = cca;
      return gthreads
    }
    gthreads = cca + 1;
    return gthreads
  }
}
/** @param {NS} ns */
function getHackChance(ns, server, sec) {
  const host = ns.getServer(server)
  host.hackDifficulty = sec
  try { return ns.formulas.hacking.hackChance(host, ns.getPlayer()) }
  catch {
    const person = ns.getPlayer()
    const hackDifficulty = sec
    const requiredHackingSkill = host.requiredHackingSkill
    // Unrooted or unhackable server
    if (!host.hasAdminRights || hackDifficulty >= 100 || host.minDifficulty >= 100) {
      return 0
    }
    const hackFactor = 1.75;
    const difficultyMult = (100 - hackDifficulty) / 100;
    const skillMult = hackFactor * person.skills.hacking;
    const skillChance = (skillMult - requiredHackingSkill) / skillMult;
    let chance = 0
    try {
      chance =
        skillChance *
        difficultyMult *
        person.mults.hacking_chance *
        1 + Math.pow(person.skills.intelligence, 0.8) / 600
    }
    catch {
      chance =
        skillChance *
        difficultyMult *
        person.mults.hacking_chance
    }
    return Math.min(1, Math.max(chance, 0));
  }
}