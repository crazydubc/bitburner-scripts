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
    const deferredInvites = new WeakMap();
    const check = (allowModal = false) => {
        heartbeat();
        if (!alive()) throw new Error('BN1 automation stopped');
        // Keep invitations available on Factions, without letting their popup block work.
        if (!allowModal) for (const modal of modals()) {
            if ([...modal.querySelectorAll('h4')].some(h => uiText(h) === 'You received a faction invitation.') &&
                button(modal, 'Join') && button(modal, 'Decide later')) {
                const invitation = uiText(modal);
                if (deferredInvites.get(modal) !== invitation) {
                    deferredInvites.set(modal, invitation); click(button(modal, 'Decide later'));
                }
                continue; // MUI may keep the dismissed dialog mounted while it fades out.
            }
            throw new Error('A dialog needs your attention; close it and restart bn1-auto.js');
        }
    };
    const wait = async (read, message, allowModal = false, timeout = 5000) => {
        const deadline = Date.now() + timeout;
        while (true) {
            check(allowModal); const value = read(); if (value) return value;
            if (Date.now() >= deadline) throw new Error(message);
            await ns.sleep(50);
        }
    };
    const menu = async (name, ready) => {
        check();
        // Leaving focused work preserves the job while making sidebar navigation available.
        const unfocus = button(doc, 'Do something else simultaneously');
        if (unfocus) { click(unfocus); await ns.sleep(100); check(); }
        const target = [...doc.querySelectorAll('[role="button"]')]
            .find(e => uiText(e).replace(/^[^A-Za-z]+/, '') === name);
        if (!target) throw new Error(`Open the ${name} sidebar menu, then restart bn1-auto.js`);
        click(target); return wait(ready, `${name} page did not open`);
    };
    const dismiss = async expected => {
        for (let attempts = 0; attempts < 100; attempts++) {
            check(true); const list = modals();
            if (!list.length) { await ns.sleep(50); if (!modals().length) return; continue; }
            if (list.length !== 1 || !expected.test(uiText(list[0]))) throw new Error('Unexpected dialog; automation paused');
            const ok = button(list[0], 'OK');
            if (!ok) throw new Error('Expected confirmation could not be closed');
            click(ok); await ns.sleep(50);
        }
        throw new Error('Confirmation did not close');
    };
    const terminal = () => menu('Terminal', () => doc.getElementById('terminal-input'));
    const command = async (text, ready, timeout = 5000) => {
        await terminal(); check();
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
    const factions = () => menu('Factions', () => doc.querySelector('.factions-joined'));
    const openFaction = async (name, page = 'Augments') => {
        await factions(); check(); click(button(card(name) ?? doc.createElement('div'), page));
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
        await menu('Augmentations', () => heading('h4', 'Augmentations'));
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
            check(); click(target);
            await wait(() => ns.getPlayer().city === destination || modals().some(m => uiText(m).includes(`travel to ${destination}?`)), 'Travel confirmation unavailable', true);
            if (ns.getPlayer().city !== destination) {
                const modal = modals().find(m => uiText(m).includes(`travel to ${destination}?`));
                check(true); click(button(modal, 'Travel'));
            }
            await wait(() => ns.getPlayer().city === destination, 'Travel did not complete', true);
            await dismiss(new RegExp(`You are now in ${destination.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}!`));
        },
        async mug() { await location('The Slums', () => button(doc, 'Mug (', true)); check(); click(button(doc, 'Mug (', true)); },
        async study() {
            const university = {'Aevum': 'Summit University', 'Sector-12': 'Rothman University', Volhaven: 'ZB Institute of Technology'}[ns.getPlayer().city];
            if (!university) throw new Error('Travel to Aevum, Sector-12 or Volhaven to study');
            await location(university, () => button(doc, 'Take Algorithms course', true));
            check(); click(button(doc, ns.getPlayer().money >= 1e6 ? 'Take Algorithms course' : 'Study Computer Science', true));
        },
        async store(kind, budget) {
            const shop = {Aevum: 'NetLink Technologies', 'Sector-12': 'Alpha Enterprises', Ishima: 'Omega Software', Volhaven: 'CompuTek'}[ns.getPlayer().city];
            if (!shop) throw new Error('Current city has no technology store');
            const label = kind === 'ram' ? "Upgrade 'home' RAM" : 'Purchase TOR router';
            await location(shop, () => button(doc, label, true));
            const control = button(doc, label, true);
            const cost = [...control.querySelectorAll('span')].map(e => uiAncestor(e, p => Number.isFinite(p?.money))?.money).find(Number.isFinite);
            if (!Number.isFinite(cost) || cost < 0 || control.disabled || cost > budget() || cost > ns.getPlayer().money) return false;
            const before = kind === 'ram' ? ns.getServer('home').maxRam : ns.hasTorRouter();
            check(); click(control);
            await wait(() => kind === 'ram' ? ns.getServer('home').maxRam > before : ns.hasTorRouter(), `${kind} purchase failed`, true);
            if (kind === 'tor') await dismiss(/You have purchased a TOR router!/);
            return true;
        },
        async joinInvitations() {
            await factions();
            for (const name of BN1_FACTIONS) {
                const join = button(card(name) ?? doc.createElement('div'), 'Join!');
                if (!join) continue;
                check(); click(join);
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
            await openFaction(faction, 'Details'); check(); click(button(doc, 'Hacking Contracts'));
        },
        async buy(row, budget) {
            await openFaction(row.faction);
            const fresh = rows(row.faction).find(r => r.name === row.name && !r.owned);
            if (!fresh || fresh.control.disabled || fresh.cost > budget() || fresh.cost > ns.getPlayer().money) return false;
            check(); click(fresh.control);
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
                        click(button(modal, 'OK')); return false;
                    }
                    throw new Error('Unexpected augmentation purchase dialog');
                }
                // NF remains purchasable, so its queue is verified by the caller as well.
                return row.name === NF || rows(row.faction).some(r => r.name === row.name && r.owned);
            }, 'Augmentation purchase did not complete', true);
            return true;
        },
        async install(verify) {
            const queued = await queue();
            if (!queued.length) throw new Error('No augmentations are queued');
            await verify(); check();
            ns.tprint('BN1: Installing augmentations. After waking up, type "run bn1-auto.js" in Terminal.');
            click(button(doc, 'Install Augmentations'));
            // With confirmation suppressed, the click terminates this script immediately.
            const modal = await wait(() => modals().find(m => uiText(m).includes('Installing will reset') && button(m, 'Confirm')),
                'Installation confirmation did not appear', true);
            await verify(); check(true); click(button(modal, 'Confirm'));
        },
    };
}
