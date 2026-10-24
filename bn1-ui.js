// Scoped UI actions for the opt-in BN1 cycle. All mutations use visible game controls.
import {reactProps, clickInfiltrationElement as click, infiltrationButton as button, infiltrationModals} from './infiltration-ui.js';
import {sendTerminalCommand} from './terminal-ui.js';
import {BN1_FACTIONS, displayedNumber, NF} from './bn1-policy.js';
export const uiText = e => (e?.textContent ?? '').replace(/\s+/g, ' ').trim();
export function uiAncestor(element, matches) {
    let fiber = element?.[Object.keys(element ?? {}).find(k => k.startsWith('__reactFiber$'))];
    for (let i = 0; fiber && i < 35; i++, fiber = fiber.return)
        if (matches(fiber.memoizedProps)) return fiber.memoizedProps;
    return null;
}
function reactText(node, depth = 0) {
    if (depth > 20 || node == null || typeof node === 'boolean') return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(n => reactText(n, depth + 1)).join(' ');
    return reactText(node.props?.children, depth + 1);
}

export function createBn1UI(ns, doc, alive, heartbeat = () => {}) {
    const heading = (tag, name) => [...doc.querySelectorAll(tag)].find(e => uiText(e) === name);
    const modals = () => infiltrationModals(doc);
    const dismissed = new WeakMap();
    let purchaseStarted = false;
    const assertAlive = () => {
        heartbeat();
        if (!alive()) throw new Error('BN1 automation stopped');
    };
    const dialogDescription = modal => uiText(modal).slice(0, 240) || 'Unrecognized dialog';
    // The game's ordinary alerts usually have only an X, not an OK button.
    // Identify that visible control by its Modal onClose callback, never by icon text.
    const passiveClose = modal => {
        const controls = [...modal.querySelectorAll('button')];
        const close = controls.find(control => !uiText(control) && uiAncestor(control,
            p => typeof p?.open === 'boolean' && p.onClose === reactProps(control)?.onClick));
        if (!close || modal.querySelector('input, select, textarea, [role="combobox"]') ||
            controls.some(control => control !== close && uiText(control) !== 'OK')) return null;
        // Leave script/game errors visible with useful context instead of hiding a failure.
        if (/runtime error|uncaught|unexpected error|stack trace|syntax error/i.test(uiText(modal))) return null;
        return button(modal, 'OK') ?? close;
    };
    const closeNotice = (modal, required = true) => {
        const invite = [...modal.querySelectorAll('h4')].some(h => uiText(h) === 'You received a faction invitation.');
        const control = invite && button(modal, 'Join') ? button(modal, 'Decide later') : passiveClose(modal);
        if (!control) {
            if (required) throw new Error(`A dialog needs your attention: ${dialogDescription(modal)}`);
            return false;
        }
        const description = uiText(modal);
        if (dismissed.get(modal) !== description) {
            dismissed.set(modal, description); click(control);
        }
        return true;
    };
    const check = async (allowModal = false) => {
        const deadline = Date.now() + 5000;
        while (true) {
            assertAlive();
            const list = modals();
            if (!list.length) return;
            if (Date.now() >= deadline) throw new Error(`Dialog did not close: ${dialogDescription(list[0])}`);
            let closing = false;
            for (const modal of list) closing = closeNotice(modal, !allowModal) || closing;
            if (!closing) return; // The caller will handle its exact purchase/travel/install confirmation.
            await ns.sleep(50); // Wait for React, queued alerts and the closing transition.
        }
    };
    const wait = async (read, message, allowModal = false, timeout = 5000) => {
        const deadline = Date.now() + timeout;
        while (true) {
            await check(allowModal); const value = read(); if (value) return value;
            if (Date.now() >= deadline) throw new Error(message);
            await ns.sleep(50);
        }
    };
    const sidebar = name => [...doc.querySelectorAll('[role="button"]')].find(e =>
        uiAncestor(e, p => p?.key_ === name && typeof p.clickFn === 'function') ||
        uiText(e).replace(/^[^A-Za-z]+/, '') === name);
    const groupName = name => ['Terminal'].includes(name) ? 'Hacking'
        : ['Factions', 'Augmentations'].includes(name) ? 'Character' : 'World';
    const groupItems = name => uiAncestor(sidebar(groupName(name)),
        p => p?.key_ === groupName(name) && Array.isArray(p.items))?.items;
    const menu = async (name, ready, optional = false) => {
        await check();
        const unfocus = button(doc, 'Do something else simultaneously');
        if (unfocus) { click(unfocus); await ns.sleep(100); await check(); }
        let target = sidebar(name);
        if (!target) {
            const items = groupItems(name);
            // A locked menu is distinct from a collapsed or unfamiliar sidebar.
            if (optional && items && !items.some(item => item?.key_ === name)) return null;
            if (items?.some(item => item?.key_ === name)) {
                click(sidebar(groupName(name)));
                target = await wait(() => sidebar(name), `${name} sidebar menu did not expand`);
            } else throw new Error(`Open the ${name} sidebar menu, then restart bn1-auto.js`);
        }
        click(target); return wait(ready, `${name} page did not open`);
    };
    const dismiss = async () => { await ns.sleep(50); await check(); };
    const terminal = () => menu('Terminal', () => doc.getElementById('terminal-input'));
    const command = async (text, ready, timeout = 5000) => {
        await terminal(); await check();
        await sendTerminalCommand(doc, text, {sleep: ms => ns.sleep(ms), canContinue: alive});
        if (ready) await wait(ready, `Command did not finish: ${text}`, false, timeout);
    };
    const city = async () => {
        await menu('City', () => [...doc.querySelectorAll('p')].some(e => uiText(e) === ns.getPlayer().city));
    };
    const location = async (name, ready) => {
        await city();
        const target = await wait(() => [...doc.querySelectorAll('span[aria-label]')]
            .find(e => e.getAttribute('aria-label') === name) ?? button(doc, name), `Location unavailable: ${name}`);
        click(target); return wait(ready, `Location did not open: ${name}`);
    };
    const card = name => heading('h6', name)?.closest('.MuiPaper-root');
    const factions = (optional = false) => menu('Factions', () => doc.querySelector('.factions-joined'), optional);
    const openFaction = async (name, page = 'Augments') => {
        await factions(); await check(); click(button(card(name) ?? doc.createElement('div'), page));
        await wait(() => heading('h4', page === 'Augments' ? `Faction Augmentations - ${name}` : name), `${name} page did not open`);
    };
    function rows(name) {
        if (!heading('h4', `Faction Augmentations - ${name}`)) throw new Error('Faction page changed');
        return [...doc.querySelectorAll('button')].flatMap(control => {
            if (!['Buy', 'Owned'].includes(uiText(control))) return [];
            const row = uiAncestor(control, p => p?.parent?.faction?.name === name && typeof p.augName === 'string' && typeof p.owned === 'boolean');
            if (!row) return [];
            const scope = control.closest('.MuiPaper-root'), requirements = new Map(), descriptions = [];
            for (const element of scope.querySelectorAll('p, span, svg')) {
                const req = uiAncestor(element, p => typeof p?.fulfilled === 'boolean' && typeof p.value === 'string');
                if (req) requirements.set(req.value, req.fulfilled);
                const tip = uiAncestor(element, p => p?.title && p?.children);
                if (tip) descriptions.push(reactText(tip.title));
            }
            const price = [...requirements.keys()].find(v => v.startsWith('$'));
            const rep = [...requirements.keys()].find(v => / rep$/.test(v));
            if (!row.owned && (!price || !rep)) throw new Error(`Cannot read ${row.augName} price/reputation; clear the augmentation search filter`);
            return [{name: row.augName, faction: name, owned: row.owned, control,
                cost: row.owned ? 0 : displayedNumber(price), rep: row.owned ? 0 : displayedNumber(rep),
                // Fulfilled is authoritative even when the displayed number is rounded upward.
                repMet: row.owned || requirements.get(rep) === true,
                missingPrereqs: /Missing \d+ pre-requisite/.test(uiText(scope)), description: descriptions.join(' ')}];
        });
    }
    const queue = async () => {
        const optional = !purchaseStarted && ns.getResetInfo().ownedAugs.size === 0;
        if (!await menu('Augmentations', () => heading('h4', 'Augmentations'), optional)) return [];
        const scope = heading('h5', 'Purchased Augmentations')?.closest('.MuiPaper-root')?.parentElement;
        if (!scope) throw new Error('Purchased augmentation list unavailable');
        const names = [...scope.querySelectorAll('.MuiListItemText-primary')].map(uiText);
        if (!names.length && !uiText(scope).includes('No Augmentations have been purchased yet')) throw new Error('Cannot verify purchased augmentations');
        const installed = ns.getResetInfo().ownedAugs;
        return names.map(label => {
            const nf = label.match(/^NeuroFlux Governor - Level (\d+)$/);
            const levels = nf ? Number(nf[1]) - (installed.get(NF) ?? 0) : 1;
            if (!(levels > 0)) throw new Error('Cannot verify queued NeuroFlux levels');
            return {name: nf ? NF : label, levels};
        });
    };
    return {check, wait, menu, terminal, command, queue,
        async travel(destination) {
            if (ns.getPlayer().city === destination) return;
            await menu('Travel', () => heading('h4', 'Travel Agency'));
            const target = button(doc, `Travel to ${destination}`) ?? [...doc.querySelectorAll('span')]
                .find(e => typeof reactProps(e)?.onClick === 'function' && uiAncestor(e, p => p?.city === destination && typeof p.onTravel === 'function'));
            if (!target) throw new Error(`Travel control unavailable: ${destination}`);
            await check(); click(target);
            await wait(() => ns.getPlayer().city === destination || modals().some(m => uiText(m).includes(`travel to ${destination}?`)), 'Travel confirmation unavailable', true);
            if (ns.getPlayer().city !== destination) {
                const modal = modals().find(m => uiText(m).includes(`travel to ${destination}?`));
                await check(true); click(button(modal, 'Travel'));
            }
            await wait(() => ns.getPlayer().city === destination, 'Travel did not complete', true);
            await dismiss();
        },
        async mug() { await location('The Slums', () => button(doc, 'Mug (', true)); await check(); click(button(doc, 'Mug (', true)); },
        async study() {
            const university = {'Aevum': 'Summit University', 'Sector-12': 'Rothman University', Volhaven: 'ZB Institute of Technology'}[ns.getPlayer().city];
            if (!university) throw new Error('Travel to Aevum, Sector-12 or Volhaven to study');
            await location(university, () => button(doc, 'Take Algorithms course', true));
            await check(); click(button(doc, ns.getPlayer().money >= 1e6 ? 'Take Algorithms course' : 'Study Computer Science', true));
        },
        async store(kind, budget) {
            const shop = {Aevum: 'NetLink Technologies', 'Sector-12': 'Alpha Enterprises', Ishima: 'Omega Software', Volhaven: 'CompuTek'}[ns.getPlayer().city];
            if (!shop) throw new Error('Current city has no technology store');
            const label = kind === 'ram' ? "Upgrade 'home' RAM" : 'Purchase TOR router';
            await location(shop, () => button(doc, label, true));
            const control = button(doc, label, true);
            const cost = [...control.querySelectorAll('span')].map(e => uiAncestor(e, p => Number.isFinite(p?.money))?.money).find(Number.isFinite);
            if (!Number.isFinite(cost) || cost < 0 || control.disabled || cost > await budget() || cost > ns.getPlayer().money) return false;
            const before = kind === 'ram' ? ns.getServer('home').maxRam : ns.hasTorRouter();
            await check(); click(control);
            await wait(() => kind === 'ram' ? ns.getServer('home').maxRam > before : ns.hasTorRouter(), `${kind} purchase failed`, true);
            if (kind === 'tor') await dismiss();
            return true;
        },
        async joinInvitations() {
            if (!await factions(true)) return;
            for (const name of BN1_FACTIONS) {
                const join = button(card(name) ?? doc.createElement('div'), 'Join!');
                if (!join) continue;
                await check(); click(join);
                await wait(() => ns.getPlayer().factions.includes(name), `Joining ${name} failed`);
            }
        },
        async snapshot() {
            const queued = await queue(), result = [], reputation = {};
            for (const name of BN1_FACTIONS.filter(n => ns.getPlayer().factions.includes(n))) {
                await openFaction(name);
                const head = heading('h4', `Faction Augmentations - ${name}`);
                const faction = uiAncestor(head, p => p?.faction?.name === name)?.faction;
                if (!faction || !Number.isFinite(faction.playerReputation)) throw new Error(`Cannot read ${name} reputation`);
                reputation[name] = faction.playerReputation;
                const list = rows(name);
                const search = [...doc.querySelectorAll('input')].find(i => i.type === 'text');
                if (search?.value) throw new Error('Clear the faction augmentation search filter, then restart bn1-auto.js');
                result.push(...list.map(({control, ...row}) => row));
            }
            return {queued, rows: result, reputation};
        },
        async work(faction) {
            await openFaction(faction, 'Details'); await check(); click(button(doc, 'Hacking Contracts'));
        },
        async buy(row, budget) {
            await openFaction(row.faction);
            const fresh = rows(row.faction).find(r => r.name === row.name && !r.owned);
            if (!fresh || fresh.control.disabled || fresh.cost > budget() || fresh.cost > ns.getPlayer().money) return false;
            await check(); purchaseStarted = true; click(fresh.control);
            // Confirm only this augmentation; never dismiss an unrelated dialog.
            await ns.sleep(100); let confirmed = false;
            await wait(() => {
                for (const modal of modals()) {
                    if (button(modal, 'Purchase') && [...modal.querySelectorAll('h4')].some(h => uiText(h) === row.name)) {
                        if (confirmed) return false;
                        const cost = [...modal.querySelectorAll('span')].map(e => uiAncestor(e, p => Number.isFinite(p?.money))?.money).find(Number.isFinite);
                        if (!Number.isFinite(cost) || cost > fresh.cost || cost > budget() || cost > ns.getPlayer().money) throw new Error('Augmentation price/budget changed');
                        click(button(modal, 'Purchase')); confirmed = true; return false;
                    }
                    if (uiText(modal).includes(`You purchased ${row.name}. Its enhancements will not take effect until they are installed.`)) {
                        closeNotice(modal); return false;
                    }
                    closeNotice(modal); return false;
                }
                // NF remains purchasable, so its queue is verified by the caller as well.
                return row.name === NF || rows(row.faction).some(r => r.name === row.name && r.owned);
            }, 'Augmentation purchase did not complete', true);
            return true;
        },
        async install(verify) {
            const queued = await queue();
            if (!queued.length) throw new Error('No augmentations are queued');
            await verify(); await check();
            ns.tprint('BN1: Installing augmentations. After waking up, type "run autopilot.js" in Terminal.');
            click(button(doc, 'Install Augmentations'));
            // With confirmation suppressed, the click terminates this script immediately.
            const modal = await wait(() => modals().find(m => uiText(m).includes('Installing will reset') && button(m, 'Confirm')),
                'Installation confirmation did not appear', true);
            await verify(); await check(true); click(button(modal, 'Confirm'));
        },
    };
}
