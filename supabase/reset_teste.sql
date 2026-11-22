-- ============================================================================
--  FUTEBOL MANAGER — RESET de dados de TESTE de um grupo
--
--  Apaga TODOS os dados operacionais de teste de um grupo (jogadores, partidas,
--  mensalidades, séries, sorteios, avisos, premiações, débitos, membros que não
--  são Administrador Geral), MANTENDO o grupo e você (admin) intactos.
--
--  >>> Troque 'caveira' pelo slug do seu grupo se for diferente. <<<
--  ⚠️ IRREVERSÍVEL. Rode no SQL Editor do Supabase quando quiser começar limpo.
-- ============================================================================

do $$
declare v uuid;
begin
  select id into v from public.organizacoes where slug = 'caveira';   -- <= ajuste o slug aqui
  if v is null then raise notice 'Grupo não encontrado (confira o slug).'; return; end if;

  delete from public.premiacoes_itens where org_id = v;
  delete from public.premiacoes       where org_id = v;
  delete from public.eventos_partida  where org_id = v;
  delete from public.presencas        where org_id = v;
  delete from public.series_jogos     where org_id = v;
  delete from public.series_jogadores where org_id = v;
  delete from public.churrascos       where org_id = v;
  delete from public.series           where org_id = v;
  delete from public.sorteio_jogadores where org_id = v;
  delete from public.sorteios         where org_id = v;
  delete from public.pagamentos       where org_id = v;
  delete from public.debitos          where org_id = v;
  delete from public.mensalidades     where org_id = v;
  delete from public.partidas         where org_id = v;
  delete from public.avisos           where org_id = v;
  delete from public.lancamentos      where org_id = v;
  delete from public.jogadores        where org_id = v;
  delete from public.membros          where org_id = v and papel <> 'admin_geral';

  raise notice 'Dados de teste do grupo apagados. Grupo e administrador mantidos.';
end $$;

-- OPCIONAL: as contas de login de teste continuam em Authentication > Users.
-- Se quiser, apague-as manualmente por lá (não é obrigatório — sem vínculo elas
-- não acessam nenhum grupo).
