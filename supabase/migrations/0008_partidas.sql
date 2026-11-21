-- ============================================================================
--  FUTEBOL MANAGER — Migração 0008: Partidas + Confirmação de presença (Leva 1)
--
--  - partidas: agendamento (data/hora/local), status, placar (p/ a Leva 2).
--  - presencas: cada jogador confirma se vai ("Vou"/"Não vou").
--  Criar/editar partida: admin/comissão. Confirmar presença: o próprio jogador.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create table if not exists public.partidas (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  data           date not null,
  hora           time,
  local          text,
  status         text not null default 'agendada' check (status in ('agendada','encerrada','cancelada')),
  juiz_id        uuid references public.usuarios(id),
  serie_id       uuid,
  equipe_a_nome  text,
  equipe_b_nome  text,
  placar_a       integer,
  placar_b       integer,
  obs            text,
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_partidas_org on public.partidas(org_id, data desc);

create table if not exists public.presencas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizacoes(id) on delete cascade,
  partida_id uuid not null references public.partidas(id) on delete cascade,
  jogador_id uuid not null references public.jogadores(id) on delete cascade,
  status     text not null default 'confirmado' check (status in ('confirmado','recusado')),
  criado_em  timestamptz not null default now(),
  unique (partida_id, jogador_id)
);
create index if not exists idx_presencas_partida on public.presencas(partida_id);

-- ---------- RLS ----------
alter table public.partidas  enable row level security;
alter table public.presencas enable row level security;

drop policy if exists part_sel on public.partidas;
create policy part_sel on public.partidas for select using (public.fm_is_member(org_id));
drop policy if exists part_wr on public.partidas;
create policy part_wr on public.partidas for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao']))
  with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

drop policy if exists pres_sel on public.presencas;
create policy pres_sel on public.presencas for select using (public.fm_is_member(org_id));
-- escrita direta de presença só p/ admin/comissão; o jogador usa o RPC abaixo
drop policy if exists pres_wr on public.presencas;
create policy pres_wr on public.presencas for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao']))
  with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

-- ---------- RPCs ----------
-- O próprio jogador confirma/recusa presença numa partida
create or replace function public.confirmar_presenca(p_partida_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_jog uuid;
begin
  if p_status not in ('confirmado','recusado') then raise exception 'Status inválido.'; end if;
  select org_id into v_org from public.partidas where id = p_partida_id;
  if v_org is null then raise exception 'Partida não encontrada.'; end if;
  select id into v_jog from public.jogadores where org_id = v_org and user_id = auth.uid();
  if v_jog is null then raise exception 'Você não tem ficha de jogador neste grupo.'; end if;
  insert into public.presencas (org_id, partida_id, jogador_id, status)
  values (v_org, p_partida_id, v_jog, p_status)
  on conflict (partida_id, jogador_id) do update set status = excluded.status, criado_em = now();
end $$;

-- Admin/comissão define a presença de um jogador (lista manual)
create or replace function public.definir_presenca(p_partida_id uuid, p_jogador_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if p_status not in ('confirmado','recusado') then raise exception 'Status inválido.'; end if;
  select org_id into v_org from public.partidas where id = p_partida_id;
  if v_org is null then raise exception 'Partida não encontrada.'; end if;
  if not public.fm_has_role(v_org, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  insert into public.presencas (org_id, partida_id, jogador_id, status)
  values (v_org, p_partida_id, p_jogador_id, p_status)
  on conflict (partida_id, jogador_id) do update set status = excluded.status;
end $$;

grant execute on function public.confirmar_presenca(uuid, text)        to authenticated;
grant execute on function public.definir_presenca(uuid, uuid, text)    to authenticated;
