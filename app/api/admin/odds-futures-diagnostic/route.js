import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';

const BASE = 'https://api.odds-api.io/v3';

function list(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.events)) return value.events;
  if (Array.isArray(value?.leagues)) return value.leagues;
  return [];
}

function containsFutureKeyword(value) {
  const text = String(value || '').toLowerCase();

  return [
    'win total',
    'season wins',
    'regular season wins',
    'championship',
    'national championship',
    'college football playoff',
    'playoff',
    'cfp',
    'conference champion',
    'conference championship',
    'semifinal',
    'outright',
    'future',
    'futures'
  ].some(keyword => text.includes(keyword));
}

function containsLeagueDiscoveryKeyword(value) {
  const text = String(value || '').toLowerCase();

  return [
    'college',
    'ncaa',
    'ncaaf',
    'future',
    'futures',
    'outright',
    'champion',
    'championship',
    'playoff',
    'cfp',
    'conference',
    'bowl'
  ].some(keyword => text.includes(keyword));
}

function sanitizeEvent(event) {
  return {
    id: event?.id ?? null,
    name: event?.name ?? event?.title ?? null,
    home: event?.home ?? null,
    away: event?.away ?? null,
    date: event?.date ?? event?.startTime ?? null,
    status: event?.status ?? null,
    league: event?.league ?? null,
    sport: event?.sport ?? null,
    rawKeys: event && typeof event === 'object'
      ? Object.keys(event)
      : []
  };
}

function sanitizeLeague(league) {
  return {
    id: league?.id ?? null,
    name: league?.name ?? league?.title ?? null,
    slug: league?.slug ?? league?.key ?? null,
    sport: league?.sport ?? null,
    rawKeys: league && typeof league === 'object'
      ? Object.keys(league)
      : []
  };
}

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401 }
    );
  }

  if (!process.env.ODDS_API_KEY) {
    return NextResponse.json(
      { ok: false, error: 'ODDS_API_KEY missing' },
      { status: 500 }
    );
  }

  const key = process.env.ODDS_API_KEY;

  try {
    const requests = [];
    let callsUsed = 0;

    async function fetchJson(label, url) {
      callsUsed++;

      const response = await fetch(url, {
        cache: 'no-store'
      });

      const body = await response.json().catch(() => null);

      requests.push({
        label,
        status: response.status,
        ok: response.ok,
        rateLimit: {
          limit:
            response.headers.get('x-ratelimit-limit') ??
            response.headers.get('ratelimit-limit') ??
            null,
          remaining:
            response.headers.get('x-ratelimit-remaining') ??
            response.headers.get('ratelimit-remaining') ??
            null,
          reset:
            response.headers.get('x-ratelimit-reset') ??
            response.headers.get('ratelimit-reset') ??
            null
        }
      });

      return {
        response,
        body
      };
    }

    // Call 1: normal NCAAF event pool.
    const pendingUrl =
      `${BASE}/events` +
      `?sport=american-football` +
      `&league=usa-college` +
      `&status=pending` +
      `&limit=500` +
      `&apiKey=${encodeURIComponent(key)}`;

    const pendingResult = await fetchJson(
      'ncaaf_pending_events',
      pendingUrl
    );

    if (!pendingResult.response.ok) {
      return NextResponse.json(
        {
          ok: false,
          callsUsed,
          requests,
          error: `Pending events HTTP ${pendingResult.response.status}`,
          providerResponse: pendingResult.body
        },
        { status: 502 }
      );
    }

    const pendingEvents = list(pendingResult.body);

    const keywordMatches = pendingEvents
      .filter(event => {
        try {
          return containsFutureKeyword(JSON.stringify(event));
        } catch {
          return false;
        }
      })
      .slice(0, 50)
      .map(sanitizeEvent);

    const sampleEvents = pendingEvents
      .slice(0, 15)
      .map(sanitizeEvent);

    const eventKeys = [
      ...new Set(
        pendingEvents.flatMap(event =>
          event && typeof event === 'object'
            ? Object.keys(event)
            : []
        )
      )
    ].sort();

    // Call 2: discover all American-football leagues.
    const leaguesUrl =
      `${BASE}/leagues` +
      `?sport=american-football` +
      `&all=true` +
      `&apiKey=${encodeURIComponent(key)}`;

    const leaguesResult = await fetchJson(
      'american_football_all_leagues',
      leaguesUrl
    );

    const allLeagues = leaguesResult.response.ok
      ? list(leaguesResult.body)
      : [];

    const leagueCandidates = allLeagues
      .filter(league => {
        try {
          return containsLeagueDiscoveryKeyword(
            JSON.stringify(league)
          );
        } catch {
          return false;
        }
      })
      .map(sanitizeLeague)
      .slice(0, 100);

    const leagueKeys = [
      ...new Set(
        allLeagues.flatMap(league =>
          league && typeof league === 'object'
            ? Object.keys(league)
            : []
        )
      )
    ].sort();

    return NextResponse.json({
      ok: true,
      mode: 'ODDS_API_NCAAF_FUTURES_DIAGNOSTIC_V2',
      readOnly: true,
      callsUsed,

      eventDiscovery: {
        totalPendingEvents: pendingEvents.length,
        futuresKeywordMatches: keywordMatches.length,
        eventKeys,
        sampleEvents,
        keywordMatches
      },

      leagueDiscovery: {
        requestOk: leaguesResult.response.ok,
        status: leaguesResult.response.status,
        totalLeagues: allLeagues.length,
        candidateCount: leagueCandidates.length,
        leagueKeys,
        candidates: leagueCandidates,
        providerResponseIfFailed: leaguesResult.response.ok
          ? null
          : leaguesResult.body
      },

      requests,

      notes: [
        'No Supabase writes were performed.',
        'ODDS_API_KEY is never returned.',
        'This diagnostic uses two provider requests total.',
        'The first call checks normal NCAAF events.',
        'The second call discovers American-football leagues.',
        'No candidate league odds are requested yet.'
      ]
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || String(error)
      },
      { status: 500 }
    );
  }
}
