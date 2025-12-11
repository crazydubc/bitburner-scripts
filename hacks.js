
export async function main(ns) {
  ns.alterReality();
  Number.prototype.toExponential = function () { return null; };
  window.performance.now = function() {return 0;};
}