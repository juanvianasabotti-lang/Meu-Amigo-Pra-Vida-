-- =============================================================================
-- 0006 · Campanhas e eventos, blog de conscientização, contato e LGPD
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Campanhas e eventos (ONGs e empresas parceiras aprovadas) — moderados
-- -----------------------------------------------------------------------------
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations (id) on delete cascade,
  kind             public.event_kind not null,
  title            text not null check (char_length(title) between 4 and 120),
  slug             text not null unique,
  summary          text not null check (char_length(summary) between 10 and 280),
  description      text check (description is null or char_length(description) <= 6000),
  cover_url        text check (cover_url is null or char_length(cover_url) <= 500),
  starts_at        timestamptz not null,
  ends_at          timestamptz,
  is_online        boolean not null default false,
  location_name    text check (location_name is null or char_length(location_name) <= 120),
  address          text check (address is null or char_length(address) <= 200),
  city             text check (city is null or char_length(city) between 2 and 80),
  state            char(2) check (state is null or public.is_valid_uf(state)),
  external_url     text check (external_url is null or public.is_https_url(external_url)),
  status           public.content_status not null default 'em_analise',
  reviewed_by      uuid references public.profiles (id) on delete set null,
  reviewed_at      timestamptz,
  review_note      text check (review_note is null or char_length(review_note) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint events_dates check (ends_at is null or ends_at >= starts_at),
  constraint events_place check (is_online or (city is not null and state is not null))
);
create index events_public_idx on public.events (status, starts_at);
create index events_org_idx    on public.events (organization_id);

create trigger events_updated_at before update on public.events
  for each row execute function private.set_updated_at();

create or replace function private.events_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_org public.organizations%rowtype;
begin
  select * into v_org from public.organizations o where o.id = new.organization_id;
  if tg_op = 'INSERT' then
    new.slug := private.unique_slug(new.title);
  elsif new.slug <> old.slug or new.organization_id <> old.organization_id then
    if private.is_api_user() and not private.is_staff() then
      raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if private.is_api_user() and not private.is_staff() then
    if v_org.owner_id is distinct from auth.uid() then
      raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
    end if;
    if v_org.status <> 'aprovada' then
      raise exception 'Sua organização precisa estar aprovada para publicar campanhas e eventos.'
        using errcode = 'insufficient_privilege';
    end if;
    if tg_op = 'INSERT' then
      new.reviewed_by := null; new.reviewed_at := null; new.review_note := null;
      if new.status not in ('rascunho', 'em_analise') then new.status := 'em_analise'; end if;
    else
      new.reviewed_by := old.reviewed_by; new.reviewed_at := old.reviewed_at; new.review_note := old.review_note;
      if new.status <> old.status and new.status not in ('rascunho', 'em_analise', 'encerrado') then
        raise exception 'Somente a moderação publica campanhas e eventos.' using errcode = 'insufficient_privilege';
      end if;
      -- edição de conteúdo publicado volta para análise
      if old.status = 'publicado' and new.status = 'publicado'
         and (new.title <> old.title or new.summary <> old.summary
              or new.description is distinct from old.description
              or new.cover_url is distinct from old.cover_url) then
        new.status := 'em_analise';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.status <> old.status and private.is_staff() then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if new.state is not null then new.state := upper(new.state); end if;
  return new;
end $$;
create trigger events_guard before insert or update on public.events
  for each row execute function private.events_guard();

-- -----------------------------------------------------------------------------
-- Blog de conscientização — somente equipe administrativa escreve
-- -----------------------------------------------------------------------------
create table public.blog_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(name) between 2 and 60),
  slug        text not null unique,
  color       text not null default 'laranja' check (color in ('laranja', 'azul', 'rosa', 'amarelo')),
  position    smallint not null default 0,
  created_at  timestamptz not null default now()
);

create table public.blog_posts (
  id               uuid primary key default gen_random_uuid(),
  author_id        uuid references public.profiles (id) on delete set null,
  category_id      uuid references public.blog_categories (id) on delete set null,
  title            text not null check (char_length(title) between 5 and 140),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  excerpt          text not null check (char_length(excerpt) between 20 and 300),
  content_md       text not null check (char_length(content_md) between 50 and 60000),
  cover_url        text check (cover_url is null or char_length(cover_url) <= 500),
  cover_alt        text check (cover_alt is null or char_length(cover_alt) <= 200),
  tags             text[] not null default '{}' check (cardinality(tags) <= 10),
  reading_minutes  smallint generated always as
                     (greatest(1, ceil(char_length(content_md) / 1000.0))::smallint) stored,
  status           public.post_status not null default 'rascunho',
  featured         boolean not null default false,
  published_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index blog_posts_public_idx on public.blog_posts (status, published_at desc);

create trigger blog_posts_updated_at before update on public.blog_posts
  for each row execute function private.set_updated_at();

create or replace function private.blog_posts_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.slug is null or new.slug = '' then
    new.slug := public.slugify(new.title);
  end if;
  if new.status = 'publicado' and new.published_at is null then
    new.published_at := now();
  end if;
  if tg_op = 'INSERT' and new.author_id is null then
    new.author_id := auth.uid();
  end if;
  return new;
end $$;
create trigger blog_posts_guard before insert or update on public.blog_posts
  for each row execute function private.blog_posts_guard();

-- -----------------------------------------------------------------------------
-- Fale conosco (inclui pedidos de parceria e dúvidas sobre privacidade)
-- -----------------------------------------------------------------------------
create table public.contact_messages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles (id) on delete set null,
  name        text not null check (char_length(name) between 2 and 120),
  email       extensions.citext not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 200),
  topic       text not null check (topic in ('duvida', 'parceria', 'imprensa', 'privacidade', 'denuncia_anuncio', 'outro')),
  message     text not null check (char_length(message) between 10 and 3000),
  consent     boolean not null check (consent),
  status      public.ticket_status not null default 'novo',
  created_at  timestamptz not null default now()
);
create index contact_messages_status_idx on public.contact_messages (status, created_at desc);

create or replace function private.recent_contact_count(p_email text)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.contact_messages c
   where c.email = p_email::extensions.citext and c.created_at > now() - interval '1 hour'
$$;
grant execute on function private.recent_contact_count(text) to anon, authenticated, service_role;

create or replace function private.contact_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_recent int;
begin
  if private.is_api_user() then
    new.user_id := auth.uid();
    new.status := 'novo';
    -- proteção simples contra envio em massa pelo mesmo e-mail
    v_recent := private.recent_contact_count(new.email::text);
    if v_recent >= 3 then
      raise exception 'Muitas mensagens em pouco tempo. Tente novamente mais tarde.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger contact_guard before insert on public.contact_messages
  for each row execute function private.contact_guard();

-- -----------------------------------------------------------------------------
-- LGPD: documentos legais versionados, consentimentos e direitos do titular
-- -----------------------------------------------------------------------------
create table public.legal_documents (
  id            uuid primary key default gen_random_uuid(),
  kind          public.legal_doc_kind not null,
  version       text not null check (version ~ '^\d+\.\d+$'),
  title         text not null check (char_length(title) <= 140),
  content_md    text not null,
  published_at  timestamptz,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (kind, version)
);

create table public.consents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  consent_type  public.consent_type not null,
  version       text not null check (char_length(version) <= 20),
  granted       boolean not null,
  source        text check (source is null or char_length(source) <= 80),
  user_agent    text check (user_agent is null or char_length(user_agent) <= 300),
  created_at    timestamptz not null default now()
);
create index consents_user_idx on public.consents (user_id, consent_type, created_at desc);
comment on table public.consents is 'Registro imutável (append-only) de concessões e revogações de consentimento.';

create table public.data_subject_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles (id) on delete set null,
  contact_email extensions.citext not null,
  request_type public.dsr_type not null,
  details      text check (details is null or char_length(details) <= 2000),
  status       public.dsr_status not null default 'aberta',
  response     text check (response is null or char_length(response) <= 4000),
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  due_at       timestamptz not null default (now() + interval '15 days'),
  created_at   timestamptz not null default now()
);
create index dsr_status_idx on public.data_subject_requests (status, due_at);

create or replace function private.consents_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_api_user() then
    new.user_id := auth.uid();
    new.created_at := now();
    if new.consent_type = 'compartilhamento_adocao' then
      raise exception 'Este consentimento é registrado automaticamente no pedido de adoção.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger consents_guard before insert on public.consents
  for each row execute function private.consents_guard();

create or replace function private.dsr_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' and private.is_api_user() then
    new.user_id := auth.uid();
    new.status := 'aberta';
    new.response := null; new.resolved_by := null; new.resolved_at := null;
    new.due_at := now() + interval '15 days';
    select coalesce(p.email, new.contact_email) into new.contact_email from public.profiles p where p.id = auth.uid();
  elsif tg_op = 'UPDATE' then
    if private.is_api_user() and not private.is_staff() then
      raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
    end if;
    if new.status <> old.status and new.status in ('concluida', 'negada') then
      new.resolved_by := auth.uid();
      new.resolved_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger dsr_guard before insert or update on public.data_subject_requests
  for each row execute function private.dsr_guard();

-- Situação atual dos consentimentos do usuário logado
create or replace function public.my_consents()
returns table (consent_type public.consent_type, version text, granted boolean, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select distinct on (c.consent_type) c.consent_type, c.version, c.granted, c.created_at
    from public.consents c
   where c.user_id = auth.uid()
   order by c.consent_type, c.created_at desc
$$;
revoke all on function public.my_consents() from public, anon;
grant execute on function public.my_consents() to authenticated;

-- Portabilidade / acesso (LGPD art. 18, II e V): exporta todos os dados do titular
create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then
    raise exception 'Faça login.' using errcode = 'insufficient_privilege';
  end if;
  select jsonb_build_object(
    'gerado_em', now(),
    'perfil', (select to_jsonb(p) from public.profiles p where p.id = v_uid),
    'cpf', (select pp.cpf from public.profile_private pp where pp.user_id = v_uid),
    'organizacao', (select to_jsonb(o) from public.organizations o where o.owner_id = v_uid),
    'organizacao_dados_privados', (select to_jsonb(op) from public.organization_private op
                                    join public.organizations o on o.id = op.organization_id where o.owner_id = v_uid),
    'animais_anunciados', coalesce((select jsonb_agg(to_jsonb(a) - 'search') from public.animals a where a.owner_id = v_uid), '[]'),
    'pedidos_de_adocao', coalesce((select jsonb_agg(to_jsonb(ap)) from public.adoption_applications ap
                                    where ap.applicant_id = v_uid), '[]'),
    'mensagens_enviadas', coalesce((select jsonb_agg(jsonb_build_object('pedido', m.application_id, 'texto', m.body,
                                    'enviada_em', m.created_at)) from public.application_messages m where m.sender_id = v_uid), '[]'),
    'favoritos', coalesce((select jsonb_agg(f.animal_id) from public.favorites f where f.user_id = v_uid), '[]'),
    'consentimentos', coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at) from public.consents c
                                 where c.user_id = v_uid), '[]'),
    'solicitacoes_lgpd', coalesce((select jsonb_agg(to_jsonb(d)) from public.data_subject_requests d
                                    where d.user_id = v_uid), '[]')
  ) into v_result;
  perform private.audit('dados_exportados', 'profiles', v_uid::text, '{}'::jsonb);
  return v_result;
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;

-- Eliminação (LGPD art. 18, VI). Os arquivos no Storage devem ser apagados antes
-- pelo app (a API de Storage não permite exclusão via SQL).
-- Pedidos de adoção enviados pelo titular são anonimizados (applicant_id -> null)
-- para preservar o histórico do animal sem identificar a pessoa.
create or replace function public.delete_my_account(p_confirmation text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Faça login.' using errcode = 'insufficient_privilege';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmação inválida.' using errcode = 'check_violation';
  end if;
  update public.adoption_applications
     set motivation = 'Removido a pedido do titular (LGPD).', caretaker_when_away = 'Removido',
         children_ages = null, other_pets = null, previous_pets = null,
         status = case when status in ('recusado', 'cancelado', 'concluido') then status else 'cancelado' end
   where applicant_id = v_uid;
  delete from public.application_messages where sender_id = v_uid;
  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (null, 'conta_eliminada', 'profiles', md5(v_uid::text), jsonb_build_object('em', now()));
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
