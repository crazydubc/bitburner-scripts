/** Read one board consistently, without launching a helper for each analysis array. */
export async function main(ns) {
  const port = ns.getPortHandle(ns.pid);
  let result = 'ERROR:Go snapshot unavailable';
  ns.atExit(() => port.write(result));
  try {
    result = {
      board: ns.go.getBoardState(),
      controlled: ns.go.analysis.getControlledEmptyNodes(),
      valid: ns.go.analysis.getValidMoves(),
      liberties: ns.go.analysis.getLiberties(),
      chains: ns.go.analysis.getChains(),
    };
  } catch (error) { result = `ERROR:${String(error)}`; }
}
