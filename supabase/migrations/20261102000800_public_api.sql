-- =============================================================================
-- 0008 · Funções da API: números públicos, moderação e gestão de papéis
-- =============================================================================

-- Números do impacto exibidos na página inicial (somente agregados, sem dados pessoais)
create or replace function public.get_public_stats()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'animais_disponiveis', (select count(*) from public.animals a
                             left join public.organizations o on o.id = a.organization_id
                             where a.status in ('disponivel', 'em_processo') and a.approved_at is not null
                               and (a.organization_id is null or o.status = 'aprovada')),
    'adocoes_concluidas',  (select count(*) from public.animals a where a.status = 'adotado'),
    'ongs_parceiras',      (select count(*) from public.organizations o
                             where o.status = 'aprovada' and o.kind in ('ong', 'protetor_independente')),
    'empresas_parceiras',  (select count(*) from public.organizations o
                             where o.status = 'aprovada' and o.kind not in ('ong', 'protetor_independente')),
    'cidades',             (select count(distinct (a.city, a.state)) from public.animals a
                             where a.status in ('disponivel', 'em_processo', 'adotado') and a.approved_at is not null)
  )
$$;
revoke all on function public.get_public_stats() from public;
grant execute on function public.get_public_stats() to anon, authenticated;

-- Fila de moderação (somente equipe)
create or replace function public.moderation_queue()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_staff() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  return jsonb_build_object(
    'organizacoes', (select count(*) from public.organizations where status = 'pendente'),
    'animais',      (select count(*) from public.animals where status = 'em_analise'),
    'eventos',      (select count(*) from public.events where status = 'em_analise'),
    'contatos',     (select count(*) from public.contact_messages where status = 'novo'),
    'lgpd',         (select count(*) from public.data_subject_requests where status in ('aberta', 'em_andamento'))
  );
end $$;
revoke all on function public.moderation_queue() from public, anon;
grant execute on function public.moderation_queue() to authenticated;

-- Moderação de organização (aprovar / rejeitar / suspender) com notificação ao titular
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
  update public.organizations set status = p_status, review_note = nullif(btrim(p_note), '')
   where id = p_org returning owner_id, trade_name into v_owner, v_name;
  if v_owner is null then
    raise exception 'Organização não encontrada.' using errcode = 'no_data_found';
  end if;
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
  update public.animals
     set status = case when p_approve then 'disponivel'::public.animal_status else 'rejeitado'::public.animal_status end,
         review_note = nullif(btrim(p_note), '')
   where id = p_animal and status = 'em_analise'
  returning owner_id, name into v_owner, v_name;
  if v_owner is null then
    raise exception 'Anúncio não encontrado ou fora da fila de análise.' using errcode = 'no_data_found';
  end if;
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
  update public.events
     set status = case when p_approve then 'publicado'::public.content_status else 'rejeitado'::public.content_status end,
         review_note = nullif(btrim(p_note), '')
   where id = p_event and status = 'em_analise'
  returning title into v_title;
  if v_title is null then
    raise exception 'Evento não encontrado ou fora da fila de análise.' using errcode = 'no_data_found';
  end if;
  select o.owner_id into v_owner from public.events e join public.organizations o on o.id = e.organization_id
   where e.id = p_event;
  perform private.notify(v_owner, 'evento_moderacao',
    case when p_approve then '“' || v_title || '” foi publicado!' else '“' || v_title || '” precisa de ajustes' end,
    nullif(btrim(p_note), ''), '/painel/eventos');
end $$;

-- Papéis: somente administradores concedem ou removem
create or replace function public.set_user_role(p_email text, p_role public.app_role, p_grant boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
begin
  if not private.is_admin() then
    raise exception 'Sem permissão.' using errcode = 'insufficient_privilege';
  end if;
  select p.id into v_user from public.profiles p where p.email = p_email::extensions.citext;
  if v_user is null then
    raise exception 'Usuário não encontrado.' using errcode = 'no_data_found';
  end if;
  if p_grant then
    insert into public.user_roles (user_id, role, granted_by) values (v_user, p_role, auth.uid())
    on conflict do nothing;
  else
    if v_user = auth.uid() and p_role = 'admin' then
      raise exception 'Você não pode remover o seu próprio acesso de administrador.' using errcode = 'check_violation';
    end if;
    delete from public.user_roles where user_id = v_user and role = p_role;
  end if;
  perform private.audit(case when p_grant then 'papel_concedido' else 'papel_removido' end,
                        'user_roles', v_user::text, jsonb_build_object('papel', p_role));
end $$;

revoke all on function public.moderate_organization(uuid, public.org_status, text),
                    public.moderate_animal(uuid, boolean, text),
                    public.moderate_event(uuid, boolean, text),
                    public.set_user_role(text, public.app_role, boolean) from public, anon;
grant execute on function public.moderate_organization(uuid, public.org_status, text),
                          public.moderate_animal(uuid, boolean, text),
                          public.moderate_event(uuid, boolean, text),
                          public.set_user_role(text, public.app_role, boolean) to authenticated;

-- Garante que futuras funções em public não fiquem executáveis por padrão para anon
alter default privileges in schema public revoke execute on functions from public;
