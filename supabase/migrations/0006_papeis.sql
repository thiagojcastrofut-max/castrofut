-- ============================================================================
--  FUTEBOL MANAGER — Migração 0006: Gestão de membros e papéis
--
--  O Administrador Geral define quem é comissão, tesoureiro, juiz ou jogador,
--  e pode bloquear/reativar um membro. Comissão pode VER a lista.
--  Tudo via RPCs SECURITY DEFINER (não expõe e-mails fora da gestão).
--  Rode no SQL Editor do Supabase.
-- ============================================================================

-- Lista os membros do grupo (admin/comissão) com nome e e-mail
create or replace function public.membros_do_grupo(p_org_id uuid)
returns table (membro_id uuid, user_id uuid, nome text, email text, papel text, status text, criado_em timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.fm_has_role(p_org_id, array['admin_geral','comissao']) then
    raise exception 'Sem permissão para ver os membros deste grupo.';
  end if;
  return query
    select m.id, m.user_id, u.nome, u.email, m.papel, m.status, m.criado_em
    from public.membros m
    join public.usuarios u on u.id = m.user_id
    where m.org_id = p_org_id
    order by (m.status = 'pendente') desc, u.nome;
end $$;

-- Define o papel de um membro (só Administrador Geral / super-admin)
create or replace function public.definir_papel(p_membro_id uuid, p_papel text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_user uuid;
begin
  if p_papel not in ('admin_geral','tesoureiro','comissao','juiz','jogador') then
    raise exception 'Papel inválido.';
  end if;
  select org_id, user_id into v_org, v_user from public.membros where id = p_membro_id;
  if v_org is null then raise exception 'Vínculo não encontrado.'; end if;
  if not (public.fm_is_super() or public.fm_has_role(v_org, array['admin_geral'])) then
    raise exception 'Apenas o Administrador Geral define papéis.';
  end if;
  if v_user = auth.uid() and not public.fm_is_super() then
    raise exception 'Você não pode alterar o seu próprio papel.';
  end if;
  update public.membros set papel = p_papel where id = p_membro_id;
  insert into public.auditoria (org_id, user_id, acao, entidade, registro_id, detalhe)
  values (v_org, auth.uid(), 'definir_papel', 'membros', p_membro_id, jsonb_build_object('papel', p_papel));
end $$;

-- Bloqueia / reativa um membro (só Administrador Geral / super-admin)
create or replace function public.definir_status_membro(p_membro_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_user uuid;
begin
  if p_status not in ('ativo','bloqueado') then raise exception 'Status inválido.'; end if;
  select org_id, user_id into v_org, v_user from public.membros where id = p_membro_id;
  if v_org is null then raise exception 'Vínculo não encontrado.'; end if;
  if not (public.fm_is_super() or public.fm_has_role(v_org, array['admin_geral'])) then
    raise exception 'Apenas o Administrador Geral pode bloquear/reativar.';
  end if;
  if v_user = auth.uid() and not public.fm_is_super() then
    raise exception 'Você não pode bloquear a si mesmo.';
  end if;
  update public.membros set status = p_status where id = p_membro_id;
  insert into public.auditoria (org_id, user_id, acao, entidade, registro_id, detalhe)
  values (v_org, auth.uid(), 'definir_status_membro', 'membros', p_membro_id, jsonb_build_object('status', p_status));
end $$;

grant execute on function public.membros_do_grupo(uuid)          to authenticated;
grant execute on function public.definir_papel(uuid, text)       to authenticated;
grant execute on function public.definir_status_membro(uuid, text) to authenticated;
