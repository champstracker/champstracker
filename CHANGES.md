# CHANGES

## 2026-07-05
- fix: shipped R16/QF/SF auto-advance from `koResults` plus a WCSW knockout-elimination check
  (`394240b`) — reverted same night (`43cf4b3`) after production showed fabricated results (teams
  appearing in bracket slots for matches that hadn't been decided). Root cause was a separate,
  pre-existing bug (see next entry), not the auto-advance logic itself.
- fix: group-stage stats were leaking knockout-round results into group standings, because
  `computeStandingsFromMatches()` replayed the entire unfiltered 104-match tournament list with no
  stage/group guard (unlike `mergeMatches()`, which correctly scopes to group-stage fixtures only).
  This corrupted games-played counts (e.g. Mexico showing 4 played), the Best 3rd Placed table,
  and R32 bracket seeding (wrong teams computed into bracket slots, which is what caused the
  fabricated results above). Replaced with `computeStandingsFromFixtures()`, which derives all
  standings purely from `fbGroups[gk].fixtures` — the same already-correctly-scoped source
  `mergeMatches()` maintains — removing the redundant, driftable second calculation entirely.
- fix: `koCanonical()` maintained a second, hand-written team-name alias list that had drifted out
  of sync with `TEAM_ALIAS` (backwards/missing entries for USA, Ivory Coast, South Africa,
  Bosnia-Herzegovina), causing some finished R32 matches to never receive a `koResults` entry and
  get stuck showing "LIVE" indefinitely. Now delegates to `canonicalTeam()`/`TEAM_ALIAS` instead of
  keeping a separate list.
- fix: `mergeKoMatches()` resolved the home team name first and, on a match, never checked the away
  team — so a corrupted bracket slot on the home side could silently swallow a conflicting result
  that belonged elsewhere. Now resolves both sides independently and bails out (no write) if they
  disagree, instead of guessing.
- fix: inconsistent "Round of 32 starts Jun 28" vs "Round of 32 underway from Jun 28" wording in
  the group-stage-complete banner — now consistent in both places.
- Merged to `main` via branch `fix/group-stats-freeze` (`8d4d474`), verified on Cloudflare Pages
  preview before merge.
- fix: R32 bracket cards could take up to 5 minutes to show real scores on a fresh page load (or
  sit on a placeholder indefinitely) because `window._r32map` — needed by `mergeKoMatches()` to
  attribute API results to bracket slots — was only ever built as a side effect of
  `renderBracket()`, which ran *after* `mergeKoMatches()` in the same fetch cycle. Extracted the
  R32 slot-resolution logic into `buildR32Map()`, now called at the start of every `fetchFbData()`
  cycle before `mergeKoMatches()` needs it.
- fix: `vR32Card()`/`mobMatch()` treated "kickoff time passed, no recorded result" as LIVE — it
  actually just means unknown. Added `matchStatusDisplay()`, a generic (sport-agnostic)
  live/finished/soon/scheduled/unknown resolver, and replaced the assumption with a neutral "—"
  placeholder. Also fixed a `.r32-countdown` 30s ticker that had its own independent copy of the
  same wrong assumption, bypassing `koResults` entirely.
- fix: `hasLiveMatches()` only checked group-stage fixtures, never `window.koResults` — traced to
  commit `ecaba39` (2026-06-26), which reused a group-stage-only helper for `scheduleFbPoll()`'s
  interval decision without extending it to knockout data. Now checks both, so the 60s fast-poll
  correctly engages during knockout-stage live matches instead of the 5-minute fallback.
- fix: `initFootball()` scheduled the recurring poll interval synchronously alongside the first
  fetch instead of after it resolved, so the very first interval decision (60s vs 5min) was always
  made from pre-fetch, empty state. Moved inside `fetchFbData()`'s `.then()`.
- feat: reintroduced R16+ auto-advance (`resolveWinner`/`getMatchParticipants`/
  `buildKoAwaitingMap`) — the logic reverted the previous night after it surfaced fabricated
  results — now safe to redo on top of the fixed group-stats data. Hardened with a non-negotiable
  safeguard: only resolves a winner when `koResults` is confirmed done, unambiguous (no draws — no
  shootout data yet), and both participants resolve to two different teams; any ambiguity returns
  null rather than guessing. Applied to both `vTbdCard()` (desktop) and `mobR16()` (mobile).
- fix (caught on the Cloudflare Pages preview before merge, not on production): the `buildR32Map()`
  extraction left `renderBracket()`'s legend referencing `mapping`, a variable that had moved into
  `buildR32Map()`'s own scope — threw a `ReferenceError` that silently blanked both the Knockouts
  and "Who Can Still Win" sections entirely. `buildR32Map()` now returns `{r32map, mapping}`.
- Merged to `main` via branch `fix/live-status-loading` (`6bfbcae`), verified clean console and
  correct rendering on the Cloudflare Pages preview before merge.
