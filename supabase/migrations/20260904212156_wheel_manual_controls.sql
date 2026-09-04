alter table public.wheel_entries
  add column if not exists removed_at timestamptz;

alter table public.wheel_entries
  drop constraint if exists wheel_entries_status_check;

alter table public.wheel_entries
  add constraint wheel_entries_status_check
  check (
    status in (
      'pending',
      'approved',
      'rejected',
      'selected',
      'removed'
    )
  );

alter table public.wheel_draws
  add column if not exists draw_type text not null default 'weekly';

alter table public.wheel_draws
  drop constraint if exists wheel_draws_draw_type_check;

alter table public.wheel_draws
  add constraint wheel_draws_draw_type_check
  check (draw_type in ('weekly','manual'));

create or replace function public.draw_weekly_wheel(
  p_season_id bigint,
  p_draw_key text,
  p_week_label text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  existing_draw public.wheel_draws%rowtype;
  chosen_entry public.wheel_entries%rowtype;
  snapshot jsonb;
  new_draw public.wheel_draws%rowtype;
begin
  if p_season_id is null
    or nullif(btrim(p_draw_key), '') is null
    or nullif(btrim(p_week_label), '') is null
  then
    raise exception
      'season, draw key and week label are required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'weekly-wheel-season:' || p_season_id::text,
      0
    )
  );

  select *
  into existing_draw
  from public.wheel_draws
  where season_id = p_season_id
    and draw_key = p_draw_key;

  if found then
    return jsonb_build_object(
      'drawn', false,
      'reason', 'already_drawn',
      'drawId', existing_draw.id,
      'selectedEntryId',
        existing_draw.selected_entry_id
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'item_text', item_text
      )
      order by approved_at, id
    ),
    '[]'::jsonb
  )
  into snapshot
  from public.wheel_entries
  where season_id = p_season_id
    and status = 'approved';

  if jsonb_array_length(snapshot) = 0 then
    return jsonb_build_object(
      'drawn', false,
      'reason', 'no_approved_entries'
    );
  end if;

  select *
  into chosen_entry
  from public.wheel_entries
  where season_id = p_season_id
    and status = 'approved'
  order by random()
  limit 1
  for update;

  insert into public.wheel_draws(
    season_id,
    draw_key,
    week_label,
    selected_entry_id,
    selected_text,
    entry_snapshot,
    draw_type
  )
  values(
    p_season_id,
    p_draw_key,
    btrim(p_week_label),
    chosen_entry.id,
    chosen_entry.item_text,
    snapshot,
    'weekly'
  )
  returning * into new_draw;

  update public.wheel_entries
  set
    status = 'selected',
    selected_at = new_draw.drawn_at
  where id = chosen_entry.id;

  return jsonb_build_object(
    'drawn', true,
    'drawId', new_draw.id,
    'selectedEntryId',
      new_draw.selected_entry_id,
    'selectedText',
      new_draw.selected_text,
    'entryCount',
      jsonb_array_length(snapshot),
    'drawType', 'weekly'
  );
end;
$function$;

create or replace function public.force_wheel_spin(
  p_season_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  manual_key text;
  manual_label text;
  result jsonb;
begin
  if p_season_id is null then
    raise exception 'season is required';
  end if;

  manual_key :=
    'manual-' || gen_random_uuid()::text;

  manual_label :=
    'Commissioner Spin · ' ||
    to_char(
      timezone('America/New_York', now()),
      'Mon FMDD, YYYY FMHH12:MI AM'
    ) ||
    ' ET';

  result := public.draw_weekly_wheel(
    p_season_id,
    manual_key,
    manual_label
  );

  if coalesce(
    (result->>'drawn')::boolean,
    false
  ) then
    update public.wheel_draws
    set draw_type = 'manual'
    where id = (result->>'drawId')::bigint;

    result :=
      result ||
      jsonb_build_object(
        'drawType', 'manual',
        'weekLabel', manual_label
      );
  end if;

  return result;
end;
$function$;

revoke all on function
  public.force_wheel_spin(bigint)
  from public, anon, authenticated;

grant execute on function
  public.force_wheel_spin(bigint)
  to service_role;
