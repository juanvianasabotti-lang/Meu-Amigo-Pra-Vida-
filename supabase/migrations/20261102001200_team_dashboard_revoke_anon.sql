-- Painel da equipe: as funções de métricas não ficam disponíveis para visitantes anônimos.
-- (Esta migração já estava aplicada no projeto Supabase; o arquivo deixa o repositório igual ao banco.)
revoke execute on function public.team_dashboard(integer) from anon;
revoke execute on function public.team_recent_signups(integer) from anon;
