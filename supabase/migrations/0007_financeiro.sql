-- ============================================================================
--  FUTEBOL MANAGER — Migração 0007: Tesouraria (Leva 1)
--
--  Mensalidades, pagamentos (parciais), receitas/despesas.
--  Escrita: admin_geral/tesoureiro. Leitura: + comissão. Jogador vê SÓ as suas.
--  Config financeira do grupo (Pix / mensalidade padrão) editável por admin/tesoureiro.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

-- Campos financeiros no jogador (valor individual / isenção)
alter table public.jogadores add column if not exists mensalidade_valor numeric(10,2);
alter table public.jogadores add column if not exists isento boolean not null default false;

-- ---------- Tabelas ----------
create table if not exists public.mensalidades (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  jogador_id     uuid not null references public.jogadores(id) on delete cascade,
  competencia    date not null,                 -- 1º dia do mês de referência
  valor          numeric(10,2) not null default 0,
  desconto       numeric(10,2) not null default 0,
  valor_pago     numeric(10,2) not null default 0,
  vencimento     date,
  status         text not null default 'aberta' check (status in ('aberta','parcial','paga','isenta','cancelada')),
  isencao_motivo text,
  criado_em      timestamptz not null default now(),
  unique (org_id, jogador_id, competencia)
);
create index if not exists idx_mens_org_comp on public.mensalidades(org_id, competencia);

create table if not exists public.pagamentos (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizacoes(id) on delete cascade,
  mensalidade_id uuid references public.mensalidades(id) on delete set null,
  jogador_id     uuid references public.jogadores(id) on delete set null,
  valor          numeric(10,2) not null,
  data_recebimento date not null default current_date,
  forma          text,
  comprovante_url text,
  obs            text,
  registrado_por uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_pag_org on public.pagamentos(org_id);

create table if not exists public.lancamentos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizacoes(id) on delete cascade,
  tipo            text not null check (tipo in ('receita','despesa')),
  categoria       text,
  descricao       text,
  valor           numeric(10,2) not null,
  data            date not null default current_date,
  forma           text,
  comprovante_url text,
  criado_por      uuid,
  criado_em       timestamptz not null default now()
);
create index if not exists idx_lanc_org on public.lancamentos(org_id, data desc);

-- ---------- Helpers de permissão financeira ----------
create or replace function public.fm_fin_gere(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.fm_has_role(p_org, array['admin_geral','tesoureiro']);
$$;
create or replace function public.fm_fin_ver(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.fm_has_role(p_org, array['admin_geral','tesoureiro','comissao']);
$$;
create or replace function public.fm_sou_jogador(p_jogador uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.jogadores j where j.id = p_jogador and j.user_id = auth.uid());
$$;

-- ---------- RLS ----------
alter table public.mensalidades enable row level security;
alter table public.pagamentos   enable row level security;
alter table public.lancamentos  enable row level security;

drop policy if exists mens_sel on public.mensalidades;
create policy mens_sel on public.mensalidades for select
  using (public.fm_fin_ver(org_id) or public.fm_sou_jogador(jogador_id));
drop policy if exists mens_wr on public.mensalidades;
create policy mens_wr on public.mensalidades for all
  using (public.fm_fin_gere(org_id)) with check (public.fm_fin_gere(org_id));

drop policy if exists pag_sel on public.pagamentos;
create policy pag_sel on public.pagamentos for select
  using (public.fm_fin_ver(org_id) or public.fm_sou_jogador(jogador_id));
drop policy if exists pag_wr on public.pagamentos;
create policy pag_wr on public.pagamentos for all
  using (public.fm_fin_gere(org_id)) with check (public.fm_fin_gere(org_id));

drop policy if exists lanc_sel on public.lancamentos;
create policy lanc_sel on public.lancamentos for select using (public.fm_fin_ver(org_id));
drop policy if exists lanc_wr on public.lancamentos;
create policy lanc_wr on public.lancamentos for all
  using (public.fm_fin_gere(org_id)) with check (public.fm_fin_gere(org_id));

-- ---------- RPCs ----------
-- Gera as mensalidades do mês para todos os jogadores ATIVOS (não duplica)
create or replace function public.gerar_mensalidades(p_org_id uuid, p_competencia date, p_vencimento date)
returns integer language plpgsql security definer set search_path = public as $$
declare v_padrao numeric; v_count int := 0; r record;
begin
  if not public.fm_fin_gere(p_org_id) then raise exception 'Sem permissão.'; end if;
  select mensalidade_padrao into v_padrao from public.organizacoes where id = p_org_id;
  for r in select * from public.jogadores where org_id = p_org_id and situacao = 'ativo' loop
    insert into public.mensalidades (org_id, jogador_id, competencia, valor, vencimento, status, isencao_motivo)
    values (
      p_org_id, r.id, date_trunc('month', p_competencia)::date,
      case when r.isento then 0 else coalesce(r.mensalidade_valor, v_padrao, 0) end,
      p_vencimento,
      case when r.isento then 'isenta' else 'aberta' end,
      case when r.isento then 'Jogador isento' else null end
    )
    on conflict (org_id, jogador_id, competencia) do nothing;
    if found then v_count := v_count + 1; end if;
  end loop;
  insert into public.auditoria (org_id, user_id, acao, entidade, detalhe)
  values (p_org_id, auth.uid(), 'gerar_mensalidades', 'mensalidades',
          jsonb_build_object('competencia', date_trunc('month', p_competencia)::date, 'geradas', v_count));
  return v_count;
end $$;

-- Registra um pagamento (parcial ou total) e recalcula o status
create or replace function public.registrar_pagamento(
  p_mensalidade_id uuid, p_valor numeric, p_data date, p_forma text, p_comprovante text, p_obs text)
returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.mensalidades where id = p_mensalidade_id;
  if m is null then raise exception 'Mensalidade não encontrada.'; end if;
  if not public.fm_fin_gere(m.org_id) then raise exception 'Sem permissão.'; end if;
  if p_valor <= 0 then raise exception 'Valor inválido.'; end if;

  insert into public.pagamentos (org_id, mensalidade_id, jogador_id, valor, data_recebimento, forma, comprovante_url, obs, registrado_por)
  values (m.org_id, m.id, m.jogador_id, p_valor, coalesce(p_data, current_date), p_forma, p_comprovante, p_obs, auth.uid());

  update public.mensalidades
     set valor_pago = valor_pago + p_valor,
         status = case when (valor_pago + p_valor + desconto) >= valor then 'paga' else 'parcial' end
   where id = m.id;
end $$;

-- Ajusta uma mensalidade (valor, desconto, isenção, cancelar)
create or replace function public.definir_mensalidade(
  p_id uuid, p_valor numeric, p_desconto numeric, p_status text, p_isencao_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select * into m from public.mensalidades where id = p_id;
  if m is null then raise exception 'Mensalidade não encontrada.'; end if;
  if not public.fm_fin_gere(m.org_id) then raise exception 'Sem permissão.'; end if;
  if p_status is not null and p_status not in ('aberta','parcial','paga','isenta','cancelada') then
    raise exception 'Status inválido.'; end if;
  update public.mensalidades set
    valor = coalesce(p_valor, valor),
    desconto = coalesce(p_desconto, desconto),
    isencao_motivo = p_isencao_motivo,
    status = coalesce(p_status,
      case when (valor_pago + coalesce(p_desconto,desconto)) >= coalesce(p_valor,valor) and valor_pago > 0 then 'paga'
           when valor_pago > 0 then 'parcial' else status end)
  where id = p_id;
end $$;

-- Configuração financeira do grupo (Pix / valor padrão)
create or replace function public.salvar_config_financeira(
  p_org_id uuid, p_mensalidade_padrao numeric, p_pix_chave text, p_pix_titular text, p_banco text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.fm_fin_gere(p_org_id) then raise exception 'Sem permissão.'; end if;
  update public.organizacoes set
    mensalidade_padrao = p_mensalidade_padrao, pix_chave = p_pix_chave,
    pix_titular = p_pix_titular, banco = p_banco
  where id = p_org_id;
end $$;

grant execute on function public.gerar_mensalidades(uuid, date, date)               to authenticated;
grant execute on function public.registrar_pagamento(uuid, numeric, date, text, text, text) to authenticated;
grant execute on function public.definir_mensalidade(uuid, numeric, numeric, text, text) to authenticated;
grant execute on function public.salvar_config_financeira(uuid, numeric, text, text, text) to authenticated;
