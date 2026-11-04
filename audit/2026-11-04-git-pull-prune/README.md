# Default repository sync — November 4, 2026

Every successful full `git-pull.js` run now downloads current scripts **and removes unchanged retired repo scripts automatically**. No cleanup flag is needed. This is scoped to the host and deployment folder running the updater.

## Usage

Use your usual pull command:

```text
run git-pull.js --branch testing/bn1-go-audit
```

The first run with an older updater downloads the new updater. **Run the same command again** to apply its cleanup behavior; a running script does not replace its own executing code after downloading an update.

For an optional preview with no downloads, writes or removals:

```text
run git-pull.js --branch testing/bn1-go-audit --dry-run
```

The preview prints proposed removals in the terminal and downloads in the script log. This preview is optional; a normal pull performs the sync directly.

## What cleanup removes and preserves

A deleted repo script is removed only when its contents match either the last version downloaded by this updater or an exact historical version from this repo. The migration catalog recognizes 38 retired runtime paths across 647 historical versions, including `dev.js` and `hacks.js`. Future deletions are tracked automatically without regenerating that catalog.

Cleanup preserves:

- Unknown personal scripts and locally modified retired scripts.
- Configs, results, reserves, programs, contracts, and other game data; only recognized runtime script extensions are eligible.
- Files in `data/`, `Temp/`, `audit/`, `.git/`, `.github/`, or folders excluded by the user's download settings.
- Files still present anywhere in the repository, even when excluded from downloading. Optional diagnostics remain available and are not considered retired.
- Running scripts and the updater itself. The game's native removal API refuses running scripts; cleanup does not stop automation. A later pull can remove them after they stop.
- Files on other hosts or outside the selected deployment folder.

Normal downloads still update existing repo files as before. The local-edit protection described above applies to **removing retired scripts**, not to overwriting current repo files during an update.

Download history is saved to `data/git-pull/crazydubc/bitburner-scripts/manifest.json`. A deployment subfolder is also prepended to this path when used. Before removing files, the updater saves their exact contents to `data/git-pull/crazydubc/bitburner-scripts/backups/<timestamp>-<pid>.json`, reads the backup back to verify it, and prints its path. Each backup's `files` object maps original local filenames to their original source text for manual recovery.

An unrecognized legacy file is kept rather than guessed to be repo-owned. This includes historical subfolder copies whose imports were rewritten and therefore do not match the original historical fingerprints. Newly downloaded subfolder copies are tracked after rewriting and can be cleaned up normally.

## Failure behavior

A complete recursive tree and all downloads are pinned to one commit. A failed/truncated listing, any failed download, invalid download history, unavailable content hashing, or a failed backup prevents cleanup. A failed migration-catalog read also prevents deletion. The ordinary local-list fallback still updates files when possible, but never deletes them. Explicit `--download` requests remain partial updates and do not trigger cleanup or unrelated fallback downloads.

A full successful pull records its successful script downloads; successful files from a partially failed pull are also journaled for future runs. Invalid existing history is preserved rather than overwritten. Each candidate is checked again after the backup, immediately before removal, so an edit made during the backup is retained. Use one updater at a time for a deployment.

## Validation

The cleanup fixtures execute the actual downloader and the official engine's running-file removal check. They cover default sync with no cleanup flag, old installations, backups, dry runs, edited/running/personal/data files, listing and download failures, corrupted history, backup failures, edits during backup, explicit partial downloads, omitted diagnostics, and subfolder/remote-host scoping.

The existing full-audit integration and sharing regressions also pass. The official RAM calculator measures `git-pull.js` at **2.45 GB**, previously **1.80 GB**. The extra 0.65 GB is charged only while the updater runs. No automation manager, batcher, or worker is changed by this patch.

```sh
node audit/2026-11-04-git-pull-prune/checks/git-pull-prune.mjs ../bitburner-engine
node audit/2026-11-04-full-audit/checks/full-audit.mjs ../bitburner-engine
node audit/2026-10-17-speedrun/checks/share-allocation.mjs
AUDIT_RAM_TARGETS=git-pull.js node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs ../bitburner-engine 65a7018
```

Validation uses official engine commit `1da7316ffd9d281b45a86c4c54ec532276557892`. Results are in `validation.json`. The catalog builder is repository-only tooling under excluded `audit/`; the updater fetches the small JSON catalog directly and adds no runtime dependency or background process. No live game save was changed during verification.
