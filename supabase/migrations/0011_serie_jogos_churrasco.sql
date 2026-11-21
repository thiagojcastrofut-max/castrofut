-- ============================================================================
--  FUTEBOL MANAGER — Migração 0011: Jogos da série + Churrasco
--
--  Registra o vencedor de cada jogo da série (melhor de N). Ao atingir as
--  vitórias necessárias, a série encerra e define a campeã. O time perdedor
--  paga o churrasco: o valor é dividido entre os jogadores do time perdedor,
--  virando débito (reaproveita a tabela debitos).
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create table if not exists public.series_jogos (
  id         uuid primary key default gen_random_uuid(),
  serie_id   uuid not null references public.series(id) on delete cascade,
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  numero     integer not null,
  vencedor   text not null check (vencedor in ('a','b')),
  criado_em  timestamptz not null default now()
);
create index if not exists idx_sjogos_serie on public.series_jogos(serie_id);

create table if not exists public.churrascos (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizacoes(id) on delete cascade,
  serie_id         uuid references public.series(id) on delete set null,
  valor_total      numeric(10,2) not null,
  equipe_perdedora text,
  data             date not null default current_date,
  obs              text,
  criado_em        timestamptz not null default now(),
  unique (serie_id)
);

alter table public.series_jogos enable row level security;
alter table public.churrascos   enable row level security;

drop policy if exists sjogos_sel on public.series_jogos;
create policy sjogos_sel on public.series_jogos for select using (public.fm_is_member(org_id));
drop policy if exists sjogos_wr on public.series_jogos;
create policy sjogos_wr on public.series_jogos for all
  using (public.fm_juiz(org_id)) with check (public.fm_juiz(org_id));

drop policy if exists chur_sel on public.churrascos;
create policy chur_sel on public.churrascos for select using (public.fm_is_member(org_id));
drop policy if exists chur_wr on public.churrascos;
create policy chur_wr on public.churrascos for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao','tesoureiro']))
  with check (public.fm_has_role(org_id, array['admin_geral','comissao','tesoureiro']));

-- ---------- RPCs ----------
-- Registra o vencedor de um jogo da série e encerra se atingir as vitórias
create or replace function public.registrar_jogo_serie(p_serie_id uuid, p_vencedor text)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_num int; v_va int; v_vb int;
begin
  if p_vencedor not in ('a','b') then raise exception 'Vencedor inválido.'; end if;
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if s.status <> 'em_andamento' then raise exception 'A série não está em andamento.'; end if;
  if not public.fm_juiz(s.org_id) then raise exception 'Apenas juiz/comissão/admin registram o resultado.'; end if;

  select coalesce(max(numero),0)+1 into v_num from public.series_jogos where serie_id = p_serie_id;
  insert into public.series_jogos (serie_id, org_id, numero, vencedor) values (p_serie_id, s.org_id, v_num, p_vencedor);

  select count(*) filter (where vencedor='a'), count(*) filter (where vencedor='b')
    into v_va, v_vb from public.series_jogos where serie_id = p_serie_id;
  update public.series set vitorias_a = v_va, vitorias_b = v_vb,
    status = case when v_va >= s.vitorias_necessarias or v_vb >= s.vitorias_necessarias then 'encerrada' else 'em_andamento' end,
    vencedor = case when v_va >= s.vitorias_necessarias then 'a' when v_vb >= s.vitorias_necessarias then 'b' else null end
  where id = p_serie_id;
end $$;

-- Desfaz o último jogo (reabre a série se estava encerrada)
create or replace function public.desfazer_jogo_serie(p_serie_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_va int; v_vb int;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if not public.fm_juiz(s.org_id) then raise exception 'Sem permissão.'; end if;
  delete from public.series_jogos where id = (select id from public.series_jogos where serie_id = p_serie_id order by numero desc limit 1);
  select coalesce(count(*) filter (where vencedor='a'),0), coalesce(count(*) filter (where vencedor='b'),0)
    into v_va, v_vb from public.series_jogos where serie_id = p_serie_id;
  update public.series set vitorias_a = v_va, vitorias_b = v_vb, status = 'em_andamento', vencedor = null where id = p_serie_id;
end $$;

-- Cria o churrasco: divide o valor entre os jogadores do time PERDEDOR (débitos)
create or replace function public.criar_churrasco(p_serie_id uuid, p_valor numeric)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_perd text; v_n int; v_cota numeric; r record;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if s.status <> 'encerrada' or s.vencedor is null then raise exception 'A série ainda não foi decidida.'; end if;
  if not public.fm_has_role(s.org_id, array['admin_geral','comissao','tesoureiro']) then raise exception 'Sem permissão.'; end if;
  if coalesce(p_valor,0) <= 0 then raise exception 'Informe o valor do churrasco.'; end if;

  v_perd := case when s.vencedor = 'a' then 'b' else 'a' end;
  select count(*) into v_n from public.series_jogadores where serie_id = p_serie_id and time = v_perd;
  if v_n = 0 then raise exception 'Time perdedor sem jogadores.'; end if;
  v_cota := round(p_valor / v_n, 2);

  insert into public.churrascos (org_id, serie_id, valor_total, equipe_perdedora)
  values (s.org_id, p_serie_id, p_valor, v_perd)
  on conflict (serie_id) do update set valor_total = excluded.valor_total, equipe_perdedora = excluded.equipe_perdedora;

  -- limpa débitos de churrasco anteriores desta série (não pagos) e recria
  delete from public.debitos d using public.churrascos c
    where c.serie_id = p_serie_id and d.tipo = 'churrasco' and d.descricao = ('Churrasco - série') and d.valor_pago = 0
      and d.org_id = s.org_id;
  for r in select jogador_id from public.series_jogadores where serie_id = p_serie_id and time = v_perd loop
    insert into public.debitos (org_id, jogador_id, tipo, descricao, valor)
    values (s.org_id, r.jogador_id, 'churrasco', 'Churrasco - série', v_cota);
  end loop;
end $$;

grant execute on function public.registrar_jogo_serie(uuid, text)  to authenticated;
grant execute on function public.desfazer_jogo_serie(uuid)         to authenticated;
grant execute on function public.criar_churrasco(uuid, numeric)    to authenticated;
