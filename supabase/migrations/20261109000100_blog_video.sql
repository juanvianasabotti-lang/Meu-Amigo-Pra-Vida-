-- Vídeo "Como funciona a adoção" (public/assets/video/como-funciona.*) no artigo das 10 perguntas,
-- antes do primeiro subtítulo. Usa a sintaxe de vídeo do markdown dos artigos:
--   !video[legenda](/assets/video/arquivo.mp4|/assets/video/capa.jpg)
-- Idempotente: não insere de novo se o vídeo já estiver no texto.
-- (Uma migração anterior, "blog_media", pôs capas próprias nos artigos e foi desfeita no mesmo dia:
--  o desenho atual monta a capa com o recorte de um animal, então cover_url fica vazio.)

update public.blog_posts
set content_md = regexp_replace(content_md, chr(10) || '## ',
  chr(10) || chr(10) || '!video[Como funciona a adoção, do pedido à ida pra casa, em quatro passos. Vídeo sem som.](/assets/video/como-funciona.mp4|/assets/video/como-funciona.jpg)' || chr(10) || chr(10) || '## ')
where slug = '10-perguntas-antes-de-adotar'
  and position('/assets/video/como-funciona.mp4' in content_md) = 0;
