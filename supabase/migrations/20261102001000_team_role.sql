-- Papel "integrante": vê apenas os indicadores agregados do painel da equipe (/equipe).
-- Não entra em private.is_staff(), então não ganha acesso a dados pessoais nem à moderação.
alter type public.app_role add value if not exists 'integrante';
