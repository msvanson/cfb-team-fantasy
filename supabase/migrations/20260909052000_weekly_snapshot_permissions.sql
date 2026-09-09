grant select on
  public.official_regular_standings,
  public.ownership_owner_full_totals,
  public.ownership_owner_fantasy_totals,
  public.ownership_owner_game_totals,
  public.ownership_game_ledger
to anon, authenticated;

create or replace function public.finalize_fantasy_week(
  p_season_id bigint,
  p_week_key text,
  p_start timestamptz,
  p_end timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $function$
declare
  inserted_count integer;
begin
  if now() < p_end then
    raise exception 'Fantasy week has not ended';
  end if;

  insert into public.weekly_snapshots(
    season_id,
    week_key,
    owner_id,
    weekly_rank,
    weekly_points,
    weekly_point_differential,
    result,
    finalized_at
  )
  with pts as (
    select
      o.id owner_id,
      o.draft_slot,
      coalesce(
        sum(sel.points) filter (where sel.week_key = p_week_key),
        0
      )::integer weekly_points
    from public.owners o
    left join public.ownership_scoring_event_ledger sel
      on sel.season_id = o.season_id
      and sel.owner_id = o.id
    where o.season_id = p_season_id
    group by o.id, o.draft_slot
  ),
  diffs as (
    select
      o.id owner_id,
      coalesce(
        sum(ogl.point_differential) filter (
          where ogl.completed
            and ogl.start_time >= p_start
            and ogl.start_time < p_end
        ),
        0
      )::integer weekly_point_differential
    from public.owners o
    left join public.ownership_game_ledger ogl
      on ogl.season_id = o.season_id
      and ogl.owner_id = o.id
    where o.season_id = p_season_id
    group by o.id
  ),
  ranked as (
    select
      pts.owner_id,
      pts.weekly_points,
      diffs.weekly_point_differential,
      row_number() over (
        order by
          pts.weekly_points desc,
          diffs.weekly_point_differential desc,
          pts.draft_slot asc
      )::integer weekly_rank,
      count(*) over ()::integer owner_count
    from pts
    join diffs using (owner_id)
  )
  select
    p_season_id,
    p_week_key,
    ranked.owner_id,
    ranked.weekly_rank,
    ranked.weekly_points,
    ranked.weekly_point_differential,
    case
      when ranked.weekly_rank = 1 then 'winner'
      when ranked.weekly_rank = ranked.owner_count then 'loser'
      else 'middle'
    end,
    now()
  from ranked
  on conflict (season_id, week_key, owner_id)
  do update set
    weekly_rank = excluded.weekly_rank,
    weekly_points = excluded.weekly_points,
    weekly_point_differential = excluded.weekly_point_differential,
    result = excluded.result,
    finalized_at = excluded.finalized_at;

  get diagnostics inserted_count = row_count;

  insert into public.weekly_snapshot_games(
    season_id,
    week_key,
    owner_id,
    team_id,
    game_id,
    opponent_team_id,
    start_time,
    team_score,
    opponent_score,
    point_differential,
    win_point,
    fantasy_points
  )
  select
    p_season_id,
    p_week_key,
    ogl.owner_id,
    ogl.team_id,
    ogl.game_id,
    case
      when g.home_team_id = ogl.team_id then g.away_team_id
      else g.home_team_id
    end,
    ogl.start_time,
    ogl.team_score,
    ogl.opp_score,
    ogl.point_differential,
    ogl.win_points,
    coalesce((
      select sum(sel.points)::integer
      from public.ownership_scoring_event_ledger sel
      where sel.season_id = p_season_id
        and sel.owner_id = ogl.owner_id
        and sel.team_id = ogl.team_id
        and sel.game_id = ogl.game_id
    ), 0)
  from public.ownership_game_ledger ogl
  join public.games g
    on g.id = ogl.game_id
  where ogl.season_id = p_season_id
    and ogl.completed
    and ogl.start_time >= p_start
    and ogl.start_time < p_end
  on conflict (season_id, week_key, owner_id, team_id, game_id)
  do update set
    team_score = excluded.team_score,
    opponent_score = excluded.opponent_score,
    point_differential = excluded.point_differential,
    win_point = excluded.win_point,
    fantasy_points = excluded.fantasy_points;

  return inserted_count;
end;
$function$;

revoke all on function public.finalize_fantasy_week(
  bigint,
  text,
  timestamptz,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.finalize_fantasy_week(
  bigint,
  text,
  timestamptz,
  timestamptz
) to service_role;
