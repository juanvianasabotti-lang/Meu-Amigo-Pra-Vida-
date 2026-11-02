#!/usr/bin/env bash
# Recria um banco local, aplica o stub do Supabase, todas as migrações, o seed e os testes.
set -euo pipefail
PG="psql -h ${PGHOST:-/var/tmp/pg} -p ${PGPORT:-54322} -U postgres"
cd "$(dirname "$0")/.."
$PG -q -c "drop database if exists mapv_test;" -c "create database mapv_test;"
$PG -d mapv_test -v ON_ERROR_STOP=1 -q -f tests/00_supabase_stub.sql
for f in migrations/*.sql; do $PG -d mapv_test -v ON_ERROR_STOP=1 -q -f "$f" 2>&1 | grep -v NOTICE || true; done
if [ -f seed.sql ]; then $PG -d mapv_test -v ON_ERROR_STOP=1 -q -f seed.sql; fi
$PG -d mapv_test -v ON_ERROR_STOP=1 -f tests/01_rls_flows.sql
