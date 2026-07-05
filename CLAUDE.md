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
- `renderBracket()` — builds R32/R16/QF/SF/Final bracket (desktop vertical + mobile versions)
- `mergeKoMatches()` / `window.koResults` — knockout match results, keyed by match ID (`M74` etc.)
- `koCanonical()` — knockout team-name aliasing; delegates to `canonicalTeam()`/`TEAM_ALIAS`
  (as of Jul 2026 — do not reintroduce a second, separately-maintained alias list here)
- `renderWCSW()` — "Who Can Still Win" page

## Known open issues (as of Jul 2026, post koResults-revert + group-stats-freeze merge)
1. **R32 "LIVE" fallback is still fragile.** `vR32Card()`'s rule — "kickoff time has passed and
   there's no `koResults` entry → show LIVE" — treats "we don't know the result" as "it must
   still be live." The `koCanonical()`→`TEAM_ALIAS` delegation and `mergeKoMatches()` home/away
   independent resolution (both shipped in `8d4d474`) closed the specific known cases (USA vs
   Bosnia-Herzegovina alias gap, Brazil/Japan bracket-slot conflict), but the fallback itself
   wasn't hardened — any future unmapped team name will reproduce the same stuck-LIVE symptom.
   Worth double-checking live on champstracker.in, and considering a neutral fallback instead of
   presuming LIVE.
2. **R16+ auto-advance logic (`resolveWinner`/`buildKoAwaitingMap`) needs re-investigation.** Shipped
   in `394240b` to make R16/QF/SF cards resolve real team names from `window.koResults`, then
   reverted same night (`43cf4b3`) after it surfaced fabricated results in production. Root cause
   traced to corrupted group-stage stats feeding wrong teams into R32 bracket slots — now fixed
   separately (group-stats-freeze, `8d4d474`). The R16+ auto-advance logic itself was never
   reapplied to `main` and needs to be redone/re-verified now that the underlying data corruption
   is gone.
3. **Mobile bracket `mobR16()` fix still pending.** Same static `"W·M74"` placeholder problem the
   (reverted) desktop `vTbdCard()` fix addressed — never landed on `main`.
4. **R32 card styling doesn't distinguish won/lost/TBD well.** Current `.hkb-vteam` states
   (`confirmed`/`inR32`/`projected`/`third`/`tbd`) have no distinct visual treatment for "played
   and lost" vs "not yet decided" — both currently read as plain/neutral.
5. **Live data refresh is slower than the documented 60s cache.** `hasLiveMatches()` only checks
   `fbGroups[*].fixtures` for `f.live` — it never looks at `window.koResults` — so a live
   knockout-stage match doesn't trigger the fast 60s poll or `scheduleLiveRefresh()`, and silently
   falls back to the 5-minute idle interval even mid-match.
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
