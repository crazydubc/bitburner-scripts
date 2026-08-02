
/** @param {NS} ns */
export async function main(ns) {
  const utilFile = "./util.js";
  const scriptCost = 12.55;
  const telemetryFile = "telemetry.txt";
  const easyHacks = ["DeskMemo_3.1", "ZeroLogon", "FreshInstall_1.0", "CloudBlare(tm)", "Laika4",
    "OctantVoxel", "OpenWebAccessPoint", "Pr0verFl0", "110100100", "PrimeTime 2", "MathML", "OrdoXenos"];
  const connectFailures = ["Not Enough Charisma", "Direct Connection Required", "Service Unavailable", "Not Found", "Request Timeout"];
  const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const lettersLCase = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"]
  const lettersUCase = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"]
  const euCountries =
    ["Austria", "Belgium", "Bulgaria", "Croatia", "Republic of Cyprus", "Czech Republic", "Denmark", "Estonia", "Finland", "France", "Germany", "Greece", "Hungary",
      "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands", "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden"]
  const smallPrimes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]
  const largePrimes = [
    1069, 1409, 1471, 1567, 1597, 1601, 1697, 1747, 1801, 1889, 1979, 1999, 2063, 2207, 2371, 2503, 2539, 2693, 2741,
    2753, 2801, 2819, 2837, 2909, 2939, 3169, 3389, 3571, 3761, 3881, 4217, 4289, 4547, 4729, 4789, 4877, 4943, 4951,
    4957, 5393, 5417, 5419, 5441, 5519, 5527, 5647, 5779, 5881, 6007, 6089, 6133, 6389, 6451, 6469, 6547, 6661, 6719,
    6841, 7103, 7549, 7559, 7573, 7691, 7753, 7867, 8053, 8081, 8221, 8329, 8599, 8677, 8761, 8839, 8963, 9103, 9199,
    9343, 9467, 9551, 9601, 9739, 9749, 9859]
  const commonPWDict =
    ["123456", "password", "12345678", "qwerty", "123456789", "12345", "1234", "111111", "1234567", "dragon", "123123", "baseball", "abc123", "football", "monkey", "letmein",
      "696969", "shadow", "master", "666666", "qwertyuiop", "123321", "mustang", "1234567890", "michael", "654321", "superman", "1qaz2wsx", "7777777", "121212", "0", "qazwsx",
      "123qwe", "trustno1", "jordan", "jennifer", "zxcvbnm", "asdfgh", "hunter", "buster", "soccer", "harley", "batman", "andrew", "tigger", "sunshine", "iloveyou", "2000",
      "charlie", "robert", "thomas", "hockey", "ranger", "daniel", "starwars", "112233", "george", "computer", "michelle", "jessica", "pepper", "1111", "zxcvbn", "555555",
      "11111111", "131313", "freedom", "777777", "pass", "maggie", "159753", "aaaaaa", "ginger", "princess", "joshua", "cheese", "amanda", "summer", "love", "ashley", "6969",
      "nicole", "chelsea", "biteme", "matthew", "access", "yankees", "987654321", "dallas", "austin", "thunder", "taylor", "matrix"]

  let telemetry = {};
  let labComplete;
  let complete = Object.create(null);
  let inProgress = Object.create(null);
  let workingOn = Object.create(null);
  let logged_once = new Set();
  if (ns.self().server === "darkweb") {
    complete = []
    inProgress = []
    workingOn = []
    labComplete = false
    if (ns.scp(telemetryFile, ns.self().server, "home")) {
      const telemetryData = JSON.parse(ns.read(telemetryFile))
      telemetry = telemetryData
    }
  }

  if (ns.args.includes("clear-stasis")) {
    await runSetStasis(ns, false);
    const threads = Math.floor((ns.getServerMaxRam(ns.self().server) - ns.dnet.getBlockedRam(ns.self().server)) / scriptCost)
    ns.spawn(ns.self().filename, { temporary: true, spawnDelay: 0, threads: threads, ramOverride: scriptCost })
  }


  //library of all types of servers with instructions on how to break in.
  const library = {
    //get password from hint
    "DeskMemo_3.1": async (ns, server, details) => {
      const answerArray = details.passwordHint.split(" ");
      const answer = answerArray[answerArray.length - 1];
      return await workOnServer(ns, server, answer, 1, details);
    },
    //does not have a password. Easy peasy
    "ZeroLogon": async (ns, server, details) => {
      return await workOnServer(ns, server, "", 1, details);
    },
    //has a default password. Noobs.
    "FreshInstall_1.0": async (ns, server, details) => {
      const passwordDict = {
        "alphabetic": {
          5: "admin",
          8: "password",
        },
        "numeric": {
          5: "12345",
          4: "0000",
        }
      }
      let password = passwordDict[details.passwordFormat]?.[details.passwordLength] || undefined;
      if (!password) return { success: false };
      return await workOnServer(ns, server, password, 1, details);
    },
    "CloudBlare(tm)": async (ns, server, details) => {
      if (details.passwordFormat === "numeric")
        return await workOnServer(ns, server, details.data.replace(/\D/g, ""), 1, details);

      logonce(ns, "CloudBlare(tm)needs a new format!  " + details.passwordFormat);
      return { success: false };
    },
    //dog names
    "Laika4": async (ns, server, details) => {
      const dognames = ["max", "rover", "spot", "fido"];
      for (const dog of dognames) {
        if (dog.length == details.passwordLength) {
          const results = await workOnServer(ns, server, dog, 1, details);
          if (results.success || !serverCheck(ns, server, results)) return results;
          else if (!serverCheck(ns, server, results)) return { success: false }
        }
      }
      return { success: false };
    },
    //roamn to decimals
    "BellaCuore": async (ns, server, details) => {
      function romanToDecimal(details) {
        if (details === "nulla") return 0
        const values = {
          I: 1,
          V: 5,
          X: 10,
          L: 50,
          C: 100,
          D: 500,
          M: 1000
        }
        let total = 0;
        const romanNums = details.split("")
        for (let i = 0; i < romanNums.length; i++) {
          const current = values[romanNums[i]]
          const next = values[romanNums[i + 1]]
          if (next && current < next) {
            total -= current
          } else {
            total += current
          }
        }
        return total
      }

      let rawNumbers = details.data.split(",")
      const numbers = []
      if (rawNumbers.length > 1)
        rawNumbers.forEach((n) => numbers.push(romanToDecimal(n)))
      else numbers.push(romanToDecimal(rawNumbers[0]))
      let result
      if (numbers.length === 1) {
        result = await workOnServer(ns, server, numbers[0], 1, details)
        if (result.success) return result
        else if (!serverCheck(ns, server, result)) return { success: false }
      }
      else { //We have a range of 2 numbers.
        let pool = inProgress[server]?.currentPool ?? []
        let tries = inProgress[server]?.tries ?? 1
        const high = numbers[0] > numbers[1] ? numbers[0] : numbers[1]
        const low = numbers[0] < numbers[1] ? numbers[0] : numbers[1]
        if (pool.length === 0) {
          for (let i = low; i <= high; i++)
            pool.push(i);
        }
        while (true) {
          inProgress[server] = { currentPool: pool, tries };

          const testing = pool[Math.floor(pool.length / 2)];
          result = await workOnServer(ns, server, String(testing), tries++, details, false);

          if (result.success || !serverCheck(ns, server, result)) return result;

          const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 });
          if (!bleedCheck(ns, server, bleed)) return { success: false };

          let shrunk = false;
          for (const log of (bleed?.logs ?? [])) {
            let jsonLog;
            try { jsonLog = JSON.parse(log); } catch { continue; }
            if (!jsonLog?.data) continue;

            if (jsonLog.passwordAttempted != null && Number(jsonLog.passwordAttempted) !== testing) continue;

            if (jsonLog.data === "PARUM BREVIS") {
              pool = pool.filter(p => p > testing);
              shrunk = true;
              break;
            } else if (jsonLog.data === "ALTUS NIMIS") {
              pool = pool.filter(p => p < testing);
              shrunk = true;
              break;
            }
          }

          // Prevent infinite loop if logs didn’t give guidance
          if (!shrunk) {
            await ns.sleep(20);
            continue;
          }

          if (pool.length === 0) return { success: false };
        }
      }
      return { success: false }
    },
    "RateMyPix.Auth": async (ns, server, details) => {
      let testing;
      if (details.passwordFormat === "numeric") testing = numbers
      else if (details.passwordFormat === "alphabetic") testing = lettersLCase.concat(lettersUCase)
      else if (details.passwordFormat === "alphanumeric") testing = lettersLCase.concat(lettersUCase).concat(numbers)
      else {
        return { success: false }
      }
      const workers = []
      const working = []
      let i = inProgress[server]?.count ?? 0
      let tries = inProgress[server]?.tries ?? 1
      const knownPool = inProgress[server]?.knownPool ?? []
      let firstGuess = inProgress[server]?.firstGuess ?? false
      let lastGuess = inProgress[server]?.lastGuess ?? []
      let nextGuess = inProgress[server]?.nextGuess ?? []
      const tested = new Set(inProgress[server]?.tested ?? [])
      const testFeedback = inProgress[server]?.testFeedback ?? []
      const clearWorkers = () => {
        workers.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
        working.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
      }
      const record = () => {
        inProgress[server] = {
          knownPool,
          count: i,
          tries,
          firstGuess,
          lastGuess: lastGuess,
          nextGuess: nextGuess,
          tested: Array.from(tested),
          testFeedback
        }
      }
      ns.atExit(() => {
        updateWorkingOn(ns, server, "remove")
        clearWorkers()
      })
      while (knownPool.length < details.passwordLength) {
        record()
        const beingTested = testing[i]
        const testGroup = []
        for (let x = 0; x < details.passwordLength; x++)
          testGroup.push(beingTested)
        const result = await workOnServer(ns, server, testGroup.join("").toString(), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) {
          clearWorkers()
          return result
        }
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) {
          clearWorkers()
          return { success: false }
        }
        const data = bleed?.logs
        for (const log of data) {
          let jsonLog
          try { jsonLog = JSON.parse(log) } catch { continue }
          if (!jsonLog?.data || jsonLog?.passwordAttempted.toString() !== testGroup.join("").toString()) continue
          const response = jsonLog.data.split("/")
          let currentMatch = 0
          if (response[0].toString() === "0") {
            break
          }
          else {
            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            currentMatch = Array.from(segmenter.segment(response[0])).length //Surprise!  Each 🌶️ splits into multiple unicode points, with variants...  Spicy indeed!!
            for (let x = 0; x < currentMatch; x++)
              knownPool.push(i)
          }
        }
        if (knownPool.length === details.passwordLength) break
        else i++
      }

      //knownPool will now contain all of the valid candidates.
      //We could do straight up combinations and permutations here
      //but I'm going to use another variation of Knuth.  It's just better
      if (!firstGuess) {
        record()
        const result = await workOnServer(ns, server, knownPool.map((index) => testing[index]).join("").toString(), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) {
          clearWorkers()
          return result
        }
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) {
          clearWorkers()
          return { success: false }
        }
        const data = bleed?.logs
        for (const log of data) {
          let jsonLog
          try { jsonLog = JSON.parse(log) } catch { continue }
          if (!jsonLog?.data || jsonLog?.passwordAttempted.toString() !== knownPool.map((index) => testing[index]).join("").toString()) continue
          const response = jsonLog.data.split("/")
          let currentMatch = 0
          if (response[0].toString() === "0") {
            testFeedback.push({
              guess: knownPool,
              feedback: { blk: 0 }
            })
          }
          else {
            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            currentMatch = Array.from(segmenter.segment(response[0])).length //Surprise!  Each 🌶️ splits into multiple unicode points, with variants...  Spicy indeed!!
            testFeedback.push({
              guess: knownPool,
              feedback: { blk: currentMatch }
            })
          }
          tested.add(knownPool.join(","))
          firstGuess = true
          lastGuess = [...knownPool]
          nextGuess = []
          record()
          break
        }
      }
      //webworker time!
      while (true) {
        record()
        if (nextGuess.length === 0) {
          let ready = false
          const worker = workers.length > 1 ? workers.pop() : getWorker()
          worker.onmessage = (msg) => {
            nextGuess = msg.data[0]
            workers.push(worker)
            working.pop()
            ready = true
            try { ns.self() }
            catch {
              clearWorkers()
              record()
              return { silentFail: true }
            }
          }
          worker.postMessage(["pixGetNextCode", [tested, testFeedback, lastGuess, knownPool]])
          working.push(worker)
          while (!ready) await ns.asleep(10)
        }
        const result = await workOnServer(ns, server, nextGuess.map((index) => testing[index]).join("").toString(), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) {
          clearWorkers()
          return result
        }
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) {
          clearWorkers()
          return { success: false }
        }
        const data = bleed?.logs
        for (const log of data) {
          let jsonLog
          try { jsonLog = JSON.parse(log) } catch { continue }
          if (!jsonLog?.data || jsonLog?.passwordAttempted.toString() !== nextGuess.map((index) => testing[index]).join("").toString()) continue
          const response = jsonLog.data.split("/")
          let currentMatch = 0
          if (response[0].toString() === "0") {
            testFeedback.push({
              guess: [...nextGuess],
              feedback: { blk: 0 }
            })
          }
          else {
            const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
            currentMatch = Array.from(segmenter.segment(response[0])).length //Surprise!  Each 🌶️ splits into multiple unicode points, with variants...  Spicy indeed!!
            testFeedback.push({
              guess: [...nextGuess],
              feedback: { blk: currentMatch }
            })
          }
          tested.add(nextGuess.join(","))
          lastGuess = [...nextGuess]
          nextGuess = []
          record()
          break
        }
      }
    },
    "OctantVoxel": async (ns, server, details) => {
      function convertToBase10(value) {//numberStr, base) {
        function charToValue(char) {
          if (char >= '0' && char <= '9') return char.charCodeAt(0) - 48
          if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 55
          if (char >= 'a' && char <= 'z') return char.charCodeAt(0) - 87
          throw new Error(`Invalid digit: ${char}`)
        }
        const numberStr = value[0]
        const base = value[1]
        const [intPart, fracPart = ""] = numberStr.split('.')
        let result = 0
        // Integer part
        for (let i = 0; i < intPart.length; i++) {
          const digit = charToValue(intPart[i])
          result += digit * Math.pow(base, intPart.length - i - 1)
        }
        // Fractional part
        for (let i = 0; i < fracPart.length; i++) {
          const digit = charToValue(fracPart[i])
          result += digit * Math.pow(base, -(i + 1))
        }
        return result
      }
      const nums = details.data.split(",");
      const result = await workOnServer(ns, server, convertToBase10([nums[1], nums[0]]), 1, details);
      if (result.success || !serverCheck(ns, server, result)) return result;

      return { success: false };
    },
    "BigMo%od": async (ns, server, details) => {
      const workers = []
      const working = []
      const length = details.passwordLength;
      const MIN = 10 ** (length - 1);
      const MAX = 10 ** length - 1;
      let tries = inProgress[server]?.tries ?? 1;
      let tripleConstraints = inProgress[server]?.tripleConstraints ?? [];
      let base = Number(inProgress[server]?.base ?? MIN);
      const tried = new Set(inProgress[server]?.tried ?? [])
      const record = () => {
        inProgress[server] = {
          base: base.toString(),
          tries,
          tripleConstraints,
          tried: Array.from(tried)
        }
      }
      const clearWorker = () => {
        workers.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
        working.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
      }
      ns.atExit(() => {
        clearWorker()
        updateWorkingOn(ns, server, "remove");
      });

      function parseTripleModuloLogs(logs) {
        const out = [];
        for (const log of logs ?? []) {
          try {
            const j = JSON.parse(log);
            if (j?.passwordAttempted && j?.data) {
              const k = Number(j.passwordAttempted);
              const r = Number(j.data);
              if (Number.isFinite(k) && Number.isFinite(r)) {
                out.push({ k, r });
              }
            }
          } catch {
            continue;
          }
        }
        return out;
      }

      let candidate = base
      while (true) {
        base = candidate.toString()
        record()

        const result = await workOnServer(ns, server, candidate.toString(), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) {
          clearWorker()
          return result
        }
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 });
        if (!bleedCheck(ns, server, bleed)) {
          clearWorker()
          return { success: false }
        }
        const fresh = parseTripleModuloLogs(bleed.logs).filter(c => !tripleConstraints.some(x => x.k === c.k && x.r === c.r));
        if (fresh.length > 0) tripleConstraints.push(...fresh);
        tried.add(candidate)

        //Webworker - GO!
        let ready = false
        const worker = workers.length > 1 ? workers.pop() : getWorker()
        worker.onmessage = (msg) => {
          candidate = msg.data[0]
          workers.push(worker)
          working.pop()
          ready = true
          base = candidate.toString()
          record()
        }
        worker.postMessage(["getNextCandidate", [candidate, tripleConstraints, tries, MIN, MAX, Array.from(tried)]])
        working.push(worker)
        while (!ready) await ns.asleep(10)
        record()
      }
    },
    //numeric. Tells you the number is divisible by 1 
    //and every attempt will tell you if the password is divisible by the submitted number.
    "Factori-Os": async (ns, server, details) => {
      let base = BigInt(inProgress[server]?.base ?? "1")
      const length = details.passwordLength
      let tries = inProgress[server]?.tries ?? 1
      let primeCounter = inProgress[server]?.primeCounter ?? 0
      let usedLargePrimes = inProgress[server]?.usedLargePrimes ?? 0
      let power = inProgress[server]?.power ?? 0
      const record = () => inProgress[server] = {
        primeCounter,
        base: base.toString(),
        tries,
        usedLargePrimes,
        power
      }

      if (length === 1) { //Seperate optimal solver
        const testingOrder = [0, 7, 2, 3, 5, 4, 8, 9]
        let candidates = inProgress[server]?.candidates ?? [1, 2, 3, 4, 5, 6, 7, 8, 9]
        let result

        for (; primeCounter < testingOrder.length; primeCounter++) {
          record()
          const d = BigInt(testingOrder[primeCounter])

          if (candidates.length === 1) {
            result = await workOnServer(ns, server, candidates[0], tries++, details)
            if (result.success || !serverCheck(ns, server, result)) return result
            failureReport(ns, server, details)
            return { success: false }
          }

          let divides = false

          result = await workOnServer(ns, server, d.toString(), tries++, details, false)
          if (result.success || !serverCheck(ns, server, result)) return result
          const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
          if (!bleedCheck(ns, server, bleed)) return { success: false }
          if (d.toString() === "0") continue
          for (const log of bleed?.logs ?? []) {
            try {
              const jsonLog = JSON.parse(log)
              if (jsonLog.data === true || jsonLog.data === "true") {
                divides = true
                break
              }
            } catch { }
          }
          candidates = candidates.filter(n => divides ? BigInt(n) % d === 0n : BigInt(n) % d !== 0n)
        }
        if (candidates.length === 1) {
          const final = await workOnServer(ns, server, candidates[0], tries, details)
          if (final.success || !serverCheck(ns, server, result)) return final
        }
        return { success: false }
      }

      // Prime order: small → large → rare
      const sortedPrimeGroup = [...smallPrimes, ...largePrimes].filter(p => (p).toString().length <= details.passwordLength)
      record()
      for (; primeCounter < sortedPrimeGroup.length; primeCounter++) {
        const prime = BigInt(sortedPrimeGroup[primeCounter])
        const isLarge = prime >= 1000n
        if (isLarge && usedLargePrimes >= 3) {
          power = 0
          continue
        }
        while (true) {
          record()
          const candidate = base * prime
          if (candidate.toString().length > details.passwordLength) {
            power = 0
            break
          }

          const result = await workOnServer(ns, server, candidate.toString(), tries++, details, false)
          if (result.success || !serverCheck(ns, server, result)) return result
          const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
          if (!bleedCheck(ns, server, bleed)) return { success: false }
          let divides = false
          for (const log of bleed?.logs ?? []) {
            try {
              const json = JSON.parse(log)
              if (json?.data === true || json?.data === "true") {
                divides = true
                break
              }
            } catch { }
          }
          if (!divides) {
            power = 0
            break
          }
          base = candidate
          power++
          if (isLarge) usedLargePrimes++
        }
      }
      const final = await workOnServer(ns, server, base.toString(), tries++, details)
      if (final.success || !serverCheck(ns, server, final)) return final
      return { success: false }
    },
    "AccountsManager_4.2": async (ns, server, details) => {
      if (details.passwordFormat !== "numeric") return { success: false }

      const numbers = details.passwordHint.match(/\d+/g).map(Number)
      let pool = inProgress[server]?.currentPool ?? []
      let tries = inProgress[server]?.tries ?? 1
      updateWorkingOn(ns, server, "set")
      if (pool.length === 0) {
        for (let i = numbers[0]; i <= numbers[1]; i++)
          pool.push(i);
      }
      const record = () => inProgress[server] = {
        currentPool: pool,
        tries: tries
      }
      while (true) {
        record()
        const testing = pool[Math.floor(pool.length / 2)]
        const result = await workOnServer(ns, server, testing, tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) return result
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) return { success: false }
        const data = bleed?.logs
        for (const log of data) {
          let jsonLog
          try { jsonLog = JSON.parse(log) } catch { continue }
          if (jsonLog?.data === "Lower") {
            const logNum = Number(jsonLog.passwordAttempted)
            const newPool = pool.filter((p) => p < logNum)
            pool = newPool
            break
          }
          else if (jsonLog?.data === "Higher") {
            const logNum = Number(jsonLog.passwordAttempted)
            const newPool = pool.filter((p) => p > logNum)
            pool = newPool
            break
          }
        }
      }
    },
    "OpenWebAccessPoint": async (ns, server, details) => {
      if (!ns.dnet.getServerDetails(server).isConnectedToCurrentServer) return { success: false }
      updateWorkingOn(ns, server, "set")
      const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
      if (!bleedCheck(ns, server, bleed)) return { success: false }
      const data = bleed?.logs
      for (const log of data) {
        if (log.includes("Authentication successful")) {
          const answerArray = log.split(" ")
          const answer = answerArray[answerArray.length - 1]
          const result = await workOnServer(ns, server, answer, 1, details)
          if (result.success) return result
        }
      }
      return { success: false }
    },
    "NIL": async (ns, server, details) => {
      const length = details.passwordLength
      let testing
      if (details.passwordFormat === "numeric") testing = numbers
      else if (details.passwordFormat === "alphabetic") testing = lettersLCase.concat(lettersUCase)
      else if (details.passwordFormat === "alphanumeric") testing = lettersLCase.concat(lettersUCase).concat(numbers)
      else return { success: false }
      let i = inProgress[server]?.count ?? 0
      let tries = inProgress[server]?.tries ?? 1
      const correct = inProgress[server]?.correct ?? []
      if (correct.length === 0)
        for (let check = 0; check < length; check++)
          correct.push("*")

      while (i < testing.length) {
        inProgress[server] = {
          correct: correct,
          count: i,
          tries: tries
        }
        //await startup(ns)
        const beingTested = testing[i]
        const testArray = correct.map((a) => a === "*" ? beingTested : a)
        const result = await workOnServer(ns, server, testArray.join(""), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) return result
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) return { success: false }
        const data = bleed?.logs
        for (const log of data) {
          let jsonLog
          try { jsonLog = JSON.parse(log) } catch { continue }
          if (!jsonLog?.data) continue
          const response = jsonLog.data.split(",")
          if (testArray.join("") !== jsonLog.passwordAttempted) continue
          const pwAttempt = jsonLog.passwordAttempted.split("")
          for (let check = 0; check < response.length; check++) {
            if (response[check] === "yes")
              correct[check] = pwAttempt[check]
            else
              correct[check] = "*"
          }
          break
        }
        i++;
      }
      return { success: false }
    },
    "DeepGreen": async (ns, server, details) => {
      // A variation on Knuth
      updateWorkingOn(ns, server, "set")
      const workers = []
      const working = []
      const testFeedback = inProgress[server]?.testFeedback ?? []
      const tested = new Set(inProgress[server]?.tested ?? [])
      let tries = inProgress[server]?.tries ?? 1
      let firstFeedback
      let lastGuess = inProgress[server]?.lastGuess ?? []
      let nextGuess = inProgress[server]?.nextGuess ?? []
      let notFound = new Set(inProgress[server]?.notFound ?? [])
      let currentTestCount = inProgress[server]?.currentTestCount ?? 0
      let countHasCycled = inProgress[server]?.countHasCycled ?? false
      let feedback
      const length = details.passwordLength
      let pool
      if (details.passwordFormat === "numeric") pool = numbers
      else if (details.passwordFormat === "alphanumeric") pool = numbers.concat(lettersLCase).concat(lettersUCase)
      else if (details.passwordFormat === "alphabetic") pool = lettersLCase.concat(lettersUCase)
      else {
        return { success: false }
      }
      const record = () => inProgress[server] = {
        testFeedback,
        tested: Array.from(tested),
        lastGuess,
        nextGuess,
        notFound: Array.from(notFound),
        tries,
        countHasCycled,
      }
      const clearWorker = () => {
        workers.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
        working.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
      }
      ns.atExit(() => {
        clearWorker()
        updateWorkingOn(ns, server, "remove")
      })
      while (!countHasCycled) {
        //await startup(ns)
        //const firstGuess = []
        let needGuess = true
        let firstGuess
        while (needGuess) {
          firstGuess = []
          for (let i = 0; i < length; i++) {
            while (notFound.has(currentTestCount)) {
              currentTestCount++
              if (currentTestCount === pool.length) {
                countHasCycled = true
                currentTestCount = 0
              }
            }
            firstGuess.push(currentTestCount++)
            if (currentTestCount === pool.length) {
              countHasCycled = true
              currentTestCount = 0
            }
          }
          if (!tested.has(firstGuess.join(","))) needGuess = false
          else {
            currentTestCount++
            if (currentTestCount === pool.length) {
              countHasCycled = true
              currentTestCount = 0
            }
          }
        }
        const attempted = firstGuess.map(i => String(pool[i])).join("");
        const result = await workOnServer(ns, server, firstGuess.map((index) => pool[index].toString()).join(""), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) {
          clearWorker()
          return result
        }
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) {
          clearWorker()
          return { success: false }
        }
        firstFeedback = undefined;

        for (const log of (bleed?.logs ?? [])) {
          let jsonLog;
          try { jsonLog = JSON.parse(log); } catch { continue; }
          if (!jsonLog?.data) continue;

          if (jsonLog.passwordAttempted && jsonLog.passwordAttempted !== attempted) continue;

          const response = String(jsonLog.data).split(",");
          firstFeedback = { blk: Number(response[0] ?? 0), wht: Number(response[1] ?? 0) };
          break;
        }
        if (!firstFeedback) {
          // could not extract feedback — treat as retry/failure
          record();
          continue; // or return {success:false} depending on your desired behavior
        }
        testFeedback.push({
          guess: firstGuess,
          feedback: firstFeedback
        })
        tested.add(firstGuess.join(",")) //The only one to add.  We keep track of our last guess, all but this one.
        if (firstFeedback.blk === 0 && firstFeedback.wht === 0) //Cannot read properties of undefined (reading 'blk') is possible.. humm
          firstGuess.forEach((guess) => notFound.add(guess))
        lastGuess = []
        for (let i = 0; i < length; i++)
          lastGuess.push(0)
        record()
      }
      while (true) {
        if (nextGuess.length === 0) {
          let ready = false
          const worker = workers.length > 1 ? workers.pop() : getWorker()
          worker.onmessage = (msg) => {
            nextGuess = msg.data[0]
            workers.push(worker)
            working.pop()
            ready = true
            record()
          }
          worker.postMessage(["getNextCode", [tested, testFeedback, lastGuess, pool]])
          working.push(worker)
          while (!ready) await ns.asleep(10)
        }
        const result = await workOnServer(ns, server, nextGuess.map((index) => pool[index].toString()).join(""), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) {
          clearWorker()
          return result
        }
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) {
          clearWorker()
          return { success: false }
        }
        const data = bleed?.logs
        for (const log of data) {
          let jsonLog
          try { jsonLog = JSON.parse(log) } catch { continue }
          if (!jsonLog?.data) continue
          const response = jsonLog.data.split(",")
          feedback = {
            blk: response[0],
            wht: response[1]
          }
          break //Only process 1 lot at a time
        }
        testFeedback.push({
          guess: nextGuess.slice(),
          feedback: feedback
        })

        lastGuess = nextGuess.slice()
        nextGuess = []
        record()
      }
    },
    "Pr0verFl0": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const length = details.passwordLength
      const hint = details.passwordHint.split(" ")
      const buffer = hint[hint.length - 2]
      let testing = []
      if (details.passwordFormat === "numeric")
        for (let i = 0; i < buffer + length; i++)
          testing.push("1")
      else if (details.passwordFormat === "alphabetic")
        for (let i = 0; i < buffer + length; i++)
          testing.push("a")
      else if (details.passwordFormat === "alphanumeric") {
        testing.push("1")
        for (let i = 1; i < length; i++)
          testing.push("a")
        testing.push("1")
        for (let i = 1; i < length; i++)
          testing.push("a")
      }
      else {
        return { success: false }
      }
      return await workOnServer(ns, server, testing.join(""), 1, details);
    },
    "PHP 5.4": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const workers = []
      const working = []
      const clearWorker = () => {
        workers.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
        working.forEach(worker => {
          worker.terminate()
          worker.onmessage = null
          worker.onerror = null
          worker = null
        })
      }
      ns.atExit(() => {
        clearWorker()
        updateWorkingOn(ns, server, "remove")
      })
      const testing = details.data.split("")
      let combinations = inProgress[server]?.combinations ?? []
      if (combinations.length === 0) {
        let ready = false
        const worker = workers.length > 1 ? workers.pop() : getWorker()
        worker.onmessage = (msg) => {
          combinations = msg.data[0]
          workers.push(worker)
          working.pop()
          ready = true
        }
        worker.postMessage(["uniquePermutations", testing])
        working.push(worker)
        while (!ready) await ns.asleep(10)
      }

      let i = inProgress[server]?.count ?? 0
      let tries = inProgress[server]?.tries ?? 1
      const record = () => inProgress[server] = {
        combinations: combinations,
        count: i,
        tries: tries
      }

      for (; i < combinations.length; i++) {
        record()
        //await startup(ns)
        const testCombo = combinations[i]
        const result = await workOnServer(ns, server, testCombo.join(""), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) {
          clearWorker()
          return result
        }
      }
      clearWorker()
      return { success: false }
    },
    "110100100": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const values = details.data.split(" ")
      const answer = values.map(binary => String.fromCharCode(parseInt(binary, 2))).join('')
      return await workOnServer(ns, server, answer, 1, details)
    }, "2G_cellular": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      let testing
      if (details.passwordFormat === "numeric") testing = numbers
      else if (details.passwordFormat === "alphabetic") testing = lettersLCase.concat(lettersUCase)
      else if (details.passwordFormat === "alphanumeric") testing = lettersLCase.concat(lettersUCase).concat(numbers)
      else ns.tprintf("2G_cellular needs a new format - " + details.passwordFormat)
      let i = inProgress[server]?.count ?? 0
      const correct = inProgress[server]?.correct ?? []
      let tries = inProgress[server]?.tries ?? 1
      let responseTime = inProgress[server]?.responseTime ?? 0
      let result
      while (i < testing.length && correct.length < details.passwordLength) {
        inProgress[server] = {
          correct: correct,
          count: i,
          responseTime: responseTime,
          tries: tries
        }
        const beingTested = testing[i]
        const testArray = [...correct]
        testArray.push(beingTested)
        result = await workOnServer(ns, server, testArray.join("").toString(), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) return result
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) return { success: false }
        const data = bleed?.logs
        let found = false
        for (const log of data) {
          let jsonLog
          try { jsonLog = JSON.parse(log) } catch { continue }
          if (!jsonLog?.message) continue
          if (jsonLog.passwordAttempted.toString() !== testArray.join("").toString()) continue
          const response = Number(jsonLog.data.split(":")[1].replaceAll("ms", ""))
          if (Number.isNaN(response)) ns.tprintf(server + " - " + jsonLog.data.split(":")[1].replaceAll("ms", ""))
          if (response < responseTime + 2) break
          correct.push(beingTested)
          responseTime = response
          i = 0
          found = true
          break
        }
        if (!found) i++
      }
      return { success: false }
    },
    "EuroZone Free": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const length = details.passwordLength
      let i = inProgress[server]?.count ?? 0
      let tries = inProgress[server]?.tries ?? 1
      const pool = euCountries.filter((p) => p.length === length)
      for (; i < pool.length; i++) {
        inProgress[server] = {
          count: i,
          tries: tries
        }
        const testing = pool[i]
        const result = await workOnServer(ns, server, testing, tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) return result
      }
      return { success: false }
    },
    "PrimeTime 2": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const testing = Number(details.data)
      let result = { success: false }
      for (let i = largePrimes.length - 1; i >= 0; i--)
        if (testing % largePrimes[i] === 0)
          result = await workOnServer(ns, server, largePrimes[i], 1, details)
      return result
    },
    "MathML": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const finishedExpression = []
      let expression = details.data.split(",")
      for (const exp of expression) {
        if (exp.includes("alert") || exp.includes("globalThis") || exp.includes("you")) continue
        const finished = exp.replaceAll("➖", "-").replaceAll("➕", "+").replaceAll("ҳ", "*").replaceAll("÷", "/").replaceAll("ns.exit()", "")
        finishedExpression.push(finished)
      }
      let answer
      try { answer = eval(finishedExpression.join("").trim()) }
      catch {
        ns.tprintf("Error in eval of expression")
        ns.tprintf(details.data)
        ns.tprintf("My format: " + finishedExpression.join("").trim())
        updateWorkingOn(ns, server, "remove")
        return { success: false }
      }
      return await workOnServer(ns, server, answer.toString(), 1, details)
    },
    "TopPass": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const length = details.passwordLength
      let pool
      let i = inProgress[server]?.count ?? 0
      let tries = inProgress[server]?.tries ?? 1
      if (details.passwordFormat === "numeric")
        pool = commonPWDict.filter((f) => f.length === length && isNumeric(f))
      else if (details.passwordFormat === "alphabetic")
        pool = commonPWDict.filter((f) => f.length === length && isAlphabetic(f))
      else if (details.passwordFormat === "alphanumeric") {
        pool = commonPWDict.filter((f) => f.length === length && isAlphanumeric(f))
      }
      else {
        return { success: false };
      }

      for (; i < pool.length; i++) {
        inProgress[server] = {
          count: i,
          tries: tries
        }
        const testing = pool[i]
        const result = await workOnServer(ns, server, testing.toString(), tries++, details, false)
        if (result.success || !serverCheck(ns, server, result)) return result
      }
      return { success: false };
    },
    "OrdoXenos": async (ns, server, details) => {
      updateWorkingOn(ns, server, "set")
      const parts = details.data.split(";")
      const maskStr = parts.pop().trim()
      const encrypted = parts.join(";");

      const mask = maskStr.split(/\s+/).map(b => parseInt(b, 2))

      let decoded = "";
      for (let i = 0; i < encrypted.length; i++) {
        decoded += String.fromCharCode(encrypted.charCodeAt(i) ^ mask[i])
      }
      const result = await workOnServer(ns, server, decoded.toString(), 1, details)
      if (result.success || !serverCheck(ns, server, result)) return result
      return { success: false }
    },
    "KingOfTheHill": async (ns, server, details) => {
      if (details.passwordFormat !== "numeric") {
        logonce(ns, `[${server}] KOTH only supports numeric passwords.`);
        return { success: false };
      }
      updateWorkingOn(ns, server, "set")

      const length = details.passwordLength
      const MIN = Math.pow(10, length - 1)
      const MAX = Math.pow(10, length) - 1
      const trueHillMinWidth = Math.max(1, Math.pow(10, length - 2))
      const minHillSpacing = 3 * Math.pow(10, length - 2)

      let state = inProgress[server] || {}
      let tries = state.tries || 1
      let guessed = new Set(state.guessed || [])
      let guessedAltitudes = state.guessedAltitudes || {}
      let solved = false
      let solvedResult = null

      function record() {
        inProgress[server] = {
          tries,
          guessed: Array.from(guessed),
          guessedAltitudes
        }
      }
      async function getAltitude(x) {
        if (guessed.has(x)) return guessedAltitudes[x] //Don't guess again

        const result = await workOnServer(ns, server, x.toString(), tries++, details, false)
        if (result.success) {
          solved = true
          solvedResult = result
          return Infinity
        }
        else if (!serverCheck(ns, server, result)) {
          solved = true //We're just done.  Servers out.
          solvedResult = result
          return Infinity
        }
        const bleed = await ns.dnet.heartbleed(server, { logsToCapture: 8 })
        if (!bleedCheck(ns, server, bleed)) {
          solved = true //We're just done.  Servers out.
          solvedResult = result
          return Infinity
        }
        let altitude = -Infinity

        for (const log of bleed.logs) {
          try {
            const parsed = JSON.parse(log)
            if (Number(parsed?.passwordAttempted) === x) {
              altitude = Number(parsed.data)
            }
          } catch { }
        }

        guessed.add(x)
        guessedAltitudes[x] = altitude

        //ns.tprintf(`[${server}] x=${x} alt=${altitude} tries=${tries - 1}`)
        record()
        return altitude
      }

      const candidateQueue = []
      const stepBonus = length >= 3 ? minHillSpacing : 0 //Length 3 is guaranteed to have extra hills, 2 can but only at high difficulty
      if (length === 1) {
        for (let x = 0; x <= 9 && !solved; x++)
          await getAltitude(x)
      } else {
        //The true hill could be at the extreem of left or right.  So, start in a way that we will catch these cases
        candidateQueue.push({ x: (MIN + (Math.max(0, Math.floor(trueHillMinWidth / 2)))), alt: await getAltitude((MIN + (Math.max(0, Math.floor(trueHillMinWidth / 2))))) })
        if (!solved) candidateQueue.push({ x: (MAX - (Math.max(0, Math.floor(trueHillMinWidth / 2)))), alt: await getAltitude((MAX - (Math.max(0, Math.floor(trueHillMinWidth / 2))))) })
        for (let step = Math.ceil((MIN + (Math.max(0, Math.floor(trueHillMinWidth / 2)))) + trueHillMinWidth); step < MAX && !solved; step += Math.max(4, Math.ceil((trueHillMinWidth + stepBonus) / 2))) {
          candidateQueue.push({ x: step, alt: await getAltitude(step) })
        }
      }
      candidateQueue.sort((a, b) => b.alt - a.alt)
      for (const test of candidateQueue) {
        if (solved) break
        //Each test is a possible true hill, sorted by highest first
        //Get direction
        let direction = 0
        if (test.x < MAX) {
          let checkPoint = await getAltitude(test.x + 1) //Test 1 to the right
          if (test.alt > checkPoint) direction = -1 //We are moving left
          else if (test.alt < checkPoint) direction = 1 //We are moving right
        }
        else {
          let checkPoint = await getAltitude(test.x - 1) //Test 1 to the left
          if (test.alt < checkPoint) direction = -1 //We are moving left
          else if (test.alt > checkPoint) direction = 1 //We are moving right
        }
        if (solved) break
        if (direction === 0) continue
        //Climb and refine that hill.
        let step = length === 1 ? 1 : length === 2 ? 2 : Math.ceil((minHillSpacing + trueHillMinWidth) / 3)
        let pivot = test

        while (!solved) {
          //If checked1 is higher, we have a new pivot and need to check around it
          //Even if it's higher, we could be on the other side of the hill and need to change direction
          //If it's lower, we keep our pivot point and still halve the step.
          let checked1 = await getAltitude(Math.max(MIN, Math.min(MAX, pivot.x + (direction * step))))
          if (checked1 > pivot.alt) {
            pivot = { x: Math.max(MIN, Math.min(MAX, pivot.x + (direction * step))), alt: checked1 }
            step = Math.ceil(step / 2)
            continue
          }
          let checked2 = await getAltitude(Math.max(MIN, Math.min(MAX, pivot.x + (direction * step * -1))))
          if (checked2 > pivot.alt) {
            pivot = { x: Math.max(MIN, Math.min(MAX, pivot.x + (direction * step * -1))), alt: checked2 }
            step = Math.ceil(step / 2)
            direction *= -1
            continue
          }
          if (step === 1) break
          step = Math.ceil(step / 2)
        }
      }
      if (solved) return solvedResult;
      return { success: false }
    },
    "(The Labyrinth)": async (ns, server, details) => {
      let tries = 1
      if (labComplete) return { success: false }
      updateWorkingOn(ns, server, "set")
      if (!ns.args.includes("lab")) {
        while (ns.dnet.getServerDetails(server).isConnectedToCurrentServer && ns.dnet.getBlockedRam(ns.self().server) > 0) {
          await ns.dnet.memoryReallocation(ns.self().server)
          const threads = Math.floor((ns.getServerMaxRam(ns.self().server) - ns.dnet.getBlockedRam(ns.self().server)) / scriptCost)
          if (ns.self().threads < threads) ns.spawn(ns.self().filename, { temporary: true, spawnDelay: 0, threads: threads, ramOverride: scriptCost })
        }
      }
      const cost = scriptCost + 12
      if (!ns.dnet.getStasisLinkedServers().includes(ns.self().server)) {
        if (ns.self().ramUsage === scriptCost) {
          const threads = Math.floor(ns.getServerMaxRam(ns.self().server) / cost)
          if (threads) ns.spawn(ns.self().filename, { temporary: true, spawnDelay: 0, threads: threads, ramOverride: cost }, "lab")
        }
        else await runSetStasis(ns)//setStasis(ns);
      }
      //logonce(ns, "WARNING:  " + ns.self().server + " is attempting the Labyrinth - " + server)
      const directions = {
        north: { dx: 0, dy: -1, back: "south" },
        south: { dx: 0, dy: 1, back: "north" },
        east: { dx: 1, dy: 0, back: "west" },
        west: { dx: -1, dy: 0, back: "east" }
      }
      const visited = new Set(inProgress[server + ns.self().server]?.visited ?? [])
      const path = inProgress[server + ns.self().server]?.path ?? []
      let jsonLog = inProgress[server + ns.self().server]?.lastLog ?? false
      tries = inProgress[server + ns.self().server]?.tries ?? 1
      const record = () => {
        inProgress[server + ns.self().server] = {
          visited: Array.from(visited),
          path: path,
          lastLog: jsonLog,
          tries: tries
        }
      }
      let result
      if (visited.size === 0) jsonLog = await ns.dnet.labreport()//Get your berings

      function canMove(dir, details) {
        if (dir === "north") return details.north
        else if (dir === "east") return details.east
        else if (dir === "south") return details.south
        else if (dir === "west") return details.west
        else ns.tprintf("Invalid direction for maze")
        return false
      }
      async function dfs(x, y) {
        const key = `${x},${y}`
        if (visited.has(key)) return false
        visited.add(key)
        for (const dir in directions) {
          if (canMove(dir, jsonLog)) {
            const { dx, dy, back } = directions[dir]
            const nx = x + dx
            const ny = y + dy
            const nextKey = `${nx},${ny}`

            //Specifically prevents you from backtracking while you are exploring a new area
            if (!canMove(dir, jsonLog) || visited.has(nextKey)) {
              continue
            }
            result = await workOnServer(ns, server, dir, tries++, details, false)
            if (result.success) {
              //logonce(ns, "WARNING:  " + ns.self().server + " has completed the Labyrinth - " + server)
              if (ns.self().ramUsage === cost && ns.dnet.getStasisLinkedServers().includes(ns.self().server)) await runSetStasis(ns, false)
              return result
            }
            else if (!serverCheck(ns, server, result)) { //We lost our connection to the Lab
              if (ns.self().ramUsage === cost && ns.dnet.getStasisLinkedServers().includes(ns.self().server)) await runSetStasis(ns, false)
              return result
            }
            jsonLog = await ns.dnet.labreport()
            path.push(dir)
            record()

            if (await dfs(x + dx, y + dy)) {
              return true
            }

            // backtrack
            path.pop()
            result = await workOnServer(ns, server, back, tries++, details, false)
            if (result.success) {
              //logonce(ns, "WARNING:  " + ns.self().server + " has completed the Labyrinth - " + server)
              if (ns.self().ramUsage === cost && ns.dnet.getStasisLinkedServers().includes(ns.self().server)) await runSetStasis(ns, false)
              return result
            }
            else if (!serverCheck(ns, server, result)) {
              if (ns.self().ramUsage === cost && ns.dnet.getStasisLinkedServers().includes(ns.self().server)) await runSetStasis(ns, false)
              return result
            }
            jsonLog = await ns.dnet.labreport()
            record()
          }
        }
        return false
      }
      await dfs(1, 1);
      return { success: false }
    }
  };


  /** @param {NS} ns */
  async function mainRun(ns) {
    const servers = ns.dnet.probe();
    servers.sort((a, b) => ns.dnet.getServerRequiredCharismaLevel(a.toString()) - ns.dnet.getServerRequiredCharismaLevel(b.toString()))
    const cacheFiles = ns.ls(ns.self().server, ".cache")
    cacheFiles.forEach((f) => ns.dnet.openCache(f, true))
    const dataFiles = ns.ls(ns.self().server, ".data.txt")
    dataFiles.forEach((f) => {
      const content = ns.read(f)
      if (content.startsWith("Server:")) {//We have a new password to take and use
        updateFull(content.split(" ")[1], content.split(" ")[3])
        ns.mv(ns.self().server, f, f.replaceAll("data", "processed"))
      }
    })
    let foundWork = false
    for (const serverRaw of servers) {
      const server = serverRaw.toString()
      if (server === "home" || workingOn[server]) continue
      const details = ns.dnet.getServerDetails(server)
      if (ns.args.includes("lab") && details.modelId !== "(The Labyrinth)") continue
      if (labComplete && details.modelId === "(The Labyrinth)") continue
      if (!details.isConnectedToCurrentServer) continue
      let result
      if (!details.hasSession) {
        result = await breakIn(ns, server, details)
        if (details.modelId !== "OpenWebAccessPoint") foundWork = true
        if (result?.silentFail) return
      }
      else result = { success: true }
      if (details.hasSession || (result && result.success)) {
        while (ns.self().server !== "home" && ns.dnet.getServerDetails(server).isConnectedToCurrentServer && ns.dnet.getServerDetails(server).hasSession
          && ns.dnet.getBlockedRam(server) > 0 && ns.getServerMaxRam(server) - ns.dnet.getBlockedRam(server) < scriptCost)
          await ns.dnet.memoryReallocation(server)
        if (ns.dnet.getServerDetails(server).isConnectedToCurrentServer && ns.dnet.getServerDetails(server).hasSession && ns.ps(server).length === 0) {
          ns.scp([ns.self().filename, utilFile], server)
          if (server === "darkweb") {
            const threads = Math.floor(ns.getServerMaxRam(server) / scriptCost)
            if (threads) ns.exec(ns.self().filename, server, { temporary: true, threads: threads, preventDuplicates: true, temporary: true, ramOverride: scriptCost })
          }
          else {
            const threads = Math.floor((ns.getServerMaxRam(server) - ns.dnet.getBlockedRam(server)) / scriptCost)
            if (threads) ns.exec(ns.self().filename, server, { temporary: true, threads: threads, preventDuplicates: true, temporary: true, ramOverride: scriptCost })
          }
        }
      }
      await startup(ns);

      if (ns.self().server === "home") {
        ns.atExit(() => { })
        ns.exit()
      }
      if (!foundWork) {
        const servers = ns.dnet.probe();
        for (const serverRaw of servers) {
          const server = serverRaw.toString()
          const details = ns.dnet.getServerDetails(server)
          if (details.hasSession && details.isConnectedToCurrentServer && ns.dnet.getBlockedRam(server) > 0) {
            await ns.dnet.memoryReallocation(server)
            if (ns.dnet.getServerDetails(server).isConnectedToCurrentServer && ns.dnet.getServerDetails(server).hasSession && ns.ps(server).length === 0) {
              ns.scp([ns.self().filename, utilFile], server)
              const threads = Math.floor((ns.getServerMaxRam(server) - ns.dnet.getBlockedRam(server)) / scriptCost)
              if (threads) ns.exec(ns.self().filename, server, { temporary: true, threads: threads, preventDuplicates: true, temporary: true, ramOverride: scriptCost })
            }
          }
        }
      }
      if (ns.dnet.getBlockedRam(ns.self().server) > 0)
        await ns.dnet.memoryReallocation(ns.self().server)
      const threads = Math.floor((ns.getServerMaxRam(ns.self().server) - ns.dnet.getBlockedRam(ns.self().server)) / scriptCost)
      if (threads > ns.self().threads)
        ns.spawn(ns.self().filename, { temporary: true, spawnDelay: 0, threads: threads, ramOverride: scriptCost })
      if (ns.dnet.getBlockedRam(ns.self().server) === 0 && !foundWork) await ns.dnet.phishingAttack()
      if (ns.self().server === "darkweb") {
        ns.write(telemetryFile, JSON.stringify(telemetry), "w")
        ns.scp(telemetryFile, "home")
      }
      if (ns.dnet.getStasisLinkedServers().includes(ns.self().server)) {
        const threads = Math.floor((ns.getServerMaxRam(ns.self().server) - ns.dnet.getBlockedRam(ns.self().server)) / scriptCost + 12)
        ns.spawn(ns.self().filename, { temporary: true, spawnDelay: 0, threads: threads, ramOverride: scriptCost + 12 }, "clear-stasis")
      }
      if (ns.args.includes("lab")) {
        const threads = Math.floor((ns.getServerMaxRam(ns.self().server) - ns.dnet.getBlockedRam(ns.self().server)) / scriptCost)
        ns.spawn(ns.self().filename, { temporary: true, spawnDelay: 0, threads: threads, ramOverride: scriptCost })
      }
      await ns.asleep(Math.floor(Math.random() * 500) + 500)  //Solve all scripts starting up at once again.
    }
  }
  /** @param {NS} ns */
  async function startup(ns) {
    if (ns.self().server === "home") return
    const servers = ns.dnet.probe();
    for (const serverRaw of servers) {
      const server = serverRaw.toString()
      const firstDetails = ns.dnet.getServerDetails(server)
      if (!firstDetails.hasSession) {
        if (easyHacks.includes(firstDetails.modelId)) await breakIn(ns, server, firstDetails)
        else if (complete[server] !== undefined) await breakIn(ns, server, firstDetails)
        else continue
      }
      const details = ns.dnet.getServerDetails(server)
      if (details.hasSession && details.isConnectedToCurrentServer) {
        while (ns.self().server !== "home" && ns.dnet.getServerDetails(server).isConnectedToCurrentServer && ns.dnet.getServerDetails(server).hasSession
          && ns.dnet.getBlockedRam(server) > 0 && ns.getServerMaxRam(server) - ns.dnet.getBlockedRam(server) < scriptCost)
          await ns.dnet.memoryReallocation(server)
        if (ns.dnet.getServerDetails(server).isConnectedToCurrentServer && ns.dnet.getServerDetails(server).hasSession && ns.getServerMaxRam(server) - ns.dnet.getBlockedRam(server) > scriptCost && ns.ps(server).length === 0) {
          ns.scp([ns.self().filename, utilFile], server)
          const threads = Math.floor((ns.getServerMaxRam(server) - ns.dnet.getBlockedRam(server)) / scriptCost)
          if (threads) ns.exec(ns.self().filename, server, { temporary: true, threads: threads, preventDuplicates: true, temporary: true, ramOverride: scriptCost })
        }
      }
    }
  }
  /** @param {NS} ns */
  async function workOnServer(ns, server, answer, tries, details, removeWorkingOn = true) {
    try {
      const results = await ns.dnet.authenticate(server, answer)
      if (results.success) {
        ns.atExit(() => { })
        if (tries === 0) return results

        if (details.modelId !== "(The Labyrinth)") {
          delete inProgress[server]
          updateWorkingOn(ns, server, "remove")
        }
        else {
          delete inProgress[server + ns.self().server]
          updateWorkingOn(ns, server + ns.self().server, "remove")
          labComplete = server
        }
        updateFull(server, answer)
        updateTelemetry(details, tries, server)
      }
      if (removeWorkingOn)
        updateWorkingOn(ns, server, "remove")
      return results
    } catch (e) {
      return { success: false }
    }
  }
  /** @param {NS} ns */
  function updateWorkingOn(ns, server, action) {
    if (action === "remove")
      delete workingOn[server]
    else if (action === "set")
      workingOn[server] = true;
  }
  /** @param {NS} ns */
  function updateTelemetry(details, tries, server) {
    if (tries === 0) return
    let key
    if (details.modelId === "(The Labyrinth)") key = details.modelId + server
    else key = details.modelId + details.passwordFormat + String(details.passwordLength)
    if (!telemetry[key]) telemetry[key] = []
    telemetry[key].push(tries)
  }
  /** @param {NS} ns */
  function updateFull(server, password) {
    if (complete[server] === undefined)
      complete[server] = password
  }
  /** @param {NS} ns */
  function bleedCheck(ns, server, bleed) {
    if (connectFailures.includes(bleed.message)) {
      if (bleed.message === "Not Enough Charisma") {
        updateWorkingOn(ns, server, "remove")
        return false
      }
      updateWorkingOn(ns, server, "remove")
      return false
    }
    if (bleed.message !== "Success") ns.tprintf(bleed.message)
    const details = ns.dnet.getServerDetails(server)
    if (details.isConnectedToCurrentServer) return true
    updateWorkingOn(ns, server, "remove")
    return false
  }
  /** @param {NS} ns */
  function serverCheck(ns, server, result) {
    if (connectFailures.includes(result.message)) {
      if (result.message === "Not Enough Charisma") {
        updateWorkingOn(ns, server, "remove")
        return false
      }
      updateWorkingOn(ns, server, "remove")
      return false
    }
    const details = ns.dnet.getServerDetails(server)
    if (details.isConnectedToCurrentServer) return true
    updateWorkingOn(ns, server, "remove")
    return false
  }
  function isNumeric(value) {
    const testing = value.split("")
    for (const test of testing)
      if (typeof test === "string" && test.trim() !== "" && !Number.isNaN(Number(test))) continue
      else return false
    return true
  }
  function isAlphabetic(value) {
    for (const test of value.split(""))
      if (!lettersLCase.concat(lettersUCase).includes(test.toString())) return false
    return true
  }
  function isAlphanumeric(value) {
    let numeric = false
    let alphabetic = false
    for (const test of value.split("")) {
      if (isNumeric(test)) numeric = true
      else if (isAlphabetic(test)) alphabetic = true
    }
    return numeric && alphabetic
  }




  /** @param { ServerAuthDetails } deta
    * @param { NS }   
* @param { string } ser  r
  **/
  async function breakIn(ns, server, details) {
    if (server === "darkweb") return { success: true }
    if (complete[server]) {
      let result = await workOnServer(ns, server, complete[server], 0, details) || {}
      if (result.success || !serverCheck(ns, server, result)) return result
      else delete complete[server]
    }
    updateWorkingOn(ns, server, "set");
    if (!library[details.modelId]) {
      logonce(ns, "WARNING:  Unknown modelID for " + server + ": " + details.modelId + "  Details: " + JSON.stringify(details))
      return await workOnServer(ns, server, "", 1, details);
      //return { success: false, message: "Unknown modelId", silentFail: true };
    }
    const result = await library[details.modelId](ns, server, details);
    if (result.success || !serverCheck(ns, server, result)) return result
    //logonce(ns, `${details.modelId} needs a new format. ` + details.passwordFormat);
    failureReport(ns, server, details)
    return result;
  }
  function logonce(ns, msg) {
    if (logged_once.has(msg)) return;
    logged_once.add(msg);
    ns.tprint(msg)
  }
  function failureReport(ns, server, details) {
    //logonce(ns, "ERROR:  Failure Report!  " + server + "  Model: " + details.modelId + "  Length: " + details.passwordLength)
    updateWorkingOn(ns, server, "remove")
    delete inProgress[server]
  }
  //ram dodging this fat 12 gig command.
  async function runSetStasis(ns, value = true) {
    const helper = "/temp_set_stasis.js";

    // Only create it if it doesn't exist
    if (!ns.fileExists(helper, ns.self().server)) {
      ns.write(helper, `
      /** @param {NS} ns */
      export async function main(ns) {
        const state = ns.args[0];
        await ns.dnet.setStasisLink(state);
      }
    `, "w");
    }

    const pid = ns.exec(helper, ns.self().server, {
      threads: 1,
      temporary: true
    }, value);

    if (!pid) {
      ns.print("Failed to execute stasis helper.");
      return false;
    }

    while (ns.isRunning(pid)) {
      await ns.sleep(10);
    }

    return true;
  }
  function getWorker() {
    const worker = new Worker(URL.createObjectURL(blob))
    return worker
  }

  const workerCode = `
// Does this candidate satisfy all constraints?
function candidateSatisfiesAll(x, constraints) {
  for (const { k, r } of constraints) {
    const m = k % 32;
    if (m === 0) continue;
    if ((x % k) % m !== r) return false;
  }
  return true;
}

// Extended GCD for modular inverse with a save return of null on 0
function modInverse(a, m) {
  a = ((a % m) + m) % m;
  if (m === 0) return null;

  let m0 = m;
  let x0 = 0, x1 = 1;

  while (a > 1) {
    if (m === 0) return null;

    const q = Math.floor(a / m);
    [a, m] = [m, a % m];
    [x0, x1] = [x1 - q * x0, x0];
  }

  if (x1 < 0) x1 += m0;
  return x1;
}


// Combine two modular constraints using CRT
function combineModConstraints(a1, m1, a2, m2) {
  // Enforce integer invariants early
  if (
    !Number.isInteger(a1) ||
    !Number.isInteger(m1) ||
    !Number.isInteger(a2) ||
    !Number.isInteger(m2)) { return null; }

  const d = gcd(m1, m2);
  if ((a2 - a1) % d !== 0) return null;
  const m1d = m1 / d;
  const m2d = m2 / d;
  const inv = modInverse(m1d, m2d);
  if (inv === null) return null;
  const t = ((a2 - a1) / d) % m2d;
  let x = a1 + m1 * ((t * inv) % m2d);
  const mod = m1 * m2d;

  // Normalize
  x = ((x % mod) + mod) % mod;

  // Final safety gate
  if (!Number.isInteger(x) || !Number.isInteger(mod)) return null;

  return { x, mod };
}


// Greatest common divisor
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

//Entry point
function getNextCandidate(data) {
  let [candidate, tripleConstraints, tries, MIN, MAX, triedArr] = data;
  const testGroup = [31, 29, 28, 27, 25, 23, 19, 17, 13, 11];
  
  const tried = new Set(triedArr || []);
  const RANGE = MAX - MIN + 1;

  // Phase 0 - baseline tests, adaptive to length.  Will go 1 over max as it tends to save 1 try
  let testedValue = 1;
  for (const p of testGroup) {
    testedValue *= p;
    if (!tried.has(p)) return p;
    if (testedValue > MAX) break;
  }

  // Phase 2: CRT
  const crtConstraints = tripleConstraints
    .map(({ k, r }) => ({ a: r, m: k % 32 }))
    .filter(c => c.m !== 0);

  if (crtConstraints.length > 0) {
    let crt = { x: crtConstraints[0].a, mod: crtConstraints[0].m };
    let valid = true;

    for (let i = 1; i < crtConstraints.length; i++) {
      const res = combineModConstraints(
        crt.x,
        crt.mod,
        crtConstraints[i].a,
        crtConstraints[i].m
      );

      if (res === null) {
        valid = false;
        break;
      }

      crt = res;
    }

    if (valid) {
      let x = crt.x;
      const mod = crt.mod;

      if (x < MIN) x += Math.ceil((MIN - x) / mod) * mod;

      while (x <= MAX) {
        if (!tried.has(x) && candidateSatisfiesAll(x, tripleConstraints)) {
          return x;
        }
        x += mod;
      }
    }
  }
  
  // Phase 3 - brute force with what we have
  let next = candidate + 1;
  while (!candidateSatisfiesAll(next, tripleConstraints) || tried.has(next)) {
    next++;
    if (next > MAX) next = MIN;
  }
  return next;
}
function getNextCode([tested, testFeedback, lastGuessRaw, pool]) {
  const length = lastGuessRaw.length;
  const candidate = new Array(length);

  function dfs(pos) {
    if (pos === length) {
      const key = candidate.join(",");
      if (!tested.has(key) && isPossible(candidate, testFeedback)) {
        return candidate.slice();
      }
      return null;
    }

    for (let d = 0; d < pool.length; d++) {
      candidate[pos] = d;

      if (!prefixPossible(candidate, pos + 1, testFeedback)) {
        continue;
      }

      const result = dfs(pos + 1);
      if (result) return result;
    }
    return null;
  }

  const result = dfs(0);
  if (!result) throw new Error("No possible code found");
  return result;
}

function prefixPossible(candidate, len, testFeedback) {
  for (const { guess, feedback } of testFeedback) {
    const targetBlk = Number(feedback.blk);
    const targetTotal = targetBlk + Number(feedback.wht);

    let blk = 0;
    let matches = 0;

    for (let i = 0; i < len; i++) {
      if (candidate[i] === guess[i]) {
        blk++;
        matches++;
      } else if (guess.includes(candidate[i])) {
        // optimistic: could become a white later
        matches++;
      }
    }
    const remaining = guess.length - len;
    if (blk > targetBlk) return false;
    if (blk + remaining < targetBlk) return false;
    if (matches + remaining < targetTotal) return false;
  }
  return true;
}
function scoreFast(guessRaw, codeRaw, expected) {
  let blk = 0, wht = 0;
  const guessCount = new Map();
  const codeCount = new Map();

  for (let i = 0; i < guessRaw.length; i++) {
    if (guessRaw[i] === codeRaw[i]) {
      blk++;
      if (blk > expected.blk) return null;
    } else {
      guessCount.set(guessRaw[i], (guessCount.get(guessRaw[i]) || 0) + 1);
      codeCount.set(codeRaw[i], (codeCount.get(codeRaw[i]) || 0) + 1);
    }
  }

  for (const [k, v] of guessCount) {
    if (codeCount.has(k)) {
      wht += Math.min(v, codeCount.get(k));
      if (blk + wht > expected.blk + expected.wht) return null;
    }
  }

  return { blk, wht };
}
function* digitArraysFrom(start, pool) {
  const arr = start.slice(); // one allocation total
  if (!increment(arr, pool)) return;

  while (true) {
    yield arr;              // SAME array, reused
    if (!increment(arr, pool)) return;
  }
}
function increment(arr, pool) {
  const base = pool.length;
  let i = arr.length - 1;

  while (i >= 0) {
   if (arr[i] < base - 1) {
      arr[i]++;
      return true;
    }
    arr[i] = 0;
    i--;
  }
  return false;
}
function score(guessRaw, codeRaw) {
  let blk = 0, wht = 0;
  const guessCount = new Map();
  const codeCount = new Map();

  for (let i = 0; i < guessRaw.length; i++) {
    if (guessRaw[i] === codeRaw[i]) {
      blk++;
    } else {
      guessCount.set(guessRaw[i], (guessCount.get(guessRaw[i]) || 0) + 1);
      codeCount.set(codeRaw[i], (codeCount.get(codeRaw[i]) || 0) + 1);
    }
  }

  for (const [k, v] of guessCount) {
    if (codeCount.has(k)) {
      wht += Math.min(v, codeCount.get(k));
    }
  }

  return { blk, wht };
}
function isPossible(testRaw, testFeedback) {
  for (const { guess, feedback } of testFeedback) {
    const expected = {
      blk: Number(feedback.blk),
      wht: Number(feedback.wht)
    };

    const s = scoreFast(guess, testRaw, expected);

    if (s === null) return false;

    // Final exact check (scoreFast may early-exit before full count)
    if (s.blk !== expected.blk || s.wht !== expected.wht) {
      return false;
    }
  }
  return true;
}

function uniquePermutations(array) {
  const results = [];
  const nums = [...array].sort(); // sort to group duplicates
  const used = Array(nums.length).fill(false);

  function backtrack(current) {
    if (current.length === nums.length) {
      results.push([...current]);
      return;
    }
    for (let i = 0; i < nums.length; i++) {
      // Skip already-used elements
      if (used[i]) continue;
      // Skip duplicates:
      // only allow the first unused instance
      if (i > 0 && nums[i] === nums[i - 1] && !used[i - 1]) {
        continue;
      };
      used[i] = true;
      current.push(nums[i]);
      backtrack(current);
      current.pop();
      used[i] = false;
    };
  };
  backtrack([]);
  return results;
}
// ==============================
// PIX BLACK-ONLY MULTISET SOLVER
// ==============================
function pixGetNextCode([tested, testFeedback, lastGuessRaw, pool]) {
  const length = lastGuessRaw.length;
  const candidate = new Array(length);

  // Build multiset as parallel arrays
  const values = [];
  const counts = [];

  for (const v of pool) {
    const idx = values.indexOf(v);
    if (idx === -1) {
      values.push(v);
      counts.push(1);
    } else {
      counts[idx]++;
    }
  }

  function dfs(pos) {
    if (pos === length) {
      const key = candidate.join(",");
      if (tested.has(key)) return null;

      // Exact black-only feedback check
      for (const { guess, feedback } of testFeedback) {
        const expectedBlk = Number(feedback.blk);
        let blk = 0;
        for (let i = 0; i < length; i++) {
          if (candidate[i] === guess[i]) blk++;
        }
        if (blk !== expectedBlk) return null;
      }

      return candidate.slice();
    }

    for (let i = 0; i < values.length; i++) {
      if (counts[i] === 0) continue;

      candidate[pos] = values[i];
      counts[i]--;

      const result = dfs(pos + 1);
      if (result) return result;

      counts[i]++;
    }

    return null;
  }

  const result = dfs(0);
  if (!result) throw new Error("No possible code found");
  return result;
}

onmessage = (event) => {
  try {
    postMessage([eval(event.data[0])(event.data[1])]);
  } catch (e) {
    console.error("Worker error:", e);
    postMessage(null); // always return something
  }
};
`;
  const blob = new Blob([workerCode], { type: "application/javascript" })



  await startup(ns);
  while (true) {
    try { await mainRun(ns) } catch (e) {
      logonce(ns, `ERROR mainRun: ${String(e?.stack || e)}`);
    }
    await ns.sleep(50);
  }
}