export function prepareSingularityResultForPort(fn, result) {
  if (fn !== "getCurrentWork" || result === null || typeof result !== "object" || Array.isArray(result))
    return result;

  // Work API snapshots include nextCompletion, an unresolved Promise inherited from PlayerBaseWork.
  // Ports use structuredClone(), so copy the public work data and omit only that non-serializable field.
  const cloneableWork = {};
  for (const [key, value] of Object.entries(result)) {
    if (key !== "nextCompletion") cloneableWork[key] = value;
  }
  return cloneableWork;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(6.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response = `ERROR:singularity.${String(fn)} exited before returning a result`;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from singularity.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const f = ns.singularity?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid singularity function: ${String(fn)}`);

    response = prepareSingularityResultForPort(fn, await f(...args));
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
