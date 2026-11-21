import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, Users, Goal, Wallet, UserCheck, Clock, MapPin, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PAPEL_LABEL } from '../lib/types'

const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hojeISO = () => new Date().toISOString().slice(0, 10)
const diaSemana = (d: string) => new Date(d + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })

export default function Dashboard() {
  const { orgId, usuario, membroAtual, membros, temPapel } = useAuth()
  const navigate = useNavigate()
  const org = membros.find((m) => m.org_id === orgId)?.organizacao
  const papel = usuario?.super_admin ? 'Super-admin' : membroAtual ? PAPEL_LABEL[membroAtual.papel] : '—'
  const podeFin = temPapel('admin_geral', 'tesoureiro', 'comissao')
  const podeAprovar = temPapel('admin_geral', 'comissao')

  const { data: prox } = useQuery({
    queryKey: ['dash-prox', orgId], enabled: !!orgId,
    queryFn: async () => {
      const { data } = await supabase.from('partidas').select('*, presencas(status)').eq('org_id', orgId).eq('status', 'agendada').gte('data', hojeISO()).order('data').limit(1)
      return (data?.[0] as { id: string; data: string; hora: string | null; local: string | null; presencas?: { status: string }[] }) || null
    },
  })
  const { data: nAtivos } = useQuery({
    queryKey: ['dash-ativos', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('jogadores').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('situacao', 'ativo')).count || 0,
  })
  const { data: artil } = useQuery({
    queryKey: ['dash-artil', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('vw_estatisticas').select('nome,apelido,gols').eq('org_id', orgId).order('gols', { ascending: false }).limit(1)).data?.[0] as { nome: string; apelido: string | null; gols: number } | undefined,
  })
  const { data: nPend } = useQuery({
    queryKey: ['dash-pend', orgId], enabled: !!orgId && podeAprovar,
    queryFn: async () => (await supabase.from('membros').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pendente')).count || 0,
  })
  const { data: fin } = useQuery({
    queryKey: ['dash-fin', orgId], enabled: !!orgId && podeFin,
    queryFn: async () => {
      const [m, l, p] = await Promise.all([
        supabase.from('mensalidades').select('valor,desconto,valor_pago,status').eq('org_id', orgId),
        supabase.from('lancamentos').select('tipo,valor').eq('org_id', orgId),
        supabase.from('pagamentos').select('valor').eq('org_id', orgId),
      ])
      const aReceber = (m.data || []).filter((x) => x.status === 'aberta' || x.status === 'parcial').reduce((s, x) => s + (x.valor - x.desconto - x.valor_pago), 0)
      const rec = (l.data || []).filter((x) => x.tipo === 'receita').reduce((s, x) => s + x.valor, 0) + (p.data || []).reduce((s, x) => s + x.valor, 0)
      const desp = (l.data || []).filter((x) => x.tipo === 'despesa').reduce((s, x) => s + x.valor, 0)
      return { aReceber, saldo: rec - desp }
    },
  })

  const confirmados = prox?.presencas?.filter((x) => x.status === 'confirmado').length || 0
  const artName = artil && artil.gols > 0 ? (artil.apelido || artil.nome) : '—'

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Olá, {usuario?.nome?.split(' ')[0] || ''}! 👋</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 18px' }}>{org?.nome ? <>Grupo <b>{org.nome}</b> · {papel}</> : <>Perfil: {papel}</>}</p>

      {/* Próxima partida */}
      <button className="card" onClick={() => navigate('/partidas')} style={{ width: '100%', padding: 18, marginBottom: 14, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: 11, background: 'rgba(15,138,60,.15)', display: 'grid', placeItems: 'center' }}><CalendarDays size={22} color="var(--grass-light)" /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', textTransform: 'uppercase', fontWeight: 700 }}>Próxima partida</div>
          {prox ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', textTransform: 'capitalize' }}>{diaSemana(prox.data)}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {prox.hora && <span><Clock size={12} /> {prox.hora.slice(0, 5)}</span>}
                {prox.local && <span><MapPin size={12} /> {prox.local}</span>}
                <span>{confirmados} confirmado(s)</span>
              </div>
            </>
          ) : <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>Nenhuma agendada</div>}
        </div>
        <ChevronRight size={18} color="var(--text-hint)" />
      </button>

      {/* Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
        <Card icon={Users} label="Jogadores ativos" valor={String(nAtivos ?? '—')} onClick={() => navigate('/jogadores')} />
        <Card icon={Goal} label="Artilheiro" valor={artName} sub={artil && artil.gols > 0 ? `${artil.gols} gols` : ''} onClick={() => navigate('/rankings')} />
        {podeFin && fin && <Card icon={Wallet} label="A receber" valor={brl(fin.aReceber)} cor="var(--warn)" onClick={() => navigate('/financeiro')} />}
        {podeFin && fin && <Card icon={Wallet} label="Saldo em caixa" valor={brl(fin.saldo)} cor="var(--grass-light)" onClick={() => navigate('/financeiro')} />}
        {podeAprovar && (nPend ?? 0) > 0 && <Card icon={UserCheck} label="Cadastros pendentes" valor={String(nPend)} cor="var(--warn)" onClick={() => navigate('/aprovacoes')} />}
      </div>
    </div>
  )
}

function Card({ icon: Icon, label, valor, sub, cor, onClick }: { icon: typeof Users; label: string; valor: string; sub?: string; cor?: string; onClick?: () => void }) {
  return (
    <button className="card" onClick={onClick} style={{ padding: 16, textAlign: 'left', cursor: onClick ? 'pointer' : 'default', display: 'block', width: '100%' }}>
      <Icon size={20} color={cor || 'var(--grass-light)'} />
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || 'var(--text)', marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{label}{sub ? ` · ${sub}` : ''}</div>
    </button>
  )
}
