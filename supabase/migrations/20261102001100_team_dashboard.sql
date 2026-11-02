-- =============================================================================
-- Painel da equipe: contador de visitas sem cookies + indicadores agregados
-- =============================================================================

create or replace function private.is_team()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.user_roles r where r.user_id = auth.uid()) $$;
grant execute on function private.is_team() to authenticated;

-- Visitas: só página e dia (fuso de São Paulo). Nada que identifique a pessoa.
create table if not exists public.site_visits_daily (
  day      date    not null,
  path     text    not null check (path ~ '^/[a-z0-9/*_-]{0,79}$'),
  views    integer not null default 0 check (views >= 0),
  sessions integer not null default 0 check (sessions >= 0),
  mobile   integer not null default 0 check (mobile >= 0),
  primary key (day, path)
);
alter table public.site_visits_daily enable row level security;
-- sem políticas: ninguém lê ou escreve direto; só pelas funções abaixo.

create or replace function public.track_visit(p_path text, p_new_session boolean default false, p_mobile boolean default false)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_path text := lower(coalesce(p_path, ''));
  v_day  date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_path !~ '^/[a-z0-9/*_-]{0,79}$' then return; end if;
  insert into public.site_visits_daily as v (day, path, views, sessions, mobile)
  values (v_day, v_path, 1, case when p_new_session then 1 else 0 end, case when p_mobile then 1 else 0 end)
  on conflict (day, path) do update
    set views = v.views + 1,
        sessions = v.sessions + case when p_new_session then 1 else 0 end,
        mobile = v.mobile + case when p_mobile then 1 else 0 end;
end $$;
revoke all on function public.track_visit(text, boolean, boolean) from public;
grant execute on function public.track_visit(text, boolean, boolean) to anon, authenticated;

-- Indicadores agregados (qualquer papel da equipe). Sem nomes, e-mails ou documentos.
create or replace function public.team_dashboard(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days  integer := least(greatest(coalesce(p_days, 30), 7), 365);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_from  date := v_today - (v_days - 1);
  v_prev  date := v_from - v_days;
  r jsonb;
begin
  if not private.is_team() then
    raise exception 'Acesso só para a equipe.' using errcode = 'insufficient_privilege';
  end if;

  with d as (select generate_series(v_from, v_today, interval '1 day')::date as day),
  p as (select account_type, state, (created_at at time zone 'America/Sao_Paulo')::date as day from public.profiles)
  select jsonb_build_object(
    'days', v_days, 'from', v_from, 'to', v_today, 'generated_at', now(),
    'signups', jsonb_build_object(
      'total', (select count(*) from p),
      'by_type_total', (select coalesce(jsonb_object_agg(account_type, n), '{}') from (select account_type, count(*) n from p group by 1) x),
      'period', (select count(*) from p where day >= v_from),
      'previous', (select count(*) from p where day >= v_prev and day < v_from),
      'by_day', (select jsonb_agg(jsonb_build_object('day', d.day,
                   'pessoa', (select count(*) from p where p.day = d.day and account_type = 'pessoa'),
                   'ong', (select count(*) from p where p.day = d.day and account_type = 'ong'),
                   'empresa', (select count(*) from p where p.day = d.day and account_type = 'empresa')) order by d.day) from d),
      'by_state', (select coalesce(jsonb_agg(jsonb_build_object('uf', state, 'n', n) order by n desc), '[]')
                   from (select state, count(*) n from p where state is not null group by 1 order by 2 desc limit 10) x)
    ),
    'visits', jsonb_build_object(
      'views', (select coalesce(sum(views), 0) from public.site_visits_daily where day >= v_from),
      'sessions', (select coalesce(sum(sessions), 0) from public.site_visits_daily where day >= v_from),
      'mobile', (select coalesce(sum(mobile), 0) from public.site_visits_daily where day >= v_from),
      'previous_sessions', (select coalesce(sum(sessions), 0) from public.site_visits_daily where day >= v_prev and day < v_from),
      'by_day', (select jsonb_agg(jsonb_build_object('day', d.day,
                   'views', coalesce((select sum(views) from public.site_visits_daily v where v.day = d.day), 0),
                   'sessions', coalesce((select sum(sessions) from public.site_visits_daily v where v.day = d.day), 0)) order by d.day) from d),
      'top_pages', (select coalesce(jsonb_agg(jsonb_build_object('path', path, 'views', n) order by n desc), '[]')
                    from (select path, sum(views) n from public.site_visits_daily where day >= v_from group by 1 order by 2 desc limit 8) x)
    ),
    'animals', jsonb_build_object(
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.animals group by 1) x),
      'by_species', (select coalesce(jsonb_object_agg(species, n), '{}') from (select species, count(*) n from public.animals where status in ('disponivel', 'em_processo') group by 1) x),
      'published_period', (select count(*) from public.animals where (approved_at at time zone 'America/Sao_Paulo')::date >= v_from)
    ),
    'adoptions', jsonb_build_object(
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.adoption_applications group by 1) x),
      'period', (select count(*) from public.adoption_applications where (created_at at time zone 'America/Sao_Paulo')::date >= v_from),
      'concluded_period', (select count(*) from public.adoption_applications where status = 'concluido' and (updated_at at time zone 'America/Sao_Paulo')::date >= v_from)
    ),
    'organizations', jsonb_build_object(
      'by_status', (select coalesce(jsonb_object_agg(status, n), '{}') from (select status, count(*) n from public.organizations group by 1) x),
      'by_kind', (select coalesce(jsonb_object_agg(kind, n), '{}') from (select kind, count(*) n from public.organizations where status = 'aprovada' group by 1) x)
    ),
    'pending', jsonb_build_object(
      'organizations', (select count(*) from public.organizations where status = 'pendente'),
      'animals', (select count(*) from public.animals where status = 'em_analise'),
      'events', (select count(*) from public.events where status = 'em_analise'),
      'contacts', (select count(*) from public.contact_messages where status = 'novo'),
      'lgpd', (select count(*) from public.data_subject_requests where status in ('aberta', 'em_andamento'))
    )
  ) into r;
  return r;
end $$;
revoke all on function public.team_dashboard(integer) from public;
grant execute on function public.team_dashboard(integer) to authenticated;

-- Últimos cadastros: só administradores (contém nome e cidade).
create or replace function public.team_recent_signups(p_limit integer default 12)
returns table (full_name text, account_type public.account_type, city text, state char(2), created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  return query select p.full_name, p.account_type, p.city, p.state, p.created_at
    from public.profiles p order by p.created_at desc limit least(greatest(coalesce(p_limit, 12), 1), 50);
end $$;
revoke all on function public.team_recent_signups(integer) from public;
grant execute on function public.team_recent_signups(integer) to authenticated;

revoke execute on function public.team_dashboard(integer) from anon;
revoke execute on function public.team_recent_signups(integer) from anon;
