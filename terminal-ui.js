// Bounded terminal input for BN1 automation. scan.js keeps its existing click handlers.
// The controller supplies ns.sleep, so its actions end with its Netscript process.
function controls(input) {
    const key = Object.keys(input ?? {}).find(name => name.startsWith('__reactProps$'));
    const props = key ? input[key] : null;
    if (!props || typeof props.onChange !== 'function' || typeof props.onKeyDown !== 'function')
        throw new Error('Terminal controls are unavailable; type the command manually.');
    return props;
}

export async function sendTerminalCommand(doc, command, {
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now,
    timeout = 5000, canContinue = () => true,
} = {}) {
    if (typeof command !== 'string' || !command.trim() || /[\r\n]/.test(command))
        throw new Error('Expected one nonempty terminal command line.');
    const input = doc.getElementById('terminal-input');
    if (!input || input.disabled) throw new Error('Open Terminal and wait for its current command to finish.');
    if (!canContinue()) throw new Error('Terminal command cancelled.');
    // Focus can rerender a controlled MUI input and restore its previous value.
    // Finish that transition before writing the command or reading its handlers.
    input.focus();
    const initial = controls(input), deadline = now() + timeout;
    input.value = command;
    initial.onChange({target: input, currentTarget: input, isTrusted: true});
    while (now() < deadline) {
        await sleep(25);
        if (now() >= deadline) break;
        if (!canContinue()) throw new Error('Terminal command cancelled.');
        if (doc.getElementById('terminal-input') !== input || input.disabled)
            throw new Error('Terminal changed or became busy; command was not submitted.');
        if (input.value !== command) throw new Error('Terminal input changed; command was not submitted.');
        const current = controls(input);
        // Enter reads the component's state, not the value assigned to the DOM input.
        if (current !== initial && current.value === command) {
            await current.onKeyDown({key: 'Enter', target: input, currentTarget: input,
                isTrusted: true, preventDefault() {}, stopPropagation() {}});
            return;
        }
    }
    throw new Error('Terminal did not accept the input in time; press Enter manually if the command is correct.');
}
