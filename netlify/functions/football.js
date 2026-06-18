// ═══════════════════════════════════════════════════════════
// Champs Tracker — Football Netlify Function
// Fetches live World Cup data with smart caching
// Primary: worldcup26.ir (free, no key)
// Backup:  football-data.org (API key from env var)
// ═══════════════════════════════════════════════════════════

// Simple in-memory cache (resets on function cold start ~15 mins)
const cache = {};
const CACHE_TTL = {
  live:    60 * 1000,        // 60 seconds during live match
  today:   5 * 60 * 1000,   // 5 minutes on match day
  idle:    60 * 60 * 1000,  // 1 hour on non-match day
};

function isCached(key) {
  const entry = cache[key];
  if (!entry) return false;
  return (Date.now() - entry.time) < entry.ttl;
}

function setCache(key, data, ttl) {
  cache[key] = { data, time: Date.now(), ttl };
}

// ── Fetch from worldcup26.ir ─────────────────────────────
async function fetchWC26(endpoint) {
  const res = await fetch(`https://worldcup26.ir/get/${endpoint}`, {
    headers: { 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`worldcup26.ir error: ${res.status}`);
  return res.json();
}

// ── Fetch from football-data.org ─────────────────────────
async function fetchFD(endpoint) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error('No FOOTBALL_DATA_API_KEY set');
  const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
    headers: { 'X-Auth-Token': key }
  });
  if (!res.ok) throw new Error(`football-data.org error: ${res.status}`);
  return res.json();
}

// ── Determine cache TTL based on match state ─────────────
function getTTL(matches) {
  if (!matches || !matches.length) return CACHE_TTL.idle;
  const now = Date.now();
  const isLive = matches.some(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
  if (isLive) return CACHE_TTL.live;
  const isToday = matches.some(m => {
    const d = new Date(m.utcDate || m.date);
    return Math.abs(d - now) < 24 * 60 * 60 * 1000;
  });
  return isToday ? CACHE_TTL.today : CACHE_TTL.idle;
}

// ── Normalise worldcup26.ir match data ───────────────────
function normaliseWC26Games(games) {
  return (games || []).map(g => ({
    id:        g.id,
    homeTeam:  g.home_team_en || g.home_team,
    awayTeam:  g.away_team_en || g.away_team,
    homeScore: g.home_score ?? null,
    awayScore: g.away_score ?? null,
    status:    g.status || 'SCHEDULED',
    date:      g.datetime || g.date,
    group:     g.group || null,
    stage:     g.stage || 'GROUP_STAGE',
  }));
}

// ── Normalise football-data.org match data ───────────────
function normaliseFDMatches(matches) {
  return (matches || []).map(m => ({
    id:        m.id,
    homeTeam:  m.homeTeam?.name,
    awayTeam:  m.awayTeam?.name,
    homeScore: m.score?.fullTime?.home ?? null,
    awayScore: m.score?.fullTime?.away ?? null,
    status:    m.status,
    date:      m.utcDate,
    group:     m.group || null,
    stage:     m.stage,
  }));
}

// ── Normalise worldcup26.ir standings ────────────────────
function normaliseWC26Groups(groups) {
  if (!groups) return [];
  return Object.entries(groups).map(([groupName, teams]) => ({
    group: groupName,
    teams: (teams || []).map(t => ({
      name:   t.team_name_en || t.team_name,
      flag:   t.flag || '',
      played: t.mp ?? t.played ?? 0,
      won:    t.w ?? t.won ?? 0,
      drawn:  t.d ?? t.drawn ?? 0,
      lost:   t.l ?? t.lost ?? 0,
      gf:     t.gf ?? 0,
      ga:     t.ga ?? 0,
      gd:     t.gd ?? 0,
      points: t.pts ?? t.points ?? 0,
    }))
  }));
}

// ── Main handler ─────────────────────────────────────────
export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const type = event.queryStringParameters?.type || 'matches';

  // Return cached data if fresh
  if (isCached(type)) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ source: 'cache', data: cache[type].data }),
    };
  }

  try {
    let data;
    let source = 'worldcup26';

    if (type === 'matches') {
      // Try worldcup26.ir first
      try {
        const raw = await fetchWC26('games');
        data = normaliseWC26Games(raw?.games || raw);
      } catch (e) {
        // Fallback to football-data.org
        console.log('worldcup26 failed, trying football-data.org:', e.message);
        const raw = await fetchFD('competitions/WC/matches?season=2026');
        data = normaliseFDMatches(raw?.matches);
        source = 'football-data';
      }
      const ttl = getTTL(data);
      setCache(type, data, ttl);

    } else if (type === 'standings') {
      // Try worldcup26.ir first
      try {
        const raw = await fetchWC26('groups');
        data = normaliseWC26Groups(raw?.groups || raw);
      } catch (e) {
        // Fallback to football-data.org
        console.log('worldcup26 failed, trying football-data.org:', e.message);
        const raw = await fetchFD('competitions/WC/standings?season=2026');
        data = raw?.standings || [];
        source = 'football-data';
      }
      setCache(type, data, CACHE_TTL.today);

    } else if (type === 'live') {
      // Only live matches right now
      try {
        const raw = await fetchWC26('games');
        const all = normaliseWC26Games(raw?.games || raw);
        data = all.filter(m => m.status === 'IN_PLAY' || m.status === 'PAUSED' || m.status === 'HT');
      } catch (e) {
        const raw = await fetchFD('competitions/WC/matches?season=2026&status=LIVE');
        data = normaliseFDMatches(raw?.matches);
        source = 'football-data';
      }
      setCache(type, data, CACHE_TTL.live);

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Unknown type: ${type}. Use matches, standings, or live.` }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ source, data, timestamp: new Date().toISOString() }),
    };

  } catch (err) {
    console.error('Football function error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
