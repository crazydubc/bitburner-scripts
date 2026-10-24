// First-BN1 UI automation, launched by autopilot. Restart autopilot manually after installation.
import {isScriptRunning, whichServerIsRunning, runScriptLocal, getReserve} from './utils.js';
import {createBn1UI} from './bn1-ui.js';
import {BN1_SESSION, BN1_SERVERS, firstBn1, planBn1Augmentations} from './bn1-policy.js';
import {BN1_CRACKERS} from './bn1-guide.js';
import {evaluateAugmentationReset} from './augmentation-reset-policy.js';

export async function main(ns) {
    // The bootstrap uses direct reads and hands all RAM to bn1-casino.js when needed.
    ns.ramOverride(8);
    const flags = ns.flags([['stop', false]]), wnd = globalThis['window'], doc = wnd?.['document'];
    if (!doc) return ns.tprint('Run bn1-auto.js with the game open.');
    const host = ns.getHostname();
    // Autopilot places the remote controller with its full steady-state allocation.
    if (host !== 'home' && ns.ramOverride(16) < 16) return ns.tprint('BN1 controller needs 16 GB on its remote host.');
    if (flags.stop) {
        const reset = ns.getResetInfo();
        const session = wnd[BN1_SESSION] ?? {lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset};
        Object.assign(session, {stop: true, paused: true, lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset});
        wnd[BN1_SESSION] = session;
        const [, casinoPid] = await whichServerIsRunning(ns, 'bn1-casino.js');
        if (casinoPid) ns.kill(casinoPid);
        return ns.tprint('BN1 controller stopping. Autopilot and hacking remain running.');
    }
    const reset = ns.getResetInfo();
    if (!firstBn1(reset)) return ns.tprint('bn1-auto.js is only for BN1.1 before SF1/SF4. Use autopilot.js here.');
    const casinoRunning = await isScriptRunning(ns, 'bn1-casino.js');
    const previous = wnd[BN1_SESSION];
    if (casinoRunning || (previous?.lastAugReset === reset.lastAugReset && previous?.lastNodeReset === reset.lastNodeReset &&
        Number.isInteger(previous.pid) && previous.pid !== ns.pid && ns.isRunning(previous.pid)))
        return ns.tprint('BN1 automation is already running.');
    const session = {pid: ns.pid, stop: false, spendLock: false, child: 0, expires: 0,
        lastAugReset: reset.lastAugReset, lastNodeReset: reset.lastNodeReset};
    wnd[BN1_SESSION] = session;
    const pulse = () => { session.expires = Date.now() + 60_000; };
    const alive = () => !session.stop && wnd[BN1_SESSION] === session;
    ns.atExit(() => {
        session.stop = true;
        if (wnd[BN1_SESSION] === session && !session.paused && !session.handoff) delete wnd[BN1_SESSION];
        const child = wnd.__bitburnerScriptsInfiltration;
        if (child?.controller === ns.pid) child.stop = true;
    });
    const ui = createBn1UI(ns, doc, alive, pulse);
    let lastStatus = '', handoff = false, ownedLiquidator = 0;
    const say = text => {
        pulse(); if (text === lastStatus) return;
        lastStatus = text; ns.print(text); ns.tprint(`BN1: ${text}`);
    };
    const pause = async ms => {
        const until = Date.now() + ms;
        while (alive() && Date.now() < until) { pulse(); await ns.sleep(Math.min(1000, until - Date.now())); }
        if (!alive()) throw new Error('Stopped');
    };
    const reserveBudget = async () => {
        const reserve = host === 'home' ? Number(ns.read('reserve.txt') || 8e9) : await getReserve(ns);
        if (!Number.isFinite(reserve) || reserve < 0) throw new Error('Cash reserve is unavailable');
        return Math.max(0, ns.getPlayer().money - reserve);
    };
    const launch = (file, args = []) => {
        const home = ns.getServer('home'), cost = ns.getScriptRam(file, 'home');
        if (!(cost > 0)) throw new Error(`Missing ${file}; pull the complete testing branch`);
        if (home.maxRam - home.ramUsed < cost) return 0;
        return ns.exec(file, 'home', {threads: 1, temporary: true, preventDuplicates: true}, ...args);
    };
    const waitChild = async pid => { while (alive() && ns.isRunning(pid)) await pause(250); };
    const stocks = async () => {
        const result = await runScriptLocal(ns, 'bin/bn1-stock.js', false, []);
        return result && typeof result.known === 'boolean' ? result : {known: false, reason: 'Stock helper unavailable'};
    };
    const liquidate = async () => {
        let process = ns.ps('home').find(p => p.filename === 'stockmaster.js' && p.args.some(a => ['--liquidate', '-l'].includes(a)));
        if (!process) {
            const pid = launch('stockmaster.js', ['--liquidate']);
            if (!pid) return false;
            ownedLiquidator = pid; process = {pid};
        }
        const value = await stocks();
        return ns.isRunning(process.pid) && value.known && value.shares === 0;
    };
    const releaseLiquidator = () => {
        if (ownedLiquidator && ns.isRunning(ownedLiquidator)) ns.kill(ownedLiquidator);
        ownedLiquidator = 0;
    };
    try {
        ns.disableLog('ALL');
        // Never navigate away from an existing casino/infiltration run.
        while (await isScriptRunning(ns, 'coinflip.js') || ns.ps('home').some(p => p.filename === 'infiltrate.js')) {
            say('Waiting for the current casino/infiltration session.'); await pause(1000);
        }
        if (!(ns.getMoneySources().sinceInstall.casino >= 10e9)) {
            const needed = ns.getPlayer().city === 'Aevum' ? 10_000 : 250_000;
            if (ns.getPlayer().money < needed) {
                say(`Mugging for $${needed.toLocaleString()} seed money.`); await ui.mug();
                while (ns.getPlayer().money < needed) await pause(1000);
            }
            await ui.travel('Aevum'); await ui.terminal();
            if (!ns.fileExists('bn1-casino.js', host)) throw new Error('Missing bn1-casino.js; pull the complete branch');
            say('Starting coinflip. Automation resumes when the casino has paid $10 billion.');
            handoff = true;
        } else {
            if (!['Aevum', 'Sector-12', 'Volhaven'].includes(ns.getPlayer().city)) await ui.travel('Aevum');
            while (ns.getServer('home').maxRam < 128) {
                say('Upgrading home RAM for hacking and automation.');
                if (!await ui.store('ram', reserveBudget)) break;
            }
            if (ns.getServer('home').maxRam < 64) throw new Error('Need 64 GB home RAM; leave the casino money available for the upgrade');
            if (ns.ramOverride(16) < 16) throw new Error(`Free 8 more GB on ${host}, then restart bn1-auto.js`);
            ns.ui.openTail(); ns.ui.resizeTail(800, 400); ns.ui.setTailTitle('BN1.1 — Automatic cycle');
            const state = {}; let nextInfiltration = 0;
            while (alive()) {
                pulse();
                if (ns.getResetInfo().lastAugReset !== reset.lastAugReset) break;
                while (ns.ps('home').some(p => p.filename === 'infiltrate.js')) await pause(1000);
                await ui.check();
                if (!ns.hasTorRouter()) {
                    say('Buying TOR.'); if (!await ui.store('tor', reserveBudget)) { await pause(5000); continue; }
                }
                for (const [file, cost] of [...BN1_CRACKERS, ['DarkscapeNavigator.exe', 50e6]]) {
                    if (ns.fileExists(file, 'home') || cost > await reserveBudget()) continue;
                    say(`Buying ${file}.`);
                    await ui.command(`home;buy ${file}`, () => ns.fileExists(file, 'home'));
                }
                if (!await isScriptRunning(ns, 'autopilot.js')) {
                    if (ns.getServer('home').maxRam - ns.getServer('home').ramUsed >= 48) launch('autopilot.js');
                    else say('Waiting for 48 GB free on home to start autopilot.');
                }
                // Rooting and terminal backdoors use existing scripts/commands, never the batcher.
                const player = ns.getPlayer();
                const final = reset.ownedAugs.has('The Red Pill');
                const targets = final ? [['w0r1d_d43m0n', '']] : BN1_SERVERS;
                let backdoored = false;
                for (const [host, faction] of targets) {
                    if (faction && player.factions.includes(faction)) continue;
                    const server = ns.getServer(host);
                    if (server.backdoorInstalled || player.skills.hacking < server.requiredHackingSkill) continue;
                    if (BN1_CRACKERS.filter(([file]) => ns.fileExists(file, 'home')).length < server.numOpenPortsRequired) continue;
                    const routes = new Map([['home', 'home']]);
                    for (const [from, route] of routes) for (const to of ns.scan(from))
                        if (!routes.has(to)) routes.set(to, `${route};connect ${to}`);
                    if (!routes.has(host)) throw new Error(`Cannot find ${host}`);
                    if (!server.hasAdminRights) {
                        const programs = BN1_CRACKERS.filter(([file]) => ns.fileExists(file, 'home')).map(([file]) => `run ${file}`);
                        await ui.command(`${routes.get(host)};${programs.join(';')};run NUKE.exe`, () => ns.getServer(host).hasAdminRights);
                    }
                    say(`Backdooring ${host}.`);
                    if (final) {
                        say('Finishing BN1. Follow the Bitverse prompts, choose BN4, then run autopilot.js.');
                        await ui.command(`${routes.get(host)};backdoor`); return;
                    }
                    await ui.command(`${routes.get(host)};backdoor`, () => ns.getServer(host).backdoorInstalled, 30 * 60_000);
                    backdoored = true; break;
                }
                if (backdoored) continue;
                if (final) { say('Training hacking for the final server.'); await ui.study(); await pause(30_000); continue; }
                // CashRoot is a useful early reset accelerator; visiting cities does not join enemies.
                if (!player.factions.includes('Sector-12') && ns.getPlayer().money >= 15.2e6 &&
                    !player.factions.some(f => ['Chongqing', 'New Tokyo', 'Ishima', 'Volhaven'].includes(f))) await ui.travel('Sector-12');
                await ui.joinInvitations();
                if (session.spendLock && ns.getPlayer().factions.includes('Daedalus')) {
                    session.spendLock = false; releaseLiquidator();
                }
                if (!ns.getPlayer().factions.includes('CyberSec')) {
                    say('Studying hacking for CyberSec.'); await ui.study(); await pause(30_000); continue;
                }
                if (reset.ownedAugs.size >= 30 && ns.getPlayer().skills.hacking >= 2500 && !ns.getPlayer().factions.includes('Daedalus')) {
                    session.spendLock = true;
                    say('Holding spending and liquidating stocks for the $100 billion Daedalus invitation.');
                    if (!await liquidate()) { await pause(5000); continue; }
                    await ui.joinInvitations();
                    if (!ns.getPlayer().factions.includes('Daedalus')) {
                        if (Date.now() >= nextInfiltration) {
                            await ui.terminal(); const pid = launch('infiltrate.js', ['--single', '--money-target', 100e9, '--bn1-controller', ns.pid]);
                            if (pid) { session.child = pid; await waitChild(pid); session.child = 0; }
                            nextInfiltration = Date.now() + 60_000;
                        }
                        await pause(5000); continue;
                    }
                    session.spendLock = false; releaseLiquidator();
                }
                const snapshot = await ui.snapshot(), market = await stocks();
                const wealth = ns.getPlayer().money + (market.known ? market.value : 0);
                const plan = planBn1Augmentations({...snapshot, installed: [...reset.ownedAugs.keys()], money: wealth});
                const decision = evaluateAugmentationReset({generated_at: Date.now(), current_node: 1, last_aug_reset: reset.lastAugReset,
                    reset_planning: {version: 1, wealth, readyUtility: plan.readyUtility, goals: plan.goals,
                        reputation: snapshot.reputation, hacking: ns.getPlayer().skills.hacking}}, reset, state, Date.now(),
                    reset.ownedAugs.size >= 30 ? 2500 : 0);
                if (market.known && (decision.action === 'reset' || snapshot.queued.some(q => q.name === 'The Red Pill'))) {
                    session.spendLock = true;
                    say('Preparing installation: selling stocks, then buying the best affordable bundle.');
                    while (!await liquidate()) { say('Waiting for verified empty stock holdings before installation.'); await pause(5000); }
                    for (let purchases = 0; purchases < 100; purchases++) {
                        const fresh = await ui.snapshot();
                        const buying = planBn1Augmentations({...fresh, installed: [...reset.ownedAugs.keys()], money: ns.getPlayer().money}).bundle[0];
                        if (!buying) break;
                        const count = fresh.queued.reduce((n, q) => n + q.levels, 0);
                        if (!await ui.buy(buying, () => ns.getPlayer().money)) break;
                        if ((await ui.queue()).reduce((n, q) => n + q.levels, 0) <= count) throw new Error(`Could not verify purchase: ${buying.name}`);
                    }
                    if (!(await ui.queue()).length) { session.spendLock = false; releaseLiquidator(); await pause(5000); continue; }
                    // Spend affordable leftovers on persistent RAM after augmentation purchases.
                    if (['Aevum', 'Sector-12', 'Ishima', 'Volhaven'].includes(ns.getPlayer().city))
                        for (let upgrades = 0; upgrades < 20 && await ui.store('ram', () => ns.getPlayer().money); upgrades++) {}
                    await ui.install(async () => {
                        const fresh = await stocks();
                        const held = ns.ps('home').some(p => p.filename === 'stockmaster.js' && p.args.some(a => ['--liquidate', '-l'].includes(a)));
                        if (!alive() || !session.spendLock || !held || !fresh.known || fresh.shares !== 0)
                            throw new Error('Stock liquidation could not be verified; installation postponed');
                    });
                    return;
                }
                const target = plan.target;
                say(!market.known ? 'Stock holdings unavailable; continuing progress, installation paused.'
                    : decision.action === 'wait' ? `Working toward ${decision.goal ?? target?.name ?? 'a useful bundle'}; measuring progress.`
                    : `Working toward ${target?.name ?? 'the next useful augmentation'}.`);
                let infiltrated = false;
                if (Date.now() >= nextInfiltration) {
                    await ui.terminal();
                    const moneyTarget = Math.max(10e9, ...plan.goals.map(g => Math.min(g.money, 100e9)));
                    const pid = launch('infiltrate.js', ['--single', '--soa', '--bn1-controller', ns.pid,
                        ...(target ? ['--faction', target.faction] : ['--money-target', moneyTarget])]);
                    if (pid) { session.child = pid; await waitChild(pid); session.child = 0; infiltrated = true; }
                    nextInfiltration = Date.now() + 60_000;
                }
                if (target) await ui.work(target.faction);
                else if (reset.ownedAugs.size >= 30) await ui.study();
                else await ui.work('CyberSec');
                // Re-read rewards immediately; the cooldown then leaves room for regular ETA samples.
                if (!infiltrated) await pause(30_000);
            }
        }
    } catch (error) {
        if (alive()) {
            session.paused = true;
            ns.tprint(`BN1 automation paused: ${String(error?.message ?? error)}. Fix the indicated screen/state, then run bn1-auto.js again. For manual steps: run bn1-guide.js.`);
        }
    }
    if (handoff && alive()) {
        session.handoff = Date.now() + 5000;
        ns.spawn('bn1-casino.js', {threads: 1, spawnDelay: 0, ramOverride: host === 'home' ? 6.5 : 16});
    }
}
