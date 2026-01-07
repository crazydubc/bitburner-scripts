
export async function main(ns) {
  //ns.alterReality();
  //Number.prototype.toExponential = function () { return null; };
  //window.performance.now = function() {return 0;};

  globalThis.webpack_require ?? webpackChunkbitburner.push([[-1], {}, w => globalThis.webpack_require = w]);
  //Object.keys(webpack_require.m).forEach(k => Object.values(webpack_require(k)).forEach(p => p?.toPage?.('Dev')));
  let p;
  Object.keys(webpack_require.m).forEach(k => Object.values(webpack_require(k)).find(f => { if (typeof f?.giveExploit === "function") p = f }
  ))
  ns.print(JSON.stringify(p));
  let intelboost = Number.MAX_VALUE - p.exp.intelligence;

  if (intelboost > 0)
    p.gainIntelligenceExp(intelboost);
    
  p.karma=-54000;
  p.exp.hacking += 9000000000;
  p.exp.strength += 9000000000;
  p.exp.defense += 9000000000;
  p.exp.dexterity += 9000000000;
  p.exp.agility += 9000000000;
  p.exp.charisma += 9000000000;
  p.money += 10000000000;
}
