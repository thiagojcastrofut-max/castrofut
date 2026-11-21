import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, MapPin, Clock, Check, CircleSlash, Users, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Presenca { jogador_id: string; status: string; jogador?: { nome: string; apelido: string | null } }
interface Partida {
  id: string; org_id: string; data: string; hora: string | null; local: string | null; status: string
  obs: string | null; presencas?: Presenca[]
}

const diaSemana = (d: string) => new Date(d + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })
const hojeISO = () => new Date().toISOString().slice(0, 10)

export default function Partidas() {
  const { orgId, usuario, temPapel } = useAuth()
  const qc = useQueryClient()
  const podeGerir = temPapel('admin_geral', 'comissao')
  const [sel, setSel] = useState<Partida | null>(null)
  const [editar, setEditar] = useState<Partida | 'novo' | null>(null)

  const { data: meuJog } = useQuery({
    queryKey: ['meu-jogador', orgId], enabled: !!orgId && !!usuario,
    queryFn: async () => (await supabase.from('jogadores').select('id').eq('org_id', orgId).eq('user_id', usuario!.id).maybeSingle()).data as { id: string } | null,
  })
  const { data, isLoading } = useQuery({
    queryKey: ['partidas', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Partida[]> => {
      const { data, error } = await supabase.from('partidas')
        .select('*, presencas(jogador_id,status,jogador:jogadores(nome,apelido))')
        .eq('org_id', orgId).order('data', { ascending: false })
      if (error) throw error
      return (data || []) as Partida[]
    },
  })

  const confirmar = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.rpc('confirmar_presenca', { p_partida_id: id, p_status: status })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['partidas', orgId] }),
    onError: (e) => alert((e as Error).message),
  })

  const hoje = hojeISO()
  const futuras = (data || []).filter((p) => p.data >= hoje && p.status !== 'cancelada').sort((a, b) => a.data.localeCompare(b.data))
  const passadas = (data || []).filter((p) => p.data < hoje || p.status === 'cancelada')

  const confirmados = (p: Partida) => (p.presencas || []).filter((x) => x.status === 'confirmado').length
  const meuStatus = (p: Partida) => (p.presencas || []).find((x) => x.jogador_id === meuJog?.id)?.status

  function Card({ p }: { p: Partida }) {
    const ms = meuStatus(p)
    return (
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => setSel(p)}>
          <div style={{ textAlign: 'center', minWidth: 54 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--grass-light)', textTransform: 'capitalize' }}>{diaSemana(p.data).split(',')[0]}</div>
            <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{p.data.slice(8, 10)}/{p.data.slice(5, 7)}</div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {p.hora && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {p.hora.slice(0, 5)}</span>}
              {p.local && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontWeight: 500 }}><MapPin size={13} /> {p.local}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <Users size={13} /> {confirmados(p)} confirmado(s)
              {p.status === 'cancelada' && <span className="badge" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--danger)', marginLeft: 6 }}>cancelada</span>}
              {p.status === 'encerrada' && <span className="badge" style={{ background: 'var(--bg-elev)', color: 'var(--text-hint)', marginLeft: 6 }}>encerrada</span>}
            </div>
          </div>
        </div>
        {meuJog && p.status === 'agendada' && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className={'btn ' + (ms === 'confirmado' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1 }} disabled={confirmar.isPending}
              onClick={() => confirmar.mutate({ id: p.id, status: 'confirmado' })}><Check size={16} /> Vou</button>
            <button className={'btn ' + (ms === 'recusado' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1 }} disabled={confirmar.isPending}
              onClick={() => confirmar.mutate({ id: p.id, status: 'recusado' })}><CircleSlash size={16} /> Não vou</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Partidas</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Agende os jogos e confirme sua presença.</p>
        </div>
        {podeGerir && <button className="btn btn-primary" onClick={() => setEditar('novo')}><Plus size={16} /> Nova partida</button>}
      </div>

      {isLoading ? <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando…</div> : (
        <>
          <Secao titulo="Próximas">
            {futuras.length === 0 ? <Vazio t="Nenhuma partida agendada." /> : futuras.map((p) => <Card key={p.id} p={p} />)}
          </Secao>
          {passadas.length > 0 && (
            <Secao titulo="Anteriores">
              {passadas.map((p) => <Card key={p.id} p={p} />)}
            </Secao>
          )}
        </>
      )}

      {sel && <DetalhePartida p={sel} podeGerir={podeGerir} onEditar={() => { setEditar(sel); setSel(null) }} onClose={() => setSel(null)} orgId={orgId!} />}
      {editar && <PartidaModal orgId={orgId!} partida={editar === 'novo' ? null : editar} onClose={() => setEditar(null)} />}
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .5, margin: '0 0 8px' }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  )
}
function Vazio({ t }: { t: string }) { return <div className="card" style={{ padding: 16, color: 'var(--text-muted)', fontSize: 14 }}>{t}</div> }

interface Evento { id: string; jogador_id: string | null; equipe: string | null; tipo: string; minuto: number | null; jogador?: { nome: string; apelido: string | null } }
const EV_ICON: Record<string, string> = { gol: '⚽', assistencia: '👟', cartao_azul: '🟦', cartao_amarelo: '🟨', cartao_vermelho: '🟥' }

function DetalhePartida({ p, podeGerir, onEditar, onClose, orgId }: { p: Partida; podeGerir: boolean; onEditar: () => void; onClose: () => void; orgId: string }) {
  const qc = useQueryClient()
  const { temPapel } = useAuth()
  const podeSumula = temPapel('admin_geral', 'comissao', 'juiz')
  const conf = (p.presencas || []).filter((x) => x.status === 'confirmado')
  const rec = (p.presencas || []).filter((x) => x.status === 'recusado')
  const nome = (x: { jogador?: { nome: string; apelido: string | null } }) => x.jogador?.apelido || x.jogador?.nome || '—'

  const { data: eventos } = useQuery({
    queryKey: ['eventos', p.id], enabled: !!p.id,
    queryFn: async (): Promise<Evento[]> => (await supabase.from('eventos_partida').select('*, jogador:jogadores(nome,apelido)').eq('partida_id', p.id).order('criado_em')).data as Evento[] || [],
  })
  const { data: jogs } = useQuery({
    queryKey: ['jogs-ativos', orgId], enabled: podeSumula,
    queryFn: async () => (await supabase.from('jogadores').select('id,nome,apelido').eq('org_id', orgId).eq('situacao', 'ativo').order('nome')).data as { id: string; nome: string; apelido: string | null }[] || [],
  })

  const golA = (eventos || []).filter((e) => e.tipo === 'gol' && e.equipe === 'a').length
  const golB = (eventos || []).filter((e) => e.tipo === 'gol' && e.equipe === 'b').length

  const excluir = useMutation({ mutationFn: async () => { const { error } = await supabase.from('partidas').delete().eq('id', p.id); if (error) throw error }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['partidas', orgId] }); onClose() }, onError: (e) => alert((e as Error).message) })
  const registrar = useMutation({
    mutationFn: async (v: { jogador_id: string; tipo: string; equipe: string | null; minuto: number | null }) => {
      const { error } = await supabase.rpc('registrar_evento', { p_partida_id: p.id, p_jogador_id: v.jogador_id, p_tipo: v.tipo, p_equipe: v.equipe, p_minuto: v.minuto })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['eventos', p.id] }); qc.invalidateQueries({ queryKey: ['partidas', orgId] }) },
    onError: (e) => alert((e as Error).message),
  })
  const remover = useMutation({ mutationFn: async (id: string) => { const { error } = await supabase.rpc('remover_evento', { p_evento_id: id }); if (error) throw error }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['eventos', p.id] }); qc.invalidateQueries({ queryKey: ['partidas', orgId] }) }, onError: (e) => alert((e as Error).message) })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px,100%)', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 61, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0, textTransform: 'capitalize' }}>{diaSemana(p.data)}</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
          {p.hora && <span><Clock size={13} /> {p.hora.slice(0, 5)}</span>}
          {p.local && <span><MapPin size={13} /> {p.local}</span>}
        </div>

        {/* Placar */}
        <div className="card" style={{ padding: 14, marginBottom: 14, background: 'var(--bg-elev)', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 2 }}>Placar</div>
          <div style={{ fontSize: 30, fontWeight: 800, color: 'var(--text)' }}>Time A <span style={{ color: 'var(--grass-light)' }}>{golA}</span> × <span style={{ color: 'var(--grass-light)' }}>{golB}</span> Time B</div>
        </div>

        {podeGerir && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button className="btn btn-outline" style={{ flex: 1 }} onClick={onEditar}><Pencil size={15} /> Editar</button>
            <button className="btn btn-outline" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }} onClick={() => { if (confirm('Excluir esta partida?')) excluir.mutate() }}><Trash2 size={15} /></button>
          </div>
        )}

        {/* Súmula do juiz */}
        {podeSumula && p.status !== 'cancelada' && <Sumula jogs={jogs || []} onReg={(v) => registrar.mutate(v)} />}

        {/* Eventos */}
        {(eventos || []).length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>Súmula</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(eventos || []).map((e) => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--text)', background: 'var(--bg-elev)', borderRadius: 7, padding: '6px 10px' }}>
                  <span style={{ fontSize: 15 }}>{EV_ICON[e.tipo] || '•'}</span>
                  <span style={{ flex: 1 }}>{nome(e)} {e.equipe ? <span style={{ color: 'var(--text-hint)', fontSize: 11 }}>({'Time ' + e.equipe.toUpperCase()})</span> : ''}{e.minuto ? <span style={{ color: 'var(--text-hint)' }}> · {e.minuto}'</span> : ''}</span>
                  {podeSumula && <button className="btn btn-ghost" style={{ padding: 3 }} onClick={() => remover.mutate(e.id)}><Trash2 size={13} /></button>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ fontWeight: 700, color: 'var(--grass-light)', marginBottom: 8 }}>✅ Confirmados ({conf.length})</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
          {conf.length ? conf.map((x) => <div key={x.jogador_id} style={{ fontSize: 14, color: 'var(--text)' }}>• {nome(x)}</div>) : <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>Ninguém confirmou ainda.</div>}
        </div>
        {rec.length > 0 && (
          <>
            <div style={{ fontWeight: 700, color: 'var(--text-hint)', marginBottom: 8 }}>✖ Não vão ({rec.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {rec.map((x) => <div key={x.jogador_id} style={{ fontSize: 13, color: 'var(--text-hint)' }}>• {nome(x)}</div>)}
            </div>
          </>
        )}
      </aside>
    </>
  )
}

function Sumula({ jogs, onReg }: { jogs: { id: string; nome: string; apelido: string | null }[]; onReg: (v: { jogador_id: string; tipo: string; equipe: string | null; minuto: number | null }) => void }) {
  const [tipo, setTipo] = useState('gol')
  const [jid, setJid] = useState('')
  const [equipe, setEquipe] = useState<'a' | 'b'>('a')
  const [minuto, setMinuto] = useState('')
  const tipos = [['gol', '⚽ Gol'], ['assistencia', '👟 Assist.'], ['cartao_azul', '🟦 Azul'], ['cartao_amarelo', '🟨 Amarelo'], ['cartao_vermelho', '🟥 Vermelho']] as const
  return (
    <div className="card" style={{ padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, color: 'var(--gold-light,var(--grass-light))', marginBottom: 10 }}>📋 Registrar (juiz)</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {tipos.map(([k, l]) => <button key={k} className={'btn ' + (tipo === k ? 'btn-primary' : 'btn-outline')} style={{ padding: '6px 10px', fontSize: 12 }} onClick={() => setTipo(k)}>{l}</button>)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <select className="input" value={jid} onChange={(e) => setJid(e.target.value)}>
          <option value="">Jogador…</option>
          {jogs.map((j) => <option key={j.id} value={j.id}>{j.apelido || j.nome}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <button className={'btn ' + (equipe === 'a' ? 'btn-primary' : 'btn-outline')} style={{ padding: '7px 12px' }} onClick={() => setEquipe('a')}>Time A</button>
            <button className={'btn ' + (equipe === 'b' ? 'btn-primary' : 'btn-outline')} style={{ padding: '7px 12px' }} onClick={() => setEquipe('b')}>Time B</button>
          </div>
          <input className="input" style={{ width: 70 }} placeholder="min" value={minuto} onChange={(e) => setMinuto(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={!jid} onClick={() => { onReg({ jogador_id: jid, tipo, equipe, minuto: minuto ? parseInt(minuto) : null }); setJid(''); setMinuto('') }}>Registrar</button>
      </div>
    </div>
  )
}

function PartidaModal({ orgId, partida, onClose }: { orgId: string; partida: Partida | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({
    data: partida?.data || hojeISO(), hora: partida?.hora?.slice(0, 5) || '', local: partida?.local || '',
    status: partida?.status || 'agendada', obs: partida?.obs || '',
  })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const payload = { org_id: orgId, data: f.data, hora: f.hora || null, local: f.local || null, status: f.status, obs: f.obs || null }
      const { error } = partida
        ? await supabase.from('partidas').update(payload).eq('id', partida.id)
        : await supabase.from('partidas').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['partidas', orgId] }); onClose() },
    onError: (e) => setErro((e as Error).message),
  })
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <div className="card" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px,94%)', zIndex: 61, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{partida ? 'Editar partida' : 'Nova partida'}</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Data</label><input className="input" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></div>
            <div><label className="label">Hora</label><input className="input" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></div>
          </div>
          <div><label className="label">Local</label><input className="input" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} placeholder="Quadra / campo" /></div>
          {partida && (
            <div><label className="label">Situação</label>
              <select className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
                <option value="agendada">Agendada</option><option value="encerrada">Encerrada</option><option value="cancelada">Cancelada</option>
              </select>
            </div>
          )}
          <div><label className="label">Observações</label><input className="input" value={f.obs} onChange={(e) => setF({ ...f, obs: e.target.value })} /></div>
          {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          <button className="btn btn-primary" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </>
  )
}
