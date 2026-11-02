-- =============================================================================
-- 0007 · Segurança: RLS em todas as tabelas, permissões, Storage e gatilhos de Auth
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Gatilhos no auth.users
-- -----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Liga RLS em todas as tabelas públicas
-- -----------------------------------------------------------------------------
alter table public.profiles                   enable row level security;
alter table public.profile_private            enable row level security;
alter table public.user_roles                 enable row level security;
alter table public.organizations              enable row level security;
alter table public.organization_private       enable row level security;
alter table public.animals                    enable row level security;
alter table public.animal_photos              enable row level security;
alter table public.favorites                  enable row level security;
alter table public.adoption_applications      enable row level security;
alter table public.application_status_history enable row level security;
alter table public.adoption_notes             enable row level security;
alter table public.application_messages       enable row level security;
alter table public.notifications              enable row level security;
alter table public.events                     enable row level security;
alter table public.blog_categories            enable row level security;
alter table public.blog_posts                 enable row level security;
alter table public.contact_messages           enable row level security;
alter table public.legal_documents            enable row level security;
alter table public.consents                   enable row level security;
alter table public.data_subject_requests      enable row level security;
-- audit_log já tem RLS ligada (0001)

-- -----------------------------------------------------------------------------
-- Permissões de tabela (defesa em profundidade: o anônimo só lê o que é público)
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant select on public.organizations, public.animals, public.animal_photos, public.events,
                public.blog_categories, public.blog_posts, public.legal_documents to anon;
grant insert on public.contact_messages to anon;

grant select, insert, update, delete on
  public.profiles, public.profile_private, public.organizations, public.organization_private,
  public.animals, public.animal_photos, public.favorites, public.events, public.blog_categories,
  public.blog_posts, public.legal_documents, public.data_subject_requests, public.contact_messages
  to authenticated;
grant select, insert, update on public.adoption_applications to authenticated;
grant select, insert, update, delete on public.adoption_notes to authenticated;
grant select, insert, update on public.application_messages to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select on public.application_status_history, public.user_roles, public.audit_log to authenticated;
grant select, insert on public.consents to authenticated;

grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

-- Funções utilitárias públicas (validação no formulário)
revoke execute on all functions in schema public from public;
grant execute on function public.only_digits(text), public.is_valid_cpf(text), public.is_valid_cnpj(text),
  public.normalize_cnpj(text), public.slugify(text), public.is_valid_uf(text), public.is_valid_phone(text),
  public.is_https_url(text), public.org_category(public.org_kind) to anon, authenticated, service_role;
grant execute on function public.my_roles(), public.my_consents(), public.export_my_data(),
  public.delete_my_account(text), public.get_applicant_cpf(uuid) to authenticated;

-- =============================================================================
-- Políticas RLS
-- =============================================================================

-- profiles -------------------------------------------------------------------
create policy "perfil: titular lê" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_staff()) or private.can_view_profile(id));
create policy "perfil: titular cria" on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));
create policy "perfil: titular atualiza" on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()))
  with check (id = (select auth.uid()) or (select private.is_admin()));

-- profile_private (CPF): somente o titular -------------------------------------
create policy "cpf: titular lê" on public.profile_private for select to authenticated
  using (user_id = (select auth.uid()));
create policy "cpf: titular cria" on public.profile_private for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "cpf: titular atualiza" on public.profile_private for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "cpf: titular apaga" on public.profile_private for delete to authenticated
  using (user_id = (select auth.uid()));

-- user_roles -----------------------------------------------------------------
create policy "papéis: titular e admin leem" on public.user_roles for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));

-- organizations ----------------------------------------------------------------
create policy "org: públicas aprovadas" on public.organizations for select to anon, authenticated
  using (status = 'aprovada' or owner_id = (select auth.uid()) or (select private.is_staff()));
create policy "org: titular cria" on public.organizations for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "org: titular ou equipe atualiza" on public.organizations for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_staff()))
  with check (owner_id = (select auth.uid()) or (select private.is_staff()));
create policy "org: titular ou admin apaga" on public.organizations for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

-- organization_private ---------------------------------------------------------
create policy "org privado: titular e equipe leem" on public.organization_private for select to authenticated
  using (private.owns_org(organization_id) or (select private.is_staff()));
create policy "org privado: titular cria" on public.organization_private for insert to authenticated
  with check (private.owns_org(organization_id));
create policy "org privado: titular atualiza" on public.organization_private for update to authenticated
  using (private.owns_org(organization_id) or (select private.is_admin()))
  with check (private.owns_org(organization_id) or (select private.is_admin()));

-- animals --------------------------------------------------------------------
-- quem se candidatou continua vendo o animal mesmo depois de adotado/arquivado
create or replace function private.applied_to_animal(p_animal uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.adoption_applications ap
                 where ap.animal_id = p_animal and ap.applicant_id = auth.uid())
$$;
grant execute on function private.applied_to_animal(uuid) to anon, authenticated, service_role;

create policy "animais: públicos" on public.animals for select to anon, authenticated
  using (private.animal_is_public(id) or owner_id = (select auth.uid()) or (select private.is_staff())
         or private.applied_to_animal(id));
create policy "animais: cadastrar" on public.animals for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "animais: dono ou equipe atualiza" on public.animals for update to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_staff()))
  with check (owner_id = (select auth.uid()) or (select private.is_staff()));
create policy "animais: dono ou admin apaga" on public.animals for delete to authenticated
  using (owner_id = (select auth.uid()) or (select private.is_admin()));

-- animal_photos --------------------------------------------------------------
create policy "fotos: visíveis com o animal" on public.animal_photos for select to anon, authenticated
  using (private.animal_is_public(animal_id) or private.manages_animal(animal_id) or (select private.is_staff()));
create policy "fotos: dono insere" on public.animal_photos for insert to authenticated
  with check (private.manages_animal(animal_id));
create policy "fotos: dono atualiza" on public.animal_photos for update to authenticated
  using (private.manages_animal(animal_id)) with check (private.manages_animal(animal_id));
create policy "fotos: dono ou equipe apaga" on public.animal_photos for delete to authenticated
  using (private.manages_animal(animal_id) or (select private.is_staff()));

-- favorites ------------------------------------------------------------------
create policy "favoritos: do titular" on public.favorites for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- adoption_applications ------------------------------------------------------
create policy "pedidos: partes leem" on public.adoption_applications for select to authenticated
  using (applicant_id = (select auth.uid()) or manager_id = (select auth.uid()) or (select private.is_staff()));
create policy "pedidos: candidato envia" on public.adoption_applications for insert to authenticated
  with check (applicant_id = (select auth.uid()));
create policy "pedidos: partes atualizam" on public.adoption_applications for update to authenticated
  using (applicant_id = (select auth.uid()) or manager_id = (select auth.uid()) or (select private.is_staff()))
  with check (applicant_id = (select auth.uid()) or manager_id = (select auth.uid()) or (select private.is_staff()));

-- adoption_notes: somente quem gerencia o anúncio ---------------------------------
create or replace function private.manages_application(p_app uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.adoption_applications a where a.id = p_app and a.manager_id = auth.uid())
$$;
grant execute on function private.manages_application(uuid) to authenticated, service_role;

create policy "anotações: responsável" on public.adoption_notes for all to authenticated
  using (private.manages_application(application_id))
  with check (private.manages_application(application_id));

-- application_status_history ---------------------------------------------------
create policy "histórico: partes leem" on public.application_status_history for select to authenticated
  using (private.is_application_party(application_id) or (select private.is_staff()));

-- application_messages ---------------------------------------------------------
create policy "mensagens: partes leem" on public.application_messages for select to authenticated
  using (private.is_application_party(application_id) or (select private.is_staff()));
create policy "mensagens: partes enviam" on public.application_messages for insert to authenticated
  with check (private.is_application_party(application_id) and sender_id = (select auth.uid()));
create policy "mensagens: partes marcam leitura" on public.application_messages for update to authenticated
  using (private.is_application_party(application_id)) with check (private.is_application_party(application_id));

-- notifications ----------------------------------------------------------------
create policy "notificações: do titular" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notificações: titular marca lida" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notificações: titular apaga" on public.notifications for delete to authenticated
  using (user_id = (select auth.uid()));

-- events -----------------------------------------------------------------------
create policy "eventos: publicados" on public.events for select to anon, authenticated
  using (status in ('publicado', 'encerrado') or private.owns_org(organization_id) or (select private.is_staff()));
create policy "eventos: org cria" on public.events for insert to authenticated
  with check (private.owns_org(organization_id) or (select private.is_staff()));
create policy "eventos: org ou equipe atualiza" on public.events for update to authenticated
  using (private.owns_org(organization_id) or (select private.is_staff()))
  with check (private.owns_org(organization_id) or (select private.is_staff()));
create policy "eventos: org ou equipe apaga" on public.events for delete to authenticated
  using (private.owns_org(organization_id) or (select private.is_staff()));

-- blog -------------------------------------------------------------------------
create policy "categorias: todos leem" on public.blog_categories for select to anon, authenticated using (true);
create policy "categorias: admin escreve" on public.blog_categories for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy "posts: publicados" on public.blog_posts for select to anon, authenticated
  using ((status = 'publicado' and published_at <= now()) or (select private.is_admin()));
create policy "posts: admin insere" on public.blog_posts for insert to authenticated
  with check ((select private.is_admin()));
create policy "posts: admin atualiza" on public.blog_posts for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy "posts: admin apaga" on public.blog_posts for delete to authenticated
  using ((select private.is_admin()));

-- contact_messages -------------------------------------------------------------
create policy "contato: qualquer um envia" on public.contact_messages for insert to anon, authenticated
  with check (consent);
create policy "contato: equipe lê" on public.contact_messages for select to authenticated
  using ((select private.is_staff()));
create policy "contato: equipe atualiza" on public.contact_messages for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- legal_documents --------------------------------------------------------------
create policy "documentos legais: publicados" on public.legal_documents for select to anon, authenticated
  using (published_at is not null or (select private.is_admin()));
create policy "documentos legais: admin escreve" on public.legal_documents for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- consents -------------------------------------------------------------------
create policy "consentimentos: titular lê" on public.consents for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy "consentimentos: titular registra" on public.consents for insert to authenticated
  with check (user_id = (select auth.uid()));

-- data_subject_requests --------------------------------------------------------
create policy "lgpd: titular lê" on public.data_subject_requests for select to authenticated
  using (user_id = (select auth.uid()) or (select private.is_staff()));
create policy "lgpd: titular abre" on public.data_subject_requests for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "lgpd: equipe responde" on public.data_subject_requests for update to authenticated
  using ((select private.is_staff())) with check ((select private.is_staff()));

-- audit_log --------------------------------------------------------------------
create policy "auditoria: admin lê" on public.audit_log for select to authenticated
  using ((select private.is_admin()));

-- =============================================================================
-- Storage
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('animal-photos', 'animal-photos', true, 5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('org-media',     'org-media',     true, 5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('avatars',       'avatars',       true, 2097152, array['image/webp', 'image/jpeg', 'image/png']),
  ('event-media',   'event-media',   true, 5242880, array['image/webp', 'image/jpeg', 'image/png']),
  ('blog-media',    'blog-media',    true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Cada usuário escreve somente na própria pasta: <bucket>/<user_id>/...
create policy "storage: dono lista a própria pasta" on storage.objects for select to authenticated
  using (bucket_id in ('animal-photos', 'org-media', 'avatars', 'event-media')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: dono envia" on storage.objects for insert to authenticated
  with check (bucket_id in ('animal-photos', 'org-media', 'avatars', 'event-media')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: dono substitui" on storage.objects for update to authenticated
  using (bucket_id in ('animal-photos', 'org-media', 'avatars', 'event-media')
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id in ('animal-photos', 'org-media', 'avatars', 'event-media')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: dono apaga" on storage.objects for delete to authenticated
  using (bucket_id in ('animal-photos', 'org-media', 'avatars', 'event-media')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: admin gerencia blog" on storage.objects for all to authenticated
  using (bucket_id = 'blog-media' and (select private.is_admin()))
  with check (bucket_id = 'blog-media' and (select private.is_admin()));
