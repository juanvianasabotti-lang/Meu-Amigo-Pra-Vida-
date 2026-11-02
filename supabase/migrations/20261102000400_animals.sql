-- =============================================================================
-- 0004 · Animais para adoção, fotos e favoritos
-- =============================================================================
-- Quem pode anunciar: pessoa física (doação de um animal) e ONG/protetor.
-- Empresas participam pela vitrine de parceiros, campanhas e eventos.
-- Todo anúncio passa por moderação antes de ficar público.
-- =============================================================================

create table public.animals (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references public.profiles (id) on delete cascade,
  organization_id      uuid references public.organizations (id) on delete set null,
  publisher_name       text not null default '',
  name                 text not null check (char_length(name) between 1 and 60),
  slug                 text not null unique,
  species              public.species not null,
  sex                  public.animal_sex not null,
  size                 public.animal_size not null,
  age_group            public.age_group not null,
  birth_estimate       date,
  breed                text not null default 'SRD (vira-lata)' check (char_length(breed) between 2 and 60),
  coat_color           text check (coat_color is null or char_length(coat_color) <= 60),
  weight_kg            numeric(5, 2) check (weight_kg is null or (weight_kg > 0 and weight_kg < 150)),
  description          text not null check (char_length(description) between 30 and 4000),
  personality          text[] not null default '{}' check (cardinality(personality) <= 10),
  good_with_children   boolean,
  good_with_dogs       boolean,
  good_with_cats       boolean,
  neutered             boolean not null default false,
  vaccinated           boolean not null default false,
  dewormed             boolean not null default false,
  microchipped         boolean not null default false,
  special_needs        boolean not null default false,
  special_needs_notes  text check (special_needs_notes is null or char_length(special_needs_notes) <= 1000),
  health_notes         text check (health_notes is null or char_length(health_notes) <= 1000),
  adoption_requirements text check (adoption_requirements is null or char_length(adoption_requirements) <= 1000),
  city                 text not null check (char_length(city) between 2 and 80),
  state                char(2) not null check (public.is_valid_uf(state)),
  status               public.animal_status not null default 'em_analise',
  is_urgent            boolean not null default false,
  approved_at          timestamptz,
  reviewed_by          uuid references public.profiles (id) on delete set null,
  review_note          text check (review_note is null or char_length(review_note) <= 1000),
  adopted_at           timestamptz,
  submitted_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  search               tsvector generated always as (
                         to_tsvector('portuguese'::regconfig,
                           coalesce(name, '') || ' ' || coalesce(breed, '') || ' ' || coalesce(coat_color, '') || ' ' ||
                           coalesce(city, '') || ' ' || coalesce(description, ''))) stored,
  constraint birth_estimate_range check (birth_estimate is null or birth_estimate >= date '1990-01-01')
);
create index animals_public_idx  on public.animals (status, species, size, age_group, sex);
create index animals_geo_idx     on public.animals (state, city);
create index animals_owner_idx   on public.animals (owner_id);
create index animals_org_idx     on public.animals (organization_id);
create index animals_search_idx  on public.animals using gin (search);

create table public.animal_photos (
  id            uuid primary key default gen_random_uuid(),
  animal_id     uuid not null references public.animals (id) on delete cascade,
  storage_path  text not null unique check (char_length(storage_path) <= 300),
  position      smallint not null default 0 check (position between 0 and 20),
  is_cover      boolean not null default false,
  width         int check (width is null or width between 1 and 10000),
  height        int check (height is null or height between 1 and 10000),
  alt_text      text check (alt_text is null or char_length(alt_text) <= 200),
  created_at    timestamptz not null default now()
);
create index animal_photos_animal_idx on public.animal_photos (animal_id, position);
create unique index animal_photos_one_cover on public.animal_photos (animal_id) where is_cover;

create table public.favorites (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  animal_id   uuid not null references public.animals (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, animal_id)
);
create index favorites_animal_idx on public.favorites (animal_id);

create trigger animals_updated_at before update on public.animals
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Autorização
-- -----------------------------------------------------------------------------
create or replace function private.animal_is_public(p_animal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.animals a
    left join public.organizations o on o.id = a.organization_id
    where a.id = p_animal
      and a.status in ('disponivel', 'em_processo', 'adotado')
      and a.approved_at is not null
      and (a.organization_id is null or o.status = 'aprovada'))
$$;

create or replace function private.manages_animal(p_animal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.animals a where a.id = p_animal and a.owner_id = auth.uid())
$$;
grant execute on function private.animal_is_public(uuid), private.manages_animal(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Regras de negócio
-- -----------------------------------------------------------------------------
create or replace function private.animals_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_type    public.account_type;
  v_first   text;
  v_org     public.organizations%rowtype;
  v_active  int;
  v_staff   boolean := private.is_staff();
  v_api     boolean := private.is_api_user();
begin
  if tg_op = 'INSERT' then
    if v_api and not v_staff then
      new.owner_id := auth.uid();
    end if;
    new.slug := private.unique_slug(new.name);
  elsif new.owner_id <> old.owner_id or new.slug <> old.slug or new.created_at <> old.created_at then
    if v_api and not v_staff then
      raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  select p.account_type, p.display_name into v_type, v_first from public.profiles p where p.id = new.owner_id;
  if v_type is null then
    raise exception 'Perfil não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  if v_type = 'empresa' then
    raise exception 'Empresas participam pela vitrine, campanhas e eventos. O cadastro de animais é feito por ONGs, protetores e pessoas.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_type = 'ong' then
    select * into v_org from public.organizations o where o.owner_id = new.owner_id;
    if v_org.id is null then
      raise exception 'Conclua o cadastro da ONG antes de anunciar animais.' using errcode = 'check_violation';
    end if;
    new.organization_id := v_org.id;
    new.publisher_name  := v_org.trade_name;
  else
    new.organization_id := null;
    new.publisher_name  := coalesce(nullif(v_first, ''), 'Doador') || ' (pessoa física)';
  end if;

  if v_api and not v_staff then
    -- campos de moderação
    if tg_op = 'INSERT' then
      new.approved_at := null; new.reviewed_by := null; new.review_note := null; new.adopted_at := null;
      new.is_urgent := false;
      -- limite anti-abuso para pessoa física (evita comércio disfarçado)
      if v_type = 'pessoa' then
        select count(*) into v_active from public.animals a
         where a.owner_id = new.owner_id and a.status in ('rascunho', 'em_analise', 'disponivel', 'em_processo');
        if v_active >= 5 then
          raise exception 'Limite de 5 anúncios ativos por pessoa. Para mais, cadastre-se como protetor ou ONG.'
            using errcode = 'check_violation';
        end if;
      end if;
      if new.status not in ('rascunho', 'em_analise') then new.status := 'em_analise'; end if;
    else
      new.approved_at := old.approved_at; new.reviewed_by := old.reviewed_by; new.review_note := old.review_note;
      new.is_urgent := case when v_type = 'ong' then new.is_urgent else old.is_urgent end;
      if new.status <> old.status then
        if old.status = 'adotado' and new.status <> 'arquivado' then
          raise exception 'Animal já adotado.' using errcode = 'check_violation';
        elsif new.status in ('rascunho', 'em_analise', 'arquivado') then
          null; -- permitido
        elsif new.status in ('disponivel', 'em_processo', 'adotado') then
          if old.approved_at is null then
            raise exception 'O anúncio ainda está em análise pela moderação.' using errcode = 'insufficient_privilege';
          end if;
        else
          raise exception 'Somente a moderação pode definir este status.' using errcode = 'insufficient_privilege';
        end if;
      end if;
      -- Pessoa física que altera o texto de um anúncio aprovado volta para a análise
      if v_type = 'pessoa' and old.approved_at is not null
         and (new.name <> old.name or new.description <> old.description
              or coalesce(new.health_notes, '') <> coalesce(old.health_notes, '')
              or coalesce(new.adoption_requirements, '') <> coalesce(old.adoption_requirements, '')) then
        new.status := 'em_analise';
        new.approved_at := null;
      end if;
    end if;
  elsif v_staff and tg_op = 'UPDATE' and new.status <> old.status then
    new.reviewed_by := auth.uid();
    if new.status in ('disponivel', 'em_processo', 'adotado') and new.approved_at is null then
      new.approved_at := now();
    end if;
    if new.status = 'rejeitado' then
      new.approved_at := null;
    end if;
  end if;

  if new.status = 'em_analise' and (tg_op = 'INSERT' or old.status <> 'em_analise') then
    new.submitted_at := now();
  end if;
  if new.status = 'adotado' and new.adopted_at is null then
    new.adopted_at := now();
  end if;
  new.name := btrim(new.name);
  new.state := upper(new.state);
  return new;
end $$;

create trigger animals_guard before insert or update on public.animals
  for each row execute function private.animals_guard();

create or replace function private.animals_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    perform private.audit('animal_status_' || new.status::text, 'animals', new.id::text,
                          jsonb_build_object('de', old.status, 'para', new.status));
  end if;
  return null;
end $$;
create trigger animals_after after update on public.animals
  for each row execute function private.animals_after();

-- Mantém o nome público atualizado quando a ONG muda o nome fantasia
create or replace function private.org_name_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.trade_name is distinct from old.trade_name then
    update public.animals set publisher_name = new.trade_name where organization_id = new.id;
  end if;
  return null;
end $$;
create trigger organizations_name_sync after update of trade_name on public.organizations
  for each row execute function private.org_name_sync();

-- Fotos: no máximo 8 por animal; o arquivo precisa estar na pasta do dono do anúncio
create or replace function private.animal_photos_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_owner uuid;
  v_count int;
begin
  select a.owner_id into v_owner from public.animals a where a.id = new.animal_id;
  if v_owner is null then
    raise exception 'Animal não encontrado.' using errcode = 'foreign_key_violation';
  end if;
  if new.storage_path not like v_owner::text || '/' || new.animal_id::text || '/%' then
    raise exception 'Caminho de arquivo inválido.' using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' then
    select count(*) into v_count from public.animal_photos p where p.animal_id = new.animal_id;
    if v_count >= 8 then
      raise exception 'Máximo de 8 fotos por animal.' using errcode = 'check_violation';
    end if;
  elsif new.animal_id <> old.animal_id or new.storage_path <> old.storage_path then
    raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger animal_photos_guard before insert or update on public.animal_photos
  for each row execute function private.animal_photos_guard();
