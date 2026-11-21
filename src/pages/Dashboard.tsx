import { useAuth } from '../lib/auth'
import { PAPEL_LABEL } from '../lib/types'
import { CalendarDays, Users, Trophy, Wallet } from 'lucide-react'

export default function Dashboard() {
  const { usuario, membroAtual, membros, orgId } = useAuth()
  const orgNome = membros.find((m) => m.org_id === orgId)?.organizacao?.nome
  const papel = usuario?.super_admin ? 'Super-admin' : membroAtual ? PAPEL_LABEL[membroAtual.papel] : '—'

  const cards = [
    { icon: CalendarDays, label: 'Próxima partida', valor: '—' },
    { icon: Users, label: 'Jogadores ativos', valor: '—' },
    { icon: Trophy, label: 'Artilheiro', valor: '—' },
    { icon: Wallet, label: 'Saldo', valor: '—' },
  ]

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>
        Olá, {usuario?.nome?.split(' ')[0] || 'jogador'}! 👋
      </h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px' }}>
        {orgNome ? <>Grupo <b>{orgNome}</b> · {papel}</> : <>Perfil: {papel}</>}
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        {cards.map((c) => {
          const Icon = c.icon
          return (
            <div key={c.label} className="card" style={{ padding: 16 }}>
              <Icon size={20} color="var(--grass-light)" />
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', marginTop: 8 }}>{c.valor}</div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{c.label}</div>
            </div>
          )
        })}
      </div>

      <div className="card" style={{ padding: 18, marginTop: 20 }}>
        <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>🚧 Em construção — Etapa 1 (fundação)</div>
        <p style={{ fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
          A base está pronta: login/senha, auto-cadastro com aprovação da comissão, grupos (multi-tenant) e seletor de grupo.
          Os módulos de <b>Jogadores, Financeiro, Partidas e Rankings</b> entram nas próximas etapas.
        </p>
      </div>
    </div>
  )
}
