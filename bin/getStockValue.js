/** One synchronous market snapshot, with quotes only for positions we actually own. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Stock valuation exited before returning a result';
  ns.atExit(() => port.write(result));
  try {
    let value = 0;
    if (ns.stock.hasTixApiAccess()) {
      const symbols = ns.stock.getSymbols();
      if (!Array.isArray(symbols)) throw new Error('Invalid stock symbols');
      for (const symbol of symbols) {
        const position = ns.stock.getPosition(symbol);
        if (!Array.isArray(position) || position.length !== 4 || !position.every(Number.isFinite))
          throw new Error(`Invalid position for ${symbol}`);
        const [long, , short, shortPrice] = position;
        if (long > 0) value += long * ns.stock.getBidPrice(symbol) - 100_000;
        if (short > 0) value += short * (2 * shortPrice - ns.stock.getAskPrice(symbol)) - 100_000;
      }
    }
    if (!Number.isFinite(value)) throw new Error('Non-finite stock valuation');
    result = value;
  } catch (error) {
    result = `ERROR:${String(error)}`;
  }
}
