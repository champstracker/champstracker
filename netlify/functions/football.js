// ═══════════════════════════════════════════════════════════
// Champs Tracker — Football Netlify Function
// Primary:  football-data.org (FOOTBALL_DATA_API_KEY)
// Backup:   api-football.com  (API_SPORTS_KEY)
// ═══════════════════════════════════════════════════════════

const cache = {};
const CACHE_TTL = {
  live:  30 * 1000,        // 30s when matches are live
  today: 60 * 1000,        // 60s on match days
  idle:  60 * 60 * 1000,   // 1hr when no matches today
};

function isCached(key) {
  const entry = cache[key];
  if (!entry) return false;
  return (Date.now() - entry.time) < entry.ttl;
}

function setCache(key, data, ttl) {
  cache[key] = { data, time: Date.now(), ttl };
}

// ── PRIMARY: football-data.org ───────────────────────────
async function fetchFD(endpoint) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error('No FOOTBALL_DATA_API_KEY');
  const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
    headers: { 'X-Auth-Token': key }
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}`);
  return res.json();
}

// ── BACKUP: api-football.com (api-sports) ────────────────
async function fetchAF(endpoint) {
  const key = process.env.API_SPORTS_KEY;
  if (!key) throw new Error('No API_SPORTS_KEY');
  const res = await fetch(`https://v3.football.api-sports.io/${endpoint}`, {
    headers: { 'x-apisports-key': key }
  });
  if (!res.ok) throw new Error(`api-sports ${res.status}`);
  return res.json();
}

// ── Cache TTL logic ──────────────────────────────────────
function getTTL(matches) {
  if (!matches || !matches.length) return CACHE_TTL.idle;
  const now = Date.now();
  const isLive = matches.some(m => m.status === 'IN_PLAY' || m.status === 'PAUSED');
  if (isLive) return CACHE_TTL.live;
  const isToday = matches.some(m => {
    const d = new Date(m.date);
    return Math.abs(d - now) < 24 * 60 * 60 * 1000;
  });
  return isToday ? CACHE_TTL.today : CACHE_TTL.idle;
}

// ── Normalise football-data.org matches ──────────────────
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
    matchday:  m.matchday || null,
  }));
}

// ── Normalise api-sports matches ─────────────────────────
function normaliseAFMatches(fixtures) {
  return (fixtures || []).map(f => ({
    id:        f.fixture?.id,
    homeTeam:  f.teams?.home?.name,
    awayTeam:  f.teams?.away?.name,
    homeScore: f.goals?.home ?? null,
    awayScore: f.goals?.away ?? null,
    status:    f.fixture?.status?.short === 'FT'  ? 'FINISHED'
             : f.fixture?.status?.short === '1H' || f.fixture?.status?.short === '2H' ? 'IN_PLAY'
             : f.fixture?.status?.short === 'HT'  ? 'PAUSED'
             : 'TIMED',
    date:      f.fixture?.date,
    group:     f.league?.round || null,
    stage:     'GROUP_STAGE',
  }));
}

// ── Main handler ─────────────────────────────────────────
export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const type = event.queryStringParameters?.type || 'matches';

  if (!['matches', 'live'].includes(type)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: `Unknown type: ${type}` }) };
  }

  if (isCached(type)) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ source: 'cache', data: cache[type].data }),
    };
  }

  try {
    let data;
    let source = 'football-data';

    if (type === 'live') {
      try {
        const raw = await fetchFD('competitions/WC/matches?season=2026&status=LIVE');
        data = normaliseFDMatches(raw?.matches);
      } catch (e) {
        console.log('football-data live failed:', e.message, '— trying api-sports');
        const raw = await fetchAF('fixtures?league=1&season=2026&live=all');
        data = normaliseAFMatches(raw?.response);
        source = 'api-sports';
      }
      setCache(type, data, CACHE_TTL.live);

    } else {
      // type === 'matches' — full tournament, all 104
      try {
        const raw = await fetchFD('competitions/WC/matches?season=2026');
        data = normaliseFDMatches(raw?.matches);
      } catch (e) {
        console.log('football-data failed:', e.message, '— trying api-sports');
        const raw = await fetchAF('fixtures?league=1&season=2026');
        data = normaliseAFMatches(raw?.response);
        source = 'api-sports';
      }
      setCache(type, data, getTTL(data));
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ source, data, timestamp: new Date().toISOString() }),
    };

  } catch (err) {
    const cached = cache[type];
    if (cached) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ source: 'stale-cache', data: cached.data, timestamp: new Date().toISOString() }),
      };
    }
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
}
