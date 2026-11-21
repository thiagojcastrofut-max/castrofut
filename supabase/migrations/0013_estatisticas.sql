-- ============================================================================
--  FUTEBOL MANAGER — Migração 0013: Estatísticas individuais (view)
--
--  Agrega por jogador: presenças, gols, assistências e cartões, a partir de
--  eventos_partida + presencas. A view usa SECURITY INVOKER para que o RLS das
--  tabelas de base continue valendo (cada um só vê o seu grupo).
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create or replace view public.vw_estatisticas
with (security_invoker = true) as
select
  j.id          as jogador_id,
  j.org_id      as org_id,
  j.nome        as nome,
  j.apelido     as apelido,
  j.foto_url    as foto_url,
  j.posicao_principal as posicao_principal,
  j.nivel_tecnico as nivel_tecnico,
  j.situacao    as situacao,
  (select count(distinct pr.partida_id) from public.presencas pr
     where pr.jogador_id = j.id and pr.status = 'confirmado')          as presencas,
  (select count(*) from public.eventos_partida e
     where e.jogador_id = j.id and e.tipo = 'gol')                     as gols,
  (select count(*) from public.eventos_partida e
     where e.jogador_id = j.id and e.tipo = 'assistencia')             as assistencias,
  (select count(*) from public.eventos_partida e
     where e.jogador_id = j.id and e.tipo = 'cartao_amarelo')          as amarelos,
  (select count(*) from public.eventos_partida e
     where e.jogador_id = j.id and e.tipo = 'cartao_azul')             as azuis,
  (select count(*) from public.eventos_partida e
     where e.jogador_id = j.id and e.tipo = 'cartao_vermelho')         as vermelhos
from public.jogadores j;

grant select on public.vw_estatisticas to authenticated;
