# CHANGES

## 2026-07-05
- fix: R16 bracket cards (desktop + mobile pod) now resolve to real team names once their
  feeder R32 matches are marked done in `koResults`, instead of showing a static `W·M74`
  placeholder.
- fix: `mergeKoMatches()` now keys results by the actual bracket match id being played
  (R32/R16/QF/SF) via a new `buildKoAwaitingMap()`, instead of always the team's original
  R32 match id. Previously an R16+ result would have overwritten that team's R32 scoreline
  and never been recorded under its own match id — this also unblocks QF/SF cards from
  resolving once R16 results start coming in.
- fix: `renderWCSW()` now checks `koResults` for a team's completed R32 match and shows
  "Eliminated" if they lost, instead of leaving group-stage "Qualified" status stuck forever.
