import { getStocksValue, stockRun } from './utils.js';

/** One-shot, read-only comparison of direct stock reads and the production helpers.
 * Run on home after pulling the testing branch. Prints a compact report and saves
 * the full results locally; never buys, sells, resets, or changes market state.
 * @param {NS} ns */
export async function main(ns) {
    ns.disableLog('ALL');
    const capture = async read => {
        try { return { ok: true, value: await read() }; }
        catch (error) { return { ok: false, error: String(error?.message ?? error) }; }
    };
    const ram = host => {
        const max = ns.getServerMaxRam(host), used = ns.getServerUsedRam(host);
        return { max, used, free: Math.max(0, max - used) };
    };
    const report = {
        diagnosticVersion: 1, timestamp: new Date().toISOString(), host: ns.getHostname(),
        game: await capture(() => ns.ui.getGameInfo()),
        ram: { home: ram('home'), runningHost: ram(ns.getHostname()), script: ns.getScriptRam(ns.getScriptName()) },
        helperRam: Object.fromEntries(['bin/stockRun.js', 'bin/getStockValue.js', 'bin/hasTixApi.js', 'bin/getServerAvailRam.js']
            .map(file => [file, ns.getScriptRam(file, 'home')])),
        direct: {}, helper: {},
    };
    report.direct.tix = await capture(() => ns.stock.hasTixApiAccess());
    report.direct.wse = await capture(() => ns.stock.hasWseAccount());
    report.direct.symbols = await capture(() => ns.stock.getSymbols());
    const listed = report.direct.symbols.ok && Array.isArray(report.direct.symbols.value)
        ? report.direct.symbols.value.filter(symbol => typeof symbol === 'string') : [];
    // ECP is also probed when symbol enumeration fails, to keep the report useful.
    const symbols = [...new Set([...listed, 'ECP'])];
    const reads = {
        getPosition: symbol => ns.stock.getPosition(symbol),
        getMaxShares: symbol => ns.stock.getMaxShares(symbol),
        getBidPrice: symbol => ns.stock.getBidPrice(symbol),
        getAskPrice: symbol => ns.stock.getAskPrice(symbol),
    };
    report.direct.market = [];
    for (const symbol of symbols) {
        const row = { symbol };
        for (const [method, read] of Object.entries(reads)) row[method] = await capture(() => read(symbol));
        report.direct.market.push(row);
    }

    // Do not wait for repeated launches if RAM is already exhausted.
    // This snapshot includes this diagnostic's own RAM; no processes are stopped.
    const helperProbe = async (file, required, read) => {
        const free = ram('home').free;
        if (!(report.helperRam[file] > 0)) return { ok: false, skipped: true, error: `${file} is missing or invalid on home` };
        if (free < required) return { ok: false, skipped: true, error: `Needs ${required} GB on home; ${free} GB free (diagnostic is running)` };
        return capture(read);
    };
    for (const method of ['hasTixApiAccess', 'getSymbols', ...Object.keys(reads)]) {
        const args = method in reads ? ['ECP'] : [];
        const required = Math.max(report.helperRam['bin/stockRun.js'], 5.6,
            ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`stock.${method}`));
        report.helper[method] = await helperProbe('bin/stockRun.js', required, () => stockRun(ns, method, ...args));
    }
    // The real valuation path may choose the snapshot or smaller per-call helpers.
    const missing = ['bin/hasTixApi.js', 'bin/getServerAvailRam.js', 'bin/stockRun.js']
        .filter(file => !(report.helperRam[file] > 0));
    const valuationRam = Math.max(5.6, report.helperRam['bin/hasTixApi.js'], report.helperRam['bin/getServerAvailRam.js'],
        report.helperRam['bin/stockRun.js'], ...['getSymbols', 'getPosition', 'getBidPrice', 'getAskPrice']
            .map(method => ns.getFunctionRamCost('baseCost') + ns.getFunctionRamCost(`stock.${method}`)));
    report.valuation = missing.length
        ? { ok: false, skipped: true, error: `Missing home helpers: ${missing.join(', ')}` }
        : await helperProbe('bin/stockRun.js', valuationRam, () => getStocksValue(ns));

    // Read ECP again after RPCs: a recovery/change during the run must be visible.
    report.directAfter = {};
    for (const [method, read] of Object.entries(reads)) report.directAfter[method] = await capture(() => read('ECP'));
    report.ramAfter = ram('home');
    const path = '/Temp/stock-diagnostic.json';
    const saved = await capture(() => ns.write(path, JSON.stringify(report, null, 2), 'w'));
    const describe = result => result.ok ? JSON.stringify(result.value)
        : `${result.skipped ? 'SKIPPED' : 'ERROR'}: ${result.error.replace(/\s+/g, ' ').slice(0, 450)}`;
    ns.tprint(`Stock diagnostic v${report.diagnosticVersion} | ${report.timestamp} | ${report.host}`);
    ns.tprint(`Game: ${describe(report.game)}`);
    ns.tprint(`RAM GB: ${JSON.stringify(report.ram)} (includes diagnostic); home helpers: ${JSON.stringify(report.helperRam)}`);
    ns.tprint(`Direct access: TIX ${describe(report.direct.tix)}, WSE ${describe(report.direct.wse)}`);
    ns.tprint(`Direct symbols: ${describe(report.direct.symbols)}`);
    for (const method of Object.keys(reads)) {
        const failed = report.direct.market.filter(row => !row[method].ok);
        const example = failed[0];
        ns.tprint(`Direct ${method}: ${symbols.length - failed.length}/${symbols.length} readable` +
            (example ? `; first failure ${JSON.stringify(example.symbol)}: ${describe(example[method])}` : ''));
    }
    for (const [method, result] of Object.entries(report.helper)) ns.tprint(`Helper ${method}${method in reads ? '(ECP)' : ''}: ${describe(result)}`);
    ns.tprint(`Portfolio valuation: ${describe(report.valuation)}`);
    for (const [method, result] of Object.entries(report.directAfter)) ns.tprint(`Direct after helpers ${method}(ECP): ${describe(result)}`);
    ns.tprint(saved.ok ? `Full report saved to ${path} on ${report.host}. Paste the terminal report for diagnosis.`
        : `Report could not be saved: ${describe(saved)}. Paste the terminal report for diagnosis.`);
}
