# Meu Amigo pra Vida 🐾

Plataforma de **conscientização, adoção e doação de cães e gatos**, uma ponte entre pessoas, ONGs/protetores e empresas do mundo animal.

- **Site:** HTML, CSS e JavaScript próprios (sem framework e sem dependências de terceiros), hospedado no **Vercel**
- **Banco, login e arquivos:** **Supabase** (projeto `Meu Amigo pra Vida`, região São Paulo `sa-east-1`)
- **LGPD:** dados pessoais ficam somente no Supabase, protegidos por políticas RLS em todas as tabelas, com consentimentos versionados, exportação, exclusão de conta e auditoria

---

## Estrutura

```
public/                 → o site publicado (Vercel serve esta pasta)
  assets/css/main.css   → sistema visual (cores da marca, animações, componentes)
  assets/js/
    config.js           → URL e chave PUBLICÁVEL do Supabase
    sb.js               → cliente do Supabase (Auth + banco + Storage)
    app.js              → cabeçalho, menu, animações de entrada/saída
    ui.js               → utilitários (máscaras, validação CPF/CNPJ, markdown seguro…)
    components.js       → cards de animal, ONG, evento e artigo
    image.js            → editor de fotos (enquadramento padronizado 4:5, WebP)
    chat.js             → chat dos pedidos de adoção
    pages/*.js          → lógica de cada página
  assets/img, brand, fonts
src/pages + src/partials → páginas-fonte; o build junta cabeçalho/rodapé
tools/build.py          → gera public/*.html a partir de src/
tools/devserver.py      → servidor local que imita o Vercel
supabase/migrations     → estrutura completa do banco (8 migrações)
supabase/seed.sql       → categorias, 6 artigos e documentos legais
supabase/tests          → testes automatizados das regras de segurança (Postgres local)
vercel.json             → rotas amigáveis + cabeçalhos de segurança (CSP, HSTS…)
```

## Rodar localmente

```bash
python3 tools/build.py          # gera as páginas
python3 tools/devserver.py      # abre em http://localhost:8080
```

Depois de editar algo em `src/pages` ou `src/partials`, rode `python3 tools/build.py` de novo e faça o commit da pasta `public/` também.

## Publicar no Vercel

1. Em vercel.com → **Add New → Project** → importe o repositório `Meu-Amigo-Pra-Vida-`.
2. Framework: **Other**. Build command: *(vazio)*. Output directory: **public**.
3. Deploy. Cada `git push` publica automaticamente.

## Configurações obrigatórias no Supabase (painel)

**Authentication → URL Configuration**
- *Site URL*: o endereço do site (ex.: `https://meu-amigo-pra-vida.vercel.app`, depois o domínio próprio)
- *Redirect URLs*: `https://SEU-DOMINIO/auth/callback` (adicione também a URL do Vercel e `http://localhost:8080/auth/callback`)

**Authentication → Providers → Google**

> O botão "Continuar com o Google" só aparece no site quando este provedor está ativo (o site consulta `/auth/v1/settings`). Enquanto estiver desligado, o login e o cadastro funcionam normalmente por e-mail.
1. No Google Cloud Console, crie um *OAuth Client ID* (tipo "Web application").
2. *Authorized redirect URI*: `https://phfeodwytcvrnesythiv.supabase.co/auth/v1/callback`
3. Cole o *Client ID* e o *Client Secret* no Supabase e ative o provedor.

**Authentication → Policies/Settings (recomendado)**
- Tamanho mínimo da senha: **8**; exigir letras e números
- Ativar *Leaked password protection*
- *Confirm email*: ligado
- Em *Email Templates*, traduza os e-mails para português (modelos sugeridos abaixo)
- Para produção, configure um SMTP próprio (o envio padrão do Supabase tem limite baixo por hora)

### Primeiro administrador

Depois de criar sua conta no site, rode no **SQL Editor** do Supabase:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where email = 'SEU-EMAIL@exemplo.com';
```

A partir daí, novos administradores e moderadores são adicionados pela tela **Administração → Equipe**.

## Perfis de usuário

| Perfil | Pode | Verificação |
|---|---|---|
| **Pessoa** | adotar (questionário + CPF), anunciar até 5 animais, favoritar | e-mail |
| **ONG / Protetor** | anunciar animais, receber pedidos, exibir Pix, criar eventos | CNPJ (ou CPF do protetor), endereço e moderação |
| **Empresa** | vitrine de parceiros, campanhas e eventos | CNPJ, endereço e moderação |
| **Moderador / Admin** | aprovar ONGs, empresas, anúncios e eventos; blog (admin); LGPD | concedido por admin |

## Segurança e LGPD (resumo)

- RLS em **todas** as tabelas; o visitante anônimo só lê conteúdo publicado.
- CPF em tabela separada; a ONG só vê o CPF do candidato a partir da etapa de entrevista, com **registro em auditoria**.
- Validação de CPF e de CNPJ (inclusive o novo **CNPJ alfanumérico**) no navegador **e** no banco.
- Consentimentos registrados com versão e data (`consents`), revogáveis.
- Titular baixa todos os dados (JSON), abre solicitações ao DPO e exclui a própria conta.
- Cabeçalhos de segurança: CSP sem scripts de terceiros, HSTS, `X-Frame-Options: DENY`, `nosniff`.
- Fontes servidas pelo próprio site (sem Google Fonts → nenhum dado do visitante vai para terceiros).

## Testes do banco

Com PostgreSQL 16 local:

```bash
./supabase/tests/run.sh
```

São mais de 30 verificações de segurança: tentativas de autopromoção a admin, leitura de CPF alheio, ONG se aprovando sozinha, edição do questionário, upload na pasta de outro usuário, entre outras.

## Créditos das imagens

- Cães: material da apresentação da marca (PDF).
- Gatos: fotos do [Unsplash](https://unsplash.com) (licença Unsplash, uso livre), com fundo removido.
- Fonte Poppins: SIL Open Font License.

---

### Modelos de e-mail sugeridos (Supabase → Auth → Email Templates)

**Confirmar cadastro**: assunto: `Confirme seu cadastro no Meu Amigo pra Vida 🐾`
```html
<h2>Que alegria ter você com a gente!</h2>
<p>Clique no botão abaixo para confirmar seu e-mail e ativar sua conta.</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar meu e-mail</a></p>
<p>Se você não se cadastrou, ignore esta mensagem.</p>
```

**Redefinir senha**: assunto: `Crie uma nova senha · Meu Amigo pra Vida`
```html
<h2>Esqueceu a senha? Acontece!</h2>
<p><a href="{{ .ConfirmationURL }}">Criar uma nova senha</a></p>
<p>Se não foi você, ignore este e-mail. Sua senha continua a mesma.</p>
```

**Trocar e-mail**: assunto: `Confirme seu novo e-mail · Meu Amigo pra Vida`
```html
<p>Confirme a troca do seu e-mail de acesso:</p>
<p><a href="{{ .ConfirmationURL }}">Confirmar novo e-mail</a></p>
```
