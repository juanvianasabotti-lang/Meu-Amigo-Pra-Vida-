-- Testes: animais e eventos cadastrados pela equipe (rodar depois de 01_rls_flows.sql, no mesmo banco).
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

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000e1', 'ze@mapv.test',
   '{"full_name":"Zé Comum","account_type":"pessoa","phone":"11933332222","birth_date":"1990-01-01","city":"Diadema","state":"SP","terms_version":"1.0","privacy_version":"1.0"}');

-- ---------------------------------------------------------------------------
-- Animal da equipe com contato do doador
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status,
                            posted_by_team, contact_mode, contact_name, contact_phone, contact_email, contact_consent_at)
values (auth.uid(), 'Pipoca', 'cao', 'femea', 'pequeno', 'adulto', 'Cadelinha dócil resgatada no centro, já castrada.',
        'Diadema', 'sp', 'disponivel', true, 'doador', ' Dona Rosa ', '(11) 97777-1111', null, now());
-- contato do doador exige consentimento
select pg_temp.expect_error($$insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status,
  posted_by_team, contact_mode, contact_name, contact_phone) values (auth.uid(), 'Sem Termo', 'gato', 'macho', 'pequeno', 'filhote',
  'Gatinho resgatado procurando um lar amoroso.', 'Diadema', 'SP', 'disponivel', true, 'doador', 'Fulano', '11977771111')$$, 'doador sem consentimento');
-- e-mail institucional
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status,
                            posted_by_team, contact_mode, contact_name, contact_phone)
values (auth.uid(), 'Bolinha', 'gato', 'macho', 'pequeno', 'filhote', 'Gatinho resgatado procurando um lar amoroso.',
        'Diadema', 'SP', 'disponivel', true, 'institucional', 'Ignorado', '11900000000');
reset role;
do $$ declare r record; begin
  select * into r from public.animals where name = 'Pipoca';
  assert r.posted_by_team and r.publisher_name = 'Meu Amigo pra Vida' and r.organization_id is null, 'pipoca equipe';
  assert r.status = 'disponivel' and r.approved_at is not null and r.reviewed_by = '00000000-0000-0000-0000-00000000000a', 'pipoca publicada';
  assert r.contact_name = 'Dona Rosa' and r.contact_phone = '11977771111' and r.state = 'SP', 'pipoca contato normalizado';
  select * into r from public.animals where name = 'Bolinha';
  assert r.contact_mode = 'institucional' and r.contact_name is null and r.contact_phone is null, 'bolinha sem dados pessoais';
  assert r.status = 'disponivel', 'bolinha publicada';
  raise notice 'OK animais da equipe publicados direto';
end $$;

-- Visitante vê o anúncio e o contato público
select pg_temp.as_anon();
do $$ begin
  assert (select contact_phone from public.animals where name = 'Pipoca') = '11977771111', 'anon vê contato do doador';
  assert (select publisher_name from public.animals where name = 'Bolinha') = 'Meu Amigo pra Vida', 'anon vê bolinha';
  raise notice 'OK visitante vê anúncio da equipe';
end $$;

-- Pessoa comum não consegue se passar pela equipe
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status,
                            posted_by_team, contact_mode, contact_name, contact_phone, contact_consent_at)
values (auth.uid(), 'Falso', 'cao', 'macho', 'grande', 'adulto', 'Tentando publicar como se fosse a equipe do site.',
        'Diadema', 'SP', 'disponivel', true, 'doador', 'Golpista', '11911112222', now());
update public.animals set contact_phone = '11900001111' where name = 'Pipoca'; -- RLS: nenhuma linha afetada
reset role;
do $$ declare r record; begin
  select * into r from public.animals where name = 'Falso';
  assert not r.posted_by_team and r.contact_mode = 'plataforma' and r.contact_name is null and r.contact_phone is null, 'falso sem marca da equipe';
  assert r.status = 'em_analise' and r.approved_at is null and r.publisher_name like 'Zé%(pessoa física)', 'falso foi para análise';
  assert (select contact_phone from public.animals where name = 'Pipoca') = '11977771111', 'pipoca intacta';
  raise notice 'OK pessoa comum não usa a marca da equipe';
end $$;

-- Equipe edita e marca como adotado; a marca "da equipe" não pode ser retirada
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update public.animals set description = 'Cadelinha dócil resgatada no centro, já castrada e vacinada.', posted_by_team = false where name = 'Pipoca';
update public.animals set status = 'adotado' where name = 'Bolinha';
reset role;
do $$ declare r record; begin
  select * into r from public.animals where name = 'Pipoca';
  assert r.posted_by_team and r.status = 'disponivel' and r.approved_at is not null, 'pipoca continua da equipe e no ar';
  assert (select status from public.animals where name = 'Bolinha') = 'adotado', 'bolinha adotada';
  raise notice 'OK edição pela equipe';
end $$;

-- ---------------------------------------------------------------------------
-- Eventos da equipe
-- ---------------------------------------------------------------------------
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.events (kind, title, summary, starts_at, city, state, status, posted_by_team, organizer_name)
values ('feira_adocao', 'Feira de adoção no centro', 'Cães e gatos resgatados esperando um lar.', now() + interval '10 days',
        'Diadema', 'sp', 'em_analise', true, '  ');
reset role;
do $$ declare r record; begin
  select * into r from public.events where title = 'Feira de adoção no centro';
  assert r.posted_by_team and r.organization_id is null and r.organizer_name = 'Meu Amigo pra Vida', 'evento equipe';
  assert r.status = 'publicado' and r.reviewed_at is not null and r.state = 'SP', 'evento publicado direto';
  raise notice 'OK evento da equipe publicado';
end $$;

select pg_temp.as_anon();
do $$ begin
  assert (select organizer_name from public.events where title = 'Feira de adoção no centro') = 'Meu Amigo pra Vida', 'anon vê evento';
  raise notice 'OK visitante vê evento da equipe';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
select pg_temp.expect_error($$insert into public.events (kind, title, summary, starts_at, city, state, status, posted_by_team)
  values ('feira_adocao', 'Evento falso', 'Tentando publicar sem organização.', now() + interval '3 days', 'Diadema', 'SP', 'publicado', true)$$, 'comum cria evento da equipe');
select pg_temp.expect_error($$insert into public.events (kind, title, summary, starts_at, city, state)
  values ('feira_adocao', 'Evento sem org', 'Tentando publicar sem organização.', now() + interval '3 days', 'Diadema', 'SP')$$, 'comum cria evento sem organização');
reset role;

select 'TESTES DA EQUIPE PASSARAM' as resultado;
