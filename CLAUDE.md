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
- `mergeKoMatches()` / `window.koResults` — knockout match results, keyed by match ID (`M74` etc.)
- `resolveWinner()` / `getMatchParticipants()` / `buildKoAwaitingMap()` — R16+ auto-advance chain.
  `resolveWinner()` only ever returns a team name when `koResults` is confirmed done, unambiguous,
  and both participants resolved to two different teams — never guesses. This safeguard is
  non-negotiable; it's what the previous revert (`43cf4b3`) was missing.
- `koCanonical()` — knockout team-name aliasing; delegates to `canonicalTeam()`/`TEAM_ALIAS`
  (as of Jul 2026 — do not reintroduce a second, separately-maintained alias list here)
- `renderWCSW()` — "Who Can Still Win" page

## Known open issues (as of Jul 2026, post live-status-loading merge)
1. **R16 auto-advance is live but not yet visually confirmed against a real result.**
   `resolveWinner`/`buildKoAwaitingMap` shipped in `6bfbcae`, but R16 only just started (Jul 5) —
   worth checking champstracker.in once the first R16 match actually finishes, to confirm the real
   team name (not a placeholder) shows correctly on its QF card.
2. **"Who Can Still Win" only checks R32 losses, not R16+.** `renderWCSW()`'s elimination check
   uses `buildKoTeamMap()`, which only maps team names to their original R32 slot — a team that
   loses in R16 or later won't be caught, and keeps showing "Qualified" from their group-stage
   state. Same category of gap as the original WCSW bug, just one round further along now that R32
   auto-advance works correctly.
3. **`resolveWinner`'s recursive resolution chain hasn't run on real multi-round data yet.** The
   conflict-bailout in `mergeKoMatches()` and the "never guess" safeguard in `resolveWinner()` are
   reasoned through and verified against R32 data, but QF doesn't start until Jul 9 — that's the
   first point the R16→QF resolution actually executes on real (not hypothetical) results. Worth a
   spot-check once QF kicks off.
4. **R32 card styling doesn't distinguish won/lost/TBD well.** Current `.hkb-vteam` states
   (`confirmed`/`inR32`/`projected`/`third`/`tbd`) have no distinct visual treatment for "played
   and lost" vs "not yet decided" — both currently read as plain/neutral.
5. **R32 results have no static seed fallback, unlike group stage.** `fbGroups[gk].fixtures` bakes
   in real scores for every played group match, so the group table survives a slow or failed
   fetch. `r32defs` has no equivalent — result data (`window.koResults`) is 100% fetch-dependent,
   forever, even for matches that are now historical fact. Backfilling already-decided R32 results
   into `r32defs` the same way would make the bracket as resilient as group stage.
6. **`aiGo()` (AI panel, cricket tab) is broken in production.** It calls `api.anthropic.com`
   directly from the browser with no auth — works only inside a Claude Artifact sandbox, fails
   with 401/CORS on the real deployed site. Also has a hardcoded stale date in the system prompt.
   Decide: cut it, or rebuild through the existing Worker pattern.

## Commit message convention
One line, plain English, with a prefix:
- `fix: ...` — bug fixes
- `feat: ...` — new functionality
- `chore: ...` — data updates, seed patches, non-functional changes

Example: `fix: R16 auto-advance from koResults`

## CHANGES.md
Keep a running short log of what shipped each session at the repo root. Update it as part of
any session that ships a change — don't let it go stale.
