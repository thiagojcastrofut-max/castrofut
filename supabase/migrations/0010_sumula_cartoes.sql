-- ============================================================================
--  FUTEBOL MANAGER — Migração 0010: Súmula do juiz (gols/cartões) + multas
--
--  Juiz registra gols e cartões (azul, amarelo, vermelho). Cada cartão gera,
--  conforme o valor configurado pela comissão, uma COBRANÇA automática na conta
--  do jogador (tabela debitos). Placar calculado pelos gols.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

-- Valores das multas por tipo de cartão (por grupo)
alter table public.organizacoes add column if not exists multa_cartao_azul     numeric(10,2) not null default 0;
alter table public.organizacoes add column if not exists multa_cartao_amarelo  numeric(10,2) not null default 0;
alter table public.organizacoes add column if not exists multa_cartao_vermelho numeric(10,2) not null default 0;

create table if not exists public.eventos_partida (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  partida_id    uuid not null references public.partidas(id) on delete cascade,
  jogador_id    uuid references public.jogadores(id) on delete set null,
  equipe        text check (equipe in ('a','b')),
  tipo          text not null check (tipo in ('gol','assistencia','cartao_azul','cartao_amarelo','cartao_vermelho')),
  minuto        integer,
  obs           text,
  registrado_por uuid,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_ev_partida on public.eventos_partida(partida_id);
create index if not exists idx_ev_jogador on public.eventos_partida(org_id, jogador_id);

create table if not exists public.debitos (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizacoes(id) on delete cascade,
  jogador_id  uuid not null references public.jogadores(id) on delete cascade,
  tipo        text not null,                 -- cartao_amarelo, cartao_vermelho, cartao_azul, outro
  descricao   text,
  valor       numeric(10,2) not null,
  valor_pago  numeric(10,2) not null default 0,
  status      text not null default 'aberto' check (status in ('aberto','pago','cancelado')),
  partida_id  uuid references public.partidas(id) on delete set null,
  evento_id   uuid references public.eventos_partida(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_deb_org on public.debitos(org_id);
create index if not exists idx_deb_jog on public.debitos(org_id, jogador_id);

-- ---------- Permissão: quem registra súmula ----------
create or replace function public.fm_juiz(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.fm_has_role(p_org, array['admin_geral','comissao','juiz']);
$$;

-- ---------- RLS ----------
alter table public.eventos_partida enable row level security;
alter table public.debitos         enable row level security;

drop policy if exists ev_sel on public.eventos_partida;
create policy ev_sel on public.eventos_partida for select using (public.fm_is_member(org_id));
drop policy if exists ev_wr on public.eventos_partida;
create policy ev_wr on public.eventos_partida for all
  using (public.fm_juiz(org_id)) with check (public.fm_juiz(org_id));

drop policy if exists deb_sel on public.debitos;
create policy deb_sel on public.debitos for select
  using (public.fm_fin_ver(org_id) or public.fm_sou_jogador(jogador_id));
drop policy if exists deb_wr on public.debitos;
create policy deb_wr on public.debitos for all
  using (public.fm_fin_gere(org_id)) with check (public.fm_fin_gere(org_id));

-- ---------- Helpers internos ----------
create or replace function public._fm_recalc_placar(p_partida uuid)
returns void language sql security definer set search_path = public as $$
  update public.partidas set
    placar_a = (select count(*) from public.eventos_partida where partida_id = p_partida and tipo = 'gol' and equipe = 'a'),
    placar_b = (select count(*) from public.eventos_partida where partida_id = p_partida and tipo = 'gol' and equipe = 'b')
  where id = p_partida;
$$;

-- ---------- RPCs ----------
-- Registra um evento. Se for cartão, cria o débito com o valor configurado.
create or replace function public.registrar_evento(
  p_partida_id uuid, p_jogador_id uuid, p_tipo text, p_equipe text, p_minuto integer)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_ev uuid; v_valor numeric; v_label text;
begin
  select org_id into v_org from public.partidas where id = p_partida_id;
  if v_org is null then raise exception 'Partida não encontrada.'; end if;
  if not public.fm_juiz(v_org) then raise exception 'Apenas juiz/comissão/admin registram a súmula.'; end if;

  insert into public.eventos_partida (org_id, partida_id, jogador_id, equipe, tipo, minuto, registrado_por)
  values (v_org, p_partida_id, p_jogador_id, p_equipe, p_tipo, p_minuto, auth.uid())
  returning id into v_ev;

  if p_tipo like 'cartao_%' and p_jogador_id is not null then
    select case p_tipo when 'cartao_azul' then multa_cartao_azul when 'cartao_amarelo' then multa_cartao_amarelo
                       when 'cartao_vermelho' then multa_cartao_vermelho else 0 end
      into v_valor from public.organizacoes where id = v_org;
    if coalesce(v_valor,0) > 0 then
      v_label := case p_tipo when 'cartao_azul' then 'Cartão azul' when 'cartao_amarelo' then 'Cartão amarelo' else 'Cartão vermelho' end;
      insert into public.debitos (org_id, jogador_id, tipo, descricao, valor, partida_id, evento_id)
      values (v_org, p_jogador_id, p_tipo, v_label, v_valor, p_partida_id, v_ev);
    end if;
  end if;

  if p_tipo = 'gol' then perform public._fm_recalc_placar(p_partida_id); end if;
  return v_ev;
end $$;

-- Remove um evento (e cancela o débito ligado, se não foi pago)
create or replace function public.remover_evento(p_evento_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_part uuid; v_tipo text;
begin
  select org_id, partida_id, tipo into v_org, v_part, v_tipo from public.eventos_partida where id = p_evento_id;
  if v_org is null then raise exception 'Evento não encontrado.'; end if;
  if not public.fm_juiz(v_org) then raise exception 'Sem permissão.'; end if;
  delete from public.debitos where evento_id = p_evento_id and valor_pago = 0;
  delete from public.eventos_partida where id = p_evento_id;
  if v_tipo = 'gol' then perform public._fm_recalc_placar(v_part); end if;
end $$;

-- Configura as multas dos cartões (admin/comissão)
create or replace function public.salvar_multas_cartao(p_org_id uuid, p_azul numeric, p_amarelo numeric, p_vermelho numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fm_has_role(p_org_id, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  update public.organizacoes set
    multa_cartao_azul = coalesce(p_azul,0), multa_cartao_amarelo = coalesce(p_amarelo,0), multa_cartao_vermelho = coalesce(p_vermelho,0)
  where id = p_org_id;
end $$;

-- Tesouraria: baixa/estorna um débito
create or replace function public.pagar_debito(p_debito_id uuid, p_pago boolean)
returns void language plpgsql security definer set search_path = public as $$
declare d record;
begin
  select * into d from public.debitos where id = p_debito_id;
  if d is null then raise exception 'Débito não encontrado.'; end if;
  if not public.fm_fin_gere(d.org_id) then raise exception 'Sem permissão.'; end if;
  update public.debitos set status = case when p_pago then 'pago' else 'aberto' end,
                            valor_pago = case when p_pago then valor else 0 end
  where id = p_debito_id;
end $$;

grant execute on function public.fm_juiz(uuid)                                    to authenticated;
grant execute on function public.registrar_evento(uuid, uuid, text, text, integer) to authenticated;
grant execute on function public.remover_evento(uuid)                             to authenticated;
grant execute on function public.salvar_multas_cartao(uuid, numeric, numeric, numeric) to authenticated;
grant execute on function public.pagar_debito(uuid, boolean)                      to authenticated;
