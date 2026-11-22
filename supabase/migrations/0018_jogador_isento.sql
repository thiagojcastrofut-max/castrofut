-- ============================================================================
--  FUTEBOL MANAGER — Migração 0018: Proteger isenção / valor individual
--
--  jogadores.isento e jogadores.mensalidade_valor já existem (0007) e a geração
--  de mensalidades já respeita a isenção. Aqui blindamos esses campos: só
--  admin/comissão/tesoureiro podem alterá-los (o próprio jogador não se isenta).
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create or replace function public.fm_jogador_protege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- nível técnico e situação: só admin/comissão
  if not public.fm_has_role(old.org_id, array['admin_geral','comissao']) then
    new.nivel_tecnico := old.nivel_tecnico;
    new.situacao      := old.situacao;
  end if;
  -- isenção e valor individual: só admin/comissão/tesoureiro (financeiro)
  if not public.fm_has_role(old.org_id, array['admin_geral','comissao','tesoureiro']) then
    new.isento            := old.isento;
    new.mensalidade_valor := old.mensalidade_valor;
  end if;
  -- grupo e usuário nunca mudam por update
  new.org_id  := old.org_id;
  new.user_id := old.user_id;
  return new;
end $$;
