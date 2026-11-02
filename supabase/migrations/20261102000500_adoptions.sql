-- =============================================================================
-- 0005 · Processo de adoção: questionário, histórico, mensagens e notificações
-- =============================================================================

create table public.adoption_applications (
  id                    uuid primary key default gen_random_uuid(),
  animal_id             uuid not null references public.animals (id) on delete cascade,
  applicant_id          uuid references public.profiles (id) on delete set null,
  manager_id            uuid not null references public.profiles (id) on delete cascade,
  status                public.adoption_status not null default 'enviado',
  -- Questionário de adoção responsável
  housing_type          public.housing_type not null,
  housing_owner         public.housing_owner not null,
  landlord_allows_pets  boolean,
  has_yard              boolean not null,
  yard_fenced           boolean,
  window_screens        boolean,
  adults_in_home        smallint not null check (adults_in_home between 1 and 20),
  children_in_home      smallint not null default 0 check (children_in_home between 0 and 20),
  children_ages         text check (children_ages is null or char_length(children_ages) <= 100),
  household_agrees      boolean not null,
  other_pets            text check (other_pets is null or char_length(other_pets) <= 500),
  previous_pets         text check (previous_pets is null or char_length(previous_pets) <= 500),
  hours_alone           smallint not null check (hours_alone between 0 and 24),
  caretaker_when_away   text not null check (char_length(caretaker_when_away) between 3 and 300),
  motivation            text not null check (char_length(motivation) between 30 and 2000),
  aware_of_costs        boolean not null check (aware_of_costs),
  agrees_to_follow_up   boolean not null check (agrees_to_follow_up),
  agrees_to_neuter      boolean not null default true,
  share_data_consent    boolean not null check (share_data_consent),
  decided_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint rented_needs_answer check (housing_owner <> 'alugada' or landlord_allows_pets is not null)
);
create index adoption_applications_animal_idx    on public.adoption_applications (animal_id, status);
create index adoption_applications_applicant_idx on public.adoption_applications (applicant_id, created_at desc);
create index adoption_applications_manager_idx   on public.adoption_applications (manager_id, status, created_at desc);
create unique index adoption_applications_one_open
  on public.adoption_applications (animal_id, applicant_id)
  where status not in ('recusado', 'cancelado', 'concluido');

-- Anotações internas de quem gerencia o anúncio (o candidato não vê)
create table public.adoption_notes (
  application_id  uuid primary key references public.adoption_applications (id) on delete cascade,
  note            text not null check (char_length(note) <= 2000),
  updated_at      timestamptz not null default now()
);

create table public.application_status_history (
  id              bigint generated always as identity primary key,
  application_id  uuid not null references public.adoption_applications (id) on delete cascade,
  from_status     public.adoption_status,
  to_status       public.adoption_status not null,
  changed_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);
create index application_status_history_app_idx on public.application_status_history (application_id, created_at);

create table public.application_messages (
  id              uuid primary key default gen_random_uuid(),
  application_id  uuid not null references public.adoption_applications (id) on delete cascade,
  sender_id       uuid references public.profiles (id) on delete set null,
  body            text not null check (char_length(btrim(body)) between 1 and 2000),
  read_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index application_messages_app_idx on public.application_messages (application_id, created_at);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (char_length(kind) <= 40),
  title       text not null check (char_length(title) <= 140),
  body        text check (body is null or char_length(body) <= 500),
  link        text check (link is null or (link ~ '^/' and char_length(link) <= 300)),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create trigger adoption_applications_updated_at before update on public.adoption_applications
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Autorização
-- -----------------------------------------------------------------------------
create or replace function private.is_application_party(p_app uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.adoption_applications a
                 where a.id = p_app and auth.uid() in (a.applicant_id, a.manager_id))
$$;

-- O responsável pelo anúncio vê o perfil de quem se candidatou (com consentimento explícito)
create or replace function private.can_view_profile(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.adoption_applications a
                 where a.applicant_id = p_profile and a.manager_id = auth.uid()
                   and a.status <> 'cancelado')
$$;
grant execute on function private.is_application_party(uuid), private.can_view_profile(uuid)
  to anon, authenticated, service_role;

create or replace function private.notify(p_user uuid, p_kind text, p_title text, p_body text, p_link text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_user is not null then
    insert into public.notifications (user_id, kind, title, body, link)
    values (p_user, p_kind, left(p_title, 140), left(p_body, 500), p_link);
  end if;
end $$;
revoke all on function private.notify(uuid, text, text, text, text) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Regras do pedido de adoção
-- -----------------------------------------------------------------------------
create or replace function private.adoption_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_animal  public.animals%rowtype;
  v_prof    public.profiles%rowtype;
  v_open    int;
  v_staff   boolean := private.is_staff();
  v_api     boolean := private.is_api_user();
  v_uid     uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_api then
      new.applicant_id := v_uid;
    end if;
    new.status := 'enviado';
    new.decided_at := null;

    select * into v_animal from public.animals a where a.id = new.animal_id;
    if v_animal.id is null or not private.animal_is_public(new.animal_id)
       or v_animal.status not in ('disponivel', 'em_processo') then
      raise exception 'Este animal não está disponível para adoção.' using errcode = 'check_violation';
    end if;
    new.manager_id := v_animal.owner_id;
    if new.applicant_id = new.manager_id then
      raise exception 'Você não pode se candidatar ao seu próprio anúncio.' using errcode = 'check_violation';
    end if;

    select * into v_prof from public.profiles p where p.id = new.applicant_id;
    if v_prof.account_type <> 'pessoa' then
      raise exception 'A adoção é feita por uma pessoa física. Use uma conta pessoal.' using errcode = 'check_violation';
    end if;
    if v_prof.birth_date is null or v_prof.birth_date > (current_date - interval '18 years')::date then
      raise exception 'A adoção é permitida somente para maiores de 18 anos.' using errcode = 'check_violation';
    end if;
    if v_prof.phone is null or v_prof.city is null or v_prof.state is null or btrim(v_prof.full_name) = '' then
      raise exception 'Complete seu perfil (nome, celular, cidade e UF) antes de enviar o pedido.'
        using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.profile_private pp where pp.user_id = new.applicant_id) then
      raise exception 'Informe seu CPF para enviar o pedido de adoção.' using errcode = 'check_violation';
    end if;
    select count(*) into v_open from public.adoption_applications a
     where a.applicant_id = new.applicant_id and a.status not in ('recusado', 'cancelado', 'concluido');
    if v_open >= 5 then
      raise exception 'Você já tem 5 pedidos em andamento. Aguarde as respostas antes de enviar novos.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE: o questionário é imutável depois de enviado
  if (new.animal_id, new.applicant_id, new.manager_id, new.housing_type, new.housing_owner, new.landlord_allows_pets,
      new.has_yard, new.yard_fenced, new.window_screens, new.adults_in_home, new.children_in_home, new.children_ages,
      new.household_agrees, new.other_pets, new.previous_pets, new.hours_alone, new.caretaker_when_away,
      new.motivation, new.aware_of_costs, new.agrees_to_follow_up, new.agrees_to_neuter, new.share_data_consent,
      new.created_at)
     is distinct from
     (old.animal_id, old.applicant_id, old.manager_id, old.housing_type, old.housing_owner, old.landlord_allows_pets,
      old.has_yard, old.yard_fenced, old.window_screens, old.adults_in_home, old.children_in_home, old.children_ages,
      old.household_agrees, old.other_pets, old.previous_pets, old.hours_alone, old.caretaker_when_away,
      old.motivation, old.aware_of_costs, old.agrees_to_follow_up, old.agrees_to_neuter, old.share_data_consent,
      old.created_at)
     and v_api then
    -- exceção: anonimização do candidato (applicant_id -> null) feita pelo sistema
    raise exception 'As respostas do questionário não podem ser alteradas.' using errcode = 'insufficient_privilege';
  end if;

  if v_api and not v_staff then
    if v_uid = old.applicant_id and v_uid <> old.manager_id then
      if new.status <> old.status then
        if new.status <> 'cancelado' or old.status in ('recusado', 'cancelado', 'concluido') then
          raise exception 'Você só pode cancelar um pedido em andamento.' using errcode = 'insufficient_privilege';
        end if;
      end if;
    elsif v_uid = old.manager_id then
      if new.status <> old.status then
        if old.status in ('recusado', 'cancelado', 'concluido') then
          raise exception 'Este pedido já foi encerrado.' using errcode = 'check_violation';
        end if;
        if new.status in ('enviado', 'cancelado') then
          raise exception 'Status inválido para o responsável pelo anúncio.' using errcode = 'insufficient_privilege';
        end if;
      end if;
    else
      raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if new.status <> old.status and new.status in ('aprovado', 'recusado', 'concluido') then
    new.decided_at := now();
  end if;
  return new;
end $$;

create trigger adoption_guard before insert or update on public.adoption_applications
  for each row execute function private.adoption_guard();

create or replace function private.adoption_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name   text;
  v_slug   text;
  v_label  text;
begin
  select a.name, a.slug into v_name, v_slug from public.animals a where a.id = new.animal_id;

  if tg_op = 'INSERT' then
    insert into public.application_status_history (application_id, from_status, to_status, changed_by)
    values (new.id, null, new.status, auth.uid());
    -- consentimento específico para compartilhar dados com o responsável pelo anúncio
    insert into public.consents (user_id, consent_type, version, granted, source)
    values (new.applicant_id, 'compartilhamento_adocao', '1.0', true, 'pedido:' || new.id::text);
    perform private.notify(new.manager_id, 'adocao_novo_pedido', 'Novo pedido de adoção para ' || v_name,
      'Alguém quer dar um lar para ' || v_name || '. Veja as respostas do questionário.',
      '/painel/pedidos/' || new.id::text);
    return null;
  end if;

  if new.status is distinct from old.status then
    insert into public.application_status_history (application_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());

    v_label := case new.status
      when 'em_analise' then 'está em análise'
      when 'entrevista' then 'avançou para a entrevista'
      when 'visita'     then 'avançou para a visita'
      when 'aprovado'   then 'foi aprovado! 🎉'
      when 'recusado'   then 'não foi aprovado desta vez'
      when 'concluido'  then 'foi concluído. Bem-vindo à família! 🐾'
      when 'cancelado'  then 'foi cancelado'
      else new.status::text end;

    if new.status = 'cancelado' then
      perform private.notify(new.manager_id, 'adocao_status', 'Pedido para ' || v_name || ' cancelado',
        'O candidato cancelou o pedido.', '/painel/pedidos/' || new.id::text);
    else
      perform private.notify(new.applicant_id, 'adocao_status', 'Seu pedido para ' || v_name || ' ' || v_label,
        null, '/minha-conta/pedidos/' || new.id::text);
    end if;

    -- reflexos no anúncio
    if new.status = 'aprovado' then
      update public.animals set status = 'em_processo'
       where id = new.animal_id and status = 'disponivel';
    elsif new.status = 'concluido' then
      update public.animals set status = 'adotado', adopted_at = now() where id = new.animal_id;
      update public.adoption_applications
         set status = 'recusado'
       where animal_id = new.animal_id and id <> new.id
         and status not in ('recusado', 'cancelado', 'concluido');
    end if;
  end if;
  return null;
end $$;

create trigger adoption_after after insert or update on public.adoption_applications
  for each row execute function private.adoption_after();

-- Mensagens: só as partes do pedido; o remetente é sempre quem está logado
create or replace function private.messages_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_app public.adoption_applications%rowtype;
begin
  select * into v_app from public.adoption_applications a where a.id = new.application_id;
  if tg_op = 'INSERT' then
    if private.is_api_user() then
      new.sender_id := auth.uid();
    end if;
    new.read_at := null;
    new.body := btrim(new.body);
    if v_app.status in ('cancelado', 'recusado') then
      raise exception 'Este pedido foi encerrado.' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  -- UPDATE: somente o destinatário marca como lida; o texto é imutável
  if new.body <> old.body or new.sender_id is distinct from old.sender_id
     or new.application_id <> old.application_id or new.created_at <> old.created_at then
    raise exception 'Mensagens não podem ser editadas.' using errcode = 'insufficient_privilege';
  end if;
  if private.is_api_user() and auth.uid() = old.sender_id then
    new.read_at := old.read_at;
  end if;
  return new;
end $$;
create trigger messages_guard before insert or update on public.application_messages
  for each row execute function private.messages_guard();

create or replace function private.messages_after()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_app   public.adoption_applications%rowtype;
  v_to    uuid;
  v_link  text;
begin
  select * into v_app from public.adoption_applications a where a.id = new.application_id;
  if new.sender_id = v_app.manager_id then
    v_to := v_app.applicant_id; v_link := '/minha-conta/pedidos/' || v_app.id::text;
  else
    v_to := v_app.manager_id;   v_link := '/painel/pedidos/' || v_app.id::text;
  end if;
  perform private.notify(v_to, 'mensagem', 'Nova mensagem no pedido de adoção', left(new.body, 140), v_link);
  return null;
end $$;
create trigger messages_after after insert on public.application_messages
  for each row execute function private.messages_after();

-- Notificações: o usuário só pode marcar como lida
create or replace function private.notifications_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_api_user() and (new.user_id <> old.user_id or new.kind <> old.kind or new.title <> old.title
     or new.body is distinct from old.body or new.link is distinct from old.link or new.created_at <> old.created_at) then
    raise exception 'Somente a leitura pode ser marcada.' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications
  for each row execute function private.notifications_guard();

-- -----------------------------------------------------------------------------
-- Acesso auditado ao CPF do candidato (somente o responsável pelo anúncio,
-- somente em pedidos ativos e com consentimento de compartilhamento)
-- -----------------------------------------------------------------------------
create or replace function public.get_applicant_cpf(p_application uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_app public.adoption_applications%rowtype;
  v_cpf text;
begin
  select * into v_app from public.adoption_applications a where a.id = p_application;
  if v_app.id is null or v_app.manager_id <> auth.uid() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if v_app.status not in ('entrevista', 'visita', 'aprovado', 'concluido') then
    raise exception 'O CPF fica disponível a partir da etapa de entrevista.' using errcode = 'insufficient_privilege';
  end if;
  select pp.cpf into v_cpf from public.profile_private pp where pp.user_id = v_app.applicant_id;
  perform private.audit('cpf_acessado', 'adoption_applications', p_application::text,
                        jsonb_build_object('titular', v_app.applicant_id));
  return v_cpf;
end $$;
revoke all on function public.get_applicant_cpf(uuid) from public, anon;
grant execute on function public.get_applicant_cpf(uuid) to authenticated;
