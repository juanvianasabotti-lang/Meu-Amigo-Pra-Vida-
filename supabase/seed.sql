-- =============================================================================
-- Conteúdo inicial: categorias e artigos do blog + rascunhos dos documentos legais
-- (idempotente: pode ser executado mais de uma vez)
-- =============================================================================

insert into public.blog_categories (name, slug, color, position) values
  ('Adoção responsável', 'adocao-responsavel', 'laranja', 1),
  ('Saúde e cuidados',   'saude-e-cuidados',   'azul',    2),
  ('Conscientização',    'conscientizacao',    'rosa',    3),
  ('Doação',             'doacao',             'amarelo', 4)
on conflict (slug) do nothing;

insert into public.blog_posts (category_id, title, slug, excerpt, content_md, tags, status, featured, published_at, cover_alt)
select c.id, p.title, p.slug, p.excerpt, p.content_md, p.tags, 'publicado', p.featured, now() - p.age, p.cover_alt
from (values
-- 1 ---------------------------------------------------------------------------
('adocao-responsavel', '10 perguntas para fazer antes de adotar um cão ou gato',
 '10-perguntas-antes-de-adotar',
 'Adotar é um compromisso de 10 a 20 anos. Essas perguntas ajudam você a ter certeza de que é a hora certa — para você e para o seu futuro amigo.',
$md$Adotar muda duas vidas: a sua e a de um animal que já passou por muita coisa. Por isso, a melhor adoção é a que **não volta atrás**. Antes de clicar em "Quero adotar", responda com sinceridade:

## 1. Tenho tempo de verdade?
Cães precisam de passeios diários, brincadeiras e companhia. Gatos são mais independentes, mas também precisam de interação, caixa de areia limpa e atenção todos os dias.

## 2. Por quanto tempo posso me comprometer?
Um cão vive, em média, de 10 a 15 anos; um gato pode passar dos 18. Pense em mudanças de cidade, trabalho e família nesse período.

## 3. Todos em casa concordam?
A adoção precisa ser uma decisão da família inteira. Alergias e medo de animais devem ser conversados **antes**.

## 4. Meu espaço é adequado?
Não é preciso ter quintal grande, mas o ambiente precisa ser seguro: **telas de proteção** em janelas e sacadas são obrigatórias para gatos e muito recomendadas para cães pequenos.

## 5. Moro de aluguel ou em condomínio?
Confira o contrato e as regras do condomínio. Evite surpresas que forcem uma devolução.

## 6. Cabe no meu orçamento?
Ração de qualidade, vacinas anuais, vermífugo, antipulgas, castração e emergências veterinárias. Faça uma reserva mensal.

## 7. Quem cuida quando eu viajar?
Tenha um plano: um familiar, um vizinho de confiança ou um hotel para pets.

## 8. Qual perfil combina comigo?
Filhotes têm muita energia e exigem paciência para educar. Adultos e idosos já têm personalidade definida — e costumam ser companheiros incríveis. **Não descarte os mais velhos!**

## 9. Já tenho outros animais?
Pergunte à ONG como o animal convive com cães e gatos e planeje uma apresentação gradual.

## 10. Estou pronto para a adaptação?
Os primeiros dias podem ter medo, xixi fora do lugar e noites agitadas. Isso é normal e passa com rotina e carinho.

Se você respondeu "sim" para quase tudo, **seu novo amigo pra vida está esperando por você**.$md$,
 array['adoção', 'primeiros passos'], true, interval '1 day', 'Pessoa abraçando um cão adotado'),

-- 2 ---------------------------------------------------------------------------
('adocao-responsavel', 'Os primeiros 30 dias do seu novo amigo em casa',
 'primeiros-30-dias-em-casa',
 'A chegada é um momento de descoberta para os dois. Veja como preparar a casa e conduzir a adaptação de cães e gatos com tranquilidade.',
$md$A adaptação é uma fase delicada. Um animal resgatado precisa aprender que agora está seguro. Com paciência, em poucas semanas ele vai se sentir em casa.

## Antes de buscar
- **Para cães:** coleira com plaquinha de identificação, guia, cama, potes de água e comida, brinquedos.
- **Para gatos:** caixa de transporte, caixa de areia, arranhador, esconderijos e **telas em todas as janelas**.
- Mantenha a mesma ração que ele comia no abrigo nos primeiros dias e faça a troca de forma gradual (7 a 10 dias).

## Semana 1 — segurança
Ofereça um cantinho tranquilo. Deixe que ele explore no próprio ritmo. Evite visitas e festas nesses dias.

## Semana 2 — rotina
Horários fixos de comida, passeio e sono trazem previsibilidade. Recompense os bons comportamentos com petiscos e carinho.

## Semanas 3 e 4 — confiança
Comece a apresentar novas pessoas, sons e lugares aos poucos. Agende uma consulta com o veterinário para um check-up.

## Sinais de que precisa de ajuda
Falta de apetite por mais de 2 dias, vômitos, diarreia ou apatia: procure um veterinário. Dúvidas de comportamento? Converse com a ONG — ela conhece seu amigo e quer ajudar.

> Lembre-se: a regra 3-3-3 ajuda a ter expectativas realistas — **3 dias** para descomprimir, **3 semanas** para aprender a rotina e **3 meses** para se sentir em casa.$md$,
 array['adaptação', 'cães', 'gatos'], false, interval '3 days', 'Gato explorando a nova casa'),

-- 3 ---------------------------------------------------------------------------
('saude-e-cuidados', 'Castração: mitos e verdades',
 'castracao-mitos-e-verdades',
 'A castração é o gesto mais eficaz contra o abandono e ainda protege a saúde do seu pet. Entenda o que é mito e o que é fato.',
$md$Uma única gata não castrada e seus descendentes podem gerar dezenas de filhotes em poucos anos. Muitos deles acabam nas ruas. A castração é a ferramenta mais eficaz para quebrar esse ciclo.

## "Ela precisa ter uma ninhada antes" — **Mito**
Não há benefício nenhum. Pelo contrário: castrar antes do primeiro cio reduz muito o risco de tumores de mama.

## "O animal fica gordo e preguiçoso" — **Mito**
O metabolismo muda um pouco, mas o ganho de peso vem do excesso de comida e da falta de exercício. Ajuste a ração com o veterinário.

## "Reduz fugas e brigas" — **Verdade**
Animais castrados tendem a fugir menos em busca de parceiros e a marcar menos território.

## "Previne doenças" — **Verdade**
Evita piometra (infecção grave no útero), tumores de testículo e reduz problemas de próstata.

## "É uma cirurgia muito arriscada" — **Mito**
É um procedimento de rotina. Exames pré-operatórios e um bom veterinário tornam o risco muito baixo.

## Onde castrar com preço acessível?
Muitas prefeituras e ONGs fazem **mutirões de castração gratuitos ou a preço social**. Fique de olho na nossa página de **Campanhas e eventos**.$md$,
 array['castração', 'saúde'], true, interval '6 days', 'Veterinária examinando um cão'),

-- 4 ---------------------------------------------------------------------------
('conscientizacao', 'Encontrei um animal na rua. E agora?',
 'encontrei-um-animal-na-rua',
 'Um guia prático e seguro para ajudar cães e gatos em situação de rua, sem colocar você ou o animal em risco.',
$md$Ver um animal abandonado dói. A boa notícia é que existem formas seguras e eficazes de ajudar.

## 1. Avalie a situação com segurança
Aproxime-se devagar, de lado, falando baixo. Animais assustados ou feridos podem morder. **Não force o contato.**

## 2. Ofereça água e um pouco de alimento
Isso ajuda a ganhar confiança e garante o básico enquanto você pensa no próximo passo.

## 3. Procure um tutor
Verifique se há coleira ou plaquinha. Clínicas veterinárias leem o **microchip** gratuitamente. Divulgue fotos em grupos do bairro.

## 4. Se estiver ferido, procure atendimento
Hospitais veterinários públicos e universidades costumam ter atendimento social. ONGs parceiras podem orientar.

## 5. Lar temporário salva vidas
Se puder, ofereça um lar temporário enquanto o animal é tratado e encaminhado para adoção. Converse com uma ONG da sua região aqui no **Meu Amigo Pra Vida**.

## Maus-tratos são crime
Abandonar, ferir ou negligenciar um animal é crime ambiental (Lei 9.605/1998, art. 32). Para cães e gatos, a **Lei 14.064/2020** prevê pena de reclusão de 2 a 5 anos, multa e proibição da guarda. Denuncie à **Polícia Militar (190)**, à delegacia mais próxima ou aos canais oficiais do seu estado e município.$md$,
 array['resgate', 'situação de rua', 'maus-tratos'], false, interval '9 days', 'Cão de rua olhando para a câmera'),

-- 5 ---------------------------------------------------------------------------
('saude-e-cuidados', 'Vacinas e vermífugos: o calendário básico de cães e gatos',
 'calendario-de-vacinas-caes-e-gatos',
 'Manter a vacinação em dia protege seu amigo de doenças graves. Conheça as vacinas essenciais e converse com o veterinário sobre o calendário ideal.',
$md$As vacinas são a forma mais simples de proteger seu amigo contra doenças graves e, muitas vezes, fatais. O calendário exato deve ser definido pelo **médico-veterinário**, mas é importante conhecer o básico.

## Cães
- **Polivalente (V8 ou V10):** protege contra cinomose, parvovirose, hepatite, leptospirose e outras. Os filhotes recebem uma série de doses; adultos fazem reforço anual.
- **Antirrábica:** obrigatória. Muitas cidades oferecem a vacina gratuitamente em campanhas.
- **Outras:** gripe canina e giárdia, conforme a recomendação do veterinário.

## Gatos
- **Polivalente felina (V3, V4 ou V5):** protege contra panleucopenia, rinotraqueíte, calicivirose e, dependendo da versão, clamidiose e FeLV.
- **Antirrábica:** também obrigatória para gatos — sim, mesmo os que não saem de casa.
- **Teste de FIV/FeLV:** recomendado antes de vacinar contra FeLV e antes de apresentar o novo gato a outros felinos.

## Vermífugos e antiparasitários
Filhotes são vermifugados com mais frequência; adultos, normalmente a cada 3 ou 4 meses. Antipulgas e carrapaticidas evitam doenças transmitidas por parasitas.

> Guarde a **carteirinha de vacinação**. Ao adotar pelo Meu Amigo Pra Vida, peça à ONG o histórico de saúde do seu novo amigo.$md$,
 array['vacinas', 'saúde', 'prevenção'], false, interval '12 days', 'Carteira de vacinação de um pet'),

-- 6 ---------------------------------------------------------------------------
('doacao', 'Como doar um animal com responsabilidade',
 'como-doar-um-animal-com-responsabilidade',
 'Precisa encontrar um novo lar para um animal? Veja como fazer um anúncio honesto e escolher a família certa.',
$md$Às vezes a vida muda e não é mais possível cuidar de um animal. Ou você resgatou alguém e quer encontrar o lar perfeito. Doar com responsabilidade é um ato de amor.

## Prepare o animal
Sempre que possível, entregue-o **vacinado, vermifugado e castrado**. Isso aumenta muito as chances de adoção e evita novas ninhadas.

## Faça um anúncio verdadeiro
- Fotos claras, com boa luz e sem filtros.
- Conte a personalidade real: se é agitado, se late, como convive com crianças e outros animais.
- Informe condições de saúde e necessidades especiais. A transparência evita devoluções.

## Escolha a família com calma
No Meu Amigo Pra Vida, cada interessado responde a um **questionário de adoção responsável**. Leia com atenção, converse pelo chat da plataforma e, se possível, faça uma visita.

## Nunca cobre pela doação
Animais não são mercadoria. Anúncios de venda são removidos pela moderação.

## Acompanhe depois da adoção
Combine com a família um contato nas primeiras semanas. Esse cuidado faz diferença na adaptação.$md$,
 array['doação', 'anúncio'], false, interval '15 days', 'Mãos segurando um filhote de gato')
) as p(cat_slug, title, slug, excerpt, content_md, tags, featured, age, cover_alt)
join public.blog_categories c on c.slug = p.cat_slug
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Documentos legais v1.0 — recomenda-se revisão por assessoria jurídica antes do lançamento
-- -----------------------------------------------------------------------------
insert into public.legal_documents (kind, version, title, content_md, published_at) values
('politica_privacidade', '1.0', 'Política de Privacidade',
$md$**Última atualização:** novembro de 2026 · Versão 1.0

O **Meu Amigo Pra Vida** respeita a sua privacidade e trata dados pessoais conforme a **Lei Geral de Proteção de Dados (Lei 13.709/2018 — LGPD)**.

## 1. Quem é o controlador
O controlador dos dados pessoais é o **Meu Amigo Pra Vida**, inscrito no CNPJ **69.164.207/0001-06**.
**Encarregado(a) pelo tratamento de dados (DPO):** contato pelo e-mail **diogo@agenciagryd.com**.

## 2. Quais dados coletamos e por quê
| Dado | Finalidade | Base legal (LGPD) |
|---|---|---|
| Nome, e-mail, celular, cidade e UF | Criar e manter sua conta; contato sobre adoções | Execução de contrato (art. 7º, V) |
| Data de nascimento | Confirmar a maioridade exigida para adotar | Execução de contrato (art. 7º, V) |
| CPF | Identificar o adotante com segurança e evitar fraudes | Execução de contrato e legítimo interesse (art. 7º, V e IX) |
| Respostas do questionário de adoção | Avaliar a adoção responsável | Consentimento específico (art. 7º, I) |
| CNPJ/CPF, responsável legal e endereço de ONGs e empresas | Verificar a organização antes de publicá-la | Execução de contrato e legítimo interesse |
| Preferências de comunicação | Enviar novidades, quando você autorizar | Consentimento (art. 7º, I) |

Não coletamos dados sensíveis (art. 5º, II) e não vendemos dados pessoais.

## 3. Com quem compartilhamos
- **Com a ONG, o protetor ou a pessoa responsável pelo animal** que você escolheu adotar: nome, contato, cidade e respostas do questionário, somente após o seu consentimento no pedido. O CPF só é liberado a partir da etapa de entrevista, e cada acesso fica registrado.
- **Com fornecedores de tecnologia** que operam a plataforma (hospedagem e banco de dados), sob contrato e com medidas de segurança.
- **Com autoridades**, quando exigido por lei.

## 4. Por quanto tempo guardamos
Enquanto sua conta estiver ativa. Ao excluir a conta, apagamos seus dados pessoais. O histórico de adoção dos animais é mantido de forma **anonimizada**. Registros de acesso são guardados por 6 meses (Marco Civil da Internet, art. 15).

## 5. Seus direitos (art. 18)
Confirmar o tratamento, acessar, corrigir, anonimizar, portar, eliminar, saber com quem compartilhamos e revogar consentimentos. Na área **Minha conta → Privacidade** você pode **baixar todos os seus dados**, **revogar consentimentos** e **excluir sua conta** a qualquer momento. Respondemos às solicitações em até 15 dias.

## 6. Segurança
Os dados ficam em banco de dados hospedado no Brasil (São Paulo), com controle de acesso por linha, criptografia em trânsito (HTTPS) e em repouso, e registro de auditoria. Os dados não ficam no código do site.

## 7. Menores de idade
A plataforma é destinada a maiores de 18 anos.

## 8. Cookies
Usamos apenas o armazenamento essencial ao login e ao funcionamento do site. Não usamos cookies de publicidade nem rastreadores de terceiros.

## 9. Contato
Fale com o encarregado em **diogo@agenciagryd.com** ou pela página **Fale conosco**, assunto "Privacidade". Você também pode procurar a **ANPD** (www.gov.br/anpd).$md$, now()),
('termos_uso', '1.0', 'Termos de Uso',
$md$**Última atualização:** novembro de 2026 · Versão 1.0

Bem-vindo ao **Meu Amigo Pra Vida**, uma plataforma de conscientização, adoção e doação de cães e gatos que conecta pessoas, ONGs, protetores e empresas do setor animal. Ao criar uma conta, você concorda com estes termos.

## 1. Quem pode usar
Pessoas com 18 anos ou mais. ONGs, protetores e empresas devem informar dados verdadeiros e passam por verificação antes de aparecer publicamente.

## 2. Adoção
- O Meu Amigo Pra Vida aproxima adotantes e responsáveis pelos animais, mas **a decisão final de cada adoção é do responsável pelo anúncio**.
- O adotante se compromete a oferecer cuidados adequados, vacinação, alimentação, abrigo seguro e acompanhamento veterinário, e a **não abandonar, vender ou repassar** o animal sem comunicar o responsável.
- Mentir no questionário de adoção pode resultar no cancelamento do pedido e da conta.

## 3. Anúncios de animais
- É **proibido vender** animais ou cobrar qualquer valor pela doação. O responsável pode solicitar, de forma transparente, apenas o reembolso comprovado de despesas veterinárias, se a ONG adotar essa prática.
- Fotos e informações devem ser verdadeiras. Todo anúncio passa por moderação e pode ser recusado ou removido.
- Pessoas físicas podem manter até 5 anúncios ativos. Acima disso, cadastre-se como protetor.

## 4. Doações em dinheiro
As chaves Pix exibidas pertencem às próprias ONGs verificadas. O Meu Amigo Pra Vida **não recebe, intermedeia nem garante** essas doações.

## 5. Empresas parceiras
Empresas aprovadas podem aparecer na vitrine de parceiros e divulgar campanhas e eventos, sempre sujeitos à moderação. Não é permitida publicidade enganosa.

## 6. Condutas proibidas
Conteúdo ofensivo, discriminatório ou violento; incentivo a maus-tratos; uso dos dados de outros usuários fora da finalidade de adoção; tentativas de burlar a segurança da plataforma.

## 7. Responsabilidade
Fazemos o possível para verificar organizações e moderar anúncios, mas não garantimos o comportamento de terceiros. Em caso de problema, use **Fale conosco → Denunciar anúncio**.

## 8. Alterações
Podemos atualizar estes termos. Avisaremos sobre mudanças relevantes e pediremos um novo aceite quando necessário.

## 9. Foro
Fica eleito o foro do domicílio do consumidor, nos termos do Código de Defesa do Consumidor.$md$, now())
on conflict (kind, version) do nothing;
