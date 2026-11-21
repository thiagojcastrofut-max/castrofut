import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Building2, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Organizacao } from '../lib/types'

export default function Grupos() {
  const { usuario, recarregar } = useAuth()
  const qc = useQueryClient()
  const [nome, setNome] = useState('')
  const [erro, setErro] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['orgs'],
    enabled: !!usuario?.super_admin,
    queryFn: async (): Promise<Organizacao[]> => {
      const { data, error } = await supabase.from('organizacoes').select('*').order('criado_em', { ascending: false })
      if (error) throw error
      return (data || []) as Organizacao[]
    },
  })

  const criar = useMutation({
    mutationFn: async (nomeOrg: string) => {
      const slug = nomeOrg.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
      const { error } = await supabase.rpc('criar_org', { p_nome: nomeOrg.trim(), p_slug: slug })
      if (error) throw error
    },
    onSuccess: async () => {
      setNome('')
      await qc.invalidateQueries({ queryKey: ['orgs'] })
      await recarregar()
    },
    onError: (e) => setErro((e as Error).message),
  })

  const setAtivo = useMutation({
    mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
      const { error } = await supabase.from('organizacoes').update({ ativo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orgs'] }),
    onError: (e) => setErro((e as Error).message),
  })

  const excluirOrg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('organizacoes').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['orgs'] }); await recarregar() },
    onError: (e) => setErro((e as Error).message),
  })

  if (!usuario?.super_admin) return <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Acesso restrito ao super-admin.</div>

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Grupos da plataforma</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 18px' }}>Crie e administre os grupos de futebol (multi-tenant).</p>

      <div className="card" style={{ padding: 16, marginBottom: 18 }}>
        <label className="label">Novo grupo</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input className="input" style={{ flex: 1, minWidth: 200 }} placeholder="Nome do grupo (ex.: Caveira)" value={nome} onChange={(e) => { setNome(e.target.value); setErro('') }} />
          <button className="btn btn-primary" disabled={!nome.trim() || criar.isPending} onClick={() => criar.mutate(nome)}>
            <Plus size={16} /> {criar.isPending ? 'Criando…' : 'Criar grupo'}
          </button>
        </div>
        {erro && <div style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{erro}</div>}
        <div style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 8 }}>
          Ao criar, você vira <b>Administrador Geral</b> do grupo e pode definir a comissão e os juízes.
        </div>
      </div>

      {isLoading ? (
        <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 12 }}>
          {data?.map((o) => (
            <div key={o.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {o.logo_url ? <img src={o.logo_url} width={34} height={34} style={{ borderRadius: 8 }} /> : <Building2 size={22} color="var(--grass-light)" />}
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text)' }}>{o.nome}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>/{o.slug}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                <span className="badge" style={{ background: o.ativo ? 'rgba(15,138,60,.15)' : 'rgba(245,158,11,.15)', color: o.ativo ? 'var(--grass-light)' : 'var(--warn)' }}>
                  {o.ativo ? 'Ativo' : '⏸ Pausado'}
                </span>
                <button className="btn btn-outline" style={{ padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}
                  disabled={setAtivo.isPending} onClick={() => setAtivo.mutate({ id: o.id, ativo: !o.ativo })}>
                  {o.ativo ? 'Pausar' : 'Ativar'}
                </button>
                <button className="btn btn-outline" style={{ padding: '4px 8px', fontSize: 12, color: 'var(--danger)', borderColor: 'var(--danger)' }}
                  disabled={excluirOrg.isPending}
                  onClick={() => { if (confirm(`Excluir o grupo "${o.nome}"?\n\nIsso APAGA jogadores, membros e todos os dados do grupo. Não pode ser desfeito.`)) excluirOrg.mutate(o.id) }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {data && data.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhum grupo ainda. Crie o primeiro acima.</div>}
        </div>
      )}
    </div>
  )
}
