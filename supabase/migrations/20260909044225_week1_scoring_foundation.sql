-- Make all owner-facing scoring respect the exact ownership window.

create or replace view public.owner_standings as
select
  s.season_id,
  s.owner_id,
  s.owner_name,
  s.draft_slot,
  s.fantasy_points,
  s.official_rank::bigint as rank,
  s.wins,
  (s.games_completed - s.wins)::integer as losses,
  s.point_differential
from public.official_regular_standings s;

alter view public.owner_standings set (security_invoker = true);

create or replace view public.owner_standings_with_movement as
with latest_finalized as (
  select
    season_id,
    max(finalized_at) as finalized_at
  from public.weekly_snapshots
  group by season_id
),
prior as (
  select
    ws.season_id,
    ws.owner_id,
    ws.weekly_rank as prior_rank,
    ws.finalized_at
  from public.weekly_snapshots ws
  join latest_finalized lf
    on lf.season_id = ws.season_id
   and lf.finalized_at = ws.finalized_at
)
select
  os.season_id,
  os.owner_id,
  os.owner_name,
  os.draft_slot,
  os.fantasy_points,
  os.rank,
  os.wins,
  os.losses,
  os.point_differential,
  p.prior_rank,
  case
    when p.prior_rank is null then 0
    else p.prior_rank - os.rank::integer
  end as rank_movement,
  p.finalized_at as movement_since
from public.owner_standings os
left join prior p
  on p.season_id = os.season_id
 and p.owner_id = os.owner_id;

alter view public.owner_standings_with_movement
  set (security_invoker = true);

create or replace view public.weekly_owner_points as
select
  o.season_id,
  o.id as owner_id,
  o.name as owner_name,
  l.week_key,
  coalesce(sum(l.points), 0)::integer as weekly_points
from public.owners o
join public.ownership_scoring_event_ledger l
  on l.season_id = o.season_id
 and l.owner_id = o.id
group by
  o.season_id,
  o.id,
  o.name,
  l.week_key;

alter view public.weekly_owner_points set (security_invoker = true);

create or replace view public.weekly_winners as
select
  ws.season_id,
  ws.week_key,
  ws.owner_id,
  o.name as owner_name,
  ws.weekly_points
from public.weekly_snapshots ws
join public.owners o
  on o.id = ws.owner_id
 and o.season_id = ws.season_id
where ws.result = 'winner';

alter view public.weekly_winners set (security_invoker = true);

create or replace view public.owner_weekly_summary as
select
  o.season_id,
  o.id as owner_id,
  o.name as owner_name,
  count(ws.id) filter (where ws.result = 'winner')::integer as weekly_wins,
  coalesce(max(ws.weekly_points), 0)::integer as highest_weekly_score
from public.owners o
left join public.weekly_snapshots ws
  on ws.season_id = o.season_id
 and ws.owner_id = o.id
group by
  o.season_id,
  o.id,
  o.name;

alter view public.owner_weekly_summary set (security_invoker = true);

create or replace view public.owner_previous_teams as
with fantasy as (
  select
    ownership_id,
    coalesce(sum(points), 0)::integer as fantasy_points_earned
  from public.ownership_scoring_event_ledger
  group by ownership_id
),
game_totals as (
  select
    ownership_id,
    coalesce(sum(win_points), 0)::integer as wins_while_owned,
    coalesce(
      sum(point_differential) filter (where completed),
      0
    )::integer as point_differential_while_owned
  from public.ownership_game_ledger
  group by ownership_id
)
select
  h.id as ownership_id,
  h.season_id,
  h.owner_id,
  o.name as owner_name,
  h.team_id,
  t.school,
  t.abbreviation,
  t.mascot,
  c.code as conference_code,
  h.acquired_at,
  h.released_at,
  h.acquisition_type,
  h.transaction_id,
  coalesce(f.fantasy_points_earned, 0) as fantasy_points_earned,
  coalesce(g.wins_while_owned, 0) as wins_while_owned,
  coalesce(
    g.point_differential_while_owned,
    0
  ) as point_differential_while_owned
from public.team_ownership_history h
join public.owners o
  on o.id = h.owner_id
 and o.season_id = h.season_id
join public.teams t
  on t.id = h.team_id
left join public.roster_slots rs
  on rs.id = h.roster_slot_id
left join public.conferences c
  on c.id = rs.conference_id
left join fantasy f
  on f.ownership_id = h.id
left join game_totals g
  on g.ownership_id = h.id
where h.released_at is not null;

alter view public.owner_previous_teams set (security_invoker = true);

create or replace view public.owner_current_team_contributions
with (security_invoker = true) as
with fantasy as (
  select
    ownership_id,
    coalesce(sum(points), 0)::integer as fantasy_points
  from public.ownership_scoring_event_ledger
  group by ownership_id
),
game_totals as (
  select
    ownership_id,
    count(*) filter (where completed)::integer as games_completed,
    coalesce(sum(win_points), 0)::integer as wins,
    coalesce(
      sum(point_differential) filter (where completed),
      0
    )::integer as point_differential
  from public.ownership_game_ledger
  group by ownership_id
)
select
  h.season_id,
  h.owner_id,
  o.name as owner_name,
  h.id as ownership_id,
  h.team_id,
  t.school,
  t.abbreviation,
  t.mascot,
  c.code as conference_code,
  c.name as conference_name,
  c.display_order as conference_display_order,
  c.color_hex as conference_color,
  rs.display_name as roster_slot,
  h.acquired_at,
  h.acquisition_type,
  coalesce(f.fantasy_points, 0) as fantasy_points,
  coalesce(g.wins, 0) as wins,
  (
    coalesce(g.games_completed, 0) - coalesce(g.wins, 0)
  )::integer as losses,
  coalesce(g.point_differential, 0) as point_differential,
  (
    coalesce(f.fantasy_points, 0)::numeric
    + greatest(
        coalesce(ltp.projected_points, 0)
        - coalesce(tfp.fantasy_points, 0),
        0
      )
  )::numeric(8,3) as projected_points,
  ltp.snapshot_at as projection_snapshot_at,
  true as is_owned
from public.team_ownership_history h
join public.roster_entries re
  on re.season_id = h.season_id
 and re.owner_id = h.owner_id
 and re.team_id = h.team_id
join public.owners o
  on o.id = h.owner_id
 and o.season_id = h.season_id
join public.teams t
  on t.id = h.team_id
join public.team_memberships tm
  on tm.season_id = h.season_id
 and tm.team_id = h.team_id
left join public.conferences c
  on c.id = tm.league_conference_id
left join public.roster_slots rs
  on rs.id = re.roster_slot_id
left join fantasy f
  on f.ownership_id = h.id
left join game_totals g
  on g.ownership_id = h.id
left join public.latest_team_projections ltp
  on ltp.season_id = h.season_id
 and ltp.team_id = h.team_id
left join public.team_fantasy_points tfp
  on tfp.season_id = h.season_id
 and tfp.team_id = h.team_id
where h.released_at is null;

create or replace view public.owner_projection_totals as
with remaining as (
  select
    re.season_id,
    re.owner_id,
    coalesce(
      sum(
        greatest(
          coalesce(ltp.projected_points, 0)
          - coalesce(tfp.fantasy_points, 0),
          0
        )
      ),
      0
    ) as remaining_projected_points,
    max(ltp.snapshot_at) as snapshot_at
  from public.roster_entries re
  left join public.latest_team_projections ltp
    on ltp.season_id = re.season_id
   and ltp.team_id = re.team_id
  left join public.team_fantasy_points tfp
    on tfp.season_id = re.season_id
   and tfp.team_id = re.team_id
  group by
    re.season_id,
    re.owner_id
)
select
  o.season_id,
  o.id as owner_id,
  o.name as owner_name,
  (
    coalesce(f.fantasy_points, 0)::numeric
    + coalesce(r.remaining_projected_points, 0)
  )::numeric(8,3) as projected_points,
  r.snapshot_at
from public.owners o
left join public.ownership_owner_fantasy_totals f
  on f.season_id = o.season_id
 and f.owner_id = o.id
left join remaining r
  on r.season_id = o.season_id
 and r.owner_id = o.id;

alter view public.owner_projection_totals set (security_invoker = true);

grant select on public.owner_current_team_contributions
  to anon, authenticated, service_role;

grant select on public.owner_standings,
  public.owner_standings_with_movement,
  public.weekly_owner_points,
  public.weekly_winners,
  public.owner_weekly_summary,
  public.owner_previous_teams,
  public.owner_projection_totals
  to anon, authenticated, service_role;
