alter table public.weekly_game_odds
  add column if not exists closing_home_win_probability numeric,
  add column if not exists closing_away_win_probability numeric,
  add column if not exists closing_odds_updated_at timestamptz,
  add column if not exists closing_fetched_at timestamptz,
  add column if not exists closing_books_used integer,
  add column if not exists closing_source text,
  add column if not exists live_home_win_probability numeric,
  add column if not exists live_away_win_probability numeric,
  add column if not exists live_odds_updated_at timestamptz,
  add column if not exists live_fetched_at timestamptz,
  add column if not exists live_books_used integer,
  add column if not exists live_source text,
  add column if not exists game_phase text not null default 'pregame';

alter table public.weekly_game_odds
  drop constraint if exists weekly_game_odds_game_phase_check,
  add constraint weekly_game_odds_game_phase_check
    check (game_phase in ('pregame','live','final'));

alter table public.weekly_game_odds
  drop constraint if exists weekly_game_odds_closing_home_probability_check,
  add constraint weekly_game_odds_closing_home_probability_check
    check (
      closing_home_win_probability is null
      or closing_home_win_probability between 0 and 1
    );

alter table public.weekly_game_odds
  drop constraint if exists weekly_game_odds_closing_away_probability_check,
  add constraint weekly_game_odds_closing_away_probability_check
    check (
      closing_away_win_probability is null
      or closing_away_win_probability between 0 and 1
    );

alter table public.weekly_game_odds
  drop constraint if exists weekly_game_odds_live_home_probability_check,
  add constraint weekly_game_odds_live_home_probability_check
    check (
      live_home_win_probability is null
      or live_home_win_probability between 0 and 1
    );

alter table public.weekly_game_odds
  drop constraint if exists weekly_game_odds_live_away_probability_check,
  add constraint weekly_game_odds_live_away_probability_check
    check (
      live_away_win_probability is null
      or live_away_win_probability between 0 and 1
    );
