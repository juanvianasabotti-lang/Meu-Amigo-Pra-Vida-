-- =============================================================================
-- 0009 · Endurecimento após revisão de segurança independente
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Eventos: "encerrado" só a partir de "publicado"; organização precisa estar
--    aprovada para o evento ser público
-- -----------------------------------------------------------------------------
create or replace function private.org_is_approved(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organizations o where o.id = p_org and o.status = 'aprovada')
$$;

create or replace function private.events_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_org public.organizations%rowtype;
begin
  select * into v_org from public.organizations o where o.id = new.organization_id;
  if tg_op = 'INSERT' then
    new.slug := private.unique_slug(new.title);
  elsif new.slug <> old.slug or new.organization_id <> old.organization_id then
    if private.is_api_user() and not private.is_admin() then
      raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if private.is_api_user() and (not private.is_staff() or v_org.owner_id = auth.uid()) then
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
      if new.status <> old.status then
        if new.status = 'encerrado' and old.status <> 'publicado' then
          raise exception 'Somente eventos publicados podem ser encerrados.' using errcode = 'insufficient_privilege';
        elsif new.status not in ('rascunho', 'em_analise', 'encerrado') then
          raise exception 'Somente a moderação publica campanhas e eventos.' using errcode = 'insufficient_privilege';
        end if;
      end if;
      -- qualquer edição de conteúdo já revisado volta para análise
      if old.status in ('publicado', 'encerrado')
         and (new.title, new.summary, new.description, new.cover_url, new.external_url, new.starts_at, new.ends_at,
              new.location_name, new.address, new.city, new.state, new.kind)
             is distinct from
             (old.title, old.summary, old.description, old.cover_url, old.external_url, old.starts_at, old.ends_at,
              old.location_name, old.address, old.city, old.state, old.kind) then
        new.status := 'em_analise';
      end if;
    end if;
  elsif tg_op = 'UPDATE' and new.status <> old.status and private.is_staff() and v_org.owner_id is distinct from auth.uid() then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if new.state is not null then new.state := upper(new.state); end if;
  return new;
end $$;

drop policy if exists "eventos: publicados" on public.events;
create policy "eventos: publicados" on public.events for select to anon, authenticated
  using (((status = 'publicado' or (status = 'encerrado' and reviewed_at is not null))
          and private.org_is_approved(organization_id))
         or private.owns_org(organization_id) or (select private.is_staff()));

-- -----------------------------------------------------------------------------
-- 2) Organização aprovada que muda identidade ou Pix volta para análise;
--    somente administradores trocam o dono
-- -----------------------------------------------------------------------------
create or replace function private.organizations_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_type public.account_type;
  v_staff boolean := private.is_staff()
                     and (case when tg_op = 'INSERT' then new.owner_id else old.owner_id end) is distinct from auth.uid();
begin
  if tg_op = 'INSERT' then
    new.slug := private.unique_slug(new.trade_name);
    if private.is_api_user() and not v_staff then
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
      if private.is_api_user() and not private.is_admin() then
        raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
      end if;
    end if;
    if public.org_category(new.kind) <> public.org_category(old.kind) then
      raise exception 'Não é possível trocar entre ONG e empresa. Crie uma nova conta.' using errcode = 'check_violation';
    end if;
    if private.is_api_user() and not v_staff then
      new.reviewed_by    := old.reviewed_by;
      new.reviewed_at    := old.reviewed_at;
      new.review_note    := old.review_note;
      new.partner_since  := old.partner_since;
      new.public_address := old.public_address;
      new.city           := old.city;
      new.state          := old.state;
      new.submitted_at   := old.submitted_at;
      if new.status <> old.status then
        if old.status = 'rejeitada' and new.status = 'pendente' then
          new.submitted_at := now();
        else
          raise exception 'Somente a equipe de moderação altera o status da organização.'
            using errcode = 'insufficient_privilege';
        end if;
      end if;
      -- mudanças sensíveis em organização aprovada exigem nova verificação (evita golpe com Pix/nome)
      if old.status = 'aprovada'
         and (new.trade_name, new.kind, new.pix_key, new.pix_key_type, new.logo_url, new.website, new.whatsapp)
             is distinct from
             (old.trade_name, old.kind, old.pix_key, old.pix_key_type, old.logo_url, old.website, old.whatsapp) then
        new.status := 'pendente';
        new.submitted_at := now();
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and new.status <> old.status and v_staff then
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

-- Os animais pertencem à organização: se ela for apagada, os anúncios saem junto
alter table public.animals drop constraint if exists animals_organization_id_fkey;
alter table public.animals add constraint animals_organization_id_fkey
  foreign key (organization_id) references public.organizations (id) on delete cascade;

-- -----------------------------------------------------------------------------
-- 3) Anúncios: qualquer alteração pública em anúncio aprovado volta para análise;
--    somente administradores trocam o dono
-- -----------------------------------------------------------------------------
create or replace function private.animals_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_type    public.account_type;
  v_first   text;
  v_org     public.organizations%rowtype;
  v_active  int;
  v_staff   boolean := private.is_staff()
                       and (case when tg_op = 'INSERT' then new.owner_id else old.owner_id end) is distinct from auth.uid();
  v_api     boolean := private.is_api_user();
begin
  if tg_op = 'INSERT' then
    if v_api and not v_staff then
      new.owner_id := auth.uid();
    end if;
    new.slug := private.unique_slug(new.name);
  elsif new.owner_id <> old.owner_id or new.slug <> old.slug or new.created_at <> old.created_at then
    if v_api and not private.is_admin() then
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
    if tg_op = 'INSERT' then
      new.approved_at := null; new.reviewed_by := null; new.review_note := null; new.adopted_at := null;
      new.is_urgent := false;
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
      new.adopted_at := case when new.status = 'adotado' and old.status <> 'adotado' then now() else old.adopted_at end;
      new.is_urgent := case when v_type = 'ong' then new.is_urgent else old.is_urgent end;
      if new.status <> old.status then
        if old.status = 'adotado' and new.status <> 'arquivado' then
          raise exception 'Animal já adotado.' using errcode = 'check_violation';
        elsif new.status in ('rascunho', 'em_analise', 'arquivado') then
          null;
        elsif new.status in ('disponivel', 'em_processo', 'adotado') then
          if old.approved_at is null then
            raise exception 'O anúncio ainda está em análise pela moderação.' using errcode = 'insufficient_privilege';
          end if;
        else
          raise exception 'Somente a moderação pode definir este status.' using errcode = 'insufficient_privilege';
        end if;
      end if;
      -- qualquer mudança de conteúdo público em anúncio aprovado volta para a análise
      if old.approved_at is not null and new.status in ('disponivel', 'em_processo')
         and (new.name, new.description, new.breed, new.coat_color, new.health_notes, new.adoption_requirements,
              new.special_needs_notes, new.personality, new.species, new.sex, new.size, new.age_group, new.city, new.state)
             is distinct from
             (old.name, old.description, old.breed, old.coat_color, old.health_notes, old.adoption_requirements,
              old.special_needs_notes, old.personality, old.species, old.sex, old.size, old.age_group, old.city, old.state) then
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

-- Nova foto em anúncio já aprovado e disponível: volta para análise
create or replace function private.animal_photos_after()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.animals set status = 'em_analise', approved_at = null
   where id = new.animal_id and status = 'disponivel' and approved_at is not null;
  return null;
end $$;
drop trigger if exists animal_photos_after on public.animal_photos;
create trigger animal_photos_after after insert on public.animal_photos
  for each row execute function private.animal_photos_after();

-- -----------------------------------------------------------------------------
-- 4) CPF: gravação somente por função (mensagem genérica, limite de tentativas,
--    colisão registrada para análise) — evita descobrir CPFs cadastrados
-- -----------------------------------------------------------------------------
revoke insert, update on public.profile_private from authenticated;
drop policy if exists "cpf: titular cria" on public.profile_private;
drop policy if exists "cpf: titular atualiza" on public.profile_private;

create or replace function public.set_my_cpf(p_cpf text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cpf text := public.only_digits(p_cpf);
  v_tries int;
begin
  if v_uid is null then
    raise exception 'Faça login.' using errcode = 'insufficient_privilege';
  end if;
  if not public.is_valid_cpf(v_cpf) then
    raise exception 'CPF inválido. Confira os números.' using errcode = 'check_violation';
  end if;
  select count(*) into v_tries from public.audit_log
   where actor_id = v_uid and action in ('cpf_definido', 'cpf_conflito') and created_at > now() - interval '1 hour';
  if v_tries >= 5 then
    raise exception 'Muitas tentativas. Tente novamente mais tarde.' using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.profile_private pp where pp.cpf = v_cpf and pp.user_id <> v_uid) then
    perform private.audit('cpf_conflito', 'profile_private', v_uid::text, '{}'::jsonb);
    raise exception 'Não foi possível confirmar este CPF. Se ele é seu, fale com a gente pela página de contato.'
      using errcode = 'check_violation';
  end if;
  insert into public.profile_private (user_id, cpf) values (v_uid, v_cpf)
  on conflict (user_id) do update set cpf = excluded.cpf;
  perform private.audit('cpf_definido', 'profile_private', v_uid::text, '{}'::jsonb);
end $$;
revoke all on function public.set_my_cpf(text) from public, anon;
grant execute on function public.set_my_cpf(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 5) Moderação: ninguém modera o próprio conteúdo
-- -----------------------------------------------------------------------------
create or replace function public.moderate_organization(p_org uuid, p_status public.org_status, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_name  text;
begin
  if not private.is_staff() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if p_status = 'pendente' then
    raise exception 'Status inválido.' using errcode = 'check_violation';
  end if;
  if p_status in ('rejeitada', 'suspensa') and coalesce(btrim(p_note), '') = '' then
    raise exception 'Explique o motivo para o titular.' using errcode = 'check_violation';
  end if;
  select owner_id into v_owner from public.organizations where id = p_org;
  if v_owner is null then
    raise exception 'Organização não encontrada.' using errcode = 'no_data_found';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Você não pode moderar a sua própria organização.' using errcode = 'insufficient_privilege';
  end if;
  update public.organizations set status = p_status, review_note = nullif(btrim(p_note), '')
   where id = p_org returning trade_name into v_name;
  perform private.notify(v_owner, 'org_moderacao',
    case p_status when 'aprovada' then v_name || ' foi aprovada! 🎉'
                  when 'rejeitada' then 'O cadastro de ' || v_name || ' precisa de ajustes'
                  else v_name || ' foi suspensa' end,
    nullif(btrim(p_note), ''), '/painel/organizacao');
end $$;

create or replace function public.moderate_animal(p_animal uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_name  text;
begin
  if not private.is_staff() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then
    raise exception 'Explique o motivo da rejeição.' using errcode = 'check_violation';
  end if;
  select owner_id into v_owner from public.animals where id = p_animal and status = 'em_analise';
  if v_owner is null then
    raise exception 'Anúncio não encontrado ou fora da fila de análise.' using errcode = 'no_data_found';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Você não pode moderar o seu próprio anúncio.' using errcode = 'insufficient_privilege';
  end if;
  update public.animals
     set status = case when p_approve then 'disponivel'::public.animal_status else 'rejeitado'::public.animal_status end,
         review_note = nullif(btrim(p_note), '')
   where id = p_animal returning name into v_name;
  perform private.notify(v_owner, 'animal_moderacao',
    case when p_approve then 'O anúncio de ' || v_name || ' está no ar! 🐾'
         else 'O anúncio de ' || v_name || ' precisa de ajustes' end,
    nullif(btrim(p_note), ''), '/painel/animais');
end $$;

create or replace function public.moderate_event(p_event uuid, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_owner uuid;
  v_title text;
begin
  if not private.is_staff() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  if not p_approve and coalesce(btrim(p_note), '') = '' then
    raise exception 'Explique o motivo da rejeição.' using errcode = 'check_violation';
  end if;
  select o.owner_id into v_owner from public.events e join public.organizations o on o.id = e.organization_id
   where e.id = p_event and e.status = 'em_analise';
  if v_owner is null then
    raise exception 'Evento não encontrado ou fora da fila de análise.' using errcode = 'no_data_found';
  end if;
  if v_owner = auth.uid() then
    raise exception 'Você não pode moderar o seu próprio evento.' using errcode = 'insufficient_privilege';
  end if;
  update public.events
     set status = case when p_approve then 'publicado'::public.content_status else 'rejeitado'::public.content_status end,
         review_note = nullif(btrim(p_note), '')
   where id = p_event returning title into v_title;
  perform private.notify(v_owner, 'evento_moderacao',
    case when p_approve then '“' || v_title || '” foi publicado!' else '“' || v_title || '” precisa de ajustes' end,
    nullif(btrim(p_note), ''), '/painel/eventos');
end $$;

-- -----------------------------------------------------------------------------
-- 6) Pedido de adoção: decided_at controlado só pelo sistema
-- -----------------------------------------------------------------------------
create or replace function private.adoption_decided_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if private.is_api_user() then
    new.decided_at := case when new.status <> old.status and new.status in ('aprovado', 'recusado', 'concluido')
                           then now() else old.decided_at end;
  end if;
  return new;
end $$;
drop trigger if exists adoption_decided_guard on public.adoption_applications;
-- nome com "z" para rodar depois do adoption_guard (gatilhos executam em ordem alfabética)
create trigger z_adoption_decided_guard before update on public.adoption_applications
  for each row execute function private.adoption_decided_guard();

-- -----------------------------------------------------------------------------
-- 7) Perfil: tipo de conta travado se houver anúncios ou pedidos
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
    new.email := old.email;
    if new.account_type <> old.account_type
       and (exists (select 1 from public.organizations o where o.owner_id = old.id)
            or exists (select 1 from public.animals a where a.owner_id = old.id)
            or exists (select 1 from public.adoption_applications ap where ap.applicant_id = old.id)) then
      raise exception 'O tipo de conta não pode ser alterado depois de anúncios, pedidos ou cadastro de organização.'
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

-- -----------------------------------------------------------------------------
-- 8) LGPD: acesso do responsável ao perfil do candidato só enquanto necessário
--    (pedido em andamento ou até 180 dias após a adoção, para o acompanhamento)
-- -----------------------------------------------------------------------------
create or replace function private.can_view_profile(p_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.adoption_applications a
                 where a.applicant_id = p_profile and a.manager_id = auth.uid()
                   and (a.status in ('enviado', 'em_analise', 'entrevista', 'visita', 'aprovado')
                        or (a.status = 'concluido' and a.decided_at > now() - interval '180 days')))
$$;

-- Colunas internas (dono, revisor, nota de moderação) não são expostas ao visitante anônimo
revoke select on public.animals, public.organizations, public.events from anon;
grant select (id, organization_id, publisher_name, name, slug, species, sex, size, age_group, birth_estimate, breed,
              coat_color, weight_kg, description, personality, good_with_children, good_with_dogs, good_with_cats,
              neutered, vaccinated, dewormed, microchipped, special_needs, special_needs_notes, health_notes,
              adoption_requirements, city, state, status, is_urgent, approved_at, adopted_at, created_at, updated_at)
  on public.animals to anon;
grant select (id, kind, category, status, trade_name, slug, tagline, description, services, email, whatsapp, website,
              instagram, logo_url, cover_url, city, state, public_address, show_address, pix_key, pix_key_type,
              accepts_volunteers, founded_year, partner_since, created_at)
  on public.organizations to anon;
grant select (id, organization_id, kind, title, slug, summary, description, cover_url, starts_at, ends_at, is_online,
              location_name, address, city, state, external_url, status, created_at)
  on public.events to anon;

-- Exclusão de conta: também anonimiza mensagens de contato e solicitações LGPD
create or replace function public.delete_my_account(p_confirmation text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then
    raise exception 'Faça login.' using errcode = 'insufficient_privilege';
  end if;
  if p_confirmation is distinct from 'EXCLUIR MINHA CONTA' then
    raise exception 'Confirmação inválida.' using errcode = 'check_violation';
  end if;
  select email into v_email from public.profiles where id = v_uid;
  update public.adoption_applications
     set motivation = 'Removido a pedido do titular (LGPD).', caretaker_when_away = 'Removido',
         children_ages = null, other_pets = null, previous_pets = null,
         status = case when status in ('recusado', 'cancelado', 'concluido') then status else 'cancelado' end
   where applicant_id = v_uid;
  delete from public.application_messages where sender_id = v_uid;
  update public.contact_messages set name = 'Titular removido', email = 'removido@anonimizado.invalid', user_id = null
   where user_id = v_uid or (v_email is not null and email = v_email::extensions.citext);
  update public.data_subject_requests set contact_email = 'removido@anonimizado.invalid' where user_id = v_uid;
  update public.audit_log set actor_id = null, metadata = metadata - 'titular'
   where actor_id = v_uid or metadata ->> 'titular' = v_uid::text;
  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (null, 'conta_eliminada', 'profiles', null, jsonb_build_object('em', now()));
  delete from auth.users where id = v_uid;
end $$;
revoke all on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 9) Funções internas: sem EXECUTE padrão para PUBLIC; libera só o necessário
-- -----------------------------------------------------------------------------
revoke execute on all functions in schema private from public;
grant execute on function
  private.is_admin(), private.is_staff(), private.is_api_user(), private.owns_org(uuid), private.org_is_approved(uuid),
  private.animal_is_public(uuid), private.manages_animal(uuid), private.applied_to_animal(uuid),
  private.is_application_party(uuid), private.can_view_profile(uuid), private.manages_application(uuid),
  private.recent_contact_count(text), private.unique_slug(text)
  to anon, authenticated, service_role;
