-- ============================================================================
--  FUTEBOL MANAGER — Migração 0009: Séries + Draft dos capitães (tempo real)
--
--  Série (melhor de N). Cada time tem um CAPITÃO. No início, os capitães
--  escolhem os jogadores ALTERNADAMENTE, cada um no seu celular (sincronizado
--  via Supabase Realtime). Depois podem ajustar/trocar para ficar competitivo.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create table if not exists public.series (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  partida_id    uuid references public.partidas(id) on delete set null,
  nome          text,
  formato       integer not null default 3,          -- melhor de N
  vitorias_necessarias integer not null default 2,
  status        text not null default 'draft' check (status in ('draft','em_andamento','encerrada')),
  capitao_a     uuid references public.jogadores(id),
  capitao_b     uuid references public.jogadores(id),
  vez           text not null default 'a' check (vez in ('a','b')),
  vitorias_a    integer not null default 0,
  vitorias_b    integer not null default 0,
  vencedor      text check (vencedor in ('a','b')),
  criado_por    uuid,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_series_org on public.series(org_id, criado_em desc);

create table if not exists public.series_jogadores (
  id         uuid primary key default gen_random_uuid(),
  serie_id   uuid not null references public.series(id) on delete cascade,
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  jogador_id uuid not null references public.jogadores(id) on delete cascade,
  time       text check (time in ('a','b')),        -- null = disponível (pool)
  ordem_pick integer,
  unique (serie_id, jogador_id)
);
create index if not exists idx_sj_serie on public.series_jogadores(serie_id);

-- ---------- RLS ----------
alter table public.series           enable row level security;
alter table public.series_jogadores enable row level security;

drop policy if exists serie_sel on public.series;
create policy serie_sel on public.series for select using (public.fm_is_member(org_id));
drop policy if exists serie_wr on public.series;
create policy serie_wr on public.series for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao']))
  with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

drop policy if exists sj_sel on public.series_jogadores;
create policy sj_sel on public.series_jogadores for select using (public.fm_is_member(org_id));
drop policy if exists sj_wr on public.series_jogadores;
create policy sj_wr on public.series_jogadores for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao']))
  with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

-- ---------- Helper: o jogador (ficha) do usuário logado neste grupo ----------
create or replace function public.fm_meu_jogador(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.jogadores where org_id = p_org and user_id = auth.uid() limit 1;
$$;

-- ---------- RPCs ----------
-- Cria a série já com o pool e os dois capitães posicionados nos seus times
create or replace function public.criar_serie(
  p_org_id uuid, p_partida_id uuid, p_nome text, p_formato integer,
  p_capitao_a uuid, p_capitao_b uuid, p_jogadores uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; j uuid;
begin
  if not public.fm_has_role(p_org_id, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  if p_capitao_a is null or p_capitao_b is null or p_capitao_a = p_capitao_b then raise exception 'Escolha dois capitães diferentes.'; end if;

  insert into public.series (org_id, partida_id, nome, formato, vitorias_necessarias, status, capitao_a, capitao_b, vez, criado_por)
  values (p_org_id, p_partida_id, p_nome, coalesce(p_formato,3), (coalesce(p_formato,3)/2)+1, 'draft', p_capitao_a, p_capitao_b, 'a', auth.uid())
  returning id into v_id;

  foreach j in array p_jogadores loop
    insert into public.series_jogadores (serie_id, org_id, jogador_id, time, ordem_pick)
    values (v_id, p_org_id, j,
            case when j = p_capitao_a then 'a' when j = p_capitao_b then 'b' else null end,
            case when j = p_capitao_a or j = p_capitao_b then 0 else null end)
    on conflict (serie_id, jogador_id) do nothing;
  end loop;
  -- garante os capitães no pool mesmo se não vieram na lista
  insert into public.series_jogadores (serie_id, org_id, jogador_id, time, ordem_pick)
    values (v_id, p_org_id, p_capitao_a, 'a', 0) on conflict do nothing;
  insert into public.series_jogadores (serie_id, org_id, jogador_id, time, ordem_pick)
    values (v_id, p_org_id, p_capitao_b, 'b', 0) on conflict do nothing;
  return v_id;
end $$;

-- Capitão da vez escolhe um jogador disponível (ou admin/comissão opera)
create or replace function public.escolher_jogador(p_serie_id uuid, p_jogador_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_meu uuid; v_pode_admin boolean; v_ordem int;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if s.status <> 'draft' then raise exception 'O draft já foi encerrado.'; end if;

  v_pode_admin := public.fm_has_role(s.org_id, array['admin_geral','comissao']);
  v_meu := public.fm_meu_jogador(s.org_id);
  -- precisa ser o capitão da vez (ou admin/comissão)
  if not v_pode_admin then
    if (s.vez = 'a' and v_meu is distinct from s.capitao_a)
       or (s.vez = 'b' and v_meu is distinct from s.capitao_b) then
      raise exception 'Não é a sua vez.';
    end if;
  end if;

  update public.series_jogadores
    set time = s.vez, ordem_pick = (select coalesce(max(ordem_pick),0)+1 from public.series_jogadores where serie_id = p_serie_id)
  where serie_id = p_serie_id and jogador_id = p_jogador_id and time is null;
  if not found then raise exception 'Jogador indisponível (já escolhido).'; end if;

  update public.series set vez = case when vez = 'a' then 'b' else 'a' end where id = p_serie_id;
end $$;

-- Ajuste manual: mover jogador para 'a', 'b' ou pool (null). Capitães ou admin.
create or replace function public.mover_jogador(p_serie_id uuid, p_jogador_id uuid, p_time text)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_meu uuid;
begin
  if p_time is not null and p_time not in ('a','b') then raise exception 'Time inválido.'; end if;
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if s.status = 'encerrada' then raise exception 'Série encerrada.'; end if;
  v_meu := public.fm_meu_jogador(s.org_id);
  if not (public.fm_has_role(s.org_id, array['admin_geral','comissao']) or v_meu = s.capitao_a or v_meu = s.capitao_b) then
    raise exception 'Apenas capitães ou a comissão ajustam os times.';
  end if;
  update public.series_jogadores set time = p_time where serie_id = p_serie_id and jogador_id = p_jogador_id;
end $$;

-- Fecha os times e inicia a série
create or replace function public.fechar_times(p_serie_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_meu uuid;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  v_meu := public.fm_meu_jogador(s.org_id);
  if not (public.fm_has_role(s.org_id, array['admin_geral','comissao']) or v_meu = s.capitao_a or v_meu = s.capitao_b) then
    raise exception 'Sem permissão.';
  end if;
  update public.series set status = 'em_andamento' where id = p_serie_id;
end $$;

grant execute on function public.fm_meu_jogador(uuid)                             to authenticated;
grant execute on function public.criar_serie(uuid, uuid, text, integer, uuid, uuid, uuid[]) to authenticated;
grant execute on function public.escolher_jogador(uuid, uuid)                     to authenticated;
grant execute on function public.mover_jogador(uuid, uuid, text)                  to authenticated;
grant execute on function public.fechar_times(uuid)                               to authenticated;

-- ---------- Realtime (sincroniza o draft ao vivo entre os celulares) ----------
do $$ begin alter publication supabase_realtime add table public.series;           exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.series_jogadores;  exception when duplicate_object then null; end $$;
