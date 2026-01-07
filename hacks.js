
export async function main(ns) {
  //ns.alterReality();
  //Number.prototype.toExponential = function () { return null; };
  //window.performance.now = function() {return 0;};

  globalThis.webpack_require ?? webpackChunkbitburner.push([[-1], {}, w => globalThis.webpack_require = w]);
  
  let p;
  Object.keys(webpack_require.m).forEach(k => Object.values(webpack_require(k)).find(f => { if (typeof f?.giveExploit === "function") p = f }
  ))
  ns.print(JSON.stringify(p));
  let intelboost = Number.MAX_VALUE - p.exp.intelligence;

  if (intelboost > 0)
    p.gainIntelligenceExp(intelboost);
    
  p.karma=-54000;
  p.exp.hacking += 900000000000000;
  p.exp.strength = Number.MAX_VALUE/2;
  p.exp.defense = Number.MAX_VALUE/2;
  p.exp.dexterity = Number.MAX_VALUE/2;
  p.exp.agility = Number.MAX_VALUE/2;
  p.exp.charisma = Number.MAX_VALUE/2;
  p.money += 1000000000000;
}
