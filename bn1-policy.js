// Progression and launch policy for the first-BN1 UI controller.
export const BN1_SESSION = '__bitburnerBn1Cycle';
export const BN1_FACTIONS = ['CyberSec', 'Sector-12', 'NiteSec', 'The Black Hand', 'BitRunners', 'Tian Di Hui', 'Daedalus'];
export const BN1_SERVERS = [['CSEC', 'CyberSec'], ['avmnite-02h', 'NiteSec'], ['I.I.I.I', 'The Black Hand'], ['run4theh111z', 'BitRunners']];
export const NF = 'NeuroFlux Governor';
export function firstBn1(reset) {
    return reset.currentNode === 1 && reset.ownedSF instanceof Map && !reset.ownedSF.has(1) && !reset.ownedSF.has(4);
}
export function bn1Paused(reset, session = globalThis['window']?.[BN1_SESSION]) {
    return !!session && (session.paused || session.handoff > Date.now()) &&
        session.lastAugReset === reset.lastAugReset && session.lastNodeReset === reset.lastNodeReset;
}

/** UI prices are rounded. Use the upper rounding boundary, never a lower spending estimate. */
export function displayedNumber(value) {
    const match = String(value).trim().replace(/^\$/, '').replace(/\s+rep$/, '')
        .match(/^(\d+(?:,\d{3})*(?:\.\d+)?)([kmbtqQsSon]?|[eE][+-]?\d+)$/);
    if (!match) throw new Error(`Unsupported UI number: ${value}`);
    const mantissa = Number(match[1].replaceAll(',', ''));
    const suffix = match[2], scale = /^[eE]/.test(suffix) ? 10 ** Number(suffix.slice(1))
        : ({'': 1, k: 1e3, m: 1e6, b: 1e9, t: 1e12, q: 1e15, Q: 1e18, s: 1e21, S: 1e24, o: 1e27, n: 1e30})[suffix];
    const places = match[1].split('.')[1]?.length ?? 0;
    const upper = mantissa === 0 ? 0 : (mantissa + 0.5 * 10 ** -places) * scale;
    if (!Number.isFinite(upper) || upper < 0) throw new Error('Invalid UI price');
    return upper;
}
export function augmentationValue(row, needsCount) {
    if (row.name === 'The Red Pill') return 100;
    if (row.name === 'CashRoot Starter Kit') return 5;
    if (row.name === 'Neuroreceptor Management Implant') return 4;
    if (row.name === NF) return 0.15; // Every level helps; never use NF levels as a batch-count trigger.
    return (needsCount ? 0.25 : 0) + (/hacking|faction reputation|reputation from|faction rep/i.test(row.description ?? '') ? 1 : 0);
}

/** One copy per augmentation, selecting the faction closest to its reputation requirement. */
export function planBn1Augmentations({rows, installed, queued, money, reputation}) {
    const owned = new Set([...installed, ...queued.map(q => q.name)]), needsCount = owned.size < 30;
    const unique = new Map();
    for (const row of rows) {
        if (row.owned || (row.name !== NF && owned.has(row.name)) || row.name.startsWith('SoA - ')) continue;
        if (![row.cost, row.rep].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Invalid augmentation quote');
        if (row.missingPrereqs) continue;
        const utility = augmentationValue(row, needsCount);
        if (!utility) continue;
        if (!Number.isFinite(reputation[row.faction])) throw new Error('Faction reputation unavailable');
        const old = unique.get(row.name), gap = row.repMet ? 0 : Math.max(0, row.rep - reputation[row.faction]);
        if (!old || gap < old.gap || (gap === old.gap && row.cost < old.cost)) unique.set(row.name, {...row, utility, gap});
    }
    const candidates = [...unique.values()];
    // Reserve NF until ordinary purchases are complete so it cannot inflate better upgrades.
    const ready = candidates.filter(r => r.gap === 0 && r.name !== NF).sort((a, b) => b.cost - a.cost);
    const bundle = []; let spent = 0;
    for (const row of ready) {
        const cost = row.cost * 1.9 ** bundle.length;
        if (spent + cost <= money) { bundle.push(row); spent += cost; }
    }
    const nf = candidates.find(r => r.name === NF && r.gap === 0);
    if (nf && spent + nf.cost * 1.9 ** bundle.length <= money) bundle.push(nf);
    const queuedUtility = queued.reduce((sum, q) => sum + (q.name === NF ? 0.15 * q.levels
        : q.name === 'SoA - phyzical WKS harmonizer' ? 5
        : augmentationValue(rows.find(r => r.name === q.name) ?? q, needsCount)), 0);
    const readyUtility = queuedUtility + bundle.reduce((sum, row) => sum + row.utility, 0);
    const goals = candidates.filter(r => !bundle.some(b => b.name === r.name)).map(r => ({
        key: r.name, label: r.name, faction: r.faction, rep: r.repMet ? reputation[r.faction] : r.rep, money: r.cost, utility: r.utility,
    }));
    const target = candidates.filter(r => r.gap > 0).sort((a, b) =>
        (b.name === 'The Red Pill') - (a.name === 'The Red Pill') || a.gap / a.utility - b.gap / b.utility)[0] ?? null;
    return {bundle, goals, target, readyUtility};
}
