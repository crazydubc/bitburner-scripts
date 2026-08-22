export function prepareSleeveResultForPort(fn, result) {
  if (fn !== "getTask" || result === null || typeof result !== "object" || Array.isArray(result))
    return result;

  // Sleeve task API snapshots include nextCompletion, an unresolved Promise inherited from BaseWork.
  // Ports use structuredClone(), so copy the public task data and omit only that non-serializable field.
  const cloneableTask = {};
  for (const [key, value] of Object.entries(result)) {
    if (key !== "nextCompletion") cloneableTask[key] = value;
  }
  return cloneableTask;
}

/** @param {NS} ns */
export async function main(ns) {
  ns.ramOverride(5.6);
  const port = ns.getPortHandle(ns.pid);
  const [fn, ...args] = ns.args;
  let response = `ERROR:sleeve.${String(fn)} exited before returning a result`;

  ns.atExit(() => {
    try {
      port.write(response);
    } catch (error) {
      port.write(`ERROR:Unable to serialize result from sleeve.${String(fn)}: ${String(error?.stack ?? error)}`);
    }
  });

  try {
    const f = ns.sleeve?.[fn];
    if (typeof f !== "function") throw new Error(`Invalid sleeve function: ${String(fn)}`);

    response = prepareSleeveResultForPort(fn, await f(...args));
  } catch (error) {
    response = `ERROR:${String(error?.stack ?? error)}`;
  }
}
