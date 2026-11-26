-- =============================================================================
-- 0014 · Cadastros feitos pela equipe (animais e eventos sem ONG/empresa)
-- =============================================================================
-- Administradores e moderadores podem publicar:
--  * animais para adoção em nome do Meu Amigo pra Vida, com o contato do doador
--    (só com o consentimento dele) ou com o e-mail institucional;
--  * campanhas e eventos sem vínculo com uma organização cadastrada.
-- Esses cadastros já nascem revisados (quem publica é a própria moderação).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Animais
-- -----------------------------------------------------------------------------
alter table public.animals
  add column posted_by_team     boolean not null default false,
  add column contact_mode       text not null default 'plataforma'
                                check (contact_mode in ('plataforma', 'doador', 'institucional')),
  add column contact_name       text check (contact_name is null or char_length(contact_name) between 2 and 80),
  add column contact_phone      text check (contact_phone is null or public.is_valid_phone(contact_phone)),
  add column contact_email      text check (contact_email is null
                                            or (char_length(contact_email) <= 200 and contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  add column contact_consent_at timestamptz;

alter table public.animals
  add constraint animals_contact_only_team check (
    posted_by_team or (contact_mode = 'plataforma' and contact_name is null and contact_phone is null
                       and contact_email is null and contact_consent_at is null)),
  add constraint animals_team_contact_mode check (not posted_by_team or contact_mode in ('doador', 'institucional')),
  add constraint animals_donor_contact check (
    contact_mode <> 'doador'
    or (contact_name is not null and (contact_phone is not null or contact_email is not null) and contact_consent_at is not null));

create index animals_team_idx on public.animals (posted_by_team) where posted_by_team;

create or replace function private.animals_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_type    public.account_type;
  v_first   text;
  v_org     public.organizations%rowtype;
  v_active  int;
  v_team    boolean := case when tg_op = 'INSERT' then coalesce(new.posted_by_team, false) else old.posted_by_team end;
  v_staff   boolean;
  v_api     boolean := private.is_api_user();
begin
  -- Só a equipe marca um cadastro como "da equipe", e a marca não muda depois
  if v_api and not private.is_staff() then
    v_team := case when tg_op = 'INSERT' then false else old.posted_by_team end;
  end if;
  new.posted_by_team := v_team;

  -- A equipe age como moderação nos anúncios de terceiros e nos anúncios da equipe
  v_staff := private.is_staff()
             and ((case when tg_op = 'INSERT' then new.owner_id else old.owner_id end) is distinct from auth.uid() or v_team);

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

  if v_team then
    -- Anúncio publicado pela equipe: aparece em nome do Meu Amigo pra Vida
    new.organization_id := null;
    new.publisher_name  := 'Meu Amigo pra Vida';
    if new.contact_mode = 'institucional' then
      new.contact_name := null; new.contact_phone := null; new.contact_email := null; new.contact_consent_at := null;
    end if;
    if new.contact_phone is not null then new.contact_phone := regexp_replace(new.contact_phone, '\D', '', 'g'); end if;
    if new.contact_email is not null then new.contact_email := lower(btrim(new.contact_email)); end if;
    if new.contact_name is not null then new.contact_name := btrim(new.contact_name); end if;
  else
    new.contact_mode := 'plataforma';
    new.contact_name := null; new.contact_phone := null; new.contact_email := null; new.contact_consent_at := null;

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
  elsif v_staff and (tg_op = 'INSERT' or new.status <> old.status) then
    if tg_op = 'UPDATE' or v_team then new.reviewed_by := auth.uid(); end if;
    if new.status in ('disponivel', 'em_processo', 'adotado') and new.approved_at is null then
      new.approved_at := now();
    end if;
    if new.status in ('rejeitado', 'rascunho') then
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

-- Visitantes veem o contato público dos anúncios da equipe
grant select (posted_by_team, contact_mode, contact_name, contact_phone, contact_email) on public.animals to anon;

-- -----------------------------------------------------------------------------
-- Eventos
-- -----------------------------------------------------------------------------
alter table public.events
  alter column organization_id drop not null,
  add column posted_by_team boolean not null default false,
  add column organizer_name text check (organizer_name is null or char_length(organizer_name) between 2 and 120);

alter table public.events
  add constraint events_owner check (organization_id is not null or posted_by_team);

create or replace function private.events_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_org  public.organizations%rowtype;
  v_team boolean := case when tg_op = 'INSERT' then coalesce(new.posted_by_team, false) else old.posted_by_team end;
begin
  if private.is_api_user() and not private.is_staff() then
    v_team := case when tg_op = 'INSERT' then false else old.posted_by_team end;
    if v_team then
      raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
    end if;
  end if;
  new.posted_by_team := v_team;

  if tg_op = 'INSERT' then
    new.slug := private.unique_slug(new.title);
  elsif new.slug <> old.slug or new.organization_id is distinct from old.organization_id then
    if private.is_api_user() and not private.is_admin() then
      raise exception 'Campo não pode ser alterado.' using errcode = 'insufficient_privilege';
    end if;
  end if;

  if v_team then
    -- Evento cadastrado pela equipe, sem organização vinculada
    new.organization_id := null;
    new.organizer_name  := coalesce(nullif(btrim(new.organizer_name), ''), 'Meu Amigo pra Vida');
    if new.status = 'em_analise' then new.status := 'publicado'; end if;
    if tg_op = 'INSERT' or new.status is distinct from old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
    if new.state is not null then new.state := upper(new.state); end if;
    return new;
  end if;

  new.organizer_name := null;
  select * into v_org from public.organizations o where o.id = new.organization_id;
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

grant select (posted_by_team, organizer_name) on public.events to anon;

-- Eventos da equipe não têm organização: ficam públicos quando publicados
drop policy "eventos: publicados" on public.events;
create policy "eventos: publicados" on public.events for select to anon, authenticated
  using (((status = 'publicado' or (status = 'encerrado' and reviewed_at is not null))
          and (posted_by_team or private.org_is_approved(organization_id)))
         or private.owns_org(organization_id) or (select private.is_staff()));
