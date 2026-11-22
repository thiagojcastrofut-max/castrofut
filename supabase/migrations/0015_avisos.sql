-- ============================================================================
--  FUTEBOL MANAGER — Migração 0015: Mural de avisos
--
--  Comunicação com o grupo. Comissão/admin publica, edita e exclui; todos leem.
--  (Aniversariantes do mês saem direto de jogadores.nascimento, sem tabela.)
--  Rode no SQL Editor do Supabase.
-- ============================================================================

create table if not exists public.avisos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizacoes(id) on delete cascade,
  titulo        text,
  texto         text not null,
  fixado        boolean not null default false,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists idx_avisos_org on public.avisos(org_id, fixado desc, criado_em desc);

alter table public.avisos enable row level security;

drop policy if exists avisos_sel on public.avisos;
create policy avisos_sel on public.avisos for select using (public.fm_is_member(org_id));
drop policy if exists avisos_wr on public.avisos;
create policy avisos_wr on public.avisos for all
  using (public.fm_has_role(org_id, array['admin_geral','comissao']))
  with check (public.fm_has_role(org_id, array['admin_geral','comissao']));
