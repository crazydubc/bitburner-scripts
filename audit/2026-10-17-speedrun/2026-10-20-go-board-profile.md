# Fixed Go boards from the supplied results

The default is now `--board-size profile`: a fixed size for each opponent, chosen using conservative estimates of **favor rewards per minute**. Reliable wins matter because losses break the consecutive-win pair. Game duration also matters because a larger board does not increase the favor reward. The profile stops the previous automatic board experiments; `--board-size auto` remains available explicitly.

## Evidence and choices

The [unaltered supplied results](data/go-results-2026-10-20.json) contain 1,589 lifetime games, 1,532 timed games, and 479 retained full-game samples in `patterns-1:no-cheats:normal`. Comparisons below use only that cohort. Each opponent/size retains at most sixty recent games, so these are not the lifetime win totals. Resumed games and mixed bonus-time games are excluded by the recorder.

| Opponent | Fixed board | Recent wins | Mean time | Estimated rewards/min | Conservative rewards/min | Conservative 13×13 rewards/min |
| --- | --- | --- | --- | --- | --- | --- |
| Netburners | 5×5 | 6/6 | 4.9s | 6.16 | 4.25 | 0.61 |
| Slum Snakes | 5×5 | 6/6 | 8.5s | 3.51 | 2.42 | 0.39 |
| The Black Hand | 7×7 | 4/5 | 18.2s | 1.17 | 0.57 | 0.37 |
| Tetrads | 5×5 | 6/8 | 11.0s | 1.75 | 0.98 | 0.14 |
| Daedalus | 5×5 | 6/7 | 9.8s | 2.42 | 1.46 | 0.34 |
| Illuminati | 13×13 | 39/60 | 75.9s | 0.20 | 0.16 | 0.16 |

The hidden opponent stays on its mandatory 19×19 board. Its single recorded game is not a useful performance estimate.

For a win probability `p`, games take an expected `(1 + p) / p²` games to earn each two-win reward. The long-run rate is `60 / meanSeconds × p² / (1 + p)`. The conservative column substitutes the existing one-sided 90% Wilson lower bound for `p`; it is not a 90% confidence bound for the whole forecast, because duration uncertainty and changing conditions are not modeled. Rewards mean fixed reputation-equivalent additions converted directly to favor, not a constant number of favor points.

All selected small boards have only five to eight measured games. The Black Hand is particularly provisional: conservative rates for 5×5, 7×7 and 9×9 are approximately 0.46, 0.57 and 0.52 rewards/minute. Its 13×13 record is 59/60, but takes much longer. Illuminati's 5×5 record is just 2/9; although its raw rate estimate slightly exceeds 13×13, its conservative estimate is only 0.05 rewards/minute. Keep 13×13 for now.

This is a fixed testing profile, not proof of optimal boards. The source data cover ordinary speed without cheats. The same fixed sizes remain the policy under other modes, but none of these measurements are injected into runtime history or used to forecast another strategy/cheat/bonus-time cohort. Samples continue to be recorded for a later review. Stat bonuses depend separately on node power, territory and streaks; this analysis does not establish the best stat-bonus growth or BitNode completion time.

## Funded donation routes

The existing opponent policy still prioritizes a joined Go faction near donation favor when current cash above reserve can buy a useful augmentation and its needed reputation. Fresh quotes, the remaining Go reward cap, measured timing and the non-sliding fifteen-minute limit still apply.

When `--board-size auto` is explicitly selected, a funded favor route now compares all boards with at least four full games in the matching cohort. It minimizes time to the actual remaining reward count, including whether the opponent already has an odd positive streak. One more win then completes the first pair. The actual game uses the board returned by that forecast. It does not recompute a different board using the ordinary reliability-first rule. No board trials occur during the route.

For example, the supplied Black Hand results select 9×9 when one reward remains and an odd streak is already active; three remaining rewards select 7×7. A fixed `profile` or numeric size continues to be honored, including for donation routes. Missing timing never creates an invented fast unlock. Outside a funded favor route, optional `auto` retains its earlier reliability-first learning policy.

## In-game use

Pull the same testing branch, then restart Go from the updated home copy. Autopilot can relaunch it with the new default. An existing explicit `board-size` setting still overrides that default; set `"board-size": "profile"` in `go.js.config.txt` if needed, or launch with:

```text
home
run git-pull.js --branch testing/bn1-go-audit
run go.js --opponent auto --board-size profile
```

Stop the previous Go process before the final command. A restarted bot resumes the current board; the new size applies after that game finishes. The tail reports the chosen opponent, its goal and the fixed profile. The existing goal options still select crime, combat, reputation, money or hacking priorities.

Use `--board-size auto` to resume learning or `--board-size 13` to force an ordinary board size. The fixed profile ignores `board-exploration`, so it cannot silently switch into trials. Move priorities and the `patterns-1` strategy identifier are unchanged.

## Verification and sources

Three Go regression suites pass. They reproduce the profile from the uploaded cohort, independently verify consecutive-win waiting times with a probability-state recurrence, distinguish one-reward/odd-streak routes from longer routes, test sample/cohort limits and explicit overrides, and execute the actual game loop to confirm the forecast board is played only after a completed game. Existing lifecycle, hidden-opponent, timing-retention, favor-cap, cash-reserve and deadline checks pass.

```sh
node audit/2026-10-17-speedrun/checks/go-adaptation.mjs
node audit/2026-10-17-speedrun/checks/go-goals.mjs
node audit/2026-10-17-speedrun/checks/go-lifecycle.mjs
node --expose-internals audit/2026-10-17-speedrun/checks/ram-impact.mjs /path/to/bitburner-src e444ddb
```

The pinned official RAM calculator reports Go at **3.5 GB**, with no increase for existing scripts. These are offline policy and lifecycle checks; the new fixed profile has not been exercised in the user's live save.

Mechanics were verified against the local official v3.0.1 checkout, commit `1da7316ffd9d281b45a86c4c54ec532276557892`: [scoring.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Go/boardAnalysis/scoring.ts), [effect.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Go/effects/effect.ts), and [favor.ts](https://github.com/bitburner-official/bitburner-src/blob/1da7316ffd9d281b45a86c4c54ec532276557892/src/Faction/formulas/favor.ts). A joined faction receives `getMaxRep()/200` reputation-equivalent favor on every even positive win streak until its Go reward cap is reached. Board size does not enter that reward calculation. It does affect separate node-power rewards, including Illuminati's special 5×5 multiplier.
