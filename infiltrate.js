/** Sphyxis / Dihelvid's auto-infiltration approach, with bounded lifecycle and progression selection.
 * Uses the game's undocumented React model success callback; stops on unknown UI.
 */
import { singRun, runScriptLocal } from './utils.js';
import { chooseInfiltration, freshInfiltrationTarget, infiltrationAlternativeIncome, INFILTRATION_TARGET, INFILTRATION_LEASE,
  INFILTRATION_HISTORY, INFILTRATION_ACK, INFILTRATION_PROGRESS, SOA_FACTION } from './infiltration-policy.js';
import { manageSoaProgression, soaInvitation, acceptSoaInvitation } from './infiltration-soa.js';
import { infiltrationView, infiltrationDemand, infiltrationButton, clickInfiltrationElement,
  finishInfiltrationStage, selectInfiltrationFaction, idleInfiltrationScreen, openInfiltrationCompany,
  infiltrationUiTimeout } from './infiltration-ui.js';

const argsSchema = [['auto', false], ['single', false], ['stop', false], ['status', false], ['quiet', false],
  ['company', ''], ['faction', ''], ['target-rep', 0], ['money-target', 10e9], ['time', 120_000],
  ['max-runs', 3], ['min-demand', 0.8], ['scheduled', false], ['soa', false],
  ['aug-count-target', 30], ['cooldown', 60_000]];
const sessionKey = '__bitburnerScriptsInfiltration';
export function autocomplete(data) { data.flags(argsSchema); return []; }

/** @param {NS} ns */
export async function main(ns) {
  const options = ns.flags(argsSchema);
  const wnd = globalThis['window'], doc = wnd?.['document'];
  if (!doc) return ns.tprint('ERROR: Infiltration requires the game UI.');
  if (ns.getHostname() !== 'home') return ns.tprint('ERROR: Run infiltrate.js on home.');
  const previous = wnd[sessionKey];
  if (options.status) return ns.tprint(previous || wnd.tmrAutoInf ? 'Infiltration runner is active.' : 'Infiltration runner is inactive.');
  if (options.stop) {
    if (previous) previous.stop = true;
    if (wnd.tmrAutoInf) {
      wnd.clearInterval(wnd.tmrAutoInf); delete wnd.tmrAutoInf;
      ns.tprint('Stopped the legacy timer. Reload once to clear its old pending callbacks.');
    }
    return;
  }
  if (previous) return ns.tprint('Infiltration runner is already active; use --stop first.');
  if (wnd.tmrAutoInf) {
    wnd.clearInterval(wnd.tmrAutoInf); delete wnd.tmrAutoInf;
    return ns.tprint('Stopped the old infiltration timer. Reload the game once to clear its pending callbacks before using this version.');
  }
  if (options.faction === SOA_FACTION)
    return ns.tprint('SoA reputation is earned alongside cash/normal faction rewards. Use --soa for its progression; --faction selects a normal reputation recipient such as CyberSec.');
  if (![options.time, options['max-runs'], options['min-demand'], options['money-target'], options['target-rep'],
    options['aug-count-target'], options.cooldown].every(Number.isFinite) ||
    options.time < 1000 || options.time > 600_000 || !Number.isInteger(options['max-runs']) || options['max-runs'] < 1 ||
    options['max-runs'] > 20 || options['min-demand'] < 0 || options['min-demand'] > 1 ||
    options['money-target'] < 0 || options['target-rep'] < 0 || !Number.isInteger(options['aug-count-target']) ||
    options['aug-count-target'] < 0 || options.cooldown < 1000 || options.cooldown > 3_600_000)
    return ns.tprint('ERROR: Use time 1000..600000 ms, max-runs 1..20, min-demand 0..1, cooldown 1000..3600000 ms, and nonnegative targets (integer aug-count-target).');
  const read = file => JSON.parse(ns.read(file) || 'null');
  const print = message => { ns.print(message); if (!options.quiet) ns.tprint(message); };
  let session, ownedModel, victory = false;
  const started = Date.now(), deadline = started + options.time;
  let runs = 0, lastLease = 0;
  const limit = options.single || !options.auto ? 1 : options['max-runs'];
  const history = read(INFILTRATION_HISTORY) ?? {};
  const possibleLocations = ns.infiltration.getPossibleLocations();
  const companyNames = possibleLocations.map(location => location.name);
  const lease = read(INFILTRATION_LEASE);
  if (options.scheduled && lease?.retryAfter > started) return;
  const reset = ns.getResetInfo();
  const augs = reset.ownedSF;
  const hasSingularity = reset.currentNode === 4 || Number(augs instanceof Map ? augs.get(4) : augs?.[4]) > 0;
  if (options['target-rep'] > 0 && !hasSingularity)
    return print('A total --target-rep requires SF4. Use --single --faction and check current reputation in Factions.');
  const pulse = async () => {
    if (Date.now() - lastLease < 2000) return;
    await ns.write(INFILTRATION_LEASE, JSON.stringify({pid: ns.pid,
      expires: Math.min(deadline + 5000, Date.now() + 60_000), retryAfter: 0}), 'w');
    lastLease = Date.now();
  };
  const stopping = () => session.stop || Date.now() >= deadline;
  const acquireScreen = async plannerPid => {
    await pulse();
    while (plannerPid && ns.isRunning(plannerPid) && !stopping()) {
      const ack = read(INFILTRATION_ACK);
      if (ack?.pid === ns.pid && ack.workerPid === plannerPid && ack.at >= started) break;
      await ns.sleep(100); await pulse();
    }
  };
  const updateSoa = async () => {
    const state = await manageSoaProgression(ns, {doc, canContinue: () => !stopping(), hasSingularity,
      augRequirement: options['aug-count-target'], print, heartbeat: pulse});
    if (state.owned) await ns.write(INFILTRATION_PROGRESS, JSON.stringify({...state,
      updatedAt: Date.now(), lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset}), 'w');
    return state.goal;
  };
  const cleanup = () => {
    // Release only the model we started; preserve an unclaimed victory screen.
    const complete = ownedModel && (ownedModel.results?.match(/✓/g)?.length ?? 0) >= ownedModel.maxLevel;
    if (ownedModel && !victory && !complete) ownedModel.cancel();
    if (wnd[sessionKey] === session) delete wnd[sessionKey];
  };

  try {
    if (!(ns.getMoneySources().sinceInstall.casino >= 10e9)) return print('Infiltration deferred until the coinflipper finishes its $10b.');
    if (!idleInfiltrationScreen(doc, companyNames) && !(options.soa && soaInvitation(doc)))
      return print('Infiltration deferred: return to the Terminal, City, or company screen.');
    session = {stop: false}; wnd[sessionKey] = session;
    ns.atExit(cleanup);
    while (!stopping() && runs < limit) {
      let player = ns.getPlayer();
      const work = hasSingularity ? await singRun(ns, 'getCurrentWork') : null;
      if (work?.type && work.type !== 'FACTION') break;
      if (!idleInfiltrationScreen(doc, companyNames) && !(options.soa && soaInvitation(doc))) break;
      let target = read(INFILTRATION_TARGET), rep = null;
      const plannerPid = Number.isInteger(target?.pid) && target.lastAugReset === reset.lastAugReset &&
        target.lastNodeReset === reset.lastNodeReset && Date.now() >= target.updatedAt &&
        Date.now() - target.updatedAt <= 90_000 && ns.isRunning(target.pid)
        ? target.pid : null;
      if (options.scheduled && work?.type === 'FACTION' && !plannerPid) {
        print('Infiltration deferred: restart the faction worker with --infiltration to coordinate screen use.'); break;
      }
      if (!freshInfiltrationTarget(target, reset, player.factions)) target = null;
      if (options.faction) {
        if (!player.factions.includes(options.faction)) {
          const companyHint = companyNames.includes(options.faction)
            ? ` To infiltrate that company, use --company ${JSON.stringify(options.faction)} and a joined --faction for the reputation reward.` : '';
          throw new Error(`Reward faction ${JSON.stringify(options.faction)} is not in your joined factions. ` +
            `--faction names the reputation recipient; company entry does not require faction membership.${companyHint}`);
        }
        target = {kind: 'faction-rep', faction: options.faction, targetRep: options['target-rep'] || Infinity, repRate: 0};
      }
      if (target && hasSingularity) {
        rep = await singRun(ns, 'getFactionRep', target.faction);
        if (!Number.isFinite(rep)) throw new Error('Faction reputation unavailable');
      }
      if (options.faction && rep != null && rep >= target.targetRep) break;
      let soa = null;
      if (options.soa) {
        await acquireScreen(plannerPid);
        if (stopping()) break;
        await acceptSoaInvitation(ns, doc, () => !stopping(), pulse);
        if (!idleInfiltrationScreen(doc, companyNames)) break;
        soa = await updateSoa();
        if (stopping()) break;
        player = ns.getPlayer();
      }
      const locations = await runScriptLocal(ns, 'bin/infiltration-locations.js', false, [player.city]);
      if (!Array.isArray(locations)) throw new Error(`Infiltration quotes unavailable: ${String(locations)}`);
      const input = {locations, player, target, rep, company: options.company, moneyTarget: options['money-target'],
        income: infiltrationAlternativeIncome(ns.getTotalScriptIncome()[0], ns.getMoneySources().sinceInstall,
          (Date.now() - reset.lastAugReset) / 1000),
        minDemand: options['min-demand'], remainingMs: deadline - Date.now(), history, soa};
      let choice = chooseInfiltration(input);
      if (!choice) { print('No infiltration currently beats the active income/rep route within this time budget.'); break; }
      // Wait for an in-flight faction planning pass to finish before taking the screen.
      await acquireScreen(plannerPid);
      if (stopping()) break;
      if (!idleInfiltrationScreen(doc, companyNames)) break;
      // Work/bribes/income may have finished the goal while we waited for the planner.
      input.player = ns.getPlayer();
      if (input.player.city !== player.city) break;
      if (target && hasSingularity) {
        input.rep = await singRun(ns, 'getFactionRep', target.faction);
        if (!Number.isFinite(input.rep)) throw new Error('Faction reputation unavailable');
        if (options.faction && input.rep >= target.targetRep) break;
      }
      choice = chooseInfiltration({...input, company: choice.company, remainingMs: deadline - Date.now()});
      if (!choice || stopping()) break;
      await openInfiltrationCompany(doc, choice.company, ms => ns.sleep(ms), () => !stopping());
      let view;
      const appearedBy = Math.min(deadline, Date.now() + infiltrationUiTimeout);
      while (!stopping() && Date.now() < appearedBy && !(view = infiltrationView(doc, choice.company))) await ns.sleep(50);
      if (view?.kind !== 'intro' || !view.scope) throw new Error('Expected infiltration introduction did not appear');
      ownedModel = view.model; victory = false;
      const demand = infiltrationDemand(view.scope);
      choice = chooseInfiltration({...input, company: choice.company, demand, remainingMs: deadline - Date.now()});
      if (!choice || !Number.isFinite(ownedModel.startingDifficulty) || ownedModel.startingDifficulty >= 3.5) {
        print('Infiltration deferred: demand, difficulty, or time budget is unsuitable.'); break;
      }
      if (stopping()) break;
      print(`Infiltrating ${choice.company} for ${choice.mode === 'rep' ? choice.faction + ' reputation' : 'money'} (demand ${(demand * 100).toFixed(1)}%).`);
      const gameStart = Date.now(), handled = new WeakSet();
      clickInfiltrationElement(infiltrationButton(view.scope, 'Start'));
      let claimSent = false, claimed = false, claimDeadline = 0, absentSince = 0;
      while (!stopping()) {
        await pulse();
        view = infiltrationView(doc, choice.company);
        if (!view || view.model !== ownedModel) {
          if (claimSent) { claimed = true; break; }
          absentSince ||= Date.now();
          if (Date.now() - absentSince > 500) throw new Error('Infiltration screen changed; yielding control');
          await ns.sleep(50); continue;
        }
        absentSince = 0;
        if (view.model.results?.includes('✗')) throw new Error('An infiltration stage failed; stopping this session');
        if (view.kind === 'victory') {
          victory = true;
          if (claimSent) {
            if (Date.now() > claimDeadline) throw new Error('Reward claim did not close the victory screen');
          } else if (choice.mode !== 'rep' || selectInfiltrationFaction(view.scope, choice.faction)) {
            const before = ns.getPlayer().money;
            const oldRep = hasSingularity && choice.mode === 'rep' ? await singRun(ns, 'getFactionRep', choice.faction) : null;
            if (stopping()) break;
            view = infiltrationView(doc, choice.company);
            if (view?.model !== ownedModel || view.kind !== 'victory') throw new Error('Reward screen changed; yielding control');
            if (choice.mode === 'rep' && !selectInfiltrationFaction(view.scope, choice.faction)) continue;
            clickInfiltrationElement(infiltrationButton(view.scope, choice.mode === 'rep' ? 'Trade for' : 'Sell for', true));
            claimSent = true; claimDeadline = Date.now() + 2000;
            const cash = ns.getPlayer().money - before;
            const gainedRep = oldRep != null ? (await singRun(ns, 'getFactionRep', choice.faction)) - oldRep : null;
            print(`Infiltration reward claimed: ${choice.mode === 'rep' ? choice.faction + (gainedRep == null ? '' : ' +' + Math.floor(gainedRep) + ' rep') : '$' + Math.round(cash).toLocaleString()}.`);
          }
        } else finishInfiltrationStage(view, handled);
        await ns.sleep(50);
      }
      if (!claimed) break;
      const row = history[choice.company] ??= {games: 0, durationMs: 0};
      row.games++; row.durationMs += Date.now() - gameStart;
      await ns.write(INFILTRATION_HISTORY, JSON.stringify(history, null, 2), 'w');
      runs++; ownedModel = null; victory = false;
      await ns.sleep(200);
      // Claiming the first reward creates the invitation; accept it even on a single-run session.
      if (options.soa && !stopping()) {
        await acceptSoaInvitation(ns, doc, () => !stopping(), pulse);
        if (runs >= limit && idleInfiltrationScreen(doc, companyNames)) await updateSoa();
      }
    }
  } catch (error) { print(`Infiltration stopped: ${String(error?.message ?? error)}`); }
  finally {
    cleanup();
    if (session) await ns.write(INFILTRATION_LEASE, JSON.stringify({pid: ns.pid, expires: 0, retryAfter: Date.now() + options.cooldown}), 'w');
  }
}
