import { getPlayerInfo, log, getNsDataThroughFile, formatMoney } from './helpers.js'

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');
  await ns.sleep(100);
  ns.atExit(() => { ns.clearPort(10), ns.writePort(1, 1), ns.writePort(40, 1) });

  if ((await getPlayerMoneySources(ns)).sinceInstall?.casino >= 10e9) {
    return;
  }
  let player = await getPlayerInfo(ns);
  while (player.money <= 200000) { //wait till we have enough money.
    await ns.sleep(500);
    player = await getPlayerInfo(ns);
  }
  //travel to Aevum if needed
  if (player.city != "Aevum") {
    let travelled = false;
    try {
      travelled = await getNsDataThroughFile(ns, 'ns.singularity.travelToCity(ns.args[0])', null, ["Aevum"]);
    } catch {

    }
    // If automatic travel failed or couldn't be attempted, try clicking our way there!
    if (!travelled) {
      await click(await findRequiredElement("//div[@role='button' and ./div/p/text()='Travel']"));
      await click(await findRequiredElement("//span[contains(@class,'travel') and ./text()='A']"));
      player = await getPlayerInfo(ns);
      // If this didn't put us in Aevum, there's likely a travel confirmation dialog we need to click through
      if (!player.city != "Aevum")
        await click(await findRequiredElement("//button[p/text()='Travel']"));
    }
    player = await getPlayerInfo(ns);

    if (player.city != "Aevum")
      throw new Error(`We thought we travelled to Aevum, but we're apparently still in ${ns.getPlayer().city}...`);
  }
  try { // Try to do this without SF4, because it's faster and doesn't require a temp script to be cleaned up below
    // Click our way to the city casino
    await click(await findRequiredElement("//div[(@role = 'button') and (contains(., 'City'))]", 15,
      `Couldn't find the "🏙 City" menu button. Is your \"World\" nav menu collapsed?`));
    await click(await findRequiredElement("//span[@aria-label = 'Iker Molina Casino']"));
  } catch (err) { // Try to use SF4 as a fallback (if available) - it's more reliable.
    let success = false, err2;
    try { success = await getNsDataThroughFile(ns, 'ns.singularity.goToLocation(ns.args[0])', null, ["Iker Molina Casino"]); }
    catch (singErr) { err2 = singErr; }
    if (!success)
      throw new Error("Failed to travel to the casino both using UI navigation and using SF4 as a fall-back." +
        `\nUI navigation error was: ${getErrorInfo(err)}\n` + (err2 ? `Singularity error was: ${getErrorInfo(err2)}` :
          '`ns.singularity.goToLocation("Iker Molina Casino")` returned false, but no error...'));
  }
  let doc = eval("document");
  // Step 2 Try to start the coin flip game  
  const coinflip = find(doc, "//button[contains(text(), 'coin flip')]");
  if (!coinflip) {
    ns.tprintf("ERROR: Go to the casino and rerun the script")
    ns.tprintf("ERROR: The script must click on entering coinflip")
    return;
  }

  //We have officially started!  
  ns.writePort(10, ns.pid)
  ns.writePort(1, 1)
  ns.ui.openTail()
  ns.printf("Started. Hold on! Calulating sequence")
  await click(coinflip);// Step 3 Find the buttons  
  const tails = find(doc, "//button[contains(text(), 'Tail!')]");
  const heads = find(doc, "//button[contains(text(), 'Head!')]");
  const input = find(doc, "//input[@type='number']");
  if (!input) {
    ns.printf('FAIL: Could not get a hold of the bet amount input!');
    return;
  }

  const logs = [];
  input.value = 0;
  if (ns.ui.getGameInfo()?.versionNumber >= 44) {
    const event1 = { target: { value: 0 } }
    const tmp = Object.getOwnPropertyNames(input).filter(p => p.includes("__reactProps")).pop()
    const prop = input[tmp]
    prop.onChange(event1)
  }

  // Step 4: Click one of the buttons  
  for (let i = 0; i < 1024; i++) {
    await click(tails);
    let isTails
    let isHeads
    if (ns.ui.getGameInfo()?.versionNumber >= 44) {
      isTails = find(doc, "//span[text() = 'Tail']");
      isHeads = find(doc, "//span[text() = 'Head']");
    } else {
      isTails = find(doc, "//p[text() = 'T']");
      isHeads = find(doc, "//p[text() = 'H']");
    }
    if (isTails) logs.push('T');
    else if (isHeads) logs.push('H');
    else {
      ns.printf('FAIL: Something went wrong, aborting sequence!');
      return;
    }
    await ns.sleep(0)
  }

  let loops = 0;
  input.value = 10000;
  if (ns.ui.getGameInfo()?.versionNumber >= 44) {
    const event2 = { target: { value: 10000 } }
    const tmp = Object.getOwnPropertyNames(input).filter(p => p.includes("__reactProps")).pop()
    const prop = input[tmp]
    prop.onChange(event2)
  }
  ns.printf("You can do something else now.")
  ns.writePort(40, 1)
  ns.ui.closeTail();
  await ns.sleep(4)
  const terminal = [...globalThis["document"].querySelectorAll("#root > div > div > div > ul > div > div > div > div")]
  terminal.filter(e => e.textContent === "Terminal")[0]?.click()
  await ns.sleep(4)
  // Step 5: Execute sequence  
  while (true) {

    try {
      if (logs[loops % 1024] == 'T') {
        await click(tails);
      } else if (logs[loops % 1024] == 'H') {
        await click(heads);
      }
      if (loops % 2000 == 0) {
        await ns.sleep(4)
      }
      loops++;
      if ((await getPlayerMoneySources(ns)).sinceInstall.casino >= 10_000_000_000) {
        log(ns, `Casino has been cheated out of ${formatMoney(10_000_000_000)}!`, true, 'info');
        return;
      }
    } catch (e) {
      ns.tprint('FAIL: ' + e);
      return;
    }
  }



  // Some DOM helpers (partial credit to @ShamesBond)
  async function click(button) {
    if (button === null || button === undefined)
      throw new Error("click was called on a null reference. This means the prior button detection failed, but was assumed to have succeeded.");
    // Sleep before clicking, if so configured
    //await ns.sleep(5);
    // Find the onclick method on the button
    let fnOnClick = button[Object.keys(button)[1]].onClick; // This is voodoo to me. Apparently it's function on the first property of this button?
    if (!fnOnClick)
      throw new Error(`Odd, we found the button we were looking for (${button.text()}), but couldn't find its onclick method!`)
    // Click the button. The "secret" to this working is just to pass any object containing isTrusted:true
    await fnOnClick({ isTrusted: true });
    // Sleep after clicking, if so configured
    //await ns.sleep(5);
  }

  async function findRequiredElement(xpath, retries = 15, customErrorMessage = null) {
    return await internalfindWithRetry(xpath, false, retries, customErrorMessage);
  }

  /** Try to find an element, with retries.
  * This is tricky - in some cases we are just checking if the element exists, but expect that it might not
  * (expectFailure = true) - in this case we want some retries in case we were just too fast to detect the element
  * but we don't want to retry too much. We also don't want to be too noisy if we fail to find the element.
  * In other cases, we always expect to find the element we're looking for, and if we don't it's an error.
  * @param {NS} ns
  * @param {string} xpath The xpath 1.0 expression to use to find the element.
  * @param {boolean} expectFailure Changes the behaviour when an item cannot be found.
  *                                If false, failing to find the element is treated as an error.
  *                                If true, we simply return null indicating that no such element was found.
  * @param {null|number} maxRetries (default null) The number of times to retry.
  * @param {string?} customErrorMessage (optional) A custom error message to replace the default on failure. */
  async function internalfindWithRetry(xpath, expectFailure, maxRetries, customErrorMessage = null) {
    try {
      // NOTE: We cannot actually log the xpath we're searching for because depending on the xpath, it might match our log!
      // So here's a trick to convert the characters into "look-alikes"
      let logSafeXPath = xpath.substring(2, 20) + "..."; // TODO: Some trick to convert the characters into "look-alikes" (ạḅc̣ḍ...)

      // If enabled give the game some time to render an item before we try to find it on screen

      await ns.sleep(5);
      let attempts = 0, retryDelayMs = 1; // starting retry delay (ms), will be increased with each attempt
      while (attempts++ <= maxRetries) {
        // Sleep between attempts
        if (attempts > 1) {
          if (verbose || !expectFailure)
            log(ns, (expectFailure ? 'INFO' : 'WARN') + `: Attempt ${attempts - 1} of ${maxRetries} to find \"${logSafeXPath}\" failed. Retrying...`, false);
          await ns.sleep(retryDelayMs);
          retryDelayMs *= 2; // back-off rate (increases next sleep time before retrying)
          retryDelayMs = Math.min(retryDelayMs, 200); // Cap the retry rate at 200 ms (game tick rate)
        }
        const findAttempt = internalFind(xpath);
        if (findAttempt !== null)
          return findAttempt;
      }
      if (expectFailure) {
      } else {
        const errMessage = customErrorMessage ?? `Could not find the element with xpath: \"${logSafeXPath}\"\n` +
          `Something may have stolen focus or otherwise routed the UI away from the Casino.`;
        log(ns, 'ERROR: ' + errMessage, true, 'error')
        throw new Error(errMessage, true, 'error');
      }
    } catch (e) {
      if (!expectFailure) throw e;
    }
    return null;
  }

  async function getPlayerMoneySources(ns) {
    return await getNsDataThroughFile(ns, 'ns.getMoneySources()');
  }
}


function find(doc, xpath) {
  return doc.evaluate(xpath, doc, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
}