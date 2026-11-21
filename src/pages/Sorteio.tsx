import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Shuffle, Star, ArrowLeft, Scale } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Jog { id: string; nome: string; apelido: string | null; nivel_tecnico: number | null; posicao_principal: string | null }
interface SJ { id: string; jogador_id: string; time: string | null; jogador?: Jog }
interface Sort { id: string; org_id: string; nome: string | null; num_times: number; criterio: string; criado_em: string }
const apel = (j?: Jog) => j?.apelido || j?.nome || '—'
const letras = (n: number) => Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i))

export default function Sorteio() {
  const { orgId, temPapel } = useAuth()
  const podeGerir = temPapel('admin_geral', 'comissao')
  const [sel, setSel] = useState<string | null>(null)
  const [criar, setCriar] = useState(false)
  const { data } = useQuery({
    queryKey: ['sorteios', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Sort[]> => (await supabase.from('sorteios').select('*').eq('org_id', orgId).order('criado_em', { ascending: false })).data as Sort[] || [],
  })
  if (sel) return <Board sorteioId={sel} onVoltar={() => setSel(null)} podeGerir={podeGerir} />
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Sorteio de times</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Times equilibrados do dia — com ajuste depois do sorteio.</p>
        </div>
        {podeGerir && <button className="btn btn-primary" onClick={() => setCriar(true)}><Plus size={16} /> Novo sorteio</button>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(data || []).map((s) => (
          <button key={s.id} className="card" onClick={() => setSel(s.id)} style={{ padding: 14, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Shuffle size={20} color="var(--grass-light)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{s.nome || 'Sorteio'} · {s.num_times} times</div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{s.criterio === 'equilibrado' ? 'Equilibrado' : 'Aleatório'} · {new Date(s.criado_em).toLocaleDateString('pt-BR')}</div>
            </div>
          </button>
        ))}
        {data && data.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhum sorteio ainda.</div>}
      </div>
      {criar && <CriarSorteio orgId={orgId!} onClose={() => setCriar(false)} onCriado={(id) => { setCriar(false); setSel(id) }} />}
    </div>
  )
}

function Board({ sorteioId, onVoltar, podeGerir }: { sorteioId: string; onVoltar: () => void; podeGerir: boolean }) {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['sorteio', sorteioId], enabled: !!sorteioId,
    queryFn: async () => {
      const { data: s } = await supabase.from('sorteios').select('*').eq('id', sorteioId).single()
      const { data: sj } = await supabase.from('sorteio_jogadores').select('*, jogador:jogadores(id,nome,apelido,nivel_tecnico,posicao_principal)').eq('sorteio_id', sorteioId)
      return { s: s as Sort, js: (sj || []) as SJ[] }
    },
  })
  const inv = () => qc.invalidateQueries({ queryKey: ['sorteio', sorteioId] })
  const re = useMutation({ mutationFn: async (crit: string) => { const { error } = await supabase.rpc('re_sortear', { p_sorteio_id: sorteioId, p_criterio: crit }); if (error) throw error }, onSuccess: inv, onError: (e) => alert((e as Error).message) })
  const mover = useMutation({ mutationFn: async ({ jid, time }: { jid: string; time: string }) => { const { error } = await supabase.rpc('mover_sorteio', { p_sorteio_id: sorteioId, p_jogador_id: jid, p_time: time }); if (error) throw error }, onSuccess: inv, onError: (e) => alert((e as Error).message) })

  if (!data?.s) return <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando…</div>
  const { s, js } = data
  const times = letras(s.num_times)
  const soma = (t: string) => js.filter((x) => x.time === t).reduce((acc, x) => acc + (x.jogador?.nivel_tecnico || 0), 0)
  const doTime = (t: string) => js.filter((x) => x.time === t).sort((a, b) => (b.jogador?.nivel_tecnico || 0) - (a.jogador?.nivel_tecnico || 0))

  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 10, padding: '4px 8px' }} onClick={onVoltar}><ArrowLeft size={16} /> Voltar</button>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{s.nome || 'Sorteio'}</h1>
        {podeGerir && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-outline" style={{ padding: '7px 11px' }} disabled={re.isPending} onClick={() => re.mutate('equilibrado')}><Scale size={15} /> Equilibrar</button>
            <button className="btn btn-outline" style={{ padding: '7px 11px' }} disabled={re.isPending} onClick={() => re.mutate('aleatorio')}><Shuffle size={15} /> Aleatório</button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {times.map((t) => (
          <div key={t} className="card" style={{ padding: 12, flex: 1, minWidth: 150 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <b style={{ color: 'var(--text)' }}>Time {t.toUpperCase()}</b>
              <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{doTime(t).length} · <Star size={10} style={{ fill: '#f5c518', color: '#f5c518' }} /> {soma(t)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {doTime(t).map((x) => (
                <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', background: 'var(--bg-elev)', borderRadius: 7, padding: '6px 8px' }}>
                  <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.jogador?.posicao_principal === 'goleiro' ? '🧤 ' : ''}{apel(x.jogador)}</span>
                  <span style={{ fontSize: 11, color: '#f5c518' }}>★{x.jogador?.nivel_tecnico || 0}</span>
                  {podeGerir && times.length > 1 && (
                    <div style={{ display: 'flex', gap: 3 }}>
                      {times.filter((o) => o !== t).map((o) => (
                        <button key={o} onClick={() => mover.mutate({ jid: x.jogador_id, time: o })} title={'Mover p/ Time ' + o.toUpperCase()}
                          style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>{o.toUpperCase()}</button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {doTime(t).length === 0 && <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>—</div>}
            </div>
          </div>
        ))}
      </div>
      {podeGerir && <p style={{ fontSize: 11.5, color: 'var(--text-hint)', marginTop: 12 }}>Dica: use os botões de letra em cada jogador para ajustar os times e deixar competitivo.</p>}
    </div>
  )
}

function CriarSorteio({ orgId, onClose, onCriado }: { orgId: string; onClose: () => void; onCriado: (id: string) => void }) {
  const [nome, setNome] = useState('')
  const [nTimes, setNTimes] = useState(2)
  const [crit, setCrit] = useState('equilibrado')
  const [selSet, setSelSet] = useState<Set<string>>(new Set())
  const [erro, setErro] = useState('')
  const { data: jogs } = useQuery({
    queryKey: ['jogs-ativos', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Jog[]> => (await supabase.from('jogadores').select('id,nome,apelido,nivel_tecnico,posicao_principal').eq('org_id', orgId).eq('situacao', 'ativo').order('nome')).data as Jog[] || [],
  })
  const toggle = (id: string) => setSelSet((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const criar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('criar_sorteio', { p_org_id: orgId, p_partida_id: null, p_nome: nome || null, p_jogadores: Array.from(selSet), p_num_times: nTimes, p_criterio: crit })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => onCriado(id), onError: (e) => setErro((e as Error).message),
  })
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <div className="card" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,94%)', maxHeight: '88vh', overflowY: 'auto', zIndex: 61, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Novo sorteio</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label className="label">Nome (opcional)</label><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pelada de quarta" /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Nº de times</label><select className="input" value={nTimes} onChange={(e) => setNTimes(+e.target.value)}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option></select></div>
            <div><label className="label">Critério</label><select className="input" value={crit} onChange={(e) => setCrit(e.target.value)}><option value="equilibrado">Equilibrado</option><option value="aleatorio">Aleatório</option></select></div>
          </div>
          <div>
            <label className="label">Jogadores presentes ({selSet.size})</label>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 6 }}>
              {(jogs || []).map((j) => (
                <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                  <input type="checkbox" checked={selSet.has(j.id)} onChange={() => toggle(j.id)} />
                  <span style={{ flex: 1 }}>{j.posicao_principal === 'goleiro' ? '🧤 ' : ''}{apel(j)}</span>
                  <span style={{ fontSize: 11, color: '#f5c518' }}>★{j.nivel_tecnico || 0}</span>
                </label>
              ))}
              {(jogs || []).length === 0 && <div style={{ fontSize: 13, color: 'var(--text-hint)', padding: 6 }}>Nenhum jogador ativo.</div>}
            </div>
          </div>
          {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          <button className="btn btn-primary" disabled={criar.isPending || selSet.size < 2} onClick={() => criar.mutate()}>{criar.isPending ? 'Sorteando…' : 'Sortear times'}</button>
        </div>
      </div>
    </>
  )
}
