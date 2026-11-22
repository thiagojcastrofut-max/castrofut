-- ============================================================================
--  FUTEBOL MANAGER — Migração 0019: Aprovar já definindo a função
--
--  Ao aprovar um cadastro, a comissão/admin pode já escolher a função.
--  admin_geral/super: define qualquer função. comissão: qualquer uma exceto
--  admin_geral. Mantém retrocompatível (chamada sem papel -> 'jogador').
--  Rode no SQL Editor do Supabase.
-- ============================================================================

drop function if exists public.aprovar_membro(uuid);

create or replace function public.aprovar_membro(p_membro_id uuid, p_papel text default 'jogador')
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.membros where id = p_membro_id;
  if v_org is null then raise exception 'Vínculo não encontrado.'; end if;
  if not public.fm_has_role(v_org, array['admin_geral','comissao']) then
    raise exception 'Sem permissão para aprovar neste grupo.';
  end if;

  update public.membros set status = 'ativo' where id = p_membro_id;

  if p_papel is not null and p_papel in ('admin_geral','tesoureiro','comissao','juiz','jogador') then
    if public.fm_is_super() or public.fm_has_role(v_org, array['admin_geral']) then
      update public.membros set papel = p_papel where id = p_membro_id;
    elsif public.fm_has_role(v_org, array['comissao']) and p_papel <> 'admin_geral' then
      update public.membros set papel = p_papel where id = p_membro_id;
    end if;
  end if;

  insert into public.auditoria (org_id, user_id, acao, entidade, registro_id, detalhe)
  values (v_org, auth.uid(), 'aprovar_membro', 'membros', p_membro_id, jsonb_build_object('papel', p_papel));
end $$;

grant execute on function public.aprovar_membro(uuid, text) to authenticated;
