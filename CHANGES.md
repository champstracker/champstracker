# CHANGES

## 2026-07-06
- fix: spot-checked `resolveWinner`/`mergeKoMatches` against live R16 data ahead of QF
  (Jul 9) and found a real bug — verified against the actual running site, not just
  read from code. `mergeKoMatches()` built its team→slot map (`buildKoAwaitingMap()`)
  once per call, before its own `forEach` wrote that batch's results. When a whole
  round finished within one fetch cycle (R32 completing, unlocking R16), the next
  round's team names weren't resolvable yet at the time the map was built, so those
  results got silently dropped for that cycle and only picked up on the *next* poll
  (60s–5min later). Confirmed live: 4 already-finished R16 matches stayed unresolved
  in `window.koResults` for multiple seconds on a fresh page load. Same class of bug
  as the Jul 5 `buildR32Map()`-ordering fix, one round deeper — an untested
  round-transition code path.
- fix: the fix above (rebuilding the map and reprocessing in a bounded loop) had its
  own bug, caught before commit by cross-checking against `buildKoEliminatedSet()`
  (see below): reprocessing the *entire* matches array every pass meant that once a
  team advanced and its round was marked done, `buildKoAwaitingMap()` remapped that
  team's name to its *next* round's mid — so the old, already-merged match record for
  that team got replayed against the new map and misattributed its score onto a
  future round's slot. Caught live: `koResults['M97']` (a QF match) and `['M101']`
  (a semifinal) had fabricated `done:true` results despite QF not starting until Jul 9
  and SF not until Jul 14. Fixed by tracking merged records by match id so a record
  is never reprocessed once successfully written.
- fix: `renderWCSW()`'s and the main standings table's (`renderFbGroups()`)
  "Qualified"/"Winner" badges never updated after a team lost a knockout match, at
  any round — not just R32 as a since-superseded CLAUDE.md note described. Root
  cause: `buildKoTeamMap()` (the function that note referred to) was dead code, never
  called from anywhere; `computeQualStatus()` is pure group-stage math with no
  knockout awareness at all. Replaced `buildKoTeamMap()` with
  `buildKoEliminatedSet()`, which walks every decided bracket match at any round
  (R32/R16/QF/SF) via `getMatchParticipants()`/`koResults` and collects the losers.
  Wired into both `renderFbGroups()` and `renderWCSW()` (not `buildR32Map()`'s own
  internal use of `computeQualStatus()` for bracket seeding, which is correctly about
  original group qualification, not current status). Verified live: Germany (lost
  R32) and Canada (lost R16) now show "Eliminated" in both views; Morocco and France
  (won R16) correctly still show "Qualified".
- Known issue, not fixed: the football Worker's match payload has no
  `winner`/`duration`/`penalties` field — just `homeScore`/`awayScore`/`status`.
  `resolveWinner()` correctly refuses to guess a winner when `hs === as` (to avoid
  fabricating a result on a real draw), but a knockout match decided by penalties will
  likely report `FINISHED` with a tied regulation/ET score, and there's currently no
  data path to know who actually won — that match would silently stay "TBD" in the
  bracket forever. No real knockout draw has happened yet to confirm the exact API
  shape football-data.org sends for shootouts. Test this the first time a R16/QF match
  goes to penalties; fixing it may require changes in the Worker (separate deploy, not
  in this repo) to pass through the winner field.

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
