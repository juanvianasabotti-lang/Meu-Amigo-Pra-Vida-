-- =============================================================================
-- 0003 · Organizações: ONGs / protetores independentes e empresas parceiras
-- =============================================================================

create or replace function public.org_category(k public.org_kind)
returns public.account_type language sql immutable parallel safe set search_path = '' as $$
  select case when k in ('ong', 'protetor_independente') then 'ong'::public.account_type
              else 'empresa'::public.account_type end
$$;

create table public.organizations (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null unique references public.profiles (id) on delete cascade,
  kind                public.org_kind not null,
  category            public.account_type generated always as (public.org_category(kind)) stored,
  status              public.org_status not null default 'pendente',
  trade_name          text not null check (char_length(trade_name) between 2 and 120),
  slug                text not null unique,
  tagline             text check (tagline is null or char_length(tagline) <= 140),
  description         text check (description is null or char_length(description) <= 4000),
  services            text[] not null default '{}' check (cardinality(services) <= 20),
  email               extensions.citext,
  phone               text check (phone is null or public.is_valid_phone(phone)),
  whatsapp            text check (whatsapp is null or public.is_valid_phone(whatsapp)),
  website             text check (website is null or public.is_https_url(website)),
  instagram           text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  logo_url            text check (logo_url is null or char_length(logo_url) <= 500),
  cover_url           text check (cover_url is null or char_length(cover_url) <= 500),
  city                text check (city is null or char_length(city) between 2 and 80),
  state               char(2) check (state is null or public.is_valid_uf(state)),
  public_address      text,
  show_address        boolean not null default false,
  pix_key             text check (pix_key is null or char_length(pix_key) <= 140),
  pix_key_type        public.pix_key_type,
  accepts_volunteers  boolean not null default false,
  founded_year        smallint check (founded_year is null or founded_year between 1900 and 2100),
  partner_since       timestamptz,
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  review_note         text check (review_note is null or char_length(review_note) <= 1000),
  submitted_at        timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Pix (doação em dinheiro) só é exibido para ONGs e protetores
  constraint pix_only_for_ong check (pix_key is null or kind in ('ong', 'protetor_independente')),
  constraint pix_key_and_type check ((pix_key is null) = (pix_key_type is null))
);
create index organizations_status_idx on public.organizations (status, kind);
create index organizations_geo_idx    on public.organizations (state, city);
create index organizations_name_trgm  on public.organizations using gin (trade_name extensions.gin_trgm_ops);

create table public.organization_private (
  organization_id    uuid primary key references public.organizations (id) on delete cascade,
  document_type      public.document_type not null,
  document           text not null unique,
  legal_name         text not null check (char_length(legal_name) between 2 and 160),
  responsible_name   text not null check (char_length(responsible_name) between 3 and 120),
  responsible_cpf    text check (responsible_cpf is null or public.is_valid_cpf(responsible_cpf)),
  responsible_role   text check (responsible_role is null or char_length(responsible_role) <= 80),
  cep                text not null check (cep ~ '^\d{8}$'),
  street             text not null check (char_length(street) between 2 and 160),
  number             text not null check (char_length(number) between 1 and 20),
  complement         text check (complement is null or char_length(complement) <= 80),
  district           text not null check (char_length(district) between 2 and 80),
  city               text not null check (char_length(city) between 2 and 80),
  state              char(2) not null check (public.is_valid_uf(state)),
  updated_at         timestamptz not null default now()
);
comment on table public.organization_private is
  'Documento, responsável legal e endereço completo. Visível apenas ao titular e à equipe de moderação.';

create trigger organizations_updated_at before update on public.organizations
  for each row execute function private.set_updated_at();
create trigger organization_private_updated_at before update on public.organization_private
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Autorização
-- -----------------------------------------------------------------------------
create or replace function private.owns_org(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.owner_id = auth.uid())
$$;
grant execute on function private.owns_org(uuid) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Regras de negócio
-- -----------------------------------------------------------------------------
create or replace function private.organizations_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_type public.account_type;
begin
  if tg_op = 'INSERT' then
    new.slug := private.unique_slug(new.trade_name);
    if private.is_api_user() and not private.is_staff() then
      new.owner_id     := auth.uid();
      new.status       := 'pendente';
      new.reviewed_by  := null;
      new.reviewed_at  := null;
      new.review_note  := null;
      new.partner_since := null;
      new.submitted_at := now();
    end if;
    select p.account_type into v_type from public.profiles p where p.id = new.owner_id;
    if v_type is null then
      raise exception 'Perfil não encontrado.' using errcode = 'foreign_key_violation';
    end if;
    if v_type <> public.org_category(new.kind) then
      raise exception 'O tipo da organização não corresponde ao tipo da conta.' using errcode = 'check_violation';
    end if;
  else
    if new.owner_id <> old.owner_id or new.slug <> old.slug or new.created_at <> old.created_at then
      if private.is_api_user() and not private.is_staff() then
        raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if public.org_category(new.kind) <> public.org_category(old.kind) then
      raise exception 'Não é possível trocar entre ONG e empresa. Crie uma nova conta.' using errcode = 'check_violation';
    end if;
    if private.is_api_user() and not private.is_staff() then
      -- campos controlados pela moderação
      new.reviewed_by    := old.reviewed_by;
      new.reviewed_at    := old.reviewed_at;
      new.review_note    := old.review_note;
      new.partner_since  := old.partner_since;
      new.public_address := old.public_address;
      new.city           := old.city;
      new.state          := old.state;
      new.submitted_at   := old.submitted_at;
      if new.status <> old.status then
        -- o titular só pode reenviar para análise uma organização rejeitada
        if old.status = 'rejeitada' and new.status = 'pendente' then
          new.submitted_at := now();
        else
          raise exception 'Somente a equipe de moderação altera o status da organização.'
            using errcode = 'insufficient_privilege';
        end if;
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status <> old.status and private.is_staff() then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
    if new.status = 'aprovada' and public.org_category(new.kind) = 'empresa' and new.partner_since is null then
      new.partner_since := now();
    end if;
  end if;

  if new.kind not in ('ong', 'protetor_independente') then
    new.pix_key := null;
    new.pix_key_type := null;
  end if;
  if new.phone is not null then new.phone := nullif(public.only_digits(new.phone), ''); end if;
  if new.whatsapp is not null then new.whatsapp := nullif(public.only_digits(new.whatsapp), ''); end if;
  if new.instagram is not null then new.instagram := nullif(ltrim(btrim(new.instagram), '@'), ''); end if;
  new.trade_name := btrim(new.trade_name);
  return new;
end $$;

create trigger organizations_guard before insert or update on public.organizations
  for each row execute function private.organizations_guard();

-- Endereço público e cidade/UF derivados do endereço privado (respeitando show_address)
create or replace function private.refresh_org_public_address(p_org uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.organizations o
     set city  = p.city,
         state = p.state,
         public_address = case when o.show_address
           then concat_ws(', ', p.street || ', ' || p.number, nullif(p.complement, ''), p.district,
                          p.city || ' - ' || p.state)
           else null end
    from public.organization_private p
   where p.organization_id = o.id and o.id = p_org;
end $$;

create or replace function private.organization_private_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_kind   public.org_kind;
  v_status public.org_status;
begin
  select o.kind, o.status into v_kind, v_status from public.organizations o where o.id = new.organization_id;
  if v_kind is null then
    raise exception 'Organização não encontrada.' using errcode = 'foreign_key_violation';
  end if;

  if new.document_type = 'cpf' then
    new.document := public.only_digits(new.document);
  else
    new.document := public.normalize_cnpj(new.document);
  end if;
  new.cep := public.only_digits(new.cep);
  new.state := upper(new.state);
  if new.responsible_cpf is not null then
    new.responsible_cpf := nullif(public.only_digits(new.responsible_cpf), '');
  end if;

  -- Protetor independente usa CPF; ONG formal e empresas usam CNPJ.
  if v_kind = 'protetor_independente' and new.document_type <> 'cpf' then
    raise exception 'Protetor independente deve informar CPF.' using errcode = 'check_violation';
  end if;
  if v_kind <> 'protetor_independente' and new.document_type <> 'cnpj' then
    raise exception 'Informe o CNPJ da organização.' using errcode = 'check_violation';
  end if;
  if new.document_type = 'cpf' and not public.is_valid_cpf(new.document) then
    raise exception 'CPF inválido.' using errcode = 'check_violation';
  end if;
  if new.document_type = 'cnpj' and not public.is_valid_cnpj(new.document) then
    raise exception 'CNPJ inválido.' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and private.is_api_user() and not private.is_staff() then
    if new.organization_id <> old.organization_id then
      raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
    end if;
    -- Documento e razão social ficam travados após a aprovação (evita troca de identidade)
    if v_status = 'aprovada' and (new.document <> old.document or new.document_type <> old.document_type
                                  or new.legal_name <> old.legal_name) then
      raise exception 'Documento e razão social não podem ser alterados após a aprovação. Fale com o suporte.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;

create or replace function private.organization_private_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform private.refresh_org_public_address(new.organization_id);
  return null;
end $$;

create or replace function private.organizations_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.show_address is distinct from old.show_address then
    perform private.refresh_org_public_address(new.id);
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform private.audit('org_status_' || new.status::text, 'organizations', new.id::text,
                          jsonb_build_object('de', old.status, 'para', new.status, 'nota', new.review_note));
  end if;
  return null;
end $$;

create trigger organization_private_guard before insert or update on public.organization_private
  for each row execute function private.organization_private_guard();
create trigger organization_private_after after insert or update on public.organization_private
  for each row execute function private.organization_private_after();
create trigger organizations_after after update on public.organizations
  for each row execute function private.organizations_after();
