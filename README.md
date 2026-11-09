# Meu Amigo pra Vida

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
  assets/js/fotos.js    → gerado pelo build a partir de src/data/fotos.json (não edite à mão)
  assets/img/fotos      → fotos reais (pet shops, abrigos, ruas, natureza) em WebP, com versão -sm para celular
  assets/img, brand, fonts
src/pages + src/partials → páginas-fonte; o build junta cabeçalho/rodapé
src/data/fotos.json     → texto alternativo e crédito de cada foto real (fonte única dos créditos)
tools/build.py          → gera public/*.html a partir de src/
tools/devserver.py      → servidor local que imita o Vercel
supabase/migrations     → estrutura completa do banco (12 migrações, iguais às aplicadas no projeto)
supabase/seed.sql       → categorias, 6 artigos e documentos legais
supabase/tests          → testes automatizados das regras de segurança (Postgres local)
vercel.json             → rotas amigáveis + cabeçalhos de segurança (CSP, HSTS…)
```

## Experiência guiada (como as páginas "levam" a pessoa)

Peças reutilizáveis, todas com versão sem animação para quem prefere movimento reduzido:

| Marcação | O que faz |
|---|---|
| `data-chapter="Nome"` numa `<section>` | Com 3 ou mais capítulos, aparece o guia **Nesta página** abaixo do cabeçalho, marcando onde a pessoa está |
| `<!--foto nome class="ratio-43" pos="50% 30%" tag="Na rua" sub="…"-->` | O build troca pelo `<figure>` com a foto real, `srcset`, texto alternativo e crédito. A foto entra subindo e anda um pouco com a rolagem |
| `<!--creditos-->` | Lista de créditos de todas as fotos (usada em Sobre → Créditos das fotos) |
| `.story` + `data-story` | História em etapas: no computador a foto fica parada ao lado e troca conforme o texto passa |
| `.hscroll` + `data-hscroll` | Faixa horizontal: no computador a rolagem para baixo leva os cartões para o lado; no celular vira um carrossel de arrastar |
| `data-process` | Linha numerada que se preenche com a rolagem |
| `data-help` + `data-peek` | Linhas editoriais com a foto que acompanha o mouse |
| `data-count-to="184960"` | Número com fonte que conta ao aparecer |
| `.faq` com `<details>` | Perguntas frequentes |

Para trocar ou incluir uma foto: salve `nome.webp` e `nome-sm.webp` em `public/assets/img/fotos/`, registre o texto alternativo e o crédito em `src/data/fotos.json` e rode o build.

## Rodar localmente

```bash
python3 tools/build.py          # gera as páginas
python3 tools/devserver.py      # abre em http://localhost:8080
```

Depois de editar algo em `src/pages` ou `src/partials`, rode `python3 tools/build.py` de novo e faça o commit da pasta `public/` também.

## Publicar no Vercel

1. Em vercel.com → **Add New → Project** → importe o repositório `Meu-Amigo-Pra-Vida-`.
2. O `vercel.json` já define tudo: framework **Other**, build `python3 tools/build.py`, saída **public**.
3. Deploy. Cada `git push` na `main` publica automaticamente.

O build no Vercel lê os artigos e os documentos legais publicados no Supabase (só o que a leitura
pública permite) e gera as versões estáticas deles. Se a leitura falhar, o deploy segue e essas
páginas ficam só na versão montada pelo navegador (o log do build mostra um AVISO).

## SEO, buscadores e assistentes de IA

- **Domínio oficial:** `SITE_URL` em `tools/build.py` (hoje `https://www.meuamigopravida.com.br`). Links canônicos, sitemap, `robots.txt`, `llms.txt` e dados estruturados usam esse valor.
- **Gerado a cada build:** dados estruturados `WebSite` e `Organization` (nome e variações da marca) em todas as páginas; `Article` e `BreadcrumbList` nos artigos; `public/blog/<slug>.html` com o texto do artigo no HTML inicial (a pasta não vai para o git); a lista de artigos em `/blog`; o texto de `/privacidade` e `/termos`; `sitemap.xml`; `robots.txt`; `llms.txt` (modelo em `src/static/llms.txt`).
- **Artigos novos ou editados:** a versão estática só muda no próximo deploy. Para automatizar, crie um Deploy Hook no Vercel e dispare-o quando `blog_posts` mudar.
- **Teste sem internet:** `BLOG_JSON_FILE=artigos.json LEGAL_JSON_FILE=docs.json python3 tools/build.py` (mesmo formato da API do Supabase).
- **Páginas que não existem** (animal, ONG, evento ou artigo removido) recebem `noindex` pelo JavaScript.

## Abertura animada do logo

A mesma abertura da página `/links` toca uma vez por sessão, só na primeira página visitada e só nas páginas de entrada (`INTRO_PAGES` em `tools/build.py`: início, adote, doe, ONGs, parceiros, eventos, conscientização, sobre e links). O `public/assets/js/intro-gate.js`, no `<head>`, decide antes de a página aparecer: não toca para quem chega de um buscador (Google, Bing e outros), para quem pede menos movimento nem em artigos, animais, ONGs e eventos. Ela pode ser pulada com clique, Esc, Enter ou espaço, e as animações de entrada da página esperam a abertura terminar.

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

- Cães recortados: material da apresentação da marca (PDF).
- Gatos recortados: fotos do [Unsplash](https://unsplash.com) (licença Unsplash, uso livre), com fundo removido.
- Fotos de lugares reais (pet shops, banho e tosa, clínica, abrigo, ruas e natureza): 17 fotos do [Unsplash](https://unsplash.com/license) (licença Unsplash, uso livre inclusive comercial). Autor e link de cada uma em `src/data/fotos.json` e na página **Sobre → Créditos das fotos**.
- Dado do Instituto Pet Brasil (página ONGs): citado pelo [Jornal do Comércio, jan. 2024](https://www.jornaldocomercio.com/geral/2024/01/1139363-numero-de-animais-abandonados-e-acolhidos-por-ongs-cresce-no-brasil.html).
- Fonte Poppins: SIL Open Font License.

---

### Modelos de e-mail sugeridos (Supabase → Auth → Email Templates)

**Confirmar cadastro**: assunto: `Confirme seu cadastro no Meu Amigo pra Vida`
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
