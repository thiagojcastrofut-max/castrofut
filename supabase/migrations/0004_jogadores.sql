-- ============================================================================
--  FUTEBOL MANAGER — Migração 0004: Módulo Jogadores
--
--  - Protege colunas sensíveis (nivel_tecnico, situacao) via trigger:
--    o próprio jogador edita seu perfil, MAS só admin/comissão mudam o nível
--    técnico e a situação (ativo/inativo). O grupo e o vínculo nunca mudam.
--  - Cria o bucket de Storage "fotos" (leitura pública, upload autenticado).
--  Rode no SQL Editor do Supabase.
-- ============================================================================

-- ---------- Proteção de colunas no UPDATE de jogadores ----------
create or replace function public.fm_jogador_protege()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Quem NÃO é admin/comissão (ex.: o próprio jogador) não altera estas colunas
  if not public.fm_has_role(old.org_id, array['admin_geral','comissao']) then
    new.nivel_tecnico := old.nivel_tecnico;
    new.situacao      := old.situacao;
  end if;
  -- Ninguém troca o jogador de grupo nem reatribui o usuário por update
  new.org_id  := old.org_id;
  new.user_id := old.user_id;
  return new;
end $$;

drop trigger if exists trg_jogador_protege on public.jogadores;
create trigger trg_jogador_protege
  before update on public.jogadores
  for each row execute function public.fm_jogador_protege();

-- ---------- Storage: bucket de fotos ----------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', true)
on conflict (id) do nothing;

-- Leitura pública das fotos
drop policy if exists fotos_select on storage.objects;
create policy fotos_select on storage.objects for select
  using (bucket_id = 'fotos');

-- Upload / alteração / remoção por usuários autenticados (no bucket fotos)
drop policy if exists fotos_insert on storage.objects;
create policy fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos');
drop policy if exists fotos_update on storage.objects;
create policy fotos_update on storage.objects for update to authenticated
  using (bucket_id = 'fotos') with check (bucket_id = 'fotos');
drop policy if exists fotos_delete on storage.objects;
create policy fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos');
