-- ============================================================================
--  FUTEBOL MANAGER — Migração 0017: Estatísticas de goleiro
--
--  Na súmula, o juiz marca quem foi o GOLEIRO de cada time (evento 'goleiro').
--  "Gols sofridos" = gols do time adversário nas partidas em que ele foi goleiro.
--  Métricas: jogos como goleiro, gols sofridos, jogos sem sofrer, média.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

alter table public.eventos_partida drop constraint if exists eventos_partida_tipo_check;
alter table public.eventos_partida add constraint eventos_partida_tipo_check
  check (tipo in ('gol','assistencia','cartao_azul','cartao_amarelo','cartao_vermelho','goleiro'));

create or replace view public.vw_goleiros
with (security_invoker = true) as
select
  j.id as jogador_id, j.org_id, j.nome, j.apelido, j.foto_url,
  (select count(distinct g.partida_id) from public.eventos_partida g
     where g.jogador_id = j.id and g.tipo = 'goleiro')                          as jogos,
  (select coalesce(sum(
       (select count(*) from public.eventos_partida gl
          where gl.partida_id = g.partida_id and gl.tipo = 'gol' and gl.equipe is distinct from g.equipe)
     ), 0)
     from public.eventos_partida g where g.jogador_id = j.id and g.tipo = 'goleiro') as gols_sofridos,
  (select count(*) from public.eventos_partida g
     where g.jogador_id = j.id and g.tipo = 'goleiro'
       and (select count(*) from public.eventos_partida gl
              where gl.partida_id = g.partida_id and gl.tipo = 'gol' and gl.equipe is distinct from g.equipe) = 0) as sem_sofrer
from public.jogadores j
where exists (select 1 from public.eventos_partida g where g.jogador_id = j.id and g.tipo = 'goleiro');

grant select on public.vw_goleiros to authenticated;
