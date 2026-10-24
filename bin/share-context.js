import {shareContextRam} from '../share-controller.js';

/** Read player/sleeve work once per poll. Never changes tasks, factions, or player focus. */
export async function main(ns) {
  ns.ramOverride(1.6);
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Share context exited without a result';
  ns.atExit(() => port.write(result));
  const [workAccess, sleeveAccess] = ns.args;
  const required = shareContextRam(ns, workAccess === true, sleeveAccess === true);
  if (ns.ramOverride(required) < required) return;
  const beneficiaries = [];
  let known = false;
  if (workAccess === true) try {
    const work = ns.singularity.getCurrentWork();
    known = true;
    if (work?.type === 'FACTION') beneficiaries.push(`player: ${work.factionName}`);
  } catch { /* Sleeve work may still benefit when player work is unavailable. */ }
  if (sleeveAccess === true) try {
    const count = ns.sleeve.getNumSleeves();
    for (let i = 0; i < count; i++) {
      const task = ns.sleeve.getTask(i);
      if (task?.type === 'FACTION') beneficiaries.push(`sleeve ${i}: ${task.factionName}`);
    }
    known = true;
  } catch { /* Keep any independently observed player/sleeve faction work. */ }
  result = known || beneficiaries.length ? {active: beneficiaries.length > 0, reason: beneficiaries.join(', ')} : null;
}
