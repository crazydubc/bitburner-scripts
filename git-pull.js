const argsSchema = [
    ['github', 'crazydubc'],
    ['repository', 'bitburner-scripts'],
    ['branch', 'main'],
    ['dry-run', false], // Preview the sync, including retired scripts, without changing any files.
    ['download', []], // By default, all supported files in the repository will be downloaded. Override with just a subset of files here
    ['new-file', [ 'hacks.js', 'dev.js', 'cheats.js', 'bn1-auto.js', 'bn1-casino.js', 'bn1-ui.js', 'bn1-policy.js', 'bin/bn1-stock.js', 'terminal-ui.js', 'donation-favor.js', 'faction-route-planner.js', 'farm-intel.js', 'bn1-guide.js', 'bin/reserve.js', 'bin/sync-script-config.js', 'progression.js', 'bin/intel-farm-state.js', 'hacking-formulas.js', 'purchase-guard.js', 'bin/purchase.js', 'bin/terminate-rpc.js', 'bin/getBackdoorTime.js', 'Tasks/backdoor-all-servers.js.backdoor-one.js', 'speedrun-policy.js', 'augmentation-reset-policy.js', 'go-policy.js', 'share-controller.js', 'bin/share-context.js', 'infiltration-policy.js', 'infiltration-ui.js', 'infiltration-soa.js', 'bin/infiltration-control.js', 'bin/infiltration-locations.js', 'bin/getStockValue.js', 'bin/getGoSnapshot.js', 'bin/go-context.js', 'bin/getHacknetPayoff.js', 'bin/run-log.js', 'bin/go-stats.js', 'bin/bribe-faction.js', 'bin/singReadMany.js']], // Include new entry points/dependencies when the repository listing is unavailable.
    ['subfolder', ''], // Can be set to download to a sub-folder that is not part of the remote repository structure
    ['extension', ['.js', '.ts', '.ns', '.txt', '.script']], // Files to download by extension
    ['omit-folder', ['Temp/', 'audit/']], // Runtime downloads exclude temporary data and repository-only regression fixtures.
    ['omit-file', ['performance-diagnostic.js', 'stock-diagnostic.js']], // Retired; do not attempt to fetch old local copies during fallback.
];

export function autocomplete(data, args) {
    data.flags(argsSchema);
    const lastFlag = args.length > 1 ? args[args.length - 2] : null;
    if (["--download", "--subfolder", "--omit-folder"].includes(lastFlag))
        return data.scripts;
    return [];
}

export function filterDownloadableFiles(files, extensions, omittedFolders, omittedFiles = []) {
    return files.map(name => name.replace(/^\/+/, '')).filter(name => extensions.some(extension => name.endsWith(extension)) &&
        !omittedFolders.some(folder => name.startsWith(trimSlash(folder) + '/')) &&
        !omittedFiles.some(file => name === file.replace(/^\/+/, '')));
}

/** @param {NS} ns */
export async function main(ns) {
    const options = ns.flags(argsSchema);
    for (const key of ['github', 'repository'])
        if (!/^[A-Za-z0-9_.-]+$/.test(options[key]) || ['.', '..'].includes(options[key]))
            return ns.tprint(`ERROR: Invalid --${key}.`);
    options.subfolder = trimSlash(options.subfolder ||
        ns.getScriptName().substring(0, ns.getScriptName().lastIndexOf('/')));
    if (options.subfolder && !safeRepoPath(options.subfolder))
        return ns.tprint('ERROR: Invalid --subfolder.');
    if ([...options.download, ...options['new-file']].some(name => !safeRepoPath(name.replace(/^\/+/, ''))))
        return ns.tprint('ERROR: Invalid --download or --new-file path.');

    const host = ns.getHostname();
    const source = `${options.github}/${options.repository}`.toLowerCase();
    const stateFolder = pathJoin(options.subfolder, `data/git-pull/${source}`);
    const manifestFile = pathJoin(stateFolder, 'manifest.json');
    const manifest = readManifest(ns, manifestFile, source, options.subfolder);
    const inventory = options.download.length ? {files: [], complete: false, ref: options.branch} : await repositoryListing(ns, host, options);
    const baseUrl = `https://raw.githubusercontent.com/${source}/${inventory.ref}/`;
    // A complete listing already contains every new file. Fallback hints must not resurrect removed files.
    const filesToDownload = [...new Set([
        ...filterDownloadableFiles(inventory.complete ? inventory.files : options.download.length ? [] : options['new-file'].concat(inventory.files),
            options.extension, options['omit-folder'], options['omit-file']),
        ...options.download.map(name => name.replace(/^\/+/, '')),
    ])];
    let failures = 0, trackingOK = manifest !== null;
    const tracked = {...manifest?.files};
    for (const relative of filesToDownload) {
        const local = pathJoin(options.subfolder, relative);
        if (options['dry-run']) { ns.print(`Would update ${local}`); continue; }
        try {
            if (!await ns.wget(`${baseUrl}${relative}?ts=${Date.now()}`, local) || !await rewriteFileForSubfolder(ns, local, options.subfolder))
                throw new Error('download or rewrite failed');
            ns.tprint(`SUCCESS: Updated "${local}" from ${baseUrl}${relative}`);
            if (trackingOK && pruneableScript(relative)) {
                try { tracked[relative] = await contentDigest(ns.read(local)); }
                catch (error) {
                    trackingOK = false;
                    ns.tprint(`WARNING: File tracking unavailable; cleanup disabled: ${String(error)}`);
                }
            }
        } catch (error) {
            failures++;
            ns.tprint(`WARNING: "${local}" was not updated: ${String(error)}`);
        }
    }
    // Journal successful downloads even on a partial pull. Retain older entries for future cleanup.
    if (!options['dry-run'] && trackingOK) {
        try {
            await writeVerified(ns, manifestFile, {version: 1, source, subfolder: options.subfolder,
                ref: inventory.ref, files: tracked});
        } catch (error) {
            trackingOK = false;
            ns.tprint(`WARNING: Could not save download history; cleanup disabled: ${String(error)}`);
        }
    }
    // A full pull is a sync: remove unchanged retired repo scripts after securing their backups.
    if (!inventory.complete || options.download.length || failures || !trackingOK) {
        ns.tprint('WARNING: Cleanup skipped: it requires a complete repository listing, a full successful pull, and valid download history.');
    } else {
        try { await pruneRetiredFiles(ns, host, source, stateFolder, inventory, tracked, baseUrl, options); }
        catch (error) { ns.tprint(`WARNING: Cleanup stopped: ${String(error)}`); }
    }
    ns.tprint(options['dry-run'] ? 'INFO: Preview complete; no files changed.' :
        `INFO: Pull complete (${failures} failed updates). Restart automation to load updated scripts.`);
}

function safeRepoPath(path) {
    return typeof path === 'string' && path.length > 0 && !path.includes('\\') &&
        !/[\x00-\x1f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..');
}

function pruneableScript(path) {
    return safeRepoPath(path) && /\.(?:js|ts|ns|script)$/.test(path) &&
        !/(?:^|\/)(?:data|Temp|audit|\.git|\.github)(?:\/|$)/i.test(path) &&
        !/\.config\./i.test(path);
}

async function contentDigest(content) {
    const bytes = new TextEncoder().encode(content);
    const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}

function readManifest(ns, path, source, subfolder) {
    const raw = ns.read(path);
    if (!raw) return {files: {}};
    try {
        const state = JSON.parse(raw);
        if (state.version !== 1 || state.source !== source || state.subfolder !== subfolder ||
            !state.files || typeof state.files !== 'object' || Array.isArray(state.files) ||
            Object.entries(state.files).some(([file, digest]) => !pruneableScript(file) || !/^[a-f0-9]{64}$/.test(digest)))
            throw new Error('invalid or differently scoped manifest');
        return state;
    } catch (error) {
        ns.tprint(`WARNING: Preserving invalid download history at ${path}; cleanup disabled: ${String(error)}`);
        return null;
    }
}

async function writeVerified(ns, path, value) {
    const text = JSON.stringify(value);
    await ns.write(path, text, 'w');
    if (ns.read(path) !== text) throw new Error(`Could not verify saved file ${path}`);
}

async function pruneRetiredFiles(ns, host, source, stateFolder, inventory, tracked, baseUrl, options) {
    let legacy = {};
    // Bootstraps old installations without assuming every local script belongs to this repo.
    if (inventory.files.includes('git-pull-retired.json')) {
        const catalog = await fetchJson(`${baseUrl}git-pull-retired.json`);
        if (catalog.version !== 1 || catalog.source !== source || !catalog.files ||
            typeof catalog.files !== 'object' || Array.isArray(catalog.files) ||
            Object.entries(catalog.files).some(([file, hashes]) => !pruneableScript(file) ||
                !Array.isArray(hashes) || hashes.some(hash => !/^[a-f0-9]{64}$/.test(hash))))
            throw new Error('Invalid retired-file catalog; no files removed');
        legacy = catalog.files;
    }
    const current = new Set(inventory.files);
    const localFiles = new Set(ns.ls(host).map(file => file.replace(/^\/+/, '')));
    const candidates = {};
    for (const relative of new Set([...Object.keys(tracked), ...Object.keys(legacy)])) {
        const local = pathJoin(options.subfolder, relative);
        if (!pruneableScript(relative) || current.has(relative) || !localFiles.has(local) ||
            local === ns.getScriptName().replace(/^\/+/, '') ||
            options['omit-folder'].some(folder => relative.startsWith(trimSlash(folder) + '/'))) continue;
        const contents = ns.read(local), digest = await contentDigest(contents);
        // A managed file must match its last download, even if an older version appears in the catalog.
        if (tracked[relative] ? digest !== tracked[relative] : !legacy[relative]?.includes(digest)) {
            ns.tprint(`KEEP: ${local} has local edits or unrecognized contents.`);
            continue;
        }
        candidates[local] = contents;
        if (options['dry-run']) ns.tprint(`WOULD REMOVE: ${local} (absent from ${inventory.ref}; backup required first).`);
    }
    const count = Object.keys(candidates).length;
    if (options['dry-run']) return ns.tprint(`INFO: Cleanup preview: ${count} unchanged retired script(s).`);
    if (!count) return ns.tprint('INFO: No unchanged retired scripts to remove.');
    const backup = pathJoin(stateFolder, `backups/${Date.now()}-${ns.pid}.json`);
    await writeVerified(ns, backup, {version: 1, source, ref: inventory.ref, files: candidates});
    let removed = 0;
    for (const [file, contents] of Object.entries(candidates)) {
        // Recheck after the asynchronous backup. Never delete a file edited while we were waiting.
        if (ns.read(file) !== contents) { ns.tprint(`KEEP: ${file} changed during cleanup.`); continue; }
        if (ns.rm(file, host)) { removed++; ns.tprint(`REMOVED: ${file}`); }
        else ns.tprint(`KEEP: ${file} could not be removed (it may be running).`);
    }
    ns.tprint(`INFO: Removed ${removed}/${count} retired scripts. Backup: ${backup}`);
}

/** Removes leading and trailing slashes from the specified string */
function trimSlash(s) {
    // Once upon a time, the game API required folders to have a leading slash
    // As of 2.3.1, not only is this no longer needed, but it can break the game.
    if (s.startsWith('/'))
        s = s.slice(1);
    if (s.endsWith('/'))
        s = s.slice(0, -1);
    return s;
}

/** Joins all arguments as components in a path, e.g. pathJoin("foo", "bar", "/baz") = "foo/bar/baz" **/
function pathJoin(...args) {
    return trimSlash(args.filter(s => !!s).join('/').replace(/\/\/+/g, '/'));
}

/** @param {NS} ns
 * Rewrites a file with path substitions to handle downloading to a subfolder. **/
export async function rewriteFileForSubfolder(ns, path, subfolder = '') {
    if (!subfolder || path.includes('git-pull.js'))
        return true;
    let contents = ns.read(path);
    // Replace subfolder reference in helpers.js getFilePath:
    contents = contents.replace(`const subfolder = ''`, `const subfolder = '${subfolder}/'`);
    // Replace any imports, which can't use getFilePath, but only if they don't specify a relative path (../)
    contents = contents.replace(/from '(\.\/)?((?!\.\.\/).*)'/g, `from '${pathJoin(subfolder, '$2')}'`);
    await ns.write(path, contents, 'w');
    return true;
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status} at ${url}`);
    return await response.json();
}

/** Pin a complete tree and its downloads to one commit. A failed/truncated listing never authorizes deletion. */
async function repositoryListing(ns, host, options) {
    const api = `https://api.github.com/repos/${options.github}/${options.repository}`;
    try {
        const commit = await fetchJson(`${api}/commits/${encodeURIComponent(options.branch)}`);
        if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Missing commit SHA');
        const listing = await fetchJson(`${api}/git/trees/${commit.sha}?recursive=1`);
        if (listing.truncated !== false || !Array.isArray(listing.tree) ||
            listing.tree.some(entry => !safeRepoPath(entry.path) || !['blob', 'tree', 'commit'].includes(entry.type)))
            throw new Error('Incomplete or invalid repository tree');
        // Retain every file's presence even when its extension or download flags exclude it.
        const files = listing.tree.filter(entry => entry.type !== 'tree').map(entry => entry.path);
        return {files, complete: true, ref: commit.sha};
    } catch (error) {
        ns.tprint(`WARNING: Repository listing unavailable; using local fallback without cleanup: ${String(error)}`);
        const prefix = options.subfolder ? options.subfolder + '/' : '';
        const files = ns.ls(host).map(file => file.replace(/^\/+/, '')).filter(file => file.startsWith(prefix))
            .map(file => file.slice(prefix.length));
        return {files, complete: false, ref: options.branch};
    }
}
