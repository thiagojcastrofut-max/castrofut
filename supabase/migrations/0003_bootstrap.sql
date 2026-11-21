-- ============================================================================
--  FUTEBOL MANAGER — Migração 0003: Primeiro acesso (bootstrap do super-admin)
--
--  Problema: o primeiro cadastro não tinha grupo para escolher.
--  Solução: enquanto NÃO existir nenhum super-admin, o primeiro usuário que se
--  cadastrar vira super-admin (sem grupo). Depois disso, o cadastro volta a
--  exigir grupo + aprovação da comissão. Seguro: só vale com a plataforma vazia.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

-- A tela de cadastro usa isto para decidir se mostra o modo "primeiro acesso".
create or replace function public.precisa_bootstrap()
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.usuarios where super_admin);
$$;
grant execute on function public.precisa_bootstrap() to anon, authenticated;

-- Recria o trigger de novo usuário incluindo o bootstrap.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org   uuid;
  v_nome  text := coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1));
  v_super boolean := false;
begin
  -- bootstrap: se ainda não há nenhum super-admin, este primeiro vira super-admin
  if not exists (select 1 from public.usuarios where super_admin) then
    v_super := true;
  end if;

  insert into public.usuarios (id, nome, email, telefone, super_admin)
  values (new.id, v_nome, new.email, new.raw_user_meta_data->>'telefone', v_super)
  on conflict (id) do nothing;

  v_org := nullif(new.raw_user_meta_data->>'org_id','')::uuid;
  if v_org is not null then
    insert into public.jogadores (org_id, user_id, nome, telefone, nascimento,
                                  posicao_principal, posicao_secundaria, pe_dominante)
    values (v_org, new.id, v_nome, new.raw_user_meta_data->>'telefone',
            (nullif(new.raw_user_meta_data->>'nascimento',''))::date,
            nullif(new.raw_user_meta_data->>'posicao_principal',''),
            nullif(new.raw_user_meta_data->>'posicao_secundaria',''),
            nullif(new.raw_user_meta_data->>'pe_dominante',''))
    on conflict (org_id, user_id) do nothing;

    insert into public.membros (org_id, user_id, papel, status)
    values (v_org, new.id, 'jogador', 'pendente')
    on conflict (org_id, user_id) do nothing;
  end if;
  return new;
end $$;
