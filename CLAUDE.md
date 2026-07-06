# CLAUDE.md — champstracker.in

Context for Claude Code when working in this repo. Read this before making any changes.

## What this is
A single-file (`index.html`) live tracker for FIFA World Cup 2026, plus F1 and Cricket sections.
Hosted on Cloudflare Pages. No build step, no bundler — vanilla JS/HTML/CSS in one file.

- **Repo**: champstracker/champstracker (GitHub)
- **Live site**: champstracker.in
- **Football data**: Cloudflare Worker `champstracker-football.champstracker99.workers.dev`
  (proxies football-data.org, 60s cache for matches, 30s for live)
- **F1 data**: separate Cloudflare Worker `champstracker-f1.champstracker99.workers.dev`
  (OpenF1 + Jolpica APIs)
- **Cricket**: static/hardcoded seed data, no live API (ICC Women's T20 WC 2026)
- **Tennis**: assessed, no viable free live API — not built

## How Sai works (read this, it matters)
- **Surgical patches, not rewrites.** Never restructure working code unless explicitly asked.
- **Plan first, then approve, then execute.** Describe the fix and get a yes before editing.
- **One project chunk per session.** Don't try to fix multiple unrelated things at once.
- Sai catches FIFA-rule and math errors quickly — if unsure about a tiebreaker rule, flag the
  uncertainty rather than guessing confidently.
- Laptop is primary device; occasionally works from mobile via chat (not Claude Code) when away
  from his system.

## Key functions (index.html)
- `sortGroup()` — FIFA Article 12/13 head-to-head tiebreaker logic
- `computeQualStatus()` — 5-state group qualification status per team
- `computeBest3rdStatus()` — best-3rd-place logic via 9-scenario enumeration
- `computeStandingsFromFixtures()` — derives all group-stage team stats (p/w/d/l/gf/ga/gd/pts/fp)
  purely from `fbGroups[gk].fixtures`, the same group-scoped source `mergeMatches()` maintains.
  This is the single source of truth for group standings — never feed it the raw/unfiltered
  match list again (see Jul 2026 "group-stats-freeze" incident below).
- `buildR32Map()` — resolves R32 bracket slots to team names from `fbGroups` standings, sets
  `window._r32map`. Extracted out of `renderBracket()` (Jul 2026) so it can be called early in
  `fetchFbData()`, before `mergeKoMatches()` needs it — do not inline it back into `renderBracket()`.
  Returns `{r32map, mapping}` — both are needed by callers (`mapping` feeds the bracket legend).
- `renderBracket()` — builds R32/R16/QF/SF/Final bracket (desktop vertical + mobile versions)
- `matchStatusDisplay()` — single source of truth for live/finished/soon/scheduled/unknown per
  match; "kickoff passed, no result yet" always resolves to unknown, never an assumed status.
  Sport-agnostic — reuse this for any future tournament's match cards instead of copying the logic.
- `mergeKoMatches()` / `window.koResults` — knockout match results, keyed by match ID (`M74` etc.).
  Runs in a bounded loop (max 4 passes — one per knockout round, R32→R16→QF→SF), rebuilding
  `buildKoAwaitingMap()`'s team→slot map fresh each pass, so a round that finishes mid-batch (e.g.
  the last R32 match completing) unlocks the next round's team names within the SAME fetch cycle
  instead of waiting for the next poll. Each API match record is tracked by id in a `processed` set
  so it is never re-merged in a later pass — without that guard, a team that has since advanced
  gets its OLD (already-finished) match record reattributed to its NEW round's mid on the next
  pass, fabricating a result for a round that hasn't been played yet (caught live, Jul 2026, before
  QF/SF had even started — see CHANGES.md). Do not remove either the loop or the `processed` guard
  in isolation; they depend on each other.
- `resolveWinner()` / `getMatchParticipants()` / `buildKoAwaitingMap()` — R16+ auto-advance chain.
  `resolveWinner()` only ever returns a team name when `koResults` is confirmed done, unambiguous,
  and both participants resolved to two different teams — never guesses. This safeguard is
  non-negotiable; it's what the previous revert (`43cf4b3`) was missing. Verified live against real
  R16 results (Jul 2026): correctly resolves Paraguay/France/Canada/Morocco/Brazil/Norway/
  Mexico/England into their real QF slots. **Known gap:** `koResults[mid].hs`/`.as` come straight
  from the Worker's `homeScore`/`awayScore` — there is no `winner`/`duration`/`penalties` field in
  that payload. A knockout match decided on penalties will report `FINISHED` with a tied score, and
  `resolveWinner()` correctly refuses to guess a winner on a tie — so that match would stay
  unresolved in the bracket forever. Untested against a real shootout as of Jul 2026 (see
  CHANGES.md 2026-07-06).
- `buildKoEliminatedSet()` — team name → eliminated, for any team that has lost a decided knockout
  match at ANY round (R32/R16/QF/SF), via `getMatchParticipants()`/`koResults`. Replaces the old,
  never-called `buildKoTeamMap()` (R32-slot-only, dead code). Feeds into both `renderFbGroups()`
  (main standings table) and `renderWCSW()`, overriding `computeQualStatus()`'s group-stage-only
  "Qualified"/"Winner" label once a team is knocked out. Do NOT wire it into `buildR32Map()`'s own
  internal `computeQualStatus()` call (bracket seeding) — that one is intentionally about original
  group qualification, not current knockout status.
- `koCanonical()` — knockout team-name aliasing; delegates to `canonicalTeam()`/`TEAM_ALIAS`
  (as of Jul 2026 — do not reintroduce a second, separately-maintained alias list here)
- `renderWCSW()` — "Who Can Still Win" page; now knockout-aware via `buildKoEliminatedSet()` (Jul 2026)

## Known open issues (as of Jul 2026, post knockout-logic-audit session)
1. **Penalty-shootout results have no data path.** See `resolveWinner()` note above — the Worker
   payload has no winner/duration/penalties field, so a knockout match decided on penalties (tied
   score, `done:true`) can never resolve a winner and will sit as "TBD" in the bracket indefinitely.
   No real shootout has happened yet to confirm what football-data.org actually sends; may require
   a Worker-side change (separate deploy, not in this repo) to expose it. Test the first time a
   R16/QF match goes to penalties.
2. **R32 card styling doesn't distinguish won/lost/TBD well.** Current `.hkb-vteam` states
   (`confirmed`/`inR32`/`projected`/`third`/`tbd`) have no distinct visual treatment for "played
   and lost" vs "not yet decided" — both currently read as plain/neutral.
3. **R32 results have no static seed fallback, unlike group stage.** `fbGroups[gk].fixtures` bakes
   in real scores for every played group match, so the group table survives a slow or failed
   fetch. `r32defs` has no equivalent — result data (`window.koResults`) is 100% fetch-dependent,
   forever, even for matches that are now historical fact. Backfilling already-decided R32 results
   into `r32defs` the same way would make the bracket as resilient as group stage.
4. **`aiGo()` (AI panel, cricket tab) is broken in production.** It calls `api.anthropic.com`
   directly from the browser with no auth — works only inside a Claude Artifact sandbox, fails
   with 401/CORS on the real deployed site. Also has a hardcoded stale date in the system prompt.
   Decide: cut it, or rebuild through the existing Worker pattern.
5. **No bracket definitions for Final/Third-Place beyond `sfdefs`.** `getMatchParticipants()` only
   handles R32/R16/QF/SF — there's no equivalent def for the Final or third-place playoff, so
   auto-advance stops at SF winners. Not urgent (Final is Jul 19), but worth adding before then.

## Commit message convention
One line, plain English, with a prefix:
- `fix: ...` — bug fixes
- `feat: ...` — new functionality
- `chore: ...` — data updates, seed patches, non-functional changes

Example: `fix: R16 auto-advance from koResults`

## CHANGES.md
Keep a running short log of what shipped each session at the repo root. Update it as part of
any session that ships a change — don't let it go stale.
