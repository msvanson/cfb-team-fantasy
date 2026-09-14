alter table public.owners
  add column if not exists emblem_config jsonb;

alter table public.owners
  drop constraint if exists owners_emblem_config_check;

alter table public.owners
  add constraint owners_emblem_config_check
  check (
    emblem_config is null
    or coalesce(
      jsonb_typeof(emblem_config) = 'object'
      and emblem_config ->> 'version' = '1'
      and jsonb_typeof(
        emblem_config -> 'layers'
      ) = 'array'
      and jsonb_array_length(
        emblem_config -> 'layers'
      ) between 1 and 4
      and octet_length(
        emblem_config::text
      ) <= 4096,
      false
    )
  );
