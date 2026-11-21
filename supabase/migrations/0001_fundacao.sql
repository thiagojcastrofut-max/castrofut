-- ============================================================================
--  FUTEBOL MANAGER — Migração 0001: Fundação multi-tenant
--  Rode este arquivo no Supabase (SQL Editor). Idempotente onde possível.
--
--  Cria: organizacoes, usuarios, membros, jogadores, auditoria
--        + funções de permissão + trigger de auto-cadastro + RPCs + RLS.
-- ============================================================================

-- ---------- Extensões ----------
create extension if not exists pgcrypto;

-- ============================================================================
--  TABELAS
-- ============================================================================

create table if not exists public.usuarios (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  email       text,
  telefone    text,
  foto_url    text,
  super_admin boolean not null default false,
  criado_em   timestamptz not null default now()
);

create table if not exists public.organizacoes (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  slug               text not null unique,
  logo_url           text,
  cor_primaria       text,
  pix_chave          text,
  pix_titular        text,
  banco              text,
  mensalidade_padrao numeric(10,2),
  ativo              boolean not null default true,
  criado_por         uuid references public.usuarios(id),
  criado_em          timestamptz not null default now()
);

create table if not exists public.membros (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references public.organizacoes(id) on delete cascade,
  user_id   uuid not null references public.usuarios(id) on delete cascade,
  papel     text not null default 'jogador' check (papel in ('admin_geral','tesoureiro','comissao','juiz','jogador')),
  status    text not null default 'pendente' check (status in ('pendente','ativo','recusado','bloqueado')),
  criado_em timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_membros_org    on public.membros(org_id);
create index if not exists idx_membros_user   on public.membros(user_id);
create index if not exists idx_membros_status on public.membros(org_id, status);

create table if not exists public.jogadores (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references public.organizacoes(id) on delete cascade,
  user_id            uuid references public.usuarios(id) on delete set null,
  nome               text not null,
  apelido            text,
  foto_url           text,
  telefone           text,
  nascimento         date,
  posicao_principal  text,
  posicao_secundaria text,
  pe_dominante       text,
  nivel_tecnico      smallint check (nivel_tecnico between 1 and 5),
  situacao           text not null default 'ativo' check (situacao in ('ativo','inativo')),
  data_entrada       date default current_date,
  obs                text,
  criado_em          timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists idx_jogadores_org on public.jogadores(org_id);

create table if not exists public.auditoria (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid,
  user_id     uuid,
  acao        text not null,
  entidade    text,
  registro_id uuid,
  detalhe     jsonb,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_auditoria_org on public.auditoria(org_id, criado_em desc);

-- ============================================================================
--  FUNÇÕES DE PERMISSÃO (SECURITY DEFINER evita recursão de RLS)
-- ============================================================================

create or replace function public.fm_is_super()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select super_admin from public.usuarios where id = auth.uid()), false);
$$;

create or replace function public.fm_is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros
    where org_id = p_org and user_id = auth.uid() and status = 'ativo'
  );
$$;

create or replace function public.fm_has_role(p_org uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.fm_is_super() or exists (
    select 1 from public.membros
    where org_id = p_org and user_id = auth.uid() and status = 'ativo' and papel = any(p_roles)
  );
$$;

-- ============================================================================
--  TRIGGER: novo usuário no Auth -> cria perfil + (se veio org) ficha + vínculo
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_org uuid;
  v_nome text := coalesce(nullif(new.raw_user_meta_data->>'nome',''), split_part(new.email,'@',1));
begin
  insert into public.usuarios (id, nome, email, telefone)
  values (new.id, v_nome, new.email, new.raw_user_meta_data->>'telefone')
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
--  RPCs
-- ============================================================================

-- Lista de grupos ativos para a tela de cadastro (pública)
create or replace function public.orgs_para_cadastro()
returns table (id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select id, nome from public.organizacoes where ativo order by nome;
$$;

-- Cadastros pendentes de um grupo (só admin/comissão/super)
create or replace function public.cadastros_pendentes(p_org_id uuid)
returns table (membro_id uuid, nome text, email text, telefone text,
               posicao_principal text, pe_dominante text, criado_em timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.fm_has_role(p_org_id, array['admin_geral','comissao']) then
    raise exception 'Sem permissão para ver cadastros deste grupo.';
  end if;
  return query
    select m.id, u.nome, u.email, u.telefone, j.posicao_principal, j.pe_dominante, m.criado_em
    from public.membros m
    join public.usuarios u on u.id = m.user_id
    left join public.jogadores j on j.org_id = m.org_id and j.user_id = m.user_id
    where m.org_id = p_org_id and m.status = 'pendente'
    order by m.criado_em;
end $$;

create or replace function public.aprovar_membro(p_membro_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.membros where id = p_membro_id;
  if v_org is null then raise exception 'Vínculo não encontrado.'; end if;
  if not public.fm_has_role(v_org, array['admin_geral','comissao']) then
    raise exception 'Sem permissão para aprovar neste grupo.';
  end if;
  update public.membros set status = 'ativo' where id = p_membro_id;
  insert into public.auditoria (org_id, user_id, acao, entidade, registro_id)
  values (v_org, auth.uid(), 'aprovar_membro', 'membros', p_membro_id);
end $$;

create or replace function public.recusar_membro(p_membro_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  select org_id into v_org from public.membros where id = p_membro_id;
  if v_org is null then raise exception 'Vínculo não encontrado.'; end if;
  if not public.fm_has_role(v_org, array['admin_geral','comissao']) then
    raise exception 'Sem permissão.';
  end if;
  update public.membros set status = 'recusado' where id = p_membro_id;
  insert into public.auditoria (org_id, user_id, acao, entidade, registro_id)
  values (v_org, auth.uid(), 'recusar_membro', 'membros', p_membro_id);
end $$;

-- Cria um grupo (só super-admin) e torna o criador Administrador Geral ativo
create or replace function public.criar_org(p_nome text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.fm_is_super() then raise exception 'Apenas o super-admin cria grupos.'; end if;
  insert into public.organizacoes (nome, slug, criado_por)
  values (p_nome, p_slug, auth.uid())
  returning id into v_id;
  insert into public.membros (org_id, user_id, papel, status)
  values (v_id, auth.uid(), 'admin_geral', 'ativo')
  on conflict (org_id, user_id) do update set papel = 'admin_geral', status = 'ativo';
  insert into public.auditoria (org_id, user_id, acao, entidade, registro_id)
  values (v_id, auth.uid(), 'criar_org', 'organizacoes', v_id);
  return v_id;
end $$;

grant execute on function public.orgs_para_cadastro()       to anon, authenticated;
grant execute on function public.cadastros_pendentes(uuid)  to authenticated;
grant execute on function public.aprovar_membro(uuid)       to authenticated;
grant execute on function public.recusar_membro(uuid)       to authenticated;
grant execute on function public.criar_org(text, text)      to authenticated;

-- ============================================================================
--  RLS
-- ============================================================================
alter table public.usuarios     enable row level security;
alter table public.organizacoes enable row level security;
alter table public.membros      enable row level security;
alter table public.jogadores    enable row level security;
alter table public.auditoria    enable row level security;

-- GRANTs de tabela: o Supabase não concede automático em tabelas criadas via SQL.
-- Sem isto o PostgREST devolve 42501 antes do RLS. (anon usa só os RPCs + Auth.)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.usuarios     to authenticated;
grant select, insert, update, delete on public.organizacoes to authenticated;
grant select, insert, update, delete on public.membros      to authenticated;
grant select, insert, update, delete on public.jogadores    to authenticated;
grant select                         on public.auditoria     to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

-- usuarios: lê o próprio perfil (ou super); edita o próprio
drop policy if exists usuarios_sel on public.usuarios;
create policy usuarios_sel on public.usuarios for select
  using (id = auth.uid() or public.fm_is_super());
drop policy if exists usuarios_upd on public.usuarios;
create policy usuarios_upd on public.usuarios for update
  using (id = auth.uid() or public.fm_is_super());

-- organizacoes: super vê tudo; membro (qualquer status) vê o seu grupo
drop policy if exists org_sel on public.organizacoes;
create policy org_sel on public.organizacoes for select
  using (public.fm_is_super() or exists (
    select 1 from public.membros m where m.org_id = id and m.user_id = auth.uid()));
drop policy if exists org_all_super on public.organizacoes;
create policy org_all_super on public.organizacoes for all
  using (public.fm_is_super()) with check (public.fm_is_super());

-- membros: vê os próprios; admin/comissão veem os do grupo; super vê tudo
drop policy if exists membros_sel on public.membros;
create policy membros_sel on public.membros for select
  using (user_id = auth.uid() or public.fm_has_role(org_id, array['admin_geral','comissao']));
drop policy if exists membros_upd on public.membros;
create policy membros_upd on public.membros for update
  using (public.fm_has_role(org_id, array['admin_geral','comissao']))
  with check (public.fm_has_role(org_id, array['admin_geral','comissao']));

-- jogadores: membros ativos do grupo veem; o próprio jogador vê/edita o seu
drop policy if exists jog_sel on public.jogadores;
create policy jog_sel on public.jogadores for select
  using (user_id = auth.uid() or public.fm_is_member(org_id));
drop policy if exists jog_upd on public.jogadores;
create policy jog_upd on public.jogadores for update
  using (user_id = auth.uid() or public.fm_has_role(org_id, array['admin_geral','comissao']))
  with check (user_id = auth.uid() or public.fm_has_role(org_id, array['admin_geral','comissao']));

-- auditoria: só admin/super leem
drop policy if exists aud_sel on public.auditoria;
create policy aud_sel on public.auditoria for select
  using (public.fm_has_role(org_id, array['admin_geral']));

-- ============================================================================
--  COMO TORNAR VOCÊ (THIAGO) SUPER-ADMIN:
--  1) Crie sua conta pelo app (tela "Criar conta") OU pelo Auth do Supabase.
--  2) Rode (troque o e-mail):
--     update public.usuarios set super_admin = true
--     where id = (select id from auth.users where email = 'thiagojcastrofut@gmail.com');
-- ============================================================================
