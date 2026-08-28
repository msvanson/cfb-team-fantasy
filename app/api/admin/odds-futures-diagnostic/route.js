import { NextResponse } from 'next/server';
import { isAdminAuthenticated } from '../../../../lib/admin-auth';

const BASE = 'https://api.odds-api.io/v3';
const BOOKMAKERS = 'DraftKings,FanDuel';
const MAX_CALLS = 7;

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

function sanitizeEvent(event) {
  return {
    id: event?.id ?? null,
    name: event?.name ?? event?.title ?? null,
    home: event?.home ?? null,
    away: event?.away ?? null,
    date: event?.date ?? event?.startTime ?? null,
    status: event?.status ?? null,
    league: event?.league ?? null
  };
}

function extractMarkets(body) {
  const bookmakers =
    body && typeof body === 'object' && body.bookmakers
      ? body.bookmakers
      : {};

  const result = [];

  for (const [bookmaker, markets] of Object.entries(bookmakers)) {
    if (!Array.isArray(markets)) continue;

    for (const market of markets) {
      result.push({
        bookmaker,
        name: market?.name ?? null,
        updatedAt: market?.updatedAt ?? null,
        oddsCount: Array.isArray(market?.odds)
          ? market.odds.length
          : 0,
        sampleOdds: Array.isArray(market?.odds)
          ? market.odds.slice(0, 3)
          : []
      });
    }
  }

  return result;
}

function summarizeOddsResult(event, response, body) {
  const markets = response.ok
    ? extractMarkets(body)
    : [];

  const marketNames = [
    ...new Set(
      markets
        .map(market => market.name)
        .filter(Boolean)
    )
  ].sort();

  const futureLikeMarkets = markets.filter(market =>
    containsFutureKeyword(market.name)
  );

  return {
    event: sanitizeEvent(event),
    requestOk: response.ok,
    status: response.status,
    marketCount: markets.length,
    marketNames,
    futureLikeMarketCount: futureLikeMarkets.length,
    futureLikeMarkets,
    markets,
    providerResponseIfFailed: response.ok
      ? null
      : body
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
      if (callsUsed >= MAX_CALLS) {
        throw new Error(
          `Diagnostic provider-call cap reached (${MAX_CALLS})`
        );
      }

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

    // Call 1:
    // Pull FBS/NCAA regular-season events.
    const regularSeasonUrl =
      `${BASE}/events` +
      `?sport=american-football` +
      `&league=usa-ncaa-regular-season` +
      `&status=pending` +
      `&limit=100` +
      `&apiKey=${encodeURIComponent(key)}`;

    const regularResult = await fetchJson(
      'ncaa_regular_season_events',
      regularSeasonUrl
    );

    const regularEvents = regularResult.response.ok
      ? list(regularResult.body)
      : [];

    // Call 2:
    // Pull NCAA Division I FBS postseason events.
    const postseasonUrl =
      `${BASE}/events` +
      `?sport=american-football` +
      `&league=usa-ncaa-division-i-fbs-post-season` +
      `&status=pending` +
      `&limit=100` +
      `&apiKey=${encodeURIComponent(key)}`;

    const postseasonResult = await fetchJson(
      'fbs_postseason_events',
      postseasonUrl
    );

    const postseasonEvents = postseasonResult.response.ok
      ? list(postseasonResult.body)
      : [];

    // Select up to 3 regular-season events and 2 postseason events.
    // Total provider calls can therefore never exceed 7:
    // 2 event-list calls + 5 odds calls.
    const selectedEvents = [
      ...regularEvents.slice(0, 3),
      ...postseasonEvents.slice(0, 2)
    ].filter(event => event?.id != null);

    const oddsInspection = [];

    for (const event of selectedEvents) {
      const oddsUrl =
        `${BASE}/odds` +
        `?eventId=${encodeURIComponent(event.id)}` +
        `&bookmakers=${encodeURIComponent(BOOKMAKERS)}` +
        `&apiKey=${encodeURIComponent(key)}`;

      const oddsResult = await fetchJson(
        `odds_event_${event.id}`,
        oddsUrl
      );

      oddsInspection.push(
        summarizeOddsResult(
          event,
          oddsResult.response,
          oddsResult.body
        )
      );
    }

    const allMarketNames = [
      ...new Set(
        oddsInspection.flatMap(item =>
          item.marketNames || []
        )
      )
    ].sort();

    const futureLikeResults = oddsInspection.filter(
      item => item.futureLikeMarketCount > 0
    );

    return NextResponse.json({
      ok: true,
      mode: 'ODDS_API_NCAAF_FUTURES_DIAGNOSTIC_V3',
      readOnly: true,
      callsUsed,
      maxCalls: MAX_CALLS,
      bookmakersRequested: [
        'DraftKings',
        'FanDuel'
      ],

      regularSeasonDiscovery: {
        requestOk: regularResult.response.ok,
        status: regularResult.response.status,
        eventCount: regularEvents.length,
        sampleEvents: regularEvents
          .slice(0, 10)
          .map(sanitizeEvent),
        providerResponseIfFailed:
          regularResult.response.ok
            ? null
            : regularResult.body
      },

      postseasonDiscovery: {
        requestOk: postseasonResult.response.ok,
        status: postseasonResult.response.status,
        eventCount: postseasonEvents.length,
        sampleEvents: postseasonEvents
          .slice(0, 10)
          .map(sanitizeEvent),
        providerResponseIfFailed:
          postseasonResult.response.ok
            ? null
            : postseasonResult.body
      },

      oddsInspection,

      summary: {
        eventsInspected: oddsInspection.length,
        allMarketNames,
        futureLikeEventCount: futureLikeResults.length,
        futureLikeResults
      },

      requests,

      notes: [
        'No Supabase writes were performed.',
        'ODDS_API_KEY is never returned.',
        'This diagnostic is capped at seven provider requests.',
        'It inspects up to three regular-season events and two FBS postseason events.',
        'Only DraftKings and FanDuel are requested.',
        'This test is intended to determine whether season-long/futures markets appear on normal event odds responses.'
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
