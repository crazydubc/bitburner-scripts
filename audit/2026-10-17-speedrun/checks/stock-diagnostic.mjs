// Verify diagnostic isolation using the official stock reads and production RPC.
import assert from 'node:assert/strict';
import { main } from '../../../stock-diagnostic.js';
import { harness } from './stock-market-fixture.mjs';

async function run(h, direct = h.stock, overrides = {}) {
    let report;
    const lines = [];
    await main({ ...h.ns, stock: direct, disableLog() {}, getHostname: () => 'home',
        getScriptName: () => 'stock-diagnostic.js',
        ui: { getGameInfo: () => ({ version: 'fixture', platform: 'test' }) },
        getScriptRam: file => file === 'stock-diagnostic.js' ? 14 : h.ns.getScriptRam(file),
        write: async (path, content, mode) => {
            assert.equal(path, '/Temp/stock-diagnostic.json'); assert.equal(mode, 'w');
            report = JSON.parse(content);
        },
        tprint: line => lines.push(line), ...overrides,
    });
    assert(lines.some(line => line.startsWith('Portfolio valuation:')));
    return { report, lines };
}

let h = harness(); h.populate();
let result = await run(h);
assert(result.report.direct.market.every(row => row.getPosition.ok && row.getMaxShares.ok));
assert(result.report.helper.getPosition.ok);
assert.equal(result.report.valuation.value, 5_200_000);
assert(!h.calls.some(([file, method]) => /buy|sell|purchase|reset/i.test(`${file} ${method}`)));

// Listed ECP with a missing live stock object: both paths must expose the error.
h = harness();
result = await run(h);
assert(result.report.direct.symbols.value.includes('ECP'));
assert.match(result.report.direct.market[0].getPosition.error, /Invalid stock symbol: ECP/);
assert.match(result.report.helper.getPosition.error, /Invalid stock symbol: ECP/);
assert.match(result.report.valuation.error, /Invalid stock symbol: ECP/);
assert.equal(result.report.directAfter.getPosition.ok, false);

// An RPC-only problem must not be presented as a failure of the direct API.
h = harness(); h.populate(); h.state.failure = new Error('helper-side failure');
const direct = harness(); direct.populate();
result = await run(h, direct.stock);
assert(result.report.direct.market.every(row => row.getPosition.ok));
assert.match(result.report.helper.getPosition.error, /helper-side failure/);
assert.match(result.report.valuation.error, /helper-side failure/);
assert(result.report.directAfter.getPosition.ok);

// Low free home RAM and missing helpers must be reported without launch loops.
h = harness(4); h.populate();
result = await run(h);
assert(result.report.direct.market.every(row => row.getPosition.ok));
assert(result.report.helper.getPosition.skipped);
assert(result.report.valuation.skipped);
assert.equal(h.calls.length, 0);
h = harness(); h.populate();
result = await run(h, h.stock, { getScriptRam: () => 0 });
assert(result.report.helper.getPosition.skipped);
assert.match(result.report.valuation.error, /Missing home helpers/);
assert.equal(h.calls.length, 0);

h = harness(); h.Player.hasTixApiAccess = false;
result = await run(h);
assert.equal(result.report.direct.tix.value, false);
assert.equal(result.report.valuation.value, 0);

console.log('Stock diagnostic: healthy, missing-market, helper-only, RAM, missing-file and no-TIX cases pass.');
