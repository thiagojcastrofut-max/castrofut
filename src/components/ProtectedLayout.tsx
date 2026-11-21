import { useState } from 'react'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, UserCheck, Building2, LogOut, Menu, X, ShieldCheck,
  Users, Wallet, CalendarDays, Trophy, UserCog, Swords, Shuffle,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { PAPEL_LABEL } from '../lib/types'
import type { Papel } from '../lib/types'

interface Item {
  to: string
  label: string
  icon: typeof LayoutDashboard
  papeis?: Papel[]
  soSuper?: boolean
  emBreve?: boolean
}

const ITENS: Item[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/aprovacoes', label: 'Aprovações', icon: UserCheck, papeis: ['admin_geral', 'comissao'] },
  { to: '/membros', label: 'Membros & Funções', icon: UserCog, papeis: ['admin_geral', 'comissao'] },
  { to: '/jogadores', label: 'Jogadores', icon: Users },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
  { to: '/partidas', label: 'Partidas', icon: CalendarDays },
  { to: '/series', label: 'Séries', icon: Swords },
  { to: '/sorteio', label: 'Sorteio', icon: Shuffle, papeis: ['admin_geral', 'comissao'] },
  { to: '/rankings', label: 'Rankings', icon: Trophy },
  { to: '/grupos', label: 'Grupos (plataforma)', icon: Building2, soSuper: true },
]

export function ProtectedLayout() {
  const { usuario, membros, orgId, membroAtual, selecionarOrg, sair, temPapel } = useAuth()
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)

  const ativos = membros.filter((m) => m.status === 'ativo')
  const superAdmin = !!usuario?.super_admin

  // Sem vínculo ativo e não é super-admin → vai para a tela "sem grupo"
  if (!superAdmin && !membroAtual) return <Navigate to="/sem-grupo" replace />

  const orgAtualObj = ativos.find((m) => m.org_id === orgId)?.organizacao
  const orgNome = orgAtualObj?.nome || (superAdmin ? 'Plataforma' : '—')
  const grupoPausado = !superAdmin && !!orgAtualObj && orgAtualObj.ativo === false

  const itensVisiveis = ITENS.filter((it) => {
    if (it.soSuper) return superAdmin
    if (it.papeis) return temPapel(...it.papeis)
    return true
  })

  async function logout() {
    await sair()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100svh' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240, background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
          padding: '16px 12px', flexShrink: 0, position: 'fixed', inset: '0 auto 0 0', zIndex: 40,
          transform: menuAberto ? 'none' : undefined,
        }}
        className={menuAberto ? 'fm-sidebar aberta' : 'fm-sidebar'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px 16px' }}>
          <span style={{ fontSize: 24 }}>⚽</span>
          <div>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>Futebol Manager</div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{orgNome}</div>
          </div>
          <button className="btn btn-ghost fm-close" style={{ marginLeft: 'auto', padding: 6 }} onClick={() => setMenuAberto(false)}>
            <X size={18} />
          </button>
        </div>

        {/* Seletor de grupo */}
        {ativos.length > 0 && (
          <div style={{ padding: '0 4px 14px' }}>
            <label className="label">Grupo ativo</label>
            <select
              className="input"
              value={orgId || ''}
              onChange={(e) => selecionarOrg(e.target.value)}
            >
              {ativos.map((m) => (
                <option key={m.org_id} value={m.org_id}>
                  {m.organizacao?.nome || m.org_id} · {PAPEL_LABEL[m.papel]}
                </option>
              ))}
            </select>
          </div>
        )}

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {itensVisiveis.map((it) => {
            const Icon = it.icon
            if (it.emBreve) {
              return (
                <div key={it.to} className="fm-nav" style={{ opacity: 0.45, cursor: 'default' }}>
                  <Icon size={18} /> <span>{it.label}</span>
                  <span className="badge" style={{ marginLeft: 'auto', background: 'var(--bg-elev)', color: 'var(--text-hint)' }}>em breve</span>
                </div>
              )
            }
            return (
              <NavLink
                key={it.to}
                to={it.to}
                end={it.to === '/'}
                className="fm-nav"
                onClick={() => setMenuAberto(false)}
              >
                <Icon size={18} /> <span>{it.label}</span>
              </NavLink>
            )
          })}
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: 16 }}>
          {superAdmin && (
            <div className="badge" style={{ background: 'rgba(59,130,246,.15)', color: '#60a5fa', marginBottom: 10 }}>
              <ShieldCheck size={13} /> Super-admin
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{usuario?.nome || 'Usuário'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 10 }}>{usuario?.email}</div>
          <button className="btn btn-outline" style={{ width: '100%' }} onClick={logout}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>

      {/* Overlay mobile */}
      {menuAberto && <div className="fm-overlay" onClick={() => setMenuAberto(false)} />}

      {/* Conteúdo */}
      <div style={{ flex: 1, minWidth: 0 }} className="fm-main">
        <header className="fm-topbar">
          <button className="btn btn-ghost fm-burger" style={{ padding: 8 }} onClick={() => setMenuAberto(true)}>
            <Menu size={20} />
          </button>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{orgNome}</span>
        </header>
        <main style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
          {grupoPausado ? (
            <div className="card" style={{ padding: 30, textAlign: 'center', maxWidth: 460, margin: '40px auto' }}>
              <div style={{ fontSize: 36 }}>⏸️</div>
              <h2 style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', margin: '10px 0 6px' }}>Grupo pausado</h2>
              <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                O grupo <b>{orgNome}</b> está temporariamente suspenso. Fale com o administrador para regularizar o acesso.
              </p>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  )
}
