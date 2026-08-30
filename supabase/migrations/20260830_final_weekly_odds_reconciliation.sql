create or replace function public.reconcile_final_weekly_game_odds()
returns integer
language plpgsql
set search_path to 'public'
as $function$
declare
  updated_count integer;
begin
  update public.weekly_game_odds w
  set
    home_win_probability = case
      when g.winner_team_id = g.home_team_id then 1
      when g.winner_team_id = g.away_team_id then 0
      else w.home_win_probability
    end,
    away_win_probability = case
      when g.winner_team_id = g.away_team_id then 1
      when g.winner_team_id = g.home_team_id then 0
      else w.away_win_probability
    end,
    projection_source = 'final_result',
    game_phase = 'final'
  from public.games g
  where w.season_id = g.season_id
    and w.cfbd_game_id = g.cfbd_game_id
    and g.completed = true
    and g.winner_team_id is not null
    and g.winner_team_id in (g.home_team_id, g.away_team_id)
    and w.game_phase <> 'final';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$function$;

revoke execute on function public.reconcile_final_weekly_game_odds()
from public, anon, authenticated;

grant execute on function public.reconcile_final_weekly_game_odds()
to service_role;
