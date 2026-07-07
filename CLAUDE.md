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
  `buildKoPairMap()`'s team-PAIR→mid map fresh each pass, so a round that finishes mid-batch (e.g.
  the last R32 match completing) unlocks the next round's team pairing within the SAME fetch cycle
  instead of waiting for the next poll. Resolves `mid` by matching the incoming match's (home, away)
  pair against `getMatchParticipants(mid)` via `koPairKey()` — NOT by looking up a single team name
  (that was `buildKoAwaitingMap()`, removed Jul 2026 after a confirmed cross-poll-cycle fabrication
  bug: once a team's round was marked done, the name-only map pointed their name at their NEXT round
  instead, so their OLD match record — still present in every fetch, since the API returns full
  history — got misattributed to the new round's mid on a later, independent poll; the `processed`
  set below couldn't catch this since it only guards within one call, not across separate polls).
  Two teams can only ever meet at one bracket slot, so pair-keying is structurally immune to this
  regardless of poll count or done status — it also means `koResults` corrections after `done:true`
  are no longer silently dropped (see CHANGES.md, this closes what was known issue #2). `processed`
  is now an efficiency guard against redundant same-pass rewrites, not a correctness requirement —
  do not read too much into it being "the" safety mechanism anymore; the pair key is.
- `resolveWinner()` / `getMatchParticipants()` / `buildKoPairMap()` — R16+ auto-advance chain.
  `resolveWinner()` only ever returns a team name when `koResults` is confirmed done, unambiguous,
  and both participants resolved to two different teams — never guesses. This safeguard is
  non-negotiable; it's what the previous revert (`43cf4b3`) was missing. Verified live against real
  R16 results (Jul 2026): correctly resolves Paraguay/France/Canada/Morocco/Brazil/Norway/
  Mexico/England into their real QF slots. **Confirmed bug (Jul 6, see known issues #1 below):**
  a penalty-shootout match does NOT report a tied score as originally assumed — the Worker's
  `homeScore`/`awayScore` for these matches is (probably) regulation + penalties summed per side, so
  it comes through as a plausible-looking but fabricated non-tied score (e.g. Germany 1-1 Paraguay,
  Paraguay won 4-3 on pens, renders as "4-5"). `resolveWinner()` still happens to pick the correct
  winner (the shootout winner's summed total is always higher, since regulation is tied and their
  penalty count is higher) — it does NOT get stuck refusing to guess, contrary to the original
  assumption. Only the displayed *score* is wrong, not the advancement logic. See CHANGES.md
  2026-07-06.
- `buildKoEliminatedSet()` — team name → round label (`'R32'`/`'R16'`/`'QF'`/`'SF'`) they LOST at, for
  any team eliminated in a decided knockout match at ANY round, via
  `getMatchParticipants()`/`koResults`. Returns a `Map`, not a `Set` (despite the name) — as of Jul
  2026 it carries which round produced the loss, not just a boolean. Replaces the old, never-called
  `buildKoTeamMap()` (R32-slot-only, dead code). Feeds ONLY into `renderWCSW()` — do NOT wire it
  into `renderFbGroups()` (main standings table): that table is a historical record of group-stage
  finish and must never be overridden by a later knockout result (see Jul 2026 "group vs current
  status" incident below). Also do NOT wire it into `buildR32Map()`'s own internal
  `computeQualStatus()` call (bracket seeding) — that one is intentionally about original group
  qualification too.
- `computeQualStatus()`'s own group-stage-elimination labels say `"Eliminated · Group Stage"` (not a
  flat `"Eliminated"`, as of Jul 2026) — consistent with the `"Qualified · 1A"` style, and with
  `renderWCSW()`'s KO-round labels (`"Eliminated · R32"` etc., built from `buildKoEliminatedSet()`).
- `koOutcomeClass(koResult, isHome)` — local helper inside `renderBracket()`, shared by
  `vR32Card`/`vTbdCard`/`mobMatch`/`mobR16` (every round, R32 through SF). Adds `ko-winner` (bold) or
  `ko-loser` (muted grey, `.hkb-vteam`/`.hkb-pod-team` CSS) based on `koResults[mid].hs` vs `.as` —
  returns `''` (no class) while undecided or a draw, same "never guess" rule as `resolveWinner()`.
  Get this pattern right in one place; do not hand-roll a second win/loss color scheme elsewhere.
  `vR32Card()`'s seed-confirmation badge (`hbadge`/`abadge`, the ✓/~/3rd checkmark) is a SEPARATE
  axis (pre-match seed confidence, not match outcome) and is suppressed entirely once
  `koResult.done` — do not let the two conflate again; a decided match should show only the
  win/loss styling, never the seed badge. The R32 legend also swaps to a compact "Won"/"Lost" pair
  once group stage is complete (`Object.values(fbGroups).every(g => g.fixtures.every(f => f.done))`)
  — the 5-item seeding legend's other 4 states are permanently unreachable from that point on.
- `koCanonical()` — knockout team-name aliasing; delegates to `canonicalTeam()`/`TEAM_ALIAS`
  (as of Jul 2026 — do not reintroduce a second, separately-maintained alias list here)
- `renderWCSW()` — "Who Can Still Win" page; knockout-aware via `buildKoEliminatedSet()` (Jul 2026).
  This is deliberately the ONLY place that overrides group-stage qualification with current
  knockout status — `renderFbGroups()` must not do this (see known issues history).

## Known open issues (as of Jul 2026, post ko-pair-key-matching hotfix)
1. **CONFIRMED BUG (Jul 6): penalty-shootout matches show a summed, incorrect score.** Not a
   theoretical gap anymore — verified against official FIFA.com match center results. M74 (Germany v
   Paraguay, R32) really finished 1-1 after regulation, Paraguay won 4-3 on penalties — but our data
   shows `homeScore:4, awayScore:5`, which the bracket renders as a flat "4-5". Same pattern on
   Netherlands v Morocco (real: 1-1, Morocco won 3-2 on pens; ours: `3-4`). Both fit the exact
   formula `displayed = regulation + penalties`, computed independently per side, across two
   *unrelated* matches — too consistent to be coincidence.
   - **Root cause: unknown, NOT diagnosable from this repo.** The Worker's response has no
     `winner`/`duration`/`penalties` field at all (confirmed via raw payload + full-text search for
     `penalt|extraTime|winner|duration|shootout|aet|pens` — zero hits across the entire 104-match
     feed), so the frontend has no separate components to work with even in principle; whatever is
     summing regulation + penalties happens upstream of what we can see from `index.html`.
   - **Where to look next: the Worker's source IS accessible via the Cloudflare dashboard** (Workers
     & Pages → `champstracker-football`), NOT GitHub — this repo's GitHub org has no second repo for
     it (confirmed via the GitHub API this session). A prior investigation attempt dead-ended on "no
     access to the Worker source," but that was because it was never actually opened via the
     Cloudflare dashboard — start there next time instead of re-treading that dead end. Also worth
     checking whether football-data.org's own raw response (needs an API key we don't have) already
     has this problem, or if the Worker introduces it while flattening the response.
   - **Impact:** every knockout match decided by penalties displays a plausible-looking but wrong
     score, with the winner still correctly determined (higher combined number still picks the real
     winner) but the actual scoreline is fabricated by omission — a fan reading "4-5" has no way to
     know it was actually a 1-1 draw decided on penalties.
   - Deliberately NOT fixed this session — diagnosed and documented per Sai's call; no UI workaround
     (e.g. an "may include ET/penalties" caption) was applied either, since captioning a wrong number
     doesn't fix a wrong number.
2. **R32 results have no static seed fallback, unlike group stage.** `fbGroups[gk].fixtures` bakes
   in real scores for every played group match, so the group table survives a slow or failed
   fetch. `r32defs` has no equivalent — result data (`window.koResults`) is 100% fetch-dependent,
   forever, even for matches that are now historical fact. Backfilling already-decided R32 results
   into `r32defs` the same way would make the bracket as resilient as group stage.
3. **`aiGo()` (AI panel, cricket tab) is broken in production.** It calls `api.anthropic.com`
   directly from the browser with no auth — works only inside a Claude Artifact sandbox, fails
   with 401/CORS on the real deployed site. Also has a hardcoded stale date in the system prompt.
   Decide: cut it, or rebuild through the existing Worker pattern.
4. **No bracket definitions for Final/Third-Place beyond `sfdefs`.** `getMatchParticipants()` only
   handles R32/R16/QF/SF — there's no equivalent def for the Final or third-place playoff, so
   auto-advance stops at SF winners. Not urgent (Final is Jul 19), but worth adding before then.
5. **`updateProgressBar()`'s header/progress-bar freezes at "group stage complete."** It only ever
   counts `fbGroups[gk].fixtures` (72 group-stage matches) — once `done >= 72`, it hardcodes
   "72 matches played · 32 remaining · Round of 32 underway from Jun 28" forever, regardless of how
   many knockout matches have since been played (confirmed live Jul 6: R32 100% done, R16 mostly
   done, banner still said "Round of 32 underway"). Explicitly out of scope for the Jul 6
   render/UX-fixes session (part of the top-banner tournament-stage messaging, being handled
   separately) — flagged here only, not fixed.

## Commit message convention
One line, plain English, with a prefix:
- `fix: ...` — bug fixes
- `feat: ...` — new functionality
- `chore: ...` — data updates, seed patches, non-functional changes

Example: `fix: R16 auto-advance from koResults`

## CHANGES.md
Keep a running short log of what shipped each session at the repo root. Update it as part of
any session that ships a change — don't let it go stale.
