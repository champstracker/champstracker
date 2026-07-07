# CHANGES

## 2026-07-06 (fourth session — post-group-stage restructure)
- feat: extended `updateProgressBar()` to count every trackable stage (group + R32 +
  R16 + QF + SF + Final/Third-Place), not just the 72 group fixtures. The header and
  progress bar had been frozen at "Group stage complete · Round of 32 underway from
  Jun 28" since the moment group stage ended (confirmed dormant since the Jul 6
  render/UX-fixes session, deliberately deferred then). R32-SF counted via
  `koResults` (same approach as `buildKoAwaitingMap`); Final/Third-Place (no
  bracket-def mid — known issue #5) counted directly by `stage` from a new
  `window._allMatches` snapshot taken in `fetchFbData()` — a done/live count doesn't
  need the team-name resolution issue #5 is actually about, so this didn't need to
  wait for that fix. `fb-stage-chip` (a second static "GROUP STAGE" string JS never
  touched) now updates too. Verified live: banner correctly reads "Round of 32
  complete · Round of 16 in progress (4/8 done)" against current data.
- feat: reordered the football panel's sections — Knockouts and Who Can Still Win
  (current tournament status) now come before Final Group Standings and Best
  3rd-Placed Teams (renamed, explicitly marked as the historical/final record now
  that group stage is over). Split the tournament-wide intro banner out from the old
  "Groups" section header (new `id="fb-intro"`) so it stays pinned at the top
  regardless of section order. Removed the now-redundant JS that used to
  auto-scroll to Knockouts once group stage completed, since Knockouts is the first
  section by default now. Updated the subnav order/labels and the scroll-spy
  section-index array to match. Verified live: subnav reads Knockouts / Who Can Win?
  / Final Standings / Best 3rd, in that order, both desktop and mobile.
- feat: visual refresh of the Knockouts tab. Added a round-progress stepper
  (R32→R16→QF→SF→F, shown once group stage is complete) reusing the existing F1
  pip-strip component's shape but recolored with football's own tokens instead of
  F1's blue. Added graduated round-row emphasis: the current round's label and cards
  get an amber highlight plus a small "X/Y done" or "Starts <date>" chip; later,
  not-yet-started rounds render muted (dashed, reduced opacity). Builds on top of
  (doesn't replace) the existing win/loss card styling and stage-labeled elimination
  from the earlier Jul 6 session. Presented a rendered mockup (screenshot, not just a
  description) for review before implementing, per Sai's request. Verified live on
  both desktop and mobile.
- No SKILL.md design-guidance file was available in this environment
  (`/mnt/skills/public/frontend-design/SKILL.md` doesn't exist here, and no
  frontend-design skill was available to invoke) — the visual direction was grounded
  in the site's actual existing CSS variables and general UI judgment instead, not
  that skill's guidance. Flagging in case a future session has access and wants to
  cross-check this work against it.
- Minor, not fixed: found two other pre-existing but harmless issues while in this
  code — `r32Card()`/`tbdCard()` (the older, non-"v"-prefixed horizontal bracket
  card functions in `renderBracket()`) are dead code, superseded by `vR32Card()`/
  `vTbdCard()` and never called; and `wcsw-chip`/`wcsw-info` element lookups in
  `updateProgressBar()` are no-ops since no such elements exist in the HTML. Neither
  is new to this session and neither affects behavior — left alone, flagged here for
  awareness only.

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
- Correction: the score-correction gap in `buildKoAwaitingMap()` (a match already marked
  `done` is permanently excluded from remapping, so a later upstream score fix from
  football-data.org would be silently dropped) was discussed at the end of this day's
  earlier session but never actually written down — that session ended on an open
  question rather than a commit. Documented properly now in CLAUDE.md's known issues.

### Second session same day — bugs found from live production screenshots
- fix: R16 (and, once played, QF/SF) bracket cards never rendered a score at all.
  `vTbdCard()` (desktop) and `mobR16()` (mobile) only ever showed the resolved team
  name via `resolveWinner()` — unlike `vR32Card()`/`mobMatch()`, they never read
  `koResults` or called `matchStatusDisplay()`. Confirmed finished R16 matches (Canada
  v Morocco, Paraguay v France, etc.) showed team names with no score line on
  production. Added the same score-row logic R32 already had. Verified live.
- fix: the main group standings table (`renderFbGroups()`) was showing "Eliminated"
  for teams that had won their group but lost in the knockouts (e.g. Mexico, 1st in
  Group A, shown "Eliminated" after their R16 loss) — conflating "how a team finished
  the group stage" (a historical fact) with "are they still in the tournament" (current
  status). This came from last session's `buildKoEliminatedSet()` override being wired
  into both `renderFbGroups()` and `renderWCSW()`; it should only ever have been in the
  latter. Removed the override from `renderFbGroups()` entirely — it now always shows
  original group-stage qualification, never knockout elimination. `renderWCSW()` (which
  IS about current status) keeps it. Verified live: Mexico shows "Qualified · 1A" in
  standings, "Eliminated" in Who Can Still Win.
- feat: elimination labels in Who Can Still Win (and the group-stage-only "Eliminated"
  labels in the standings table) now name the round, e.g. "Eliminated · R32",
  "Eliminated · R16", "Eliminated · Group Stage" — instead of a flat "Eliminated"
  regardless of when a team went out. `buildKoEliminatedSet()` now returns a `Map` of
  team → round label instead of a `Set`. Verified live across all rounds present in
  current data (Group Stage/R32/R16).
- feat: knockout cards now visually distinguish the winner from the loser of a decided
  match. Every finished match previously showed both teams in the same green checkmark
  style with no way to tell who actually won at a glance. Added `koOutcomeClass()`, a
  shared helper used by every round's card renderer (`vR32Card`/`vTbdCard`/`mobMatch`/
  `mobR16`) — winner renders bold, loser renders muted grey (same grey already used for
  TBD slots). Presented 3 mockup options for review before implementing; went with the
  bold-winner/muted-loser pattern (smallest diff from existing styling). No class is
  applied while a match is undecided or drawn, consistent with `resolveWinner()`'s
  "never guess" rule. Verified live on both desktop and mobile.
- Sanity pass on production (since last session's fixes went straight to `main` without
  a preview step) found one more issue, left unfixed and only flagged per this session's
  scope: `updateProgressBar()`'s header/progress bar only counts group-stage fixtures,
  so it's been frozen at "72 played · Round of 32 underway from Jun 28" since the moment
  group stage ended, regardless of how far the knockouts have actually progressed. Out
  of scope this session (top-banner tournament-stage messaging, being handled
  separately) — logged in CLAUDE.md known issues.

### Third session same day — Bug 6 penalty-score investigation (diagnosed, deferred)
- Confirmed a real, undiagnosed data bug: knockout matches decided on penalties display a summed,
  incorrect score instead of the real result. Investigated a live example (M74, Germany v Paraguay,
  R32) reported as showing "4-5" — cross-checked against official FIFA.com match center results,
  which show the real result was Germany 1-1 Paraguay after regulation, Paraguay won 4-3 on
  penalties. A second match (Netherlands v Morocco) showed the identical pattern: real result 1-1,
  Morocco won 3-2 on pens, ours displayed "3-4". Both fit `displayed = regulation + penalties`,
  summed independently per side — consistent across two unrelated matches, not a coincidence.
- Ruled out: this is not a group-stage or static-seed-data issue (group stage can't have penalties;
  R32+ has no static seed at all, confirmed 100% API-dependent). Not reproducible as a rendering bug
  either — the Worker's payload has no `winner`/`duration`/`penalties` field anywhere (checked via
  full-text search across the entire 104-match feed for `penalt|extraTime|winner|duration|shootout|
  aet|pens` — zero hits), so `index.html` never receives separate components to render correctly in
  the first place. Whatever is summing the two numbers happens upstream of anything visible from
  this repo.
- Could not pin down exactly where the summing happens: football-data.org's direct API returned 403
  (needs a subscription/API key we don't have). Initially assumed "no access to the Worker
  source" — that was wrong. The Worker's source IS reachable via the Cloudflare dashboard (Workers &
  Pages → `champstracker-football`), just not opened this session. GitHub was a dead end (confirmed
  via the GitHub API: the `champstracker` account has exactly one repo, this one) — don't re-check
  GitHub for the Worker source next time, go straight to the Cloudflare dashboard instead.
- Deliberately NOT fixed this session (Sai's call) — no code changed, no UI caption/workaround
  applied either, since labeling a wrong number clearly is still shipping a wrong number. Documented
  as known issue #1 in CLAUDE.md with full reasoning, so the next session can start at "open the
  Cloudflare dashboard" instead of re-doing this diagnosis.
- fix (Bug 5): the R32 card's seed-confirmation checkmark (✓) kept showing on both teams after a
  match was decided, sitting right next to Bug 4's new win/loss styling and contradicting it — a
  losing team could show a green ✓ right beside its own muted "lost" name. The checkmark answers a
  pre-match question (is this team's group-stage-qualified identity locked into this R32 slot?),
  unrelated to who won the actual match. Suppressed `hbadge`/`abadge` in `vR32Card()` entirely once
  `koResult.done` is true — `koOutcomeClass()`'s bold/muted styling is the status indicator once a
  match is decided. Also swapped the 5-item seeding legend (confirmed/in-R32-TBD/leading-slot/
  best-3rd/TBD) for a compact 2-item "Won"/"Lost" legend once group stage is fully complete, since
  4 of those 5 states have been permanently unreachable since group stage ended (every R32 slot
  becomes "confirmed" the moment group stage locks in, not when R32 itself is played). Verified
  live: M74 (Germany/Paraguay, decided) shows no badges, only win/loss styling; legend shows
  "Won"/"Lost" instead of the seeding legend.

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
