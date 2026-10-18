import { singRun, purchase } from './utils.js';
import { SOA_FACTION, SOA_AUGS, soaAugmentationQuote, planSoaProgression } from './infiltration-policy.js';
import { clickInfiltrationElement, infiltrationButton, infiltrationUiTimeout, infiltrationModals } from './infiltration-ui.js';

const text = element => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
function ancestorProps(element, matches) {
  let fiber = element?.[Object.keys(element ?? {}).find(key => key.startsWith('__reactFiber$'))];
  for (let depth = 0; fiber && depth < 30; depth++, fiber = fiber.return)
    if (matches(fiber.memoizedProps)) return fiber.memoizedProps;
  return null;
}
export function soaInvitation(doc) {
  const modals = infiltrationModals(doc);
  if (modals.length !== 1) return null;
  const modal = modals[0];
  return [...modal.querySelectorAll('h4')].some(element => text(element) === 'You received a faction invitation.') &&
    [...modal.querySelectorAll('p')].some(element => text(element) === `Would you like to join ${SOA_FACTION}?`) &&
    infiltrationButton(modal, 'Join') ? modal : null;
}
export async function acceptSoaInvitation(ns, doc, canContinue, heartbeat = async () => {}) {
  const modal = soaInvitation(doc);
  if (!modal || !canContinue()) return false;
  clickInfiltrationElement(infiltrationButton(modal, 'Join'));
  const deadline = Date.now() + infiltrationUiTimeout;
  while (soaInvitation(doc) || !ns.getPlayer().factions.includes(SOA_FACTION)) {
    if (!canContinue() || Date.now() >= deadline) throw new Error('SoA invitation did not finish closing');
    await ns.sleep(50); await heartbeat();
  }
  return true;
}
function reserveCash(ns) {
  const reserve = Number(ns.read('reserve.txt') || 8e9);
  if (!Number.isFinite(reserve) || reserve < 0) throw new Error('SoA purchase reserve is unavailable');
  return reserve;
}
const requireArray = (value, name) => {
  if (!Array.isArray(value)) throw new Error(`SoA ${name} unavailable`);
  return value;
};

/** Read and operate only the visible faction/augmentation controls; no Singularity is needed in BN1. */
export function createSoaUI(ns, doc, canContinue, heartbeat = async () => {}) {
  const check = (allowModal = false) => {
    if (!canContinue()) throw new Error('SoA navigation cancelled');
    if (!allowModal && (infiltrationModals(doc).length || doc.querySelector('[role="dialog"]')))
      throw new Error('SoA navigation interrupted by a dialog');
  };
  const wait = async (read, message, allowModal = false) => {
    const deadline = Date.now() + infiltrationUiTimeout;
    while (true) {
      check(allowModal);
      const value = read();
      if (value) return value;
      if (Date.now() >= deadline) throw new Error(message);
      await ns.sleep(50); await heartbeat();
    }
  };
  const heading = (selector, label) => [...doc.querySelectorAll(selector)].find(element => text(element) === label);
  const menu = async (label, ready) => {
    check();
    const button = [...doc.querySelectorAll('[role="button"]')].find(element => text(element).replace(/^[^A-Za-z]+/, '') === label);
    if (!button) throw new Error(`Open the ${label} sidebar menu for SoA progression`);
    clickInfiltrationElement(button);
    return wait(ready, `${label} page did not become ready for SoA progression`);
  };
  const card = () => heading('h6', SOA_FACTION)?.closest('.MuiPaper-root');
  const rows = () => {
    if (!heading('h4', `Faction Augmentations - ${SOA_FACTION}`)) return [];
    return [...doc.querySelectorAll('button')].flatMap(button => {
      if (!['Buy', 'Owned'].includes(text(button))) return [];
      const props = ancestorProps(button, props => props?.parent?.faction?.name === SOA_FACTION &&
        SOA_AUGS.includes(props.augName) && typeof props.owned === 'boolean');
      return props ? [{button, ...props}] : [];
    });
  };
  let owned = [];
  return {
    async read() {
      // Count distinct queued augmentations too, so count fillers cannot overshoot a ready Daedalus bundle.
      await menu('Augmentations', () => heading('h4', 'Augmentations'));
      const queue = heading('h5', 'Purchased Augmentations')?.closest('.MuiPaper-root')?.parentElement;
      if (!queue) throw new Error('Purchased augmentation list is unavailable');
      const queued = [...queue.querySelectorAll('.MuiListItemText-primary')].map(text)
        .map(name => name.replace(/ - Level \d+$/, ''));
      if (!queued.length && !text(queue).includes('No Augmentations have been purchased yet'))
        throw new Error('Could not verify the queued augmentation count');
      owned = [...new Set([...ns.getResetInfo().ownedAugs.keys(), ...queued])];
      await menu('Factions', () => doc.querySelector('.factions-joined'));
      let joined = ns.getPlayer().factions.includes(SOA_FACTION);
      const join = infiltrationButton(card() ?? {querySelectorAll: () => []}, 'Join!');
      if (!joined && join) {
        check(); clickInfiltrationElement(join);
        await wait(() => ns.getPlayer().factions.includes(SOA_FACTION) && infiltrationButton(card() ?? {querySelectorAll: () => []}, 'Augments'),
          'Shadows of Anarchy invitation was not accepted');
        joined = true;
      }
      if (!joined) return {joined: false, rep: 0, owned, quotes: {[SOA_AUGS.find(name => !owned.includes(name))]: soaAugmentationQuote(owned)}};
      const augments = infiltrationButton(card() ?? {querySelectorAll: () => []}, 'Augments');
      check(); clickInfiltrationElement(augments);
      const list = await wait(() => rows().length === SOA_AUGS.length && rows(), 'SoA augmentation list is unavailable');
      const faction = list[0].parent.faction;
      const soaOwned = list.filter(row => row.owned).map(row => row.augName);
      if (SOA_AUGS.some(name => owned.includes(name) !== soaOwned.includes(name)))
        throw new Error('SoA ownership changed while reading; retry next session');
      return {joined: true, rep: faction.playerReputation, owned,
        quotes: Object.fromEntries(list.filter(row => !row.owned).map(row => [row.augName, soaAugmentationQuote(owned)]))};
    },
    async buy(plan) {
      const allowed = cost => {
        const player = ns.getPlayer(), reserve = reserveCash(ns);
        const budget = plan.augmentation === SOA_AUGS[0] ? player.money : player.money * 0.05;
        return Number.isFinite(cost) && cost >= 0 && cost <= Math.min(budget, player.money - reserve);
      };
      const row = await wait(() => rows().find(row => row.augName === plan.augmentation && !row.owned && !row.button.disabled),
        'SoA purchase control did not become ready');
      check();
      if (!allowed(plan.cost)) return false;
      clickInfiltrationElement(row.button);
      let confirmed = false, dismissed = false;
      await wait(() => {
        for (const modal of infiltrationModals(doc)) {
          const title = [...modal.querySelectorAll('h4')].find(element => text(element) === plan.augmentation);
          if (title && infiltrationButton(modal, 'Purchase')) {
            if (confirmed) return false;
            // The confirmation renders the exact numeric Money prop, independent of locale/rounding.
            const quote = [...modal.querySelectorAll('span')].map(element =>
              ancestorProps(element, props => Number.isFinite(props?.money))?.money).find(Number.isFinite);
            if (quote !== plan.cost || !allowed(quote)) throw new Error('SoA price or available cash changed before confirmation');
            clickInfiltrationElement(infiltrationButton(modal, 'Purchase')); confirmed = true; return false;
          }
          if (text(modal).includes(`You purchased ${plan.augmentation}. Its enhancements will not take effect until they are installed.`)) {
            if (!dismissed) { clickInfiltrationElement(infiltrationButton(modal, 'OK')); dismissed = true; }
            return false;
          }
          throw new Error('Unexpected dialog during SoA purchase; leaving it for review');
        }
        return rows().some(row => row.augName === plan.augmentation && row.owned);
      }, 'SoA purchase did not report ownership', true);
      owned.push(plan.augmentation);
      return true;
    },
    async finish() { await menu('Terminal', () => doc.getElementById('terminal')); },
  };
}

/** Called only while the infiltration runner holds its acknowledged screen lease. */
export async function manageSoaProgression(ns, {doc, canContinue, hasSingularity, augRequirement, print, heartbeat = async () => {}}) {
  await acceptSoaInvitation(ns, doc, canContinue, heartbeat);
  const ui = hasSingularity ? null : createSoaUI(ns, doc, canContinue, heartbeat);
  let state, goal;
  for (let attempts = 0; attempts <= SOA_AUGS.length && canContinue(); attempts++) {
    await heartbeat();
    if (ui) state = await ui.read();
    else {
      let player = ns.getPlayer();
      if (!player.factions.includes(SOA_FACTION)) {
        const invitations = requireArray(await singRun(ns, 'checkFactionInvitations'), 'invitations');
        if (invitations.includes(SOA_FACTION)) await singRun(ns, 'joinFaction', SOA_FACTION);
      }
      player = ns.getPlayer();
      const joined = player.factions.includes(SOA_FACTION);
      const owned = requireArray(await singRun(ns, 'getOwnedAugmentations', true), 'owned augmentations');
      const next = SOA_AUGS.find(name => !owned.includes(name));
      const quote = next ? {cost: await singRun(ns, 'getAugmentationPrice', next),
        rep: await singRun(ns, 'getAugmentationRepReq', next)} : null;
      state = {joined, owned, rep: joined ? await singRun(ns, 'getFactionRep', SOA_FACTION) : 0,
        quotes: next ? {[next]: quote} : {}};
    }
    const player = ns.getPlayer();
    goal = planSoaProgression({...state, money: player.money, reserve: reserveCash(ns), augRequirement, factions: player.factions});
    if (!goal?.canBuy || !canContinue() || attempts === SOA_AUGS.length) break;
    // The home purchase helper checks the latest reserve and actual API price atomically.
    // Wait for autopilot's reserve file if a standalone SF4 invocation runs before it exists.
    const bought = ui ? await ui.buy(goal) : ns.read('reserve.txt') !== '' &&
      (await purchase(ns, 'singularity', 'purchaseAugmentation', [SOA_FACTION, goal.augmentation], {budget: goal.budget})).result === true;
    if (!bought) break;
    print(`Queued ${goal.augmentation}. Its benefits and Daedalus count apply after the next augmentation installation.`);
  }
  if (ui && canContinue()) await ui.finish();
  return {...state, goal};
}
