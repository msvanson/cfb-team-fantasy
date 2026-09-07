alter table public.owners
  add column if not exists roster_name text,
  add column if not exists avatar_key text not null default 'helmet',
  add column if not exists avatar_color text not null default 'blue',
  add column if not exists identity_updated_at timestamptz not null default now();

alter table public.owners
  drop constraint if exists owners_roster_name_check;

alter table public.owners
  add constraint owners_roster_name_check
  check (
    roster_name is null
    or (
      roster_name = btrim(roster_name)
      and char_length(roster_name) between 3 and 30
    )
  );

alter table public.owners
  drop constraint if exists owners_avatar_key_check;

alter table public.owners
  add constraint owners_avatar_key_check
  check (
    avatar_key in (
      'helmet',
      'football',
      'trophy',
      'stadium',
      'playbook',
      'megaphone',
      'goalpost',
      'star'
    )
  );

alter table public.owners
  drop constraint if exists owners_avatar_color_check;

alter table public.owners
  add constraint owners_avatar_color_check
  check (
    avatar_color in (
      'blue',
      'green',
      'red',
      'gold',
      'purple',
      'orange',
      'teal',
      'slate'
    )
  );

create unique index if not exists
  owners_season_roster_name_unique
on public.owners (
  season_id,
  lower(roster_name)
)
where roster_name is not null;

update public.owners
set
  avatar_key = (
    array[
      'helmet',
      'football',
      'trophy',
      'stadium',
      'playbook',
      'megaphone',
      'goalpost',
      'star'
    ]
  )[mod(greatest(draft_slot, 1) - 1, 8) + 1],
  avatar_color = (
    array[
      'blue',
      'green',
      'red',
      'gold',
      'purple',
      'orange',
      'teal',
      'slate'
    ]
  )[mod(greatest(draft_slot, 1) - 1, 8) + 1]
where
  avatar_key = 'helmet'
  and avatar_color = 'blue';

alter table public.user_profiles
  add column if not exists theme_key text not null default 'midnight';

alter table public.user_profiles
  drop constraint if exists user_profiles_theme_key_check;

alter table public.user_profiles
  add constraint user_profiles_theme_key_check
  check (
    theme_key in (
      'midnight',
      'stadium',
      'crimson',
      'royal'
    )
  );
