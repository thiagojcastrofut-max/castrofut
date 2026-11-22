-- ============================================================================
--  FUTEBOL MANAGER — Migração 0016: Premiações por período (campeões + galeria)
--
--  O admin/comissão cria uma premiação com um período (datas). Ao HOMOLOGAR,
--  o sistema congela os campeões do período (artilheiro, garçom, presença) num
--  snapshot (premiacoes_itens) — mantém o histórico mesmo que as estatísticas
--  futuras mudem. A galeria mostra os premiados com foto.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create table if not exists public.premiacoes (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  titulo        text not null,
  inicio        date not null,
  fim           date not null,
  status        text not null default 'rascunho' check (status in ('rascunho','homologado')),
  homologado_em timestamptz,
  criado_por    uuid,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_prem_org on public.premiacoes(org_id, criado_em desc);

create table if not exists public.premiacoes_itens (
  id            uuid primary key default gen_random_uuid(),
  premiacao_id  uuid not null references public.premiacoes(id) on delete cascade,
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  categoria     text not null,
  jogador_id    uuid,
  nome          text,
  apelido       text,
  foto_url      text,
  valor         integer,
  posicao       integer
);
create index if not exists idx_premi on public.premiacoes_itens(premiacao_id);

alter table public.premiacoes       enable row level security;
alter table public.premiacoes_itens enable row level security;

drop policy if exists prem_sel on public.premiacoes;
create policy prem_sel on public.premiacoes for select using (public.fm_is_member(org_id));
drop policy if exists prem_wr on public.premiacoes;
create policy prem_wr on public.premiacoes for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao'])) with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

drop policy if exists premi_sel on public.premiacoes_itens;
create policy premi_sel on public.premiacoes_itens for select using (public.fm_is_member(org_id));
drop policy if exists premi_wr on public.premiacoes_itens;
create policy premi_wr on public.premiacoes_itens for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao'])) with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

-- Estatísticas de um período (gols/assist/presença/cartões por data da partida)
create or replace function public.estatisticas_periodo(p_org uuid, p_ini date, p_fim date)
returns table (jogador_id uuid, nome text, apelido text, foto_url text,
               gols bigint, assistencias bigint, presencas bigint, amarelos bigint, vermelhos bigint)
language sql stable security definer set search_path = public as $$
  select j.id, j.nome, j.apelido, j.foto_url,
    (select count(*) from public.eventos_partida e join public.partidas p on p.id=e.partida_id where e.jogador_id=j.id and e.tipo='gol' and p.data between p_ini and p_fim),
    (select count(*) from public.eventos_partida e join public.partidas p on p.id=e.partida_id where e.jogador_id=j.id and e.tipo='assistencia' and p.data between p_ini and p_fim),
    (select count(distinct pr.partida_id) from public.presencas pr join public.partidas p on p.id=pr.partida_id where pr.jogador_id=j.id and pr.status='confirmado' and p.data between p_ini and p_fim),
    (select count(*) from public.eventos_partida e join public.partidas p on p.id=e.partida_id where e.jogador_id=j.id and e.tipo='cartao_amarelo' and p.data between p_ini and p_fim),
    (select count(*) from public.eventos_partida e join public.partidas p on p.id=e.partida_id where e.jogador_id=j.id and e.tipo='cartao_vermelho' and p.data between p_ini and p_fim)
  from public.jogadores j
  where j.org_id = p_org and public.fm_is_member(p_org);
$$;

-- Homologa: congela os top 3 de cada categoria do período
create or replace function public.homologar_premiacao(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pr record;
begin
  select * into pr from public.premiacoes where id = p_id;
  if pr is null then raise exception 'Premiação não encontrada.'; end if;
  if not public.fm_has_role(pr.org_id, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;

  delete from public.premiacoes_itens where premiacao_id = p_id;

  insert into public.premiacoes_itens (premiacao_id, org_id, categoria, jogador_id, nome, apelido, foto_url, valor, posicao)
  select p_id, pr.org_id, 'artilheiro', e.jogador_id, e.nome, e.apelido, e.foto_url, e.gols, row_number() over (order by e.gols desc)
  from public.estatisticas_periodo(pr.org_id, pr.inicio, pr.fim) e where e.gols > 0 order by e.gols desc limit 3;

  insert into public.premiacoes_itens (premiacao_id, org_id, categoria, jogador_id, nome, apelido, foto_url, valor, posicao)
  select p_id, pr.org_id, 'assistencias', e.jogador_id, e.nome, e.apelido, e.foto_url, e.assistencias, row_number() over (order by e.assistencias desc)
  from public.estatisticas_periodo(pr.org_id, pr.inicio, pr.fim) e where e.assistencias > 0 order by e.assistencias desc limit 3;

  insert into public.premiacoes_itens (premiacao_id, org_id, categoria, jogador_id, nome, apelido, foto_url, valor, posicao)
  select p_id, pr.org_id, 'presenca', e.jogador_id, e.nome, e.apelido, e.foto_url, e.presencas, row_number() over (order by e.presencas desc)
  from public.estatisticas_periodo(pr.org_id, pr.inicio, pr.fim) e where e.presencas > 0 order by e.presencas desc limit 3;

  update public.premiacoes set status = 'homologado', homologado_em = now() where id = p_id;
end $$;

grant execute on function public.estatisticas_periodo(uuid, date, date) to authenticated;
grant execute on function public.homologar_premiacao(uuid)              to authenticated;
