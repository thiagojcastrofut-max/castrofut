import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, supabaseConfigurado } from './supabase'
import type { Membro, Usuario, Papel } from './types'

const ORG_KEY = 'fm_org_atual'

interface AuthState {
  carregando: boolean
  session: Session | null
  usuario: Usuario | null
  membros: Membro[]
  orgId: string | null
  /** vínculo ativo do usuário no grupo selecionado */
  membroAtual: Membro | null
  configurado: boolean
}

interface AuthCtx extends AuthState {
  entrar: (email: string, senha: string) => Promise<void>
  sair: () => Promise<void>
  recarregar: () => Promise<void>
  selecionarOrg: (orgId: string) => void
  temPapel: (...papeis: Papel[]) => boolean
}

const Ctx = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    carregando: true,
    session: null,
    usuario: null,
    membros: [],
    orgId: localStorage.getItem(ORG_KEY),
    membroAtual: null,
    configurado: supabaseConfigurado,
  })

  const carregarPerfil = useCallback(async (session: Session | null) => {
    if (!session) {
      setState((s) => ({ ...s, carregando: false, session: null, usuario: null, membros: [], membroAtual: null }))
      return
    }
    try {
      const [{ data: perfil }, { data: vinculos }] = await Promise.all([
        supabase.from('usuarios').select('*').eq('id', session.user.id).maybeSingle(),
        supabase.from('membros').select('*, organizacao:organizacoes(*)').eq('user_id', session.user.id),
      ])
      const membros = (vinculos || []) as Membro[]
      const ativos = membros.filter((m) => m.status === 'ativo')
      let orgId = localStorage.getItem(ORG_KEY)
      if (!orgId || !ativos.some((m) => m.org_id === orgId)) orgId = ativos[0]?.org_id || null
      if (orgId) localStorage.setItem(ORG_KEY, orgId)
      const membroAtual = membros.find((m) => m.org_id === orgId) || null
      setState((s) => ({
        ...s,
        carregando: false,
        session,
        usuario: (perfil as Usuario) || null,
        membros,
        orgId,
        membroAtual,
      }))
    } catch {
      setState((s) => ({ ...s, carregando: false, session }))
    }
  }, [])

  useEffect(() => {
    if (!supabaseConfigurado) {
      setState((s) => ({ ...s, carregando: false }))
      return
    }
    supabase.auth.getSession().then(({ data }) => carregarPerfil(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => carregarPerfil(session))
    return () => sub.subscription.unsubscribe()
  }, [carregarPerfil])

  const entrar = useCallback(async (email: string, senha: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) throw error
  }, [])

  const sair = useCallback(async () => {
    await supabase.auth.signOut()
    setState((s) => ({ ...s, session: null, usuario: null, membros: [], membroAtual: null }))
  }, [])

  const recarregar = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await carregarPerfil(data.session)
  }, [carregarPerfil])

  const selecionarOrg = useCallback((orgId: string) => {
    localStorage.setItem(ORG_KEY, orgId)
    setState((s) => ({ ...s, orgId, membroAtual: s.membros.find((m) => m.org_id === orgId) || null }))
  }, [])

  const temPapel = useCallback(
    (...papeis: Papel[]) => {
      if (state.usuario?.super_admin) return true
      const p = state.membroAtual
      return !!p && p.status === 'ativo' && papeis.includes(p.papel)
    },
    [state.usuario, state.membroAtual],
  )

  return (
    <Ctx.Provider value={{ ...state, entrar, sair, recarregar, selecionarOrg, temPapel }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
