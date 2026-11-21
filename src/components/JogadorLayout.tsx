import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Home, CalendarDays, Swords, Wallet, Trophy, LogOut, ChevronDown } from 'lucide-react'
import { useAuth } from '../lib/auth'

const NAV = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/partidas', label: 'Partidas', icon: CalendarDays },
  { to: '/series', label: 'Séries', icon: Swords },
  { to: '/rankings', label: 'Ranking', icon: Trophy },
  { to: '/financeiro', label: 'Financeiro', icon: Wallet },
]

export function JogadorLayout() {
  const { usuario, membros, orgId, selecionarOrg, sair } = useAuth()
  const navigate = useNavigate()
  const [menu, setMenu] = useState(false)
  const ativos = membros.filter((m) => m.status === 'ativo')
  const org = ativos.find((m) => m.org_id === orgId)?.organizacao

  async function logout() { await sair(); navigate('/login') }

  return (
    <div className="jg-wrap">
      <header className="jg-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {org?.logo_url ? <img src={org.logo_url} width={30} height={30} style={{ borderRadius: 7 }} /> : <span style={{ fontSize: 22 }}>⚽</span>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{org?.nome || 'Futebol'}</div>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button className="btn btn-ghost" style={{ padding: '6px 8px' }} onClick={() => setMenu((v) => !v)}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usuario?.nome?.split(' ')[0]}</span>
            <ChevronDown size={15} />
          </button>
          {menu && (
            <>
              <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 41, width: 220, padding: 8, boxShadow: '0 10px 30px rgba(0,0,0,.5)' }}>
                {ativos.length > 1 && (
                  <>
                    <div style={{ fontSize: 10, color: 'var(--text-hint)', textTransform: 'uppercase', padding: '4px 8px' }}>Trocar de grupo</div>
                    {ativos.map((m) => (
                      <button key={m.org_id} onClick={() => { selecionarOrg(m.org_id); setMenu(false) }}
                        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px', borderRadius: 7, border: 'none', background: m.org_id === orgId ? 'var(--bg-elev)' : 'transparent', color: 'var(--text)', fontSize: 13.5, cursor: 'pointer' }}>
                        {m.organizacao?.nome}
                      </button>
                    ))}
                    <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
                  </>
                )}
                <button onClick={logout} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '8px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 13.5, cursor: 'pointer' }}>
                  <LogOut size={15} /> Sair
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="jg-main"><Outlet /></main>

      <nav className="jg-bottom">
        {NAV.map((n) => {
          const Icon = n.icon
          return (
            <NavLink key={n.to} to={n.to} end={n.end} className="jg-tab">
              <Icon size={21} /><span>{n.label}</span>
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}
