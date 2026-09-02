// Matchup Model v1
//
// Purpose:
// Produce an independent pregame win probability when a usable sportsbook
// moneyline is unavailable.
//
// Model v1 ratings:
//   SP+ = 50%
//   FPI = 35%
//   Elo = 15%
//
// Ratings are standardized across the FBS universe before being combined.
// The probability curve was initially calibrated against 2026 Week 1
// sportsbook probabilities.
//
// IMPORTANT:
// Sportsbook odds are NOT inputs to team strength. They are only used
// elsewhere as a higher-priority projection source and for model evaluation.

export const MATCHUP_MODEL_VERSION = 'v1';

export const MATCHUP_MODEL_WEIGHTS = {
  sp: 0.50,
  fpi: 0.35,
  elo: 0.15,
};

// Initial 2026 calibration.
//
// score = weighted standardized home strength
//       - weighted standardized away strength
//
// logit(home win probability) =
//   HOME_INTERCEPT + LOGIT_SLOPE * score
//
// Neutral-site games receive no home intercept.
export const MATCHUP_MODEL_CALIBRATION = {
  logitSlope: 1.47190164469548,
  homeIntercept: 0.303343434822482,
};

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function logistic(value) {
  return 1 / (1 + Math.exp(-value));
}

function mean(values) {
  if (!values.length) return null;

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values, average) {
  if (!values.length || average === null) return null;

  const variance =
    values.reduce(
      (sum, value) => sum + Math.pow(value - average, 2),
      0
    ) / values.length;

  const sd = Math.sqrt(variance);

  return sd > 0 ? sd : null;
}

function buildMetricStats(ratings, key) {
  const values = ratings
    .map((row) => finiteNumber(row?.[key]))
    .filter((value) => value !== null);

  const average = mean(values);
  const sd = standardDeviation(values, average);

  return {
    mean: average,
    sd,
    count: values.length,
  };
}

function zScore(value, stats) {
  const number = finiteNumber(value);

  if (
    number === null ||
    !stats ||
    stats.mean === null ||
    stats.sd === null ||
    stats.sd === 0
  ) {
    return null;
  }

  return (number - stats.mean) / stats.sd;
}

// Build the FBS-wide normalization context once for a ratings snapshot.
export function buildMatchupModelContext(ratings = []) {
  return {
    version: MATCHUP_MODEL_VERSION,

    stats: {
      sp: buildMetricStats(ratings, 'sp_rating'),
      fpi: buildMetricStats(ratings, 'fpi'),
      elo: buildMetricStats(ratings, 'elo'),
    },

    teamCount: ratings.length,
  };
}

function teamStrength(row, context) {
  const metrics = [
    {
      name: 'sp',
      weight: MATCHUP_MODEL_WEIGHTS.sp,
      z: zScore(row?.sp_rating, context?.stats?.sp),
    },
    {
      name: 'fpi',
      weight: MATCHUP_MODEL_WEIGHTS.fpi,
      z: zScore(row?.fpi, context?.stats?.fpi),
    },
    {
      name: 'elo',
      weight: MATCHUP_MODEL_WEIGHTS.elo,
      z: zScore(row?.elo, context?.stats?.elo),
    },
  ];

  const available = metrics.filter((metric) => metric.z !== null);

  if (!available.length) {
    return {
      available: false,
      strength: null,
      metricsUsed: [],
      effectiveWeights: {},
    };
  }

  // If a provider is temporarily missing, redistribute its weight across
  // the ratings that are actually available rather than falling to 50/50.
  const availableWeight = available.reduce(
    (sum, metric) => sum + metric.weight,
    0
  );

  const effectiveWeights = {};
  let strength = 0;

  for (const metric of available) {
    const effectiveWeight = metric.weight / availableWeight;

    effectiveWeights[metric.name] = effectiveWeight;

    strength += effectiveWeight * metric.z;
  }

  return {
    available: true,
    strength,
    metricsUsed: available.map((metric) => metric.name),
    effectiveWeights,
  };
}

export function calculateMatchupProbability({
  homeRatings,
  awayRatings,
  context,
  neutralSite = false,
}) {
  const home = teamStrength(homeRatings, context);
  const away = teamStrength(awayRatings, context);

  if (!home.available || !away.available) {
    return {
      ok: false,
      version: MATCHUP_MODEL_VERSION,
      reason: 'insufficient_ratings',
      homeWinProbability: 0.5,
      awayWinProbability: 0.5,
    };
  }

  const strengthDifference = home.strength - away.strength;

  const homeField =
    neutralSite === true
      ? 0
      : MATCHUP_MODEL_CALIBRATION.homeIntercept;

  const logit =
    homeField +
    MATCHUP_MODEL_CALIBRATION.logitSlope * strengthDifference;

  // Avoid literal 0% or 100% model predictions.
  const homeWinProbability = clamp(
    logistic(logit),
    0.01,
    0.99
  );

  return {
    ok: true,
    version: MATCHUP_MODEL_VERSION,

    homeWinProbability,
    awayWinProbability: 1 - homeWinProbability,

    neutralSite: neutralSite === true,

    strengthDifference,

    homeStrength: home.strength,
    awayStrength: away.strength,

    homeMetricsUsed: home.metricsUsed,
    awayMetricsUsed: away.metricsUsed,

    homeEffectiveWeights: home.effectiveWeights,
    awayEffectiveWeights: away.effectiveWeights,

    calibration: MATCHUP_MODEL_CALIBRATION,
  };
}

// Pregame probability hierarchy.
//
// 1. Valid sportsbook moneyline probability
// 2. No ML + favorite spread >= 20 -> 99% / 1%
// 3. Matchup Model v1
// 4. Emergency 50/50
//
// Spread convention:
// negative spread = home favorite
// positive spread = away favorite
export function choosePregameProbability({
  marketHomeProbability = null,
  marketAwayProbability = null,
  spread = null,
  modelResult = null,
}) {
  const marketHome = finiteNumber(marketHomeProbability);
  const marketAway = finiteNumber(marketAwayProbability);

  if (
    marketHome !== null &&
    marketAway !== null &&
    marketHome > 0 &&
    marketAway > 0
  ) {
    const total = marketHome + marketAway;

    if (total > 0) {
      return {
        source: 'moneyline',
        homeWinProbability: marketHome / total,
        awayWinProbability: marketAway / total,
      };
    }
  }

  const numericSpread = finiteNumber(spread);

  if (
    numericSpread !== null &&
    Math.abs(numericSpread) >= 20
  ) {
    const homeFavorite = numericSpread < 0;

    return {
      source: 'spread_20_plus',
      homeWinProbability: homeFavorite ? 0.99 : 0.01,
      awayWinProbability: homeFavorite ? 0.01 : 0.99,
      spread: numericSpread,
    };
  }

  if (modelResult?.ok) {
    return {
      source: 'matchup_model_v1',
      homeWinProbability: modelResult.homeWinProbability,
      awayWinProbability: modelResult.awayWinProbability,
    };
  }

  return {
    source: 'emergency_50_50',
    homeWinProbability: 0.5,
    awayWinProbability: 0.5,
  };
}
