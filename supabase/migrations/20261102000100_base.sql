-- =============================================================================
-- Meu Amigo Pra Vida — 0001 · Base: extensões, tipos, utilitários e auditoria
-- =============================================================================
-- Convenções:
--   * schema "public"  -> tabelas expostas pela API (sempre com RLS ligada)
--   * schema "private" -> funções auxiliares internas (NÃO expostas pela API)
--   * Funções SECURITY DEFINER sempre com search_path fixo e vazio.
-- =============================================================================

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm  with schema extensions;
create extension if not exists citext   with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Tipos enumerados
-- -----------------------------------------------------------------------------
create type public.account_type     as enum ('pessoa', 'ong', 'empresa');
create type public.app_role         as enum ('admin', 'moderador');
create type public.org_kind         as enum ('ong', 'protetor_independente', 'petshop', 'clinica_veterinaria',
                                             'banho_e_tosa', 'hotel_creche', 'adestramento', 'outro');
create type public.org_status       as enum ('pendente', 'aprovada', 'rejeitada', 'suspensa');
create type public.document_type    as enum ('cpf', 'cnpj');
create type public.pix_key_type     as enum ('cpf', 'cnpj', 'email', 'telefone', 'aleatoria');
create type public.species          as enum ('cao', 'gato');
create type public.animal_sex       as enum ('macho', 'femea');
create type public.animal_size      as enum ('pequeno', 'medio', 'grande');
create type public.age_group        as enum ('filhote', 'adulto', 'idoso');
create type public.animal_status    as enum ('rascunho', 'em_analise', 'disponivel', 'em_processo',
                                             'adotado', 'rejeitado', 'arquivado');
create type public.housing_type     as enum ('casa', 'apartamento', 'chacara_sitio', 'outro');
create type public.housing_owner    as enum ('propria', 'alugada', 'cedida');
create type public.adoption_status  as enum ('enviado', 'em_analise', 'entrevista', 'visita',
                                             'aprovado', 'recusado', 'cancelado', 'concluido');
create type public.content_status   as enum ('rascunho', 'em_analise', 'publicado', 'rejeitado', 'encerrado');
create type public.event_kind       as enum ('campanha', 'evento', 'feira_adocao', 'castracao', 'vacinacao', 'arrecadacao');
create type public.post_status      as enum ('rascunho', 'publicado');
create type public.legal_doc_kind   as enum ('termos_uso', 'politica_privacidade');
create type public.consent_type     as enum ('termos_uso', 'politica_privacidade', 'marketing', 'compartilhamento_adocao');
create type public.dsr_type         as enum ('confirmacao', 'acesso', 'correcao', 'anonimizacao',
                                             'portabilidade', 'eliminacao', 'revogacao_consentimento', 'informacao');
create type public.dsr_status       as enum ('aberta', 'em_andamento', 'concluida', 'negada');
create type public.ticket_status    as enum ('novo', 'em_atendimento', 'resolvido', 'arquivado');

-- -----------------------------------------------------------------------------
-- Utilitários
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function public.only_digits(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select regexp_replace(coalesce(p, ''), '\D', '', 'g')
$$;

-- CPF: 11 dígitos com dois dígitos verificadores (módulo 11)
create or replace function public.is_valid_cpf(p text)
returns boolean language plpgsql immutable parallel safe set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int; r int; i int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;
  s := 0;
  for i in 1..9 loop s := s + substr(d, i, 1)::int * (11 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  if r <> substr(d, 10, 1)::int then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + substr(d, i, 1)::int * (12 - i); end loop;
  r := (s * 10) % 11; if r = 10 then r := 0; end if;
  return r = substr(d, 11, 1)::int;
end $$;

-- CNPJ: aceita o formato numérico e o novo CNPJ alfanumérico (IN RFB 2.229/2024,
-- vigente a partir de jul/2026): 12 posições [A-Z0-9] + 2 dígitos verificadores.
-- Valor de cada caractere = código ASCII - 48.
create or replace function public.normalize_cnpj(p text)
returns text language sql immutable parallel safe set search_path = '' as $$
  select upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'))
$$;

create or replace function public.is_valid_cnpj(p text)
returns boolean language plpgsql immutable parallel safe set search_path = '' as $$
declare
  d text := upper(regexp_replace(coalesce(p, ''), '[^0-9A-Za-z]', '', 'g'));
  w1 int[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  w2 int[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  s int; r int; dv1 int; dv2 int; i int;
begin
  if d !~ '^[A-Z0-9]{12}[0-9]{2}$' or d ~ '^(.)\1{13}$' then
    return false;
  end if;
  s := 0;
  for i in 1..12 loop s := s + (ascii(substr(d, i, 1)) - 48) * w1[i]; end loop;
  r := s % 11; dv1 := case when r < 2 then 0 else 11 - r end;
  s := 0;
  for i in 1..13 loop
    s := s + (case when i = 13 then dv1 else ascii(substr(d, i, 1)) - 48 end) * w2[i];
  end loop;
  r := s % 11; dv2 := case when r < 2 then 0 else 11 - r end;
  return substr(d, 13, 1)::int = dv1 and substr(d, 14, 1)::int = dv2;
end $$;

create or replace function public.slugify(p text)
returns text language sql stable parallel safe set search_path = '' as $$
  select trim(both '-' from regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p, ''))), '[^a-z0-9]+', '-', 'g'))
$$;

create or replace function private.unique_slug(p text)
returns text language sql volatile set search_path = '' as $$
  select left(coalesce(nullif(public.slugify(p), ''), 'item'), 60) || '-' || substr(md5(gen_random_uuid()::text), 1, 6)
$$;

create or replace function public.is_valid_uf(p text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select p in ('AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR',
               'PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')
$$;

create or replace function public.is_valid_phone(p text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  -- Formato armazenado: somente dígitos, com DDD (10 ou 11 dígitos), opcionalmente com 55 na frente.
  select p ~ '^(55)?[1-9][0-9]{9,10}$'
$$;

create or replace function public.is_https_url(p text)
returns boolean language sql immutable parallel safe set search_path = '' as $$
  select p ~* '^https://[a-z0-9.-]+\.[a-z]{2,}(/[^\s]*)?$'
$$;

-- -----------------------------------------------------------------------------
-- Auditoria (LGPD art. 37 — registro das operações de tratamento)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  actor_id    uuid,
  action      text not null check (char_length(action) <= 80),
  entity      text not null check (char_length(entity) <= 60),
  entity_id   text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);
create index audit_log_actor_idx  on public.audit_log (actor_id, created_at desc);
alter table public.audit_log enable row level security;

create or replace function private.audit(p_action text, p_entity text, p_entity_id text, p_metadata jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end $$;
revoke all on function private.audit(text, text, text, jsonb) from public, anon, authenticated;
