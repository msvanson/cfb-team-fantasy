import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CFBD_BASE = 'https://api.collegefootballdata.com';

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured');
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function cfbdFetch(path) {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error('CFBD_API_KEY is not configured');

  const response = await fetch(`${CFBD_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    const error = new Error(
      `CFBD ${response.status}: ${text.slice(0, 300)}`
    );
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function normalizeName(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '');

  const aliases = {
    appalachianstate: 'appstate',
    floridainternational: 'fiu',
    fiu: 'fiu',
    miamifl: 'miami',
    sanjosestate: 'sanjosestate',
    louisianamonroe: 'ulm',
    ulmonroe: 'ulm',
    massachusetts: 'umass',
    umass: 'umass',
  };

  return aliases[normalized] || normalized;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function indexByTeam(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const key = normalizeName(row?.team);
    if (key) map.set(key, row);
  }

  return map;
}

export async function importTeamRatings({
  year = 2026,
  throughWeek = 0,
  seasonType = 'regular',
} = {}) {
  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('id, year')
    .eq('year', year)
    .single();

  if (seasonError) throw seasonError;

  const { data: baselineTeams, error: teamsError } = await supabase
  .from('preseason_win_totals')
  .select(`
    team_id,
    teams (
      id,
      school
    )
  `)
  .eq('season_id', season.id);

if (teamsError) throw teamsError;

const teams = (baselineTeams || [])
  .map(row => row.teams)
  .filter(Boolean);

  const encodedType = encodeURIComponent(seasonType);

  const [sp, srs, elo, previousElo, fpi, core] = await Promise.all([
  cfbdFetch(`/ratings/sp?year=${year}`),
  cfbdFetch(`/ratings/srs?year=${year}`),
  cfbdFetch(
    `/ratings/elo?year=${year}&week=${throughWeek}&seasonType=${encodedType}`
  ),
  cfbdFetch(`/ratings/elo?year=${year - 1}&seasonType=postseason`),
  cfbdFetch(`/ratings/fpi?year=${year}`),
  cfbdFetch(`/ratings/core?year=${year}`),
]);

  const sources = {
  sp: indexByTeam(sp),
  srs: indexByTeam(srs),
  elo: indexByTeam(elo),
  previousElo: indexByTeam(previousElo),
  fpi: indexByTeam(fpi),
  core: indexByTeam(core),
};

  const rows = [];
  const unmatched = [];

  for (const team of teams || []) {
    const key = normalizeName(team.school);

    const spRow = sources.sp.get(key) || null;
    const srsRow = sources.srs.get(key) || null;
    const eloRow = sources.elo.get(key) || null;
    const previousEloRow = sources.previousElo.get(key) || null;

const effectiveEloRow = eloRow || previousEloRow;
const eloSource = eloRow
  ? `${year}_current`
  : previousEloRow
    ? `${year - 1}_final`
    : null;
    const fpiRow = sources.fpi.get(key) || null;
    const coreRow = sources.core.get(key) || null;

    if (!spRow && !srsRow && !eloRow && !fpiRow && !coreRow) {
      unmatched.push(team.school);
      continue;
    }

    rows.push({
      season_id: season.id,
      team_id: team.id,
      through_week: throughWeek,
      season_type: seasonType,

      source_team_name:
        spRow?.team ||
        srsRow?.team ||
        eloRow?.team ||
        fpiRow?.team ||
        coreRow?.team ||
        team.school,

      sp_rating: toNumber(spRow?.rating),
      sp_ranking: toNumber(spRow?.ranking),
      sp_second_order_wins: toNumber(spRow?.secondOrderWins),
      sp_sos: toNumber(spRow?.sos),

      srs_rating: toNumber(srsRow?.rating),
      srs_ranking: toNumber(srsRow?.ranking),

      elo: toNumber(effectiveEloRow?.elo),

      fpi: toNumber(fpiRow?.fpi),

      core_overall: toNumber(coreRow?.overall),
      core_offense: toNumber(coreRow?.offense),
      core_defense: toNumber(coreRow?.defense),
      core_offense_plays: toNumber(coreRow?.offensePlays),
      core_defense_plays: toNumber(coreRow?.defensePlays),
      core_through_week: toNumber(coreRow?.throughWeek),
      core_through_season_type:
        coreRow?.throughSeasonType || null,
      core_model_version:
        coreRow?.modelVersion || null,

      source_data: {
        sp: spRow,
        srs: srsRow,
        elo: effectiveEloRow,
eloSource,
currentSeasonElo: eloRow,
previousSeasonElo: previousEloRow,
        fpi: fpiRow,
        core: coreRow,
      },

      captured_at: new Date().toISOString(),
    });
  }

  if (rows.length) {
    const { error } = await supabase
      .from('team_rating_snapshots')
      .upsert(rows, {
        onConflict:
          'season_id,team_id,through_week,season_type',
      });

    if (error) throw error;
  }

  return {
    ok: true,
    year,
    throughWeek,
    seasonType,
    saved: rows.length,
    unmatched,

    providerCounts: {
      sp: sp?.length || 0,
      srs: srs?.length || 0,
      elo: elo?.length || 0,
      previousElo: previousElo?.length || 0,
      fpi: fpi?.length || 0,
      core: core?.length || 0,
    },
  };
}
