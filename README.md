# ⚽ Futebol Manager

Sistema de gestão de grupos de futebol/pelada — **multi-tenant** (vários grupos),
com financeiro, partidas, estatísticas, sorteios, séries, rankings e premiações.

**Stack:** React + TypeScript + Vite · Tailwind v4 · Supabase (Postgres + Auth + RLS) ·
TanStack Query · PWA (instalável no celular/tablet) · deploy na Vercel.

---

## Status — Etapa 1 (fundação) ✅

- Login/senha + recuperação de senha (Supabase Auth)
- **Auto-cadastro** do jogador → validação pela **comissão** (aprovação)
- **Multi-tenant**: grupos (organizações) isolados por `org_id` + **RLS**
- Seletor de grupo (um usuário pode estar em vários grupos)
- Papéis: `admin_geral` · `tesoureiro` · `comissao` · `juiz` · `jogador` (+ super-admin da plataforma)
- PWA instalável

Próximas etapas: Jogadores → Tesouraria → Partidas/estatísticas → Sorteios/séries → Rankings → Relatórios.

---

## Como rodar localmente

```bash
npm install
cp .env.example .env     # preencha com os dados do seu Supabase
npm run dev
```

### 1) Configurar o Supabase
No painel do Supabase → **Settings → API**, copie para o `.env`:

```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 2) Criar as tabelas
No Supabase → **SQL Editor**, cole e rode o arquivo
[`supabase/migrations/0001_fundacao.sql`](supabase/migrations/0001_fundacao.sql).

### 3) Tornar-se super-admin
Crie sua conta pela tela **"Criar conta"** (ou pelo Auth do Supabase) e rode no SQL Editor:

```sql
update public.usuarios set super_admin = true
where id = (select id from auth.users where email = 'SEU_EMAIL');
```

Pronto — faça login e você verá **Grupos (plataforma)** para criar o primeiro grupo (ex.: Caveira).

---

## Publicar

### GitHub (repo vazio já criado por você)
```bash
git remote add origin https://github.com/thiagojcastrofut-max/<repo>.git
git push -u origin main
```

### Vercel
1. Importe o repositório na Vercel.
2. Em **Settings → Environment Variables**, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
3. Deploy (build: `npm run build`, output: `dist`).

> Nunca commite o arquivo `.env` (já está no `.gitignore`). A *service role key* do Supabase
> **não** é usada no front-end e não deve ir para este projeto.
