// Installation needs actual share counts; a zero net valuation is not proof of an empty portfolio.
export function main(ns) {
    let result = {known: false, reason: 'Stock verification helper exited'};
    const port = ns.getPortHandle(ns.pid); ns.atExit(() => port.write(result));
    try {
        if (!ns.stock.hasWSEAccount()) { result = {known: true, shares: 0, value: 0}; return; }
        if (!ns.stock.hasTixApiAccess()) { result.reason = 'TIX required to verify manually held stocks'; return; }
        const symbols = ns.stock.getSymbols();
        if (!Array.isArray(symbols) || !symbols.length) throw new Error('Stock symbols unavailable');
        let shares = 0, value = 0;
        for (const symbol of symbols) {
            const position = ns.stock.getPosition(symbol);
            if (!Array.isArray(position) || position.length !== 4 || !position.every(n => Number.isFinite(n) && n >= 0)) throw new Error('Invalid stock position');
            const [long, , short, shortCost] = position; shares += long + short;
            if (long) value += long * ns.stock.getBidPrice(symbol) - 100_000;
            if (short) value += short * (2 * shortCost - ns.stock.getAskPrice(symbol)) - 100_000;
        }
        if (!Number.isFinite(value)) throw new Error('Invalid valuation');
        result = {known: true, shares, value};
    } catch (error) { result = {known: false, reason: String(error)}; }
}
