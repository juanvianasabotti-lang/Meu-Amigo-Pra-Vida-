-- =============================================================================
-- 0015 · Admin pode aprovar o próprio anúncio
-- =============================================================================
-- Moderadores continuam sem poder moderar os próprios anúncios. Administradores
-- podem, pela fila de moderação; reviewed_by registra quem aprovou.
-- =============================================================================

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
             and ((case when tg_op = 'INSERT' then new.owner_id else old.owner_id end) is distinct from auth.uid() or v_team
                  -- admin aprovando o próprio anúncio pela fila de moderação (moderate_animal)
                  or (private.is_admin() and coalesce(current_setting('mapv.self_review', true), '') = 'on'));

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
    if not private.is_admin() then
      raise exception 'Você não pode moderar o seu próprio anúncio. Peça para outra pessoa da equipe.' using errcode = 'insufficient_privilege';
    end if;
    perform set_config('mapv.self_review', 'on', true);
  end if;
  update public.animals
     set status = case when p_approve then 'disponivel'::public.animal_status else 'rejeitado'::public.animal_status end,
         review_note = nullif(btrim(p_note), '')
   where id = p_animal returning name into v_name;
  perform set_config('mapv.self_review', 'off', true);
  perform private.notify(v_owner, 'animal_moderacao',
    case when p_approve then 'O anúncio de ' || v_name || ' está no ar! 🐾'
         else 'O anúncio de ' || v_name || ' precisa de ajustes' end,
    nullif(btrim(p_note), ''), '/painel/animais');
end $$;
