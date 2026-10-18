# Bounded infiltration and opponent-specific Go sizing

This follow-up is on `testing/bn1-go-audit` / PR #34. It supersedes the fixed 13×13 default described in the earlier October 18 follow-up. Infiltration automation is opt-in; Go uses the new adaptive mode by default unless a saved configuration specifies a fixed size.

## Infiltration

The pasted Sphyxis/Dihelvid bot and the repository's older `infiltrate.js` use the game's internal success callback. This implementation retains that completion shortcut, rather than pretending it is an official Netscript completion API. It was checked against official v3.0.1 source. A live UI/save test is still needed.

The old code left an interval alive after Netscript exited, modified `Date.prototype`, accessed unrelated control ports, and could select a success callback from elsewhere in the application. The pasted variant could invoke success twice per tick. The replacement keeps a real script alive, uses a single bounded loop, follows React ancestors only from recognized infiltration headings, and advances each currently displayed stage once. It supports all eight minigames, including the guard's `h5` instruction and both minefield phases. It does not generate keyboard events; the game penalizes synthetic keys.

Navigation follow-up: the original fixed 200 ms waits could reject a company page before React rendered it. Backdoored companies also animate their headings through `CorruptibleText`, so even an open page could fail an exact text match. Navigation now polls every 50 ms for the requested company and an enabled infiltration button, with a five-second limit per transition and checks for cancellation, the overall time budget, and intervening dialogs. Animated headings are identified through the visible heading's location props. The introduction screen gets the same five-second render allowance. Regression fixtures cover delayed City/company/intro rendering, delayed controls, animated names, both city layouts, wrong-company rejection, timeouts, and cancellation. These simulated UI checks still require confirmation in the live game.

Follow-up validation: the expanded infiltration checks, JS syntax checks, and whitespace check pass. The official RAM comparison against `9f4d1c5` reports no changes, including **5.75 GB** for the runner.

Selection:

- Wait for the current installation's verified $10 billion casino completion. Keep the existing reserve and stock rules.
- Consider companies in the current city only. No automatic travel, purchases, hospitalization, or faction joining.
- Use the game's current, BN-adjusted cash/rep quotes, reject starting difficulty ≥3.5, and check actual market demand on the introduction screen. Unknown demand declines the run. Default minimum demand is 80%.
- Prefer the faction worker's fresh augmentation/favor milestone. Corporation bribes still run first in that planner. Re-read current reputation before each run; stop spending UI time on a completed target. With no outstanding rep target, consider the configured cash goal.
- Compare the estimated reward rate with normal faction work or income. Cash comparison includes current script income and average recurring sources such as corporation, Hacknet and stock earnings; casino and infiltration payouts are excluded. Require a 50% rate advantage and enough time to finish before the alternative would close the gap.
- Estimate duration from floor count and measured company durations. Defaults: at most three runs within a two-minute planning budget, then a five-minute scheduled cooldown. `--single` completes at most one. A slow helper can delay exit; no new game starts after the budget expires.
- The faction worker acknowledges a short-lived, PID-checked pause before the runner takes the UI. It resumes after completion, termination, or lease expiry. This pauses planning, not the player's ongoing faction work.
- Defer on other work types or an occupied screen. Stop on navigation, a failed stage, unknown controls, `--stop`, or the time limit. An unclaimed completed reward remains available if its faction selector cannot be handled.

The home runner costs **5.75 GB** on the official calculator. Location quotes use a temporary **16.6 GB** helper; the coordination helper uses **1.7 GB**. Singularity reads have their normal effective SF4 cost. Autopilot and faction-worker RAM remain **4.2 / 8.5 GB**. Autopilot attempts the runner on home only, after higher-priority managers, with at least 128 GB total rooted RAM; unavailable home capacity simply defers it.

### First test in BN1.1

From Terminal, City, or a company page, after coinflip and after joining the target faction:

```text
home
run infiltrate.js --single --faction "CyberSec"
```

Substitute the faction you are actually working toward. Keep the World/City menu expanded and leave the game screen alone during the run. Both the ASCII map and the list of city locations are supported. Before SF4, check current faction reputation yourself; `--target-rep` deliberately requires Singularity. The BN1 roadmap now shows this optional command.

`--faction` is the joined faction receiving the reputation reward. `--company` is the location to infiltrate; employment and faction membership at that company are not required. For example, to infiltrate NetLink Technologies in Aevum for CyberSec reputation:

```text
run infiltrate.js --single --company "NetLink Technologies" --faction "CyberSec"
```

Omitting `--company` lets the policy choose a suitable local company. A company accidentally supplied as `--faction` now gets an explanation and the correct flag, instead of an instruction to join that company.

```text
run infiltrate.js --status
run infiltrate.js --stop
```

If a legacy `tmrAutoInf` timer is detected, the new runner stops it and asks for one game reload to discard its pending callbacks before starting. It does not touch the old shared ports. Normal runs require no reload.

### Enable selection through autopilot

Merge these keys into `autopilot.js.config.txt`, retaining your other settings:

```json
{
  "infiltration": true,
  "infiltration-money-target": 10000000000
}
```

Restart autopilot and the faction worker from home so the worker receives `--infiltration`. The scheduler does not silently restart an existing worker with different arguments. Disable the setting and use `infiltrate.js --stop` to stop automatic sessions. A manual SF4 faction worker can also be started with `--infiltration` to publish its target and cooperate with the runner.

Examples:

```text
run infiltrate.js --auto --faction "Daedalus" --target-rep 2500000 --max-runs 3 --time 120000
run infiltrate.js --single --money-target 158000000000
```

The first uses an absolute current-reputation target, not reputation to gain this invocation. The cash example can help toward the $150b corporation entry plus an $8b cushion when local infiltration beats income; it does not purchase a corporation or bypass its creation/reserve checks. For scheduled cash funding, adjust `infiltration-money-target`, then restore the normal goal after funding. An active Daedalus cash-reservation phase supplies its $100b goal automatically.

`--company "name"` restricts selection to that local company. `--min-demand`, `--time` and `--max-runs` bound manual experiments. No automatic infiltration is started during intelligence preparation or reset spending.

## Go

Yes, board size should be considered separately for each opponent. Smaller boards can produce more completed games and favor streaks per minute, but they have fewer scored nodes and komi consumes more of the board. The prior five-game samples are too small to justify declaring one size optimal for each faction. They are not used as fabricated live timings.

The new `--board-size auto` policy:

1. Starts from 13×13 for each normal opponent and measures actual full-game wall time, including game/API waits.
2. Keeps separate samples per opponent, size, strategy version, cheat configuration, and bonus-time mode. Resumed/retried games and games that cross between bonus and normal time are excluded from adaptation. Legacy totals stay readable, but do not train the new policy.
3. Requires at least 12 full games for routine promotion. Prefer sizes with ≥80% observed wins, a one-sided 90% Wilson lower bound ≥65%, and observed rate/confidence within five percentage points of the best measured candidates. Among those, choose the shortest average game. If none qualify, use the strongest measured confidence once the baseline has enough evidence, otherwise retain 13×13.
4. Collects a bounded trial only after a loss/no active winning streak, after four initial completed games, with at least eight completed games since the preceding trial. Trials are balanced among under-sampled alternatives up to 60 samples each. Illuminati tries 9, then 7, before 5. No unfamiliar size is introduced as a trial during a winning streak. Statistics write failures suspend exploration.
5. Applies changes only at completed-game boundaries. Hidden `????????????` always uses the fixed 19×19 board and still requires installed The Red Pill.

This learns conservatively; an opponent that keeps winning may remain on 13×13 for a long time. The thresholds limit experimentation, not guarantee a future win rate. This policy prioritizes reliable completion and faster games; it does not claim to maximize node power per minute or change the bot's tactical priorities.

```text
run go.js --board-size auto
run go.js --board-size 13 --opponent "Illuminati"
```

Only run one Go controller. Stop/restart the current one at a completed-game boundary. For persistent autopilot launches, merge `"board-size": "auto"` into `go.js.config.txt`; a previous fixed setting otherwise takes precedence. To disable trials while using learned selections, set `"board-exploration": false` in that config. A fixed size bypasses adaptation. Continuous fixed-size runs also collect training samples; `--runOnce` only finishes the startup board, which intentionally has no trusted full-game start time.

Results remain in `/data/go-results.json`. The `_adaptive` member holds bounded recent observations (60 per size/opponent, at most eight configuration cohorts), while the existing top-level rows retain all-time totals. Game logs explain the selected size and whether it is a baseline, trial, or measured choice. Engine win counters now distinguish a failed cheat from a genuine win even if the unfinished board score favors black.

## Verification and limits

All **17 positive checks** pass: the previous 15 plus `checks/infiltration.mjs` and `checks/go-adaptation.mjs`. New coverage executes the actual UI runner with DOM/React fixtures: all minigame headings, exact faction selection, no double advancement, repeat limits, stop/failure/navigation behavior, casino/demand gates, missing reputation APIs, pause acknowledgement, and preservation of unclaimed rewards. It also executes the Go lifecycle and result helper with per-opponent timing samples, failed-cheat counters, sample caps, corrupt-file preservation, streaks and configuration separation.

The pinned official Go engine completed all 12 smoke games (six opponents each at 5×5 and 13×13, seed base 521) with no errors. Tactical outcomes match the corresponding earlier seeds. These are regression smoke checks, not evidence of a higher live win rate. Go remains **3.5 GB**, and other existing managers retain their prior RAM costs. All changed JS/MJS parses and the whitespace check passes.

No live infiltration, augmentation install, or BN transition was performed. UI internals can change across game updates; the runner declines unknown layouts. Its actual company timings, reward throughput, and interaction with a running save need the user's testing branch run.

Primary references, read from official `bitburner-official/bitburner-src@1da7316ffd9d281b45a86c4c54ec532276557892` (v3.0.1):

- `src/NetscriptFunctions/Infiltration.ts`: quotes exclude market-demand depletion and include current multipliers.
- `src/Infiltration/Infiltration.ts`, `ui/InfiltrationRoot.tsx`, `ui/Intro.tsx`, `ui/Victory.tsx`, and all minigame views: lifecycle, event penalties, controls and exact faction choices.
- `src/Infiltration/formulas/game.ts`, `formulas/victory.ts`: difficulty cutoff, demand recovery/depletion, and rewards.
- `src/Locations/ui/City.tsx`, `CompanyLocation.tsx`, `GenericLocation.tsx`: city navigation and infiltration entry.
- `src/ui/React/CorruptibleText.tsx`: backdoor name animation that prevents reliable rendered-text matching.
- `src/Go/boardAnalysis/scoring.ts`, `effects/netscriptGoImplementation.ts`, `effects/effect.ts`: win/cheat outcomes, streak/favor rewards, bonus time and hidden board.

The supplied attachment was inspected alongside the repo's prior Sphyxis/Dihelvid-attributed script. No SphyxOS services, worker ports, or global prototype changes were imported.
