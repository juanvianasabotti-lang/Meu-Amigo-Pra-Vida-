-- Testes de ponta a ponta das regras de negócio e RLS (rodar em banco local com o stub).
-- Cada bloco "expect_error" deve falhar; os demais devem passar.
\set ON_ERROR_STOP 1
set client_min_messages = notice;

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', false);
  execute 'set role anon';
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'OK (bloqueado) % -> %', p_label, sqlerrm;
    return;
  end;
  raise exception 'FALHA: deveria ter sido bloqueado: %', p_label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Usuários
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-00000000000a', 'admin@mapv.test', '{"full_name":"Ana Admin","account_type":"pessoa"}'),
 ('00000000-0000-0000-0000-0000000000a1', 'maria@mapv.test',
   '{"full_name":"Maria  da Silva","account_type":"pessoa","phone":"(11) 98888-7777","birth_date":"1990-05-10","city":"São Paulo","state":"sp","terms_version":"1.0","privacy_version":"1.0","marketing_opt_in":"true"}'),
 ('00000000-0000-0000-0000-0000000000a2', 'joao@mapv.test',
   '{"full_name":"João Souza","account_type":"pessoa","phone":"21977776666","birth_date":"1985-01-01","city":"Rio de Janeiro","state":"RJ","terms_version":"1.0","privacy_version":"1.0"}'),
 ('00000000-0000-0000-0000-0000000000a3', 'teen@mapv.test',
   '{"full_name":"Menor","account_type":"pessoa","birth_date":"2015-01-01","account_type":"admin"}'),
 ('00000000-0000-0000-0000-0000000000b1', 'ong@mapv.test',
   '{"full_name":"Paula ONG","account_type":"ong","phone":"11955554444","birth_date":"1980-02-02","city":"São Paulo","state":"SP","terms_version":"1.0","privacy_version":"1.0"}'),
 ('00000000-0000-0000-0000-0000000000c1', 'pet@mapv.test',
   '{"full_name":"Carlos Petshop","account_type":"empresa","phone":"11944443333","birth_date":"1979-03-03","city":"Campinas","state":"SP","terms_version":"1.0","privacy_version":"1.0"}');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000000a', 'admin');

do $$ declare r record; begin
  select * into r from public.profiles where id = '00000000-0000-0000-0000-0000000000a1';
  assert r.full_name = 'Maria da Silva' and r.phone = '11988887777' and r.state = 'SP' and r.onboarding_completed, 'perfil maria';
  assert (select count(*) from public.consents where user_id = r.id) = 3, 'consentimentos maria';
  select * into r from public.profiles where id = '00000000-0000-0000-0000-0000000000a3';
  assert r.birth_date is null and r.account_type = 'pessoa' and not r.onboarding_completed, 'menor/admin ignorado';
  raise notice 'OK perfis criados pelo gatilho';
end $$;

-- ---------------------------------------------------------------------------
-- Pessoa: CPF e perfil
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$insert into public.profile_private (user_id, cpf) values ('00000000-0000-0000-0000-0000000000a1', '111.111.111-11')$$, 'CPF inválido');
insert into public.profile_private (user_id, cpf) values ('00000000-0000-0000-0000-0000000000a1', '529.982.247-25');
select pg_temp.expect_error($$insert into public.profile_private (user_id, cpf) values ('00000000-0000-0000-0000-0000000000a2', '390.533.447-05')$$, 'CPF de outra pessoa');
select pg_temp.expect_error($$update public.profiles set birth_date = '2012-01-01' where id = auth.uid()$$, 'menor de 18');
update public.profiles set email = 'hack@x.com', bio = 'Amo gatos' where id = auth.uid();
do $$ begin assert (select email::text from public.profiles where id = auth.uid()) = 'maria@mapv.test', 'email protegido'; end $$;
do $$ begin assert (select count(*) from public.profiles) = 1, 'só vê o próprio perfil'; end $$;
select pg_temp.expect_error($$insert into public.user_roles (user_id, role) values (auth.uid(), 'admin')$$, 'auto-promoção a admin');
select pg_temp.expect_error($$select public.set_user_role('maria@mapv.test', 'admin', true)$$, 'set_user_role por não-admin');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.profile_private (user_id, cpf) values ('00000000-0000-0000-0000-0000000000a2', '39053344705');
do $$ begin assert (select count(*) from public.profile_private) = 1, 'só vê o próprio CPF'; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- ONG: cadastro e moderação
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
select pg_temp.expect_error($$insert into public.organizations (owner_id, kind, trade_name) values (auth.uid(), 'petshop', 'Errado')$$, 'ONG cadastrando empresa');
insert into public.organizations (owner_id, kind, trade_name, status, pix_key, pix_key_type, show_address, instagram)
values (auth.uid(), 'ong', 'Patinhas Felizes', 'aprovada', 'pix@patinhas.org', 'email', true, '@patinhas');
do $$ begin assert (select status from public.organizations where owner_id = auth.uid()) = 'pendente', 'status forçado pendente'; end $$;
select pg_temp.expect_error($$insert into public.organization_private (organization_id, document_type, document, legal_name, responsible_name, cep, street, number, district, city, state)
  select id, 'cnpj', '11.222.333/0001-80', 'Assoc. Patinhas', 'Paula Lima', '01001-000', 'Praça da Sé', '1', 'Sé', 'São Paulo', 'SP' from public.organizations where owner_id = auth.uid()$$, 'CNPJ inválido');
insert into public.organization_private (organization_id, document_type, document, legal_name, responsible_name, cep, street, number, district, city, state)
  select id, 'cnpj', '11.222.333/0001-81', 'Associação Patinhas Felizes', 'Paula Lima', '01001-000', 'Praça da Sé', '100', 'Sé', 'São Paulo', 'sp'
  from public.organizations where owner_id = auth.uid();
do $$ declare o record; begin
  select * into o from public.organizations where owner_id = auth.uid();
  assert o.city = 'São Paulo' and o.state = 'SP' and o.public_address like 'Praça da Sé, 100%' and o.instagram = 'patinhas', 'endereço público derivado';
end $$;
select pg_temp.expect_error($$update public.organizations set status = 'aprovada' where owner_id = auth.uid()$$, 'ONG se auto-aprovando');
select pg_temp.expect_error($$select public.moderate_organization((select id from public.organizations limit 1), 'aprovada')$$, 'moderação por não-staff');
-- ONG ainda pendente consegue preparar anúncios (ficam ocultos até aprovação)
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status)
values (auth.uid(), 'Thor', 'cao', 'macho', 'grande', 'adulto', 'Thor é um labrador dócil, brincalhão e muito companheiro.', 'São Paulo', 'SP', 'disponivel');
do $$ declare a record; begin
  select * into a from public.animals where name = 'Thor';
  assert a.status = 'em_analise' and a.organization_id is not null and a.publisher_name = 'Patinhas Felizes', 'animal em análise';
end $$;
select pg_temp.expect_error($$update public.animals set status = 'disponivel' where name = 'Thor'$$, 'ONG publicando sem moderação');
select pg_temp.expect_error($$insert into public.animal_photos (animal_id, storage_path) select id, 'outro-usuario/' || id || '/a.webp' from public.animals where name = 'Thor'$$, 'foto fora da pasta');
insert into public.animal_photos (animal_id, storage_path, is_cover)
  select id, auth.uid() || '/' || id || '/capa.webp', true from public.animals where name = 'Thor';
-- storage
insert into storage.objects (bucket_id, name, owner) values ('animal-photos', auth.uid() || '/x/capa.webp', auth.uid());
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('animal-photos', '00000000-0000-0000-0000-0000000000a1/x.webp')$$, 'upload na pasta de outro');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('blog-media', auth.uid() || '/x.webp')$$, 'upload no blog sem ser admin');
reset role;

select pg_temp.as_anon();
do $$ begin assert (select count(*) from public.animals) = 0, 'anon não vê animal em análise'; end $$;
do $$ begin assert (select count(*) from public.organizations) = 0, 'anon não vê ONG pendente'; end $$;
select pg_temp.expect_error($$select * from public.organization_private$$, 'anon lendo dados privados');
select pg_temp.expect_error($$select * from public.profiles$$, 'anon lendo perfis');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
do $$ begin assert (public.moderation_queue() ->> 'organizacoes')::int = 1, 'fila de moderação'; end $$;
select public.moderate_organization((select id from public.organizations where trade_name = 'Patinhas Felizes'), 'aprovada', null);
select pg_temp.expect_error($$select public.moderate_animal((select id from public.animals where name = 'Thor'), false, '')$$, 'rejeição sem motivo');
select public.moderate_animal((select id from public.animals where name = 'Thor'), true, null);
reset role;

select pg_temp.as_anon();
do $$ begin
  assert (select count(*) from public.animals where status = 'disponivel') = 1, 'anon vê animal aprovado';
  assert (select count(*) from public.animal_photos) = 1, 'anon vê foto';
  assert (select count(*) from public.organizations) = 1, 'anon vê ONG aprovada';
  assert (public.get_public_stats() ->> 'animais_disponiveis')::int = 1, 'estatísticas';
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Adoção
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
insert into public.favorites (user_id, animal_id) select auth.uid(), id from public.animals where name = 'Thor';
select pg_temp.expect_error($$insert into public.adoption_applications (animal_id, housing_type, housing_owner, has_yard, adults_in_home, household_agrees, hours_alone, caretaker_when_away, motivation, aware_of_costs, agrees_to_follow_up, share_data_consent)
  select id, 'casa', 'alugada', true, 2, true, 4, 'Minha irmã', 'Quero muito dar um lar cheio de amor para o Thor, tenho espaço.', true, true, true from public.animals where name = 'Thor'$$, 'alugada sem resposta do proprietário');
insert into public.adoption_applications (animal_id, housing_type, housing_owner, has_yard, yard_fenced, adults_in_home, household_agrees, hours_alone, caretaker_when_away, motivation, aware_of_costs, agrees_to_follow_up, share_data_consent, status)
  select id, 'casa', 'propria', true, true, 2, true, 4, 'Minha irmã', 'Quero muito dar um lar cheio de amor para o Thor, tenho espaço.', true, true, true, 'aprovado' from public.animals where name = 'Thor';
do $$ begin assert (select status from public.adoption_applications limit 1) = 'enviado', 'status inicial forçado'; end $$;
select pg_temp.expect_error($$insert into public.adoption_applications (animal_id, housing_type, housing_owner, has_yard, adults_in_home, household_agrees, hours_alone, caretaker_when_away, motivation, aware_of_costs, agrees_to_follow_up, share_data_consent)
  select id, 'casa', 'propria', true, 2, true, 4, 'Minha irmã', 'Quero muito dar um lar cheio de amor para o Thor, tenho espaço.', true, true, true from public.animals where name = 'Thor'$$, 'pedido duplicado');
select pg_temp.expect_error($$update public.adoption_applications set status = 'aprovado'$$, 'candidato se aprovando');
select pg_temp.expect_error($$update public.adoption_applications set motivation = 'Mudei de ideia sobre o texto do pedido e quero editar.'$$, 'editar questionário');
insert into public.application_messages (application_id, body) select id, 'Olá! Posso visitar no sábado?' from public.adoption_applications;
reset role;

select set_config('test.app', (select id::text from public.adoption_applications limit 1), false);
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin assert (select count(*) from public.adoption_applications) = 0, 'terceiro não vê pedido'; end $$;
select pg_temp.expect_error($$insert into public.application_messages (application_id, body) values (current_setting('test.app')::uuid, 'intruso')$$, 'terceiro enviando mensagem');
select pg_temp.expect_error($$select public.get_applicant_cpf(current_setting('test.app')::uuid)$$, 'terceiro lendo CPF');
select pg_temp.expect_error($$insert into public.adoption_notes (application_id, note) values (current_setting('test.app')::uuid, 'x')$$, 'terceiro anotando');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000b1');
do $$ begin
  assert (select count(*) from public.adoption_applications) = 1, 'ONG vê pedido';
  assert (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = 1, 'ONG vê perfil do candidato';
  assert (select count(*) from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = 0, 'ONG não vê outros perfis';
  assert (select count(*) from public.notifications where kind = 'adocao_novo_pedido') = 1, 'notificação novo pedido';
end $$;
select pg_temp.expect_error($$select public.get_applicant_cpf((select id from public.adoption_applications limit 1))$$, 'CPF antes da entrevista');
update public.adoption_applications set status = 'entrevista';
do $$ begin assert public.get_applicant_cpf((select id from public.adoption_applications limit 1)) = '52998224725', 'CPF na entrevista'; end $$;
insert into public.adoption_notes (application_id, note) select id, 'Candidata muito atenciosa.' from public.adoption_applications;
update public.application_messages set read_at = now();
update public.adoption_applications set status = 'aprovado';
do $$ begin assert (select status from public.animals where name = 'Thor') = 'em_processo', 'animal em processo'; end $$;
update public.adoption_applications set status = 'concluido';
do $$ begin assert (select status from public.animals where name = 'Thor') = 'adotado', 'animal adotado'; end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from public.adoption_notes) = 0, 'candidato não vê anotação interna';
  assert (select count(*) from public.notifications where kind = 'adocao_status') = 3, 'notificações de status';
  assert (select count(*) from public.application_status_history) = 4, 'histórico';
  assert (select count(*) from public.application_messages where read_at is not null) = 1, 'mensagem lida';
end $$;
select pg_temp.expect_error($$update public.notifications set title = 'x'$$, 'editar notificação');
update public.notifications set read_at = now();
reset role;

-- ---------------------------------------------------------------------------
-- Pessoa física doando um animal; empresa e eventos
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state)
values (auth.uid(), 'Mimi', 'gato', 'femea', 'pequeno', 'filhote', 'Mimi é uma gatinha carinhosa resgatada da rua, já vermifugada.', 'Rio de Janeiro', 'rj');
do $$ begin assert (select publisher_name from public.animals where name = 'Mimi') = 'João (pessoa física)', 'nome público'; end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
select pg_temp.expect_error($$insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state) values (auth.uid(), 'Rex', 'cao', 'macho', 'medio', 'adulto', 'Descrição de teste com tamanho suficiente para passar.', 'Campinas', 'SP')$$, 'empresa anunciando animal');
insert into public.organizations (owner_id, kind, trade_name, services, pix_key, pix_key_type) values (auth.uid(), 'petshop', 'Pet Feliz', '{banho,tosa}', '123', 'aleatoria');
do $$ begin assert (select pix_key from public.organizations where owner_id = auth.uid()) is null, 'empresa sem pix'; end $$;
insert into public.organization_private (organization_id, document_type, document, legal_name, responsible_name, cep, street, number, district, city, state)
  select id, 'cnpj', '12.ABC.345/01DE-35', 'Pet Feliz Comércio LTDA', 'Carlos Lima', '13010-000', 'Rua A', '10', 'Centro', 'Campinas', 'SP'
  from public.organizations where owner_id = auth.uid();
select pg_temp.expect_error($$insert into public.events (organization_id, kind, title, summary, starts_at, city, state) select id, 'feira_adocao', 'Feira de adoção', 'Venha conhecer seu novo amigo', now() + interval '7 days', 'Campinas', 'SP' from public.organizations where owner_id = auth.uid()$$, 'evento com empresa pendente');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.moderate_organization((select id from public.organizations where trade_name = 'Pet Feliz'), 'aprovada');
do $$ begin assert (select partner_since from public.organizations where trade_name = 'Pet Feliz') is not null, 'parceiro desde'; end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
insert into public.events (organization_id, kind, title, summary, starts_at, city, state, status)
  select id, 'feira_adocao', 'Feira de adoção', 'Venha conhecer seu novo amigo', now() + interval '7 days', 'Campinas', 'SP', 'publicado'
  from public.organizations where owner_id = auth.uid();
do $$ begin assert (select status from public.events) = 'em_analise', 'evento em análise'; end $$;
reset role;

-- ---------------------------------------------------------------------------
-- Blog, contato, LGPD
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$insert into public.blog_posts (title, excerpt, content_md, status) values ('Post de teste', 'Resumo do post de teste aqui', repeat('texto ', 20), 'publicado')$$, 'usuário comum escrevendo no blog');
insert into public.data_subject_requests (contact_email, request_type, details) values ('x@x.com', 'acesso', 'Quero meus dados');
do $$ begin assert (select contact_email::text from public.data_subject_requests) = 'maria@mapv.test', 'e-mail do titular'; end $$;
update public.data_subject_requests set status = 'concluida';
do $$ begin assert (select status from public.data_subject_requests) = 'aberta', 'titular não encerra a própria solicitação'; end $$;
select pg_temp.expect_error($$insert into public.consents (user_id, consent_type, version, granted) values (auth.uid(), 'compartilhamento_adocao', '1.0', true)$$, 'consentimento automático manual');
insert into public.consents (user_id, consent_type, version, granted) values (auth.uid(), 'marketing', '1.0', false);
do $$ begin assert (select granted from public.my_consents() where consent_type = 'marketing') = false, 'revogação de marketing'; end $$;
do $$ declare d jsonb := public.export_my_data(); begin
  assert d -> 'perfil' ->> 'full_name' = 'Maria da Silva' and d ->> 'cpf' = '52998224725'
     and jsonb_array_length(d -> 'pedidos_de_adocao') = 1, 'exportação de dados';
end $$;
reset role;

select pg_temp.as_anon();
insert into public.contact_messages (name, email, topic, message, consent) values ('Visitante', 'v@v.com', 'duvida', 'Como funciona a adoção?', true);
select pg_temp.expect_error($$insert into public.contact_messages (name, email, topic, message, consent) values ('Visitante', 'v@v.com', 'duvida', 'Sem consentimento aqui.', false)$$, 'contato sem consentimento');
select pg_temp.expect_error($$select * from public.contact_messages$$, 'anon lendo contatos');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.blog_categories (name, slug, color) values ('Teste', 'teste', 'azul');
insert into public.blog_posts (title, excerpt, content_md, status, category_id)
  select 'Como se preparar para adotar', 'Tudo o que você precisa saber antes de adotar.', repeat('Conteúdo do artigo. ', 30), 'publicado', id from public.blog_categories where slug = 'teste';
do $$ begin assert exists (select 1 from public.blog_posts where slug = 'como-se-preparar-para-adotar'), 'slug do post'; end $$;
select public.set_user_role('joao@mapv.test', 'moderador', true);
reset role;

-- ---------------------------------------------------------------------------
-- Eliminação de conta (LGPD)
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
select pg_temp.expect_error($$select public.delete_my_account('sim')$$, 'exclusão sem confirmação');
select public.delete_my_account('EXCLUIR MINHA CONTA');
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where email = 'maria@mapv.test'), 'usuário removido';
  assert not exists (select 1 from public.profile_private where cpf = '52998224725'), 'CPF removido';
  assert (select applicant_id from public.adoption_applications limit 1) is null, 'pedido anonimizado';
  assert (select status from public.animals where name = 'Thor') = 'adotado', 'histórico do animal preservado';
  raise notice 'OK eliminação de conta';
end $$;

select 'TODOS OS TESTES PASSARAM' as resultado;
