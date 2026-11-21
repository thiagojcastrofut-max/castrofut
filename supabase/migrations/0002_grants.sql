-- ============================================================================
--  FUTEBOL MANAGER — Migração 0002: GRANTs de tabela
--
--  O Supabase atual NÃO concede privilégios automáticos ao papel `authenticated`
--  em tabelas criadas via SQL. Sem GRANT, o PostgREST devolve 42501
--  ("permission denied") ANTES mesmo do RLS. O RLS continua sendo a camada que
--  decide QUAIS linhas cada um vê; o GRANT só habilita o acesso à tabela.
--
--  anon NÃO recebe acesso às tabelas (usa apenas os RPCs SECURITY DEFINER
--  e o Auth) — mantém a superfície pública mínima.
--  Rode no SQL Editor do Supabase.
-- ============================================================================

grant usage on schema public to anon, authenticated;

-- Tabelas acessadas diretamente pelo app (o RLS restringe as linhas)
grant select, insert, update, delete on public.usuarios     to authenticated;
grant select, insert, update, delete on public.organizacoes to authenticated;
grant select, insert, update, delete on public.membros      to authenticated;
grant select, insert, update, delete on public.jogadores    to authenticated;
grant select                         on public.auditoria     to authenticated;

-- Tabelas criadas nas PRÓXIMAS migrações já herdam os privilégios
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;
