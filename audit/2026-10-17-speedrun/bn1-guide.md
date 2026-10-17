# Fresh BN1.1: practical operating instructions

**On-screen version:** the combined `testing/bn1-go-audit` branch provides live prompts in `bn1-guide.js`. Start with `run bn1-guide.js`; this document remains the detailed reference behind the prompts. See [bn1-screen-guide.md](bn1-screen-guide.md) for automatic startup and panel options.

This guide targets the audited scripts and game 3.0.1 mechanics. A fresh BN1.1 has **no Singularity API**. Hacking, rooting, server buying, and contracts can be scripted; buying home upgrades, faction work, augmentation purchases/installation, and the final transition still need manual input. A later BN1 with SF4.3 can automate those actions.

The testing branch includes focused repairs and guidance; the remaining audit findings still need work. The startup steps below are a conservative operating procedure, not a measured world-record route.

## 1. Install on home

Export a save and preserve any locally edited scripts before updating. In the game terminal:

```text
home
wget https://raw.githubusercontent.com/crazydubc/bitburner-scripts/main/git-pull.js git-pull.js
run git-pull.js --branch testing/bn1-go-audit
run bn1-guide.js
```

Wait for the pull to finish and inspect failures before starting the guide. The testing branch fixes the `farm-intel.js` fallback filename and includes the guide. A failed repository listing still needs attention because its fallback may miss dependencies. Install at the home root: several helpers use root-relative assumptions.

## 2. Finish the casino bootstrap before allowing stock buying

On the current code, avoid starting the entire autopilot stack on an 8 GB home. Nested home helpers can exceed that capacity and wait forever (B01).

1. Get roughly $250k through short manual crimes such as shoplifting/mugging at the Slums. Choose an action you can complete reliably; the objective is $200k travel plus a betting cushion.
2. Travel to Aevum manually. This also avoids relying on the coinflipper's brittle travel UI handling.
3. From the terminal, run:

   ```text
   run coinflip.js
   ```

4. Let it navigate the casino and collect its 1,024 observations. Keep the game available while it operates the UI.
5. **Wait for the actual $10 billion casino-success message.** “You can do something else now” means sampling has ended; the earning loop is still running. Process exit, port 40, and a large balance alone are not reliable completion signals.

Keep your intentional **$8 billion reserve**. Do not launch stock buying early or set the reserve to zero as a bootstrap optimization. In the present implementation, remote processes can miss that file (B02); finishing coinflip before launching the rest of the stack is the straightforward manual workaround. Casino completion is checked per augmentation installation, so revisit this step after an installation when appropriate.

If the UI changes and the coinflipper stops making progress, inspect its log. Its current DOM selectors are version-sensitive; there is no audited guaranteed completion time.

## 3. Buy enough home RAM and open the network

Use a computer store to upgrade home RAM to **at least 64 GB; 128 GB gives more helper headroom**. This is a workaround for current helper concurrency, not a proof that 64/128 GB is the economic optimum. Home RAM survives augmentation installations within a BN.

Purchase the TOR router for $200k at an appropriate technology store, then buy the five port crackers individually:

```text
home
buy BruteSSH.exe
buy FTPCrack.exe
buy relaySMTP.exe
buy HTTPWorm.exe
buy SQLInject.exe
run Tasks/crack-host.js
```

The five programs total $287m at the reference prices. `buy -a` also purchases expensive optional programs, including the $5b Formulas.exe; the suite has fallback calculations and does not require spending half the casino proceeds on Formulas in BN1.1. SF5 will later supply it.

The testing branch fixes B03's cracker detection. You can also run `Tasks/crack-host.js` after each new cracker purchase. Root access provides worker RAM even on servers whose hacking requirement is still too high to earn from.

Rerun the guide; it keeps the manager running and restarts it whenever at least 48 GB is free on a 64+ GB home:

```text
run bn1-guide.js
```

Check Active Scripts and the autopilot/kernel logs. You want a live income process, advancing preparation, and no repeating “unable to launch” messages. The testing branch fixes B04's cloud purchase budget; monitor reserve behavior because B02's remote state transport remains open. If a helper stalls, inspect home RAM and the child process before restarting; repeated blind restarts do not repair the underlying wait.

Buy `DarkscapeNavigator.exe` for $50m through TOR after the casino. Alternatively, visit Chongqing > Shadowed Walkway and buy it for $30m; this also grants TOR. Autopilot then starts `darknet.js` when home has space. Darknet phishing trains Charisma, which helps Field Work reputation in BN1.1. At Sector-12, The Black Hand, and Daedalus, compare Field Work and Hacking Contracts and choose the higher displayed rep/sec. CyberSec, NiteSec, and BitRunners only offer hacking work. Visiting Chongqing does not join its city faction.

## 4. Work toward useful augmentation bundles

For the on-screen faction route, access requirements, work instructions, and example targets, enter `run bn1-guide.js --roadmap`. It opens a reference panel alongside the normal next-action guide.

Use Algorithms study when hacking skill is the next blocker. Once faction access is available, work for the faction whose next useful augmentation or prerequisite gives the best near-term improvement. Let the batcher earn in parallel.

With the terminal visible, run:

```text
run scan.js
```

Use its connection/backdoor links. Backdoor these faction servers as their **displayed** hacking and port requirements become available, then accept the invitations:

| Server | Faction | Required open ports |
| --- | --- | --- |
| `CSEC` | CyberSec | 1 |
| `avmnite-02h` | NiteSec | 2 |
| `I.I.I.I` | The Black Hand | 3 |
| `run4theh111z` | BitRunners | 4 |

Their hacking requirements are randomized within ranges; CSEC, for example, is 51–60 in the reference data. Do not wait on a guide's rounded “50” when the actual server needs more.

Two useful optional faction stops:

- **Sector-12:** be in the city with $15m to obtain the invitation. CashRoot Starter Kit costs 12.5k reputation and $125m base; after installing it, future augmentation resets start with $1m and BruteSSH. This reduces repeated startup work and is also part of the later intelligence-farm prerequisite plan.
- **Tian Di Hui:** hacking 50, $1m, and presence in Chongqing, New Tokyo, or Ishima. This faction itself does not impose city-faction exclusions. Visiting those cities is fine; accepting their *city faction* invitations conflicts with Sector-12/Aevum. Keep the western city faction path available while obtaining CashRoot.

Favor hacking skill/experience, hacking income/growth/speed, and faction reputation upgrades that advance your next milestone. Cheap examples are CyberSec's Neurotrainer I (1k rep, $4m base) and BitWire (3.75k rep, $10m base). Neuroreceptor Management from Tian Di Hui costs 75k rep/$550m base and removes the unfocused-work penalty; it is much more attractive for an unattended run than for a run where you keep work focused. Do not make every optional augmentation a mandatory detour.

## 5. Install when the next cycle is worth more than waiting

Purchase the expensive desired augmentations first where prerequisites allow. Each purchase inflates subsequent prices; prerequisites may force a different order. Buy NeuroFlux with leftovers after the useful bundle. Repeated NeuroFlux levels do not provide multiple distinct augmentations toward Daedalus.

A good installation decision compares:

- time until the next useful augmentation/prerequisite;
- improvement from installing the already-affordable bundle;
- time to recover faction access, income, and working reputation afterward;
- whether the reset unlocks a meaningful donation-favor threshold or required installed-augmentation count.

The script's four-hour cap is a fallback, not a recommended waiting period. Avoid delaying a productive reset solely because cheap NeuroFlux levels continue appearing.

Before final purchases or a manual installation, enter `run bn1-guide.js --install` to open the on-screen checklist. Leave autopilot running. On home, enter `run stockmaster.js --liquidate`, wait for the sale summary, and verify zero stock positions in the Stock Market screen. The liquidator stays running without buying, preventing autopilot from restarting normal stock trading. If TIX API access is unavailable, sell manually while the liquidator keeps trading paused. Leave the liquidator running until installation, and pause competing spending scripts if needed while buying the bundle. To cancel, stop only the liquidating stockmaster process and let autopilot resume trading when eligible.

Then spend appropriate leftover money on home RAM, then cores when useful. Home upgrades persist across augmentation installations; ordinary purchased servers and hacknet investments do not. Use the augmentation UI to install in fresh BN1.1; `ascend.js` assumes APIs you do not yet possess and currently has missing reset helpers (B07/B11).

After installation, run `bn1-guide.js` again. On a 64+ GB home with 48 GB free, it starts autopilot and checks every five seconds to restart it if it exits. Autopilot reuses an existing coinflipper or starts one when missing. CashRoot and retained home RAM make this much shorter than the first cycle. Use `--manual` or stop the normal guide if you want to keep autopilot stopped; old cycle markers no longer affect startup.

## 6. Finish BN1

For the hacking route, Daedalus requires **30 distinct installed augmentations, $100b cash, and hacking 2,500** in BN1. The alternative skill condition is 1,500 in all four combat stats. Check actual requirements if using this guide in another BN.

Hold cash until the invitation arrives; stock portfolio value is not cash. Use the persistent liquidation command when you need portfolio value converted to cash, then join Daedalus manually in BN1.1. The testing branch also enforces autopilot's temporary Daedalus stop flag for later runs with automatic joining; B02's remote reserve-file transport issue remains open.

Earn Daedalus reputation for The Red Pill (2.5m rep, $0 base), purchase and install it. Donation access at 150 favor in BN1 can shorten this grind **if** the next cycle can actually fund the needed donation. Favor is awarded on installation; resetting for favor without a funding plan can lose time.

After The Red Pill installation, reach the world daemon's displayed hacking requirement (3,000 in ordinary BN1), open its five ports, root it, connect, and perform the final hack/backdoor interaction. Use `scan.js` to find the route. Make the first manual transition to **BN4** for the agreed automation-first progression.

## Quick diagnosis

| Symptom | First check |
| --- | --- |
| Startup appears frozen | Home RAM and the awaited helper PID; B01 |
| New cracker did not expand workers | Run `Tasks/crack-host.js`; B03 |
| Trader starts before casino is done | Host-local reserve and completion signal; B02 |
| Cash disappears despite a reserve | Remote reserve-file transport (B02); verify B04's budget fix is loaded |
| A faction backdoor never appears | Actual required hacking level, root access, and manual backdoor completion |
| Reset seems unusually slow or never finishes | Missing reset helpers / truthy RPC errors; B07/B11 |

Once the main loop is stable and RAM is available, `run go.js --runOnce --disable-cheats` is a useful optional experiment for early passive bonuses. Compare time to the next augmentation with and without it. The current 2 TB total-network gate is a policy choice, not a mechanic requiring SF14 or 2 TB to play Go.

Mechanics and prices above are from the pinned primary sources in [sources.md](sources.md); displayed in-game prices and requirements take precedence when versions or multipliers differ.
