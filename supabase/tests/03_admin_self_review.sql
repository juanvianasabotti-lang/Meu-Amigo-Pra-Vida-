-- Testes: admin aprova o próprio anúncio; moderador não (rodar depois de 02).
\set ON_ERROR_STOP 1
set client_min_messages = notice;
create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.expect_error(p_sql text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql; exception when others then raise notice 'OK (bloqueado) % -> %', p_label, sqlerrm; return; end;
  raise exception 'FALHA: deveria ter sido bloqueado: %', p_label;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

reset role;
insert into auth.users (id, email, raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000f1', 'mod@mapv.test',
  '{"full_name":"Mo Moderador","account_type":"pessoa","phone":"11933334444","birth_date":"1990-01-01","city":"Diadema","state":"SP","terms_version":"1.0","privacy_version":"1.0"}');
insert into public.user_roles (user_id, role) values ('00000000-0000-0000-0000-0000000000f1', 'moderador');

-- Admin anuncia como pessoa e aprova o próprio anúncio pela fila
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status)
values (auth.uid(), 'BelaT3', 'cao', 'femea', 'medio', 'adulto', 'Cadela muito carinhosa procurando uma família.', 'Diadema', 'SP', 'em_analise');
select public.moderate_animal((select id from public.animals where name = 'BelaT3'), true, null);
reset role;
do $$ declare r record; begin
  select * into r from public.animals where name = 'BelaT3';
  assert r.status = 'disponivel' and r.approved_at is not null and r.reviewed_by = '00000000-0000-0000-0000-00000000000a', 'bela aprovada pelo admin';
  raise notice 'OK admin aprovou o próprio anúncio';
end $$;

-- Admin não consegue pular a fila editando o status direto
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status)
values (auth.uid(), 'DiretoT3', 'gato', 'macho', 'pequeno', 'filhote', 'Gatinho esperto procurando uma família.', 'Diadema', 'SP', 'em_analise');
select pg_temp.expect_error($$update public.animals set status = 'disponivel' where name = 'DiretoT3'$$, 'admin publica sem passar pela fila');
reset role;

-- Moderador continua sem poder aprovar o próprio
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
insert into public.animals (owner_id, name, species, sex, size, age_group, description, city, state, status)
values (auth.uid(), 'MimiT3', 'gato', 'femea', 'pequeno', 'adulto', 'Gata tranquila que adora colo e sossego.', 'Diadema', 'SP', 'em_analise');
select pg_temp.expect_error($$select public.moderate_animal((select id from public.animals where name = 'MimiT3'), true, null)$$, 'moderador aprova o próprio');
-- mas aprova o de outra pessoa
select public.moderate_animal((select id from public.animals where name = 'DiretoT3'), true, null);
reset role;
do $$ begin
  assert (select status from public.animals where name = 'MimiT3') = 'em_analise', 'mimi segue na fila';
  assert (select status from public.animals where name = 'DiretoT3') = 'disponivel', 'moderador aprova anúncio do admin';
  assert coalesce(current_setting('mapv.self_review', true), '') <> 'on', 'flag não vaza';
  raise notice 'OK moderador segue a trava';
end $$;
select 'TESTES DE AUTOAPROVAÇÃO PASSARAM' as resultado;
