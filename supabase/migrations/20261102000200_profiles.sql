-- =============================================================================
-- 0002 · Perfis, dados privados (CPF), papéis e criação automática de perfil
-- =============================================================================

create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  account_type          public.account_type not null default 'pessoa',
  full_name             text not null default '' check (char_length(full_name) <= 120),
  display_name          text generated always as (split_part(btrim(full_name), ' ', 1)) stored,
  email                 extensions.citext,
  phone                 text check (phone is null or public.is_valid_phone(phone)),
  birth_date            date check (birth_date is null or birth_date >= date '1900-01-01'),
  city                  text check (city is null or char_length(city) between 2 and 80),
  state                 char(2) check (state is null or public.is_valid_uf(state)),
  avatar_url            text check (avatar_url is null or char_length(avatar_url) <= 500),
  bio                   text check (bio is null or char_length(bio) <= 500),
  onboarding_completed  boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.profiles is 'Dados cadastrais básicos de todos os usuários (pessoa, ONG e empresa).';
create index profiles_email_idx on public.profiles (email);

-- Dados pessoais de maior risco ficam isolados (minimização + controle de acesso)
create table public.profile_private (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  cpf         text not null unique check (cpf ~ '^\d{11}$' and public.is_valid_cpf(cpf)),
  updated_at  timestamptz not null default now()
);
comment on table public.profile_private is 'CPF do usuário. Somente o próprio titular lê; ONGs acessam via função auditada.';

create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (user_id, role)
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger profile_private_updated_at before update on public.profile_private
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Funções de autorização (usadas pelas políticas RLS)
-- -----------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = 'admin')
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role in ('admin', 'moderador'))
$$;

create or replace function private.is_api_user()
returns boolean language sql stable set search_path = '' as $$
  -- true quando a operação vem de um usuário comum da API (e não do sistema / service_role)
  select current_user in ('anon', 'authenticated')
$$;

grant execute on function private.is_admin(), private.is_staff(), private.is_api_user() to anon, authenticated, service_role;

-- Função pública para a interface saber se mostra opções administrativas.
create or replace function public.my_roles()
returns public.app_role[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(r.role), '{}') from public.user_roles r where r.user_id = auth.uid()
$$;
revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;

-- -----------------------------------------------------------------------------
-- Proteção de colunas do perfil
-- -----------------------------------------------------------------------------
create or replace function private.profiles_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.birth_date is not null and new.birth_date > (current_date - interval '18 years')::date then
    raise exception 'É preciso ter 18 anos ou mais para criar uma conta.' using errcode = 'check_violation';
  end if;
  if new.birth_date is not null and new.birth_date > current_date then
    raise exception 'Data de nascimento inválida.' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' and private.is_api_user() and not private.is_admin() then
    if new.id <> old.id or new.created_at <> old.created_at then
      raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
    end if;
    -- o e-mail é sincronizado a partir do auth.users; o usuário altera pelo fluxo de troca de e-mail
    new.email := old.email;
    -- tipo de conta só pode mudar enquanto não houver organização vinculada
    if new.account_type <> old.account_type
       and exists (select 1 from public.organizations o where o.owner_id = old.id) then
      raise exception 'Tipo de conta não pode ser alterado depois do cadastro da organização.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.full_name is not null then
    new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  end if;
  if new.phone is not null then
    new.phone := nullif(public.only_digits(new.phone), '');
  end if;
  if new.state is not null then
    new.state := upper(new.state);
  end if;
  return new;
end $$;

create or replace function private.profile_private_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.cpf := public.only_digits(new.cpf);
  if not public.is_valid_cpf(new.cpf) then
    raise exception 'CPF inválido.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then
    raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

create trigger profiles_guard before insert or update on public.profiles
  for each row execute function private.profiles_guard();
create trigger profile_private_guard before insert or update on public.profile_private
  for each row execute function private.profile_private_guard();

-- -----------------------------------------------------------------------------
-- Criação automática do perfil quando um usuário se cadastra (e-mail ou Google)
-- Metadados aceitos em raw_user_meta_data:
--   full_name | name, account_type (pessoa|ong|empresa), phone, birth_date (AAAA-MM-DD),
--   city, state, avatar_url | picture, terms_version, privacy_version, marketing_opt_in
-- Nada vindo do cliente pode conceder papéis administrativos.
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  m          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_type     public.account_type := 'pessoa';
  v_birth    date;
  v_phone    text;
  v_state    text;
  v_city     text;
  v_avatar   text;
  v_complete boolean;
begin
  if m ->> 'account_type' in ('pessoa', 'ong', 'empresa') then
    v_type := (m ->> 'account_type')::public.account_type;
  end if;

  begin
    v_birth := (m ->> 'birth_date')::date;
    if v_birth > (current_date - interval '18 years')::date or v_birth < date '1900-01-01' then
      v_birth := null;
    end if;
  exception when others then
    v_birth := null;
  end;

  v_phone := nullif(public.only_digits(m ->> 'phone'), '');
  if v_phone is not null and not public.is_valid_phone(v_phone) then v_phone := null; end if;

  v_state := upper(nullif(btrim(m ->> 'state'), ''));
  if v_state is not null and not public.is_valid_uf(v_state) then v_state := null; end if;

  v_city := nullif(left(btrim(coalesce(m ->> 'city', '')), 80), '');
  if v_city is not null and char_length(v_city) < 2 then v_city := null; end if;

  v_avatar := nullif(left(coalesce(m ->> 'avatar_url', m ->> 'picture', ''), 500), '');
  if v_avatar is not null and not public.is_https_url(v_avatar) then v_avatar := null; end if;

  v_complete := v_birth is not null and v_phone is not null and v_city is not null and v_state is not null
                and (m ? 'terms_version') and (m ? 'privacy_version');

  insert into public.profiles (id, account_type, full_name, email, phone, birth_date, city, state, avatar_url,
                               onboarding_completed)
  values (new.id, v_type,
          left(btrim(regexp_replace(coalesce(m ->> 'full_name', m ->> 'name', ''), '\s+', ' ', 'g')), 120),
          new.email, v_phone, v_birth, v_city, v_state, v_avatar, v_complete);

  -- Registro dos consentimentos dados no formulário de cadastro
  if m ? 'terms_version' then
    insert into public.consents (user_id, consent_type, version, granted, source)
    values (new.id, 'termos_uso', left(m ->> 'terms_version', 20), true, 'cadastro');
  end if;
  if m ? 'privacy_version' then
    insert into public.consents (user_id, consent_type, version, granted, source)
    values (new.id, 'politica_privacidade', left(m ->> 'privacy_version', 20), true, 'cadastro');
  end if;
  if coalesce(m ->> 'marketing_opt_in', '') in ('true', '1') then
    insert into public.consents (user_id, consent_type, version, granted, source)
    values (new.id, 'marketing', left(coalesce(m ->> 'privacy_version', '1.0'), 20), true, 'cadastro');
  end if;

  return new;
end $$;

create or replace function private.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
