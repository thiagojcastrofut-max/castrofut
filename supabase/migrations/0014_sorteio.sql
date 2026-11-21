-- ============================================================================
--  FUTEBOL MANAGER — Migração 0014: Sorteio do "futebol do dia"
--
--  Monta times equilibrados automaticamente (por nível técnico, goleiros
--  distribuídos) ou aleatórios, a partir dos jogadores presentes. Depois do
--  sorteio é possível AJUSTAR manualmente (mover jogador de time) e re-sortear.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create table if not exists public.sorteios (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  partida_id uuid references public.partidas(id) on delete set null,
  nome       text,
  num_times  integer not null default 2,
  criterio   text not null default 'equilibrado' check (criterio in ('equilibrado','aleatorio')),
  criado_por uuid,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_sorteios_org on public.sorteios(org_id, criado_em desc);

create table if not exists public.sorteio_jogadores (
  id         uuid primary key default gen_random_uuid(),
  sorteio_id uuid not null references public.sorteios(id) on delete cascade,
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  jogador_id uuid not null references public.jogadores(id) on delete cascade,
  time       text,
  unique (sorteio_id, jogador_id)
);
create index if not exists idx_sortj on public.sorteio_jogadores(sorteio_id);

alter table public.sorteios          enable row level security;
alter table public.sorteio_jogadores enable row level security;

drop policy if exists sort_sel on public.sorteios;
create policy sort_sel on public.sorteios for select using (public.fm_is_member(org_id));
drop policy if exists sort_wr on public.sorteios;
create policy sort_wr on public.sorteios for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao'])) with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

drop policy if exists sortj_sel on public.sorteio_jogadores;
create policy sortj_sel on public.sorteio_jogadores for select using (public.fm_is_member(org_id));
drop policy if exists sortj_wr on public.sorteio_jogadores;
create policy sortj_wr on public.sorteio_jogadores for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao'])) with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

-- ---------- Distribui os jogadores nos times ----------
create or replace function public.re_sortear(p_sorteio_id uuid, p_criterio text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid; v_n int; v_crit text;
  tot numeric[]; cnt int[]; i int; best int; j record;
begin
  select org_id, num_times, criterio into v_org, v_n, v_crit from public.sorteios where id = p_sorteio_id;
  if v_org is null then raise exception 'Sorteio não encontrado.'; end if;
  if not public.fm_has_role(v_org, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  if p_criterio in ('equilibrado','aleatorio') then v_crit := p_criterio; update public.sorteios set criterio = v_crit where id = p_sorteio_id; end if;
  if v_n < 2 then v_n := 2; end if;

  tot := array_fill(0::numeric, array[v_n]);
  cnt := array_fill(0, array[v_n]);

  for j in
    select sj.jogador_id, coalesce(jg.nivel_tecnico, 3) as nivel, (jg.posicao_principal = 'goleiro') as gk
    from public.sorteio_jogadores sj join public.jogadores jg on jg.id = sj.jogador_id
    where sj.sorteio_id = p_sorteio_id
    order by (case when v_crit = 'aleatorio' then random() else 0 end),
             (jg.posicao_principal = 'goleiro') desc,
             coalesce(jg.nivel_tecnico, 3) desc
  loop
    -- escolhe o melhor time: equilibrado = menor soma de nível (desempate por nº);
    -- aleatório = menor nº de jogadores
    best := 1;
    for i in 2..v_n loop
      if v_crit = 'aleatorio' then
        if cnt[i] < cnt[best] then best := i; end if;
      else
        if tot[i] < tot[best] or (tot[i] = tot[best] and cnt[i] < cnt[best]) then best := i; end if;
      end if;
    end loop;
    update public.sorteio_jogadores set time = chr(96 + best) where sorteio_id = p_sorteio_id and jogador_id = j.jogador_id;
    tot[best] := tot[best] + j.nivel; cnt[best] := cnt[best] + 1;
  end loop;
end $$;

-- ---------- Cria o sorteio com um pool e já distribui ----------
create or replace function public.criar_sorteio(
  p_org_id uuid, p_partida_id uuid, p_nome text, p_jogadores uuid[], p_num_times integer, p_criterio text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; j uuid;
begin
  if not public.fm_has_role(p_org_id, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  if array_length(p_jogadores,1) is null or array_length(p_jogadores,1) < 2 then raise exception 'Selecione ao menos 2 jogadores.'; end if;
  insert into public.sorteios (org_id, partida_id, nome, num_times, criterio, criado_por)
  values (p_org_id, p_partida_id, p_nome, greatest(coalesce(p_num_times,2),2), coalesce(p_criterio,'equilibrado'), auth.uid())
  returning id into v_id;
  foreach j in array p_jogadores loop
    insert into public.sorteio_jogadores (sorteio_id, org_id, jogador_id) values (v_id, p_org_id, j) on conflict do nothing;
  end loop;
  perform public.re_sortear(v_id, coalesce(p_criterio,'equilibrado'));
  return v_id;
end $$;

-- ---------- Ajuste manual: move um jogador de time ----------
create or replace function public.mover_sorteio(p_sorteio_id uuid, p_jogador_id uuid, p_time text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.sorteios where id = p_sorteio_id;
  if v_org is null then raise exception 'Sorteio não encontrado.'; end if;
  if not public.fm_has_role(v_org, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  update public.sorteio_jogadores set time = p_time where sorteio_id = p_sorteio_id and jogador_id = p_jogador_id;
end $$;

grant execute on function public.re_sortear(uuid, text)                          to authenticated;
grant execute on function public.criar_sorteio(uuid, uuid, text, uuid[], integer, text) to authenticated;
grant execute on function public.mover_sorteio(uuid, uuid, text)                 to authenticated;
