import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, X, Camera, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Jogador, Posicao, Pe } from '../lib/types'

const POS: { v: Posicao; l: string }[] = [
  { v: 'goleiro', l: 'Goleiro' }, { v: 'zagueiro', l: 'Zagueiro' }, { v: 'lateral', l: 'Lateral' },
  { v: 'volante', l: 'Volante' }, { v: 'meia', l: 'Meia' }, { v: 'atacante', l: 'Atacante' },
]
const PES: { v: Pe; l: string }[] = [
  { v: 'direito', l: 'Direito' }, { v: 'esquerdo', l: 'Esquerdo' }, { v: 'ambidestro', l: 'Ambidestro' },
]
const posLabel = (v?: string | null) => POS.find((p) => p.v === v)?.l || '—'

function iniciais(nome: string) {
  return nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
}

function Estrelas({ n, editavel, onChange }: { n: number | null; editavel?: boolean; onChange?: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i} size={17}
          onClick={() => editavel && onChange?.(i)}
          style={{ cursor: editavel ? 'pointer' : 'default', fill: i <= (n || 0) ? '#f5c518' : 'transparent', color: i <= (n || 0) ? '#f5c518' : 'var(--border-strong)' }}
        />
      ))}
    </div>
  )
}

export default function Jogadores() {
  const { orgId, usuario, temPapel } = useAuth()
  const podeGerir = temPapel('admin_geral', 'comissao')
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Jogador | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['jogadores', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Jogador[]> => {
      const { data, error } = await supabase.from('jogadores').select('*').eq('org_id', orgId).order('nome')
      if (error) throw error
      return (data || []) as Jogador[]
    },
  })

  const termo = busca.toLowerCase().trim()
  const lista = (data || []).filter((j) =>
    !termo || [j.nome, j.apelido, posLabel(j.posicao_principal)].some((t) => (t || '').toLowerCase().includes(termo)),
  )
  const ativos = (data || []).filter((j) => j.situacao === 'ativo').length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Jogadores</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>{data?.length || 0} no total · {ativos} ativos</p>
        </div>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--text-hint)' }} />
          <input className="input" style={{ paddingLeft: 34, width: 240 }} placeholder="Buscar nome, apelido, posição…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando…</div>
      ) : lista.length === 0 ? (
        <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>
          {data?.length ? 'Nenhum jogador encontrado para a busca.' : 'Nenhum jogador aprovado ainda. Os jogadores aparecem aqui após o cadastro + aprovação na Comissão.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 12 }}>
          {lista.map((j) => (
            <button key={j.id} className="card" onClick={() => setSel(j)}
              style={{ padding: 14, textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center', border: '1px solid var(--border)', opacity: j.situacao === 'inativo' ? 0.55 : 1 }}>
              <Avatar j={j} size={46} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {j.apelido || j.nome}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', marginBottom: 4 }}>{posLabel(j.posicao_principal)}{j.situacao === 'inativo' ? ' · inativo' : ''}</div>
                <Estrelas n={j.nivel_tecnico} />
              </div>
            </button>
          ))}
        </div>
      )}

      {sel && (
        <JogadorDrawer
          jogador={sel}
          podeGerir={podeGerir}
          souEu={sel.user_id === usuario?.id}
          onClose={() => setSel(null)}
        />
      )}
    </div>
  )
}

function Avatar({ j, size }: { j: Jogador; size: number }) {
  if (j.foto_url) return <img src={j.foto_url} width={size} height={size} style={{ borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--bg-elev)', color: 'var(--grass-light)', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: size * 0.34, flexShrink: 0 }}>
      {iniciais(j.nome) || '⚽'}
    </div>
  )
}

function JogadorDrawer({ jogador, podeGerir, souEu, onClose }: { jogador: Jogador; podeGerir: boolean; souEu: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const podeEditar = podeGerir || souEu
  const [f, setF] = useState<Jogador>(jogador)
  const [erro, setErro] = useState('')
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  useEffect(() => setF(jogador), [jogador])

  const set = <K extends keyof Jogador>(k: K, v: Jogador[K]) => setF((p) => ({ ...p, [k]: v }))

  const salvar = useMutation({
    mutationFn: async () => {
      const payload: Partial<Jogador> = {
        nome: f.nome, apelido: f.apelido, telefone: f.telefone, nascimento: f.nascimento || null,
        posicao_principal: f.posicao_principal, posicao_secundaria: f.posicao_secundaria,
        pe_dominante: f.pe_dominante, obs: f.obs, foto_url: f.foto_url,
      }
      if (podeGerir) { payload.nivel_tecnico = f.nivel_tecnico; payload.situacao = f.situacao }
      const { error } = await supabase.from('jogadores').update(payload).eq('id', f.id)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jogadores', jogador.org_id] }); onClose() },
    onError: (e) => setErro((e as Error).message),
  })

  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErro(''); setEnviandoFoto(true)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${jogador.org_id}/${jogador.id}.${ext}`
      const { error } = await supabase.storage.from('fotos').upload(path, file, { upsert: true, cacheControl: '3600' })
      if (error) throw error
      const { data } = supabase.storage.from('fotos').getPublicUrl(path)
      set('foto_url', data.publicUrl + '?t=' + Date.now())
    } catch (err) {
      setErro('Falha no upload da foto: ' + (err as Error).message)
    } finally {
      setEnviandoFoto(false)
    }
  }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <aside style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(440px,100%)', background: 'var(--bg-card)', borderLeft: '1px solid var(--border)', zIndex: 61, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Ficha do jogador</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ position: 'relative' }}>
            <Avatar j={f} size={72} />
            {podeEditar && (
              <button className="btn btn-outline" style={{ position: 'absolute', right: -6, bottom: -6, padding: 6, borderRadius: '50%' }}
                onClick={() => fileRef.current?.click()} title="Trocar foto" disabled={enviandoFoto}>
                <Camera size={14} />
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={escolherFoto} />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--text)' }}>{f.apelido || f.nome}</div>
            <div style={{ marginTop: 4 }}><Estrelas n={f.nivel_tecnico} editavel={podeGerir} onChange={(v) => set('nivel_tecnico', v)} /></div>
            {enviandoFoto && <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>enviando foto…</div>}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <L label="Nome completo"><input className="input" value={f.nome || ''} disabled={!podeEditar} onChange={(e) => set('nome', e.target.value)} /></L>
          <L label="Apelido"><input className="input" value={f.apelido || ''} disabled={!podeEditar} onChange={(e) => set('apelido', e.target.value)} /></L>
          <L label="Telefone (WhatsApp)"><input className="input" value={f.telefone || ''} disabled={!podeEditar} onChange={(e) => set('telefone', e.target.value)} /></L>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <L label="Posição principal">
              <select className="input" value={f.posicao_principal || ''} disabled={!podeEditar} onChange={(e) => set('posicao_principal', e.target.value as Posicao)}>
                <option value="">—</option>{POS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </L>
            <L label="Posição secundária">
              <select className="input" value={f.posicao_secundaria || ''} disabled={!podeEditar} onChange={(e) => set('posicao_secundaria', e.target.value as Posicao)}>
                <option value="">—</option>{POS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </L>
            <L label="Pé dominante">
              <select className="input" value={f.pe_dominante || ''} disabled={!podeEditar} onChange={(e) => set('pe_dominante', e.target.value as Pe)}>
                <option value="">—</option>{PES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </L>
            <L label="Nascimento"><input className="input" type="date" value={f.nascimento || ''} disabled={!podeEditar} onChange={(e) => set('nascimento', e.target.value)} /></L>
          </div>
          <L label="Observações"><textarea className="input" rows={3} value={f.obs || ''} disabled={!podeEditar} onChange={(e) => set('obs', e.target.value)} /></L>

          {podeGerir && (
            <div className="card" style={{ padding: 12, background: 'var(--bg-elev)' }}>
              <div className="label" style={{ marginBottom: 8 }}>Gestão (comissão)</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Situação</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className={'btn ' + (f.situacao === 'ativo' ? 'btn-primary' : 'btn-outline')} onClick={() => set('situacao', 'ativo')} style={{ padding: '6px 12px' }}>Ativo</button>
                  <button className={'btn ' + (f.situacao === 'inativo' ? 'btn-primary' : 'btn-outline')} onClick={() => set('situacao', 'inativo')} style={{ padding: '6px 12px' }}>Inativo</button>
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 8 }}>O nível técnico (estrelas, acima) só a comissão ajusta.</div>
            </div>
          )}

          {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          {podeEditar ? (
            <button className="btn btn-primary" disabled={salvar.isPending || enviandoFoto} onClick={() => salvar.mutate()}>
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          ) : (
            <div style={{ fontSize: 12.5, color: 'var(--text-hint)', textAlign: 'center' }}>Somente a comissão ou o próprio jogador podem editar.</div>
          )}
        </div>
      </aside>
    </>
  )
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>
}
