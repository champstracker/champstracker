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
