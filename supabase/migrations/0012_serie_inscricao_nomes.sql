-- ============================================================================
--  FUTEBOL MANAGER — Migração 0012: Inscrição na série + nomes dos times
--
--  - Nomes personalizados para os times (não só "Time A/B").
--  - Fase de INSCRIÇÃO: antes do draft, os jogadores marcam se vão participar
--    (enquete com prazo). Só quem se inscreveu entra no draft.
--  - Só a comissão insere/remove manualmente quem não conseguiu marcar.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

alter table public.series add column if not exists equipe_a_nome text;
alter table public.series add column if not exists equipe_b_nome text;
alter table public.series add column if not exists inscricao_ate timestamptz;

-- novo status 'inscricao' antes de 'draft'
alter table public.series drop constraint if exists series_status_check;
alter table public.series add constraint series_status_check
  check (status in ('inscricao','draft','em_andamento','encerrada'));

-- Recria criar_serie: começa em INSCRIÇÃO, com nomes dos times e prazo.
drop function if exists public.criar_serie(uuid, uuid, text, integer, uuid, uuid, uuid[]);
create or replace function public.criar_serie(
  p_org_id uuid, p_partida_id uuid, p_nome text, p_formato integer,
  p_capitao_a uuid, p_capitao_b uuid, p_jogadores uuid[],
  p_nome_a text, p_nome_b text, p_inscricao_ate timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; j uuid;
begin
  if not public.fm_has_role(p_org_id, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  if p_capitao_a is null or p_capitao_b is null or p_capitao_a = p_capitao_b then raise exception 'Escolha dois capitães diferentes.'; end if;

  insert into public.series (org_id, partida_id, nome, formato, vitorias_necessarias, status, capitao_a, capitao_b, vez,
                             equipe_a_nome, equipe_b_nome, inscricao_ate, criado_por)
  values (p_org_id, p_partida_id, p_nome, coalesce(p_formato,3), (coalesce(p_formato,3)/2)+1, 'inscricao',
          p_capitao_a, p_capitao_b, 'a', p_nome_a, p_nome_b, p_inscricao_ate, auth.uid())
  returning id into v_id;

  -- capitães já entram inscritos nos seus times
  insert into public.series_jogadores (serie_id, org_id, jogador_id, time, ordem_pick)
    values (v_id, p_org_id, p_capitao_a, 'a', 0) on conflict do nothing;
  insert into public.series_jogadores (serie_id, org_id, jogador_id, time, ordem_pick)
    values (v_id, p_org_id, p_capitao_b, 'b', 0) on conflict do nothing;

  if p_jogadores is not null then
    foreach j in array p_jogadores loop
      insert into public.series_jogadores (serie_id, org_id, jogador_id, time)
      values (v_id, p_org_id, j, null) on conflict (serie_id, jogador_id) do nothing;
    end loop;
  end if;
  return v_id;
end $$;

-- O próprio jogador se inscreve / sai (durante a inscrição, respeitando o prazo)
create or replace function public.inscrever_serie(p_serie_id uuid, p_participar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_jog uuid;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if s.status <> 'inscricao' then raise exception 'As inscrições estão fechadas.'; end if;
  if s.inscricao_ate is not null and now() > s.inscricao_ate then raise exception 'O prazo de inscrição encerrou.'; end if;
  v_jog := public.fm_meu_jogador(s.org_id);
  if v_jog is null then raise exception 'Você não tem ficha de jogador neste grupo.'; end if;
  if v_jog = s.capitao_a or v_jog = s.capitao_b then raise exception 'Capitães já estão na série.'; end if;
  if p_participar then
    insert into public.series_jogadores (serie_id, org_id, jogador_id, time)
    values (p_serie_id, s.org_id, v_jog, null) on conflict (serie_id, jogador_id) do nothing;
  else
    delete from public.series_jogadores where serie_id = p_serie_id and jogador_id = v_jog and time is null;
  end if;
end $$;

-- Comissão insere/remove manualmente (inclusive após o prazo)
create or replace function public.inscrever_jogador_serie(p_serie_id uuid, p_jogador_id uuid, p_incluir boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if not public.fm_has_role(s.org_id, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  if p_incluir then
    insert into public.series_jogadores (serie_id, org_id, jogador_id, time)
    values (p_serie_id, s.org_id, p_jogador_id, null) on conflict (serie_id, jogador_id) do nothing;
  else
    if p_jogador_id in (s.capitao_a, s.capitao_b) then raise exception 'Não é possível remover um capitão.'; end if;
    delete from public.series_jogadores where serie_id = p_serie_id and jogador_id = p_jogador_id;
  end if;
end $$;

-- Abre o draft (encerra as inscrições)
create or replace function public.abrir_draft(p_serie_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s record;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  if not public.fm_has_role(s.org_id, array['admin_geral','comissao']) then raise exception 'Sem permissão.'; end if;
  update public.series set status = 'draft' where id = p_serie_id;
end $$;

-- Renomeia os times (comissão ou capitães)
create or replace function public.definir_nomes_times(p_serie_id uuid, p_nome_a text, p_nome_b text)
returns void language plpgsql security definer set search_path = public as $$
declare s record; v_meu uuid;
begin
  select * into s from public.series where id = p_serie_id;
  if s is null then raise exception 'Série não encontrada.'; end if;
  v_meu := public.fm_meu_jogador(s.org_id);
  if not (public.fm_has_role(s.org_id, array['admin_geral','comissao']) or v_meu = s.capitao_a or v_meu = s.capitao_b) then
    raise exception 'Sem permissão.';
  end if;
  update public.series set equipe_a_nome = p_nome_a, equipe_b_nome = p_nome_b where id = p_serie_id;
end $$;

grant execute on function public.criar_serie(uuid, uuid, text, integer, uuid, uuid, uuid[], text, text, timestamptz) to authenticated;
grant execute on function public.inscrever_serie(uuid, boolean)                   to authenticated;
grant execute on function public.inscrever_jogador_serie(uuid, uuid, boolean)      to authenticated;
grant execute on function public.abrir_draft(uuid)                                to authenticated;
grant execute on function public.definir_nomes_times(uuid, text, text)            to authenticated;
