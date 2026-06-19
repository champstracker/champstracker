// ═══════════════════════════════════════════════════════════
// Champs Tracker — Football Netlify Function
// Primary:  football-data.org (FOOTBALL_DATA_API_KEY)
// Backup:   api-football.com  (API_SPORTS_KEY)
// Fallback: cached data
// ═══════════════════════════════════════════════════════════

const cache = {};
const CACHE_TTL = {
  live:  60 * 1000,
  today: 5 * 60 * 1000,
  idle:  60 * 60 * 1000,
};

function isCached(key) {
  const entry = cache[key];
  if (!entry) return false;
  // Invalidate standings cache if it contains the old group:null bug
  if (key === 'standings' && Array.isArray(entry.data) && entry.data[0]?.group === null) {
    delete cache[key];
    return false;
  }
  return (Date.now() - entry.time) < entry.ttl;
}

function setCache(key, data, ttl) {
  cache[key] = { data, time: Date.now(), ttl };
}

async function fetchFD(endpoint) {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key) throw new Error('No FOOTBALL_DATA_API_KEY');
  const res = await fetch(`https://api.football-data.org/v4/${endpoint}`, {
    headers: { 'X-Auth-Token': key }
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}`);
  return res.json();
}

async function fetchAF(endpoint) {
  const key = process.env.API_SPORTS_KEY;
  if (!key) throw new Error('No API_SPORTS_KEY');
  const res = await fetch(`https://v3.football.api-sports.io/${endpoint}`, {
    headers: { 'x-apisports-key': key }
  });
  if (!res.ok) throw new Error(`api-sports ${res.status}`);
  return res.json();
}

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

function normaliseFDStandings(standings) {
  return (standings || []).map(s => ({
    group: s.table?.[0]?.group || s.group,
    teams: (s.table || []).map(t => ({
      name:   t.team?.name,
      crest:  t.team?.crest,
      played: t.playedGames,
      won:    t.won,
      drawn:  t.draw,
      lost:   t.lost,
      gf:     t.goalsFor,
      ga:     t.goalsAgainst,
      gd:     t.goalDifference,
      points: t.points,
    }))
  }));
}

function normaliseAFMatches(fixtures) {
  return (fixtures || []).map(f => ({
    id:        f.fixture?.id,
    homeTeam:  f.teams?.home?.name,
    awayTeam:  f.teams?.away?.name,
    homeScore: f.goals?.home ?? null,
    awayScore: f.goals?.away ?? null,
    status:    f.fixture?.status?.short === 'FT' ? 'FINISHED'
               : f.fixture?.status?.short === '1H' || f.fixture?.status?.short === '2H' ? 'IN_PLAY'
               : f.fixture?.status?.short === 'HT' ? 'PAUSED'
               : 'TIMED',
    date:      f.fixture?.date,
    group:     f.league?.round || null,
    stage:     'GROUP_STAGE',
  }));
}

function normaliseAFStandings(response) {
  if (!response || !response[0]) return [];
  const league = response[0];
  return (league.league?.standings || []).map((group, i) => ({
    group: `GROUP_${String.fromCharCode(65 + i)}`,
    teams: group.map(t => ({
      name:   t.team?.name,
      played: t.all?.played,
      won:    t.all?.win,
      drawn:  t.all?.draw,
      lost:   t.all?.lose,
      gf:     t.all?.goals?.for,
      ga:     t.all?.goals?.against,
      gd:     t.goalsDiff,
      points: t.points,
    }))
  }));
}

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  const type = event.queryStringParameters?.type || 'matches';

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

    if (type === 'matches') {
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

    } else if (type === 'standings') {
      try {
        const raw = await fetchFD('competitions/WC/standings?season=2026');
        data = normaliseFDStandings(raw?.standings);
      } catch (e) {
        console.log('football-data failed:', e.message, '— trying api-sports');
        const raw = await fetchAF('standings?league=1&season=2026');
        data = normaliseAFStandings(raw?.response);
        source = 'api-sports';
      }
      setCache(type, data, CACHE_TTL.today);

    } else if (type === 'live') {
      try {
        const raw = await fetchFD('competitions/WC/matches?season=2026&status=LIVE');
        data = normaliseFDMatches(raw?.matches);
      } catch (e) {
        console.log('football-data failed:', e.message, '— trying api-sports');
        const raw = await fetchAF('fixtures?league=1&season=2026&live=all');
        data = normaliseAFMatches(raw?.response);
        source = 'api-sports';
      }
      setCache(type, data, CACHE_TTL.live);

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: `Unknown type: ${type}` }),
      };
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
