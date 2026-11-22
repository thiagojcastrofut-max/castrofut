import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Trophy, ArrowLeft, Trash2, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Prem { id: string; org_id: string; titulo: string; inicio: string; fim: string; status: string }
interface EstPer { jogador_id: string; nome: string; apelido: string | null; foto_url: string | null; gols: number; assistencias: number; presencas: number }
interface Item { id: string; categoria: string; nome: string | null; apelido: string | null; foto_url: string | null; valor: number | null; posicao: number | null }

const CATS = [
  { k: 'artilheiro', l: 'Artilheiro', icon: '⚽', campo: 'gols' as const, sufixo: 'gols' },
  { k: 'assistencias', l: 'Assistências', icon: '👟', campo: 'assistencias' as const, sufixo: 'assist.' },
  { k: 'presenca', l: 'Presença', icon: '📅', campo: 'presencas' as const, sufixo: 'jogos' },
]
const apel = (x: { nome: string | null; apelido: string | null }) => x.apelido || x.nome || '—'
const medal = (p: number) => p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : `${p}º`

export default function Premiacoes() {
  const { orgId, temPapel } = useAuth()
  const podeGerir = temPapel('admin_geral', 'comissao')
  const [sel, setSel] = useState<Prem | null>(null)
  const [criar, setCriar] = useState(false)
  const { data } = useQuery({
    queryKey: ['premiacoes', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Prem[]> => (await supabase.from('premiacoes').select('*').eq('org_id', orgId).order('criado_em', { ascending: false })).data as Prem[] || [],
  })
  if (sel) return <Detalhe prem={sel} podeGerir={podeGerir} onVoltar={() => setSel(null)} />
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Premiações</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Campeões por período — galeria dos vencedores.</p>
        </div>
        {podeGerir && <button className="btn btn-primary" onClick={() => setCriar(true)}><Plus size={16} /> Nova premiação</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(data || []).map((p) => (
          <button key={p.id} className="card" onClick={() => setSel(p)} style={{ padding: 14, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Trophy size={20} color="#f5c518" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{p.titulo}</div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{new Date(p.inicio + 'T00:00').toLocaleDateString('pt-BR')} a {new Date(p.fim + 'T00:00').toLocaleDateString('pt-BR')}</div>
            </div>
            <span className="badge" style={{ background: p.status === 'homologado' ? 'rgba(15,138,60,.15)' : 'rgba(245,158,11,.15)', color: p.status === 'homologado' ? 'var(--grass-light)' : 'var(--warn)' }}>{p.status === 'homologado' ? 'Homologada' : 'Rascunho'}</span>
          </button>
        ))}
        {data && data.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhuma premiação ainda.</div>}
      </div>
      {criar && <CriarPrem orgId={orgId!} onClose={() => setCriar(false)} onCriada={(p) => { setCriar(false); setSel(p) }} />}
    </div>
  )
}

function Detalhe({ prem, podeGerir, onVoltar }: { prem: Prem; podeGerir: boolean; onVoltar: () => void }) {
  const { orgId } = useAuth()
  const qc = useQueryClient()
  const homolog = prem.status === 'homologado'
  const { data: itens } = useQuery({
    queryKey: ['prem-itens', prem.id], enabled: homolog,
    queryFn: async (): Promise<Item[]> => (await supabase.from('premiacoes_itens').select('*').eq('premiacao_id', prem.id).order('posicao')).data as Item[] || [],
  })
  const { data: preview } = useQuery({
    queryKey: ['prem-prev', prem.id], enabled: !homolog,
    queryFn: async (): Promise<EstPer[]> => (await supabase.rpc('estatisticas_periodo', { p_org: orgId, p_ini: prem.inicio, p_fim: prem.fim })).data as EstPer[] || [],
  })
  const homologar = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('homologar_premiacao', { p_id: prem.id }); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['premiacoes', orgId] }); qc.invalidateQueries({ queryKey: ['prem-itens', prem.id] }); onVoltar() }, onError: (e) => alert((e as Error).message),
  })
  const excluir = useMutation({
    mutationFn: async () => { const { error } = await supabase.from('premiacoes').delete().eq('id', prem.id); if (error) throw error },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['premiacoes', orgId] }); onVoltar() }, onError: (e) => alert((e as Error).message),
  })

  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 10, padding: '4px 8px' }} onClick={onVoltar}><ArrowLeft size={16} /> Voltar</button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>🏆 {prem.titulo}</h1>
          <div style={{ fontSize: 12.5, color: 'var(--text-hint)' }}>{new Date(prem.inicio + 'T00:00').toLocaleDateString('pt-BR')} a {new Date(prem.fim + 'T00:00').toLocaleDateString('pt-BR')}</div>
        </div>
        {podeGerir && (
          <div style={{ display: 'flex', gap: 6 }}>
            {!homolog && <button className="btn btn-primary" disabled={homologar.isPending} onClick={() => { if (confirm('Homologar congela os campeões deste período. Continuar?')) homologar.mutate() }}><CheckCircle2 size={15} /> Homologar</button>}
            <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)', padding: '7px 10px' }} onClick={() => { if (confirm('Excluir esta premiação?')) excluir.mutate() }}><Trash2 size={15} /></button>
          </div>
        )}
      </div>

      {!homolog && <div className="badge" style={{ background: 'rgba(245,158,11,.15)', color: 'var(--warn)', marginBottom: 12 }}>Prévia (ainda não homologada)</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 14 }}>
        {CATS.map((c) => {
          const lista: { nome: string | null; apelido: string | null; foto_url: string | null; valor: number; posicao: number }[] =
            homolog
              ? (itens || []).filter((i) => i.categoria === c.k).map((i) => ({ nome: i.nome, apelido: i.apelido, foto_url: i.foto_url, valor: i.valor || 0, posicao: i.posicao || 0 }))
              : [...(preview || [])].sort((a, b) => b[c.campo] - a[c.campo]).filter((e) => e[c.campo] > 0).slice(0, 3).map((e, idx) => ({ nome: e.nome, apelido: e.apelido, foto_url: e.foto_url, valor: e[c.campo], posicao: idx + 1 }))
          return (
            <div key={c.k} className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{c.icon} {c.l}</div>
              {lista.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>Sem dados no período.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lista.map((x, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 24, textAlign: 'center', fontSize: x.posicao <= 3 ? 16 : 12 }}>{medal(x.posicao)}</span>
                      {x.foto_url ? <img src={x.foto_url} width={32} height={32} style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elev)', color: 'var(--grass-light)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{apel(x).slice(0, 2).toUpperCase()}</div>}
                      <span style={{ flex: 1, color: 'var(--text)', fontWeight: i === 0 ? 700 : 500 }}>{apel(x)}</span>
                      <b style={{ color: 'var(--grass-light)' }}>{x.valor}</b><span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{c.sufixo}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CriarPrem({ orgId, onClose, onCriada }: { orgId: string; onClose: () => void; onCriada: (p: Prem) => void }) {
  const hoje = new Date()
  const ym = (d: Date) => d.toISOString().slice(0, 10)
  const [titulo, setTitulo] = useState('')
  const [ini, setIni] = useState(ym(new Date(hoje.getFullYear(), hoje.getMonth(), 1)))
  const [fim, setFim] = useState(ym(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)))
  const [erro, setErro] = useState('')
  const preset = (tipo: string) => {
    const y = hoje.getFullYear(), m = hoje.getMonth()
    if (tipo === 'mes') { setIni(ym(new Date(y, m, 1))); setFim(ym(new Date(y, m + 1, 0))) }
    if (tipo === 'tri') { const q = Math.floor(m / 3) * 3; setIni(ym(new Date(y, q, 1))); setFim(ym(new Date(y, q + 3, 0))) }
    if (tipo === 'sem') { const s = m < 6 ? 0 : 6; setIni(ym(new Date(y, s, 1))); setFim(ym(new Date(y, s + 6, 0))) }
    if (tipo === 'ano') { setIni(ym(new Date(y, 0, 1))); setFim(ym(new Date(y, 11, 31))) }
  }
  const criar = useMutation({
    mutationFn: async (): Promise<Prem> => {
      if (!titulo.trim()) throw new Error('Dê um título.')
      const { data, error } = await supabase.from('premiacoes').insert({ org_id: orgId, titulo: titulo.trim(), inicio: ini, fim }).select().single()
      if (error) throw error
      return data as Prem
    },
    onSuccess: (p) => onCriada(p), onError: (e) => setErro((e as Error).message),
  })
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <div className="card" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(440px,94%)', zIndex: 61, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Nova premiação</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label className="label">Título</label><input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ex.: Craque de Novembro" /></div>
          <div>
            <label className="label">Período</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {[['mes', 'Mês'], ['tri', 'Trimestre'], ['sem', 'Semestre'], ['ano', 'Ano']].map(([k, l]) => <button key={k} className="btn btn-outline" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => preset(k)}>{l}</button>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <input className="input" type="date" value={ini} onChange={(e) => setIni(e.target.value)} />
              <input className="input" type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          <button className="btn btn-primary" disabled={criar.isPending} onClick={() => criar.mutate()}>{criar.isPending ? 'Criando…' : 'Criar (prévia)'}</button>
          <p style={{ fontSize: 11.5, color: 'var(--text-hint)', margin: 0 }}>Crie, confira a prévia dos campeões e depois <b>homologue</b> para congelar na galeria.</p>
        </div>
      </div>
    </>
  )
}
