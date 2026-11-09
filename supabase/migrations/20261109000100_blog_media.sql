-- Capas em formato de cartaz e mídia nos artigos (imagens e vídeo locais, sem sons).
-- Os arquivos ficam em public/assets/img/blog e public/assets/video.

update public.blog_posts set cover_url = '/assets/img/blog/' || slug || '.webp'
where slug in ('10-perguntas-antes-de-adotar','primeiros-30-dias-em-casa','castracao-mitos-e-verdades',
  'encontrei-um-animal-na-rua','calendario-de-vacinas-caes-e-gatos','como-doar-um-animal-com-responsabilidade');

update public.blog_posts set cover_alt = case slug
  when '10-perguntas-antes-de-adotar' then 'Cão dourado sentado diante de um fundo laranja, com a palavra pense ao fundo'
  when 'primeiros-30-dias-em-casa' then 'Gato laranja deitado diante de um fundo azul, com a palavra casa ao fundo'
  when 'castracao-mitos-e-verdades' then 'Gato preto e branco de pé diante de um fundo azul, com a palavra castre ao fundo'
  when 'encontrei-um-animal-na-rua' then 'Cachorro pequeno diante de um fundo rosa, com a palavra resgate ao fundo'
  when 'calendario-de-vacinas-caes-e-gatos' then 'Cão preto, marrom e branco diante de um fundo azul, com a palavra saúde ao fundo'
  when 'como-doar-um-animal-com-responsabilidade' then 'Cão preto, marrom e branco diante de um fundo amarelo, com a palavra doe ao fundo'
end
where slug in ('10-perguntas-antes-de-adotar','primeiros-30-dias-em-casa','castracao-mitos-e-verdades',
  'encontrei-um-animal-na-rua','calendario-de-vacinas-caes-e-gatos','como-doar-um-animal-com-responsabilidade');

-- Vídeo com as quatro etapas do pedido de adoção, antes do primeiro subtítulo
update public.blog_posts
set content_md = regexp_replace(content_md, chr(10) || '## ',
  chr(10) || chr(10) || '!video[Os quatro passos para adotar, do primeiro contato até a entrega. Vídeo sem som.](/assets/video/como-funciona-adocao.mp4|/assets/img/blog/video-poster.webp)' || chr(10) || chr(10) || '## ')
where slug = '10-perguntas-antes-de-adotar';

-- Figura no meio do texto
update public.blog_posts
set content_md = regexp_replace(content_md, chr(10) || '## ',
  chr(10) || chr(10) || '![Um novo lar pede tempo: a adaptação costuma levar algumas semanas.](/assets/img/animais/gato-rajado.webp)' || chr(10) || chr(10) || '## ')
where slug = 'primeiros-30-dias-em-casa';
