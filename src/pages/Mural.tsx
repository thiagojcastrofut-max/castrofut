import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Pin, Pencil, Trash2, Cake } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Aviso { id: string; titulo: string | null; texto: string; fixado: boolean; criado_em: string }
interface JogAniv { id: string; nome: string; apelido: string | null; nascimento: string | null }
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export default function Mural() {
  const { orgId, temPapel } = useAuth()
  const qc = useQueryClient()
  const podeGerir = temPapel('admin_geral', 'comissao')
  const [editar, setEditar] = useState<Aviso | 'novo' | null>(null)

  const { data: avisos } = useQuery({
    queryKey: ['avisos', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Aviso[]> => (await supabase.from('avisos').select('*').eq('org_id', orgId).order('fixado', { ascending: false }).order('criado_em', { ascending: false })).data as Aviso[] || [],
  })
  const { data: aniv } = useQuery({
    queryKey: ['aniversariantes', orgId], enabled: !!orgId,
    queryFn: async (): Promise<JogAniv[]> => {
      const d = (await supabase.from('jogadores').select('id,nome,apelido,nascimento').eq('org_id', orgId).eq('situacao', 'ativo').not('nascimento', 'is', null)).data as JogAniv[] || []
      const mes = new Date().getMonth() + 1
      return d.filter((j) => j.nascimento && Number(j.nascimento.slice(5, 7)) === mes).sort((a, b) => Number(a.nascimento!.slice(8, 10)) - Number(b.nascimento!.slice(8, 10)))
    },
  })

  const excluir = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('avisos').delete().eq('id', id); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['avisos', orgId] }), onError: (e) => alert((e as Error).message),
  })

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Mural</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Avisos do grupo e aniversariantes do mês.</p>
        </div>
        {podeGerir && <button className="btn btn-primary" onClick={() => setEditar('novo')}><Plus size={16} /> Novo aviso</button>}
      </div>

      {/* Aniversariantes */}
      {(aniv || []).length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: 'rgba(245,197,24,.4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: '#f5c518', fontWeight: 700 }}><Cake size={18} /> Aniversariantes de {MESES[new Date().getMonth()]}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {(aniv || []).map((j) => (
              <span key={j.id} className="badge" style={{ background: 'var(--bg-elev)', color: 'var(--text)', fontSize: 12.5, padding: '5px 11px' }}>
                🎂 dia {j.nascimento!.slice(8, 10)} · {j.apelido || j.nome}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Avisos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(avisos || []).map((a) => (
          <div key={a.id} className="card" style={{ padding: 16, borderLeft: a.fixado ? '3px solid var(--grass)' : undefined }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {a.titulo && <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}>{a.fixado && <Pin size={14} color="var(--grass-light)" />}{a.titulo}</div>}
                <div style={{ color: 'var(--text-muted)', fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{a.texto}</div>
                <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 6 }}>{new Date(a.criado_em).toLocaleDateString('pt-BR')}</div>
              </div>
              {podeGerir && (
                <div style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => setEditar(a)}><Pencil size={15} /></button>
                  <button className="btn btn-ghost" style={{ padding: 6, color: 'var(--danger)' }} onClick={() => { if (confirm('Excluir este aviso?')) excluir.mutate(a.id) }}><Trash2 size={15} /></button>
                </div>
              )}
            </div>
          </div>
        ))}
        {avisos && avisos.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhum aviso publicado.</div>}
      </div>

      {editar && <AvisoModal orgId={orgId!} aviso={editar === 'novo' ? null : editar} onClose={() => setEditar(null)} />}
    </div>
  )
}

function AvisoModal({ orgId, aviso, onClose }: { orgId: string; aviso: Aviso | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [f, setF] = useState({ titulo: aviso?.titulo || '', texto: aviso?.texto || '', fixado: aviso?.fixado || false })
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      if (!f.texto.trim()) throw new Error('Escreva o aviso.')
      const payload = { org_id: orgId, titulo: f.titulo || null, texto: f.texto, fixado: f.fixado, atualizado_em: new Date().toISOString() }
      const { error } = aviso ? await supabase.from('avisos').update(payload).eq('id', aviso.id) : await supabase.from('avisos').insert(payload)
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['avisos', orgId] }); onClose() }, onError: (e) => setErro((e as Error).message),
  })
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <div className="card" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,94%)', zIndex: 61, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{aviso ? 'Editar aviso' : 'Novo aviso'}</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><label className="label">Título (opcional)</label><input className="input" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} /></div>
          <div><label className="label">Mensagem</label><textarea className="input" rows={5} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} /></div>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={f.fixado} onChange={(e) => setF({ ...f, fixado: e.target.checked })} /> Fixar no topo</label>
          {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          <button className="btn btn-primary" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Publicar'}</button>
        </div>
      </div>
    </>
  )
}
