-- ============================================================================
--  FUTEBOL MANAGER — Migração 0005: Incluir / excluir jogador
--
--  - Permite a admin/comissão CRIAR jogador direto (ficha avulsa, sem login).
--    Esses jogadores têm user_id = NULL (podem ganhar login depois).
--  - RPC para EXCLUIR um jogador do grupo (remove a ficha e, se tiver login,
--    o vínculo do usuário com o grupo). Só admin/comissão. Com auditoria.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

-- Incluir jogador (admin/comissão)
drop policy if exists jog_ins on public.jogadores;
create policy jog_ins on public.jogadores for insert to authenticated
  with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

-- Excluir jogador do grupo (ficha + vínculo, se houver)
create or replace function public.jogador_excluir(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_user uuid; v_nome text;
begin
  select org_id, user_id, nome into v_org, v_user, v_nome from public.jogadores where id = p_id;
  if v_org is null then raise exception 'Jogador não encontrado.'; end if;
  if not public.fm_has_role(v_org, array['admin_geral','comissao']) then
    raise exception 'Sem permissão para excluir jogadores deste grupo.';
  end if;

  delete from public.jogadores where id = p_id;
  -- Se tinha login, remove também o vínculo com ESTE grupo (não apaga a conta)
  if v_user is not null then
    delete from public.membros where org_id = v_org and user_id = v_user;
  end if;

  insert into public.auditoria (org_id, user_id, acao, entidade, registro_id, detalhe)
  values (v_org, auth.uid(), 'excluir_jogador', 'jogadores', p_id, jsonb_build_object('nome', v_nome));
end $$;

grant execute on function public.jogador_excluir(uuid) to authenticated;
