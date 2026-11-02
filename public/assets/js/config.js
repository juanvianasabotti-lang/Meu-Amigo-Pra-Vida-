// Configuração pública do site.
// A "anon key" (chave publicável) do Supabase é feita para ficar no navegador:
// ela NÃO dá acesso aos dados sozinha — quem protege os dados são as políticas
// RLS do banco. Nunca coloque aqui a chave "service_role".
export const CONFIG = {
  SUPABASE_URL: "https://phfeodwytcvrnesythiv.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_yuxQ8ANpbcU5GSadZBKU-A_WfKPCnTh",
  SITE_NAME: "Meu Amigo pra Vida",
  TERMS_VERSION: "1.0",
  PRIVACY_VERSION: "1.0",
  CONTACT_EMAIL: "diogo@agenciagryd.com",
  INSTAGRAM: "meuamigopravida",
};

export const isConfigured = () => Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
