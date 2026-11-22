import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, X, Clock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const FUNCOES = [
  { v: 'jogador', l: 'Jogador (sem cargo)' },
  { v: 'comissao', l: 'Comissão' },
  { v: 'tesoureiro', l: 'Tesoureiro' },
  { v: 'juiz', l: 'Juiz' },
  { v: 'admin_geral', l: 'Administrador Geral' },
]

interface Pendente {
  membro_id: string
  nome: string
  email: string | null
  telefone: string | null
  posicao_principal: string | null
  pe_dominante: string | null
  criado_em: string
}

export default function Aprovacoes() {
  const { orgId, temPapel } = useAuth()
  const qc = useQueryClient()
  const podeAprovar = temPapel('admin_geral', 'comissao')
  const podeAdmin = temPapel('admin_geral') // super incluso
  const [papeis, setPapeis] = useState<Record<string, string>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['cadastros_pendentes', orgId],
    enabled: !!orgId && podeAprovar,
    queryFn: async (): Promise<Pendente[]> => {
      const { data, error } = await supabase.rpc('cadastros_pendentes', { p_org_id: orgId })
      if (error) throw error
      return (data || []) as Pendente[]
    },
  })

  const decidir = useMutation({
    mutationFn: async ({ membroId, aprovar, papel }: { membroId: string; aprovar: boolean; papel?: string }) => {
      if (aprovar) {
        const { error } = await supabase.rpc('aprovar_membro', { p_membro_id: membroId, p_papel: papel || 'jogador' })
        if (error) throw error
      } else {
        const { error } = await supabase.rpc('recusar_membro', { p_membro_id: membroId })
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cadastros_pendentes', orgId] }),
    onError: (e) => alert((e as Error).message),
  })

  if (!podeAprovar) return <Aviso texto="Você não tem permissão para aprovar cadastros." />

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Aprovações de cadastro</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 18px' }}>
        Valide quem solicitou acesso — e já defina a <b>função</b> (comissão, tesoureiro, juiz…) ao aprovar.
      </p>

      {isLoading && <Aviso texto="Carregando…" />}
      {error && <Aviso texto={'Erro: ' + (error as Error).message} />}
      {data && data.length === 0 && <Aviso texto="Nenhum cadastro pendente. 🎉" />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {data?.map((p) => (
          <div key={p.membro_id} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{p.nome}</div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>
                {p.email} {p.telefone ? '· ' + p.telefone : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                {p.posicao_principal || 'posição n/d'}{p.pe_dominante ? ' · pé ' + p.pe_dominante : ''}
                <span style={{ marginLeft: 8, color: 'var(--text-hint)' }}>
                  <Clock size={11} style={{ verticalAlign: 'middle' }} /> {new Date(p.criado_em).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="input" style={{ width: 'auto', minWidth: 150 }} title="Função ao aprovar"
                value={papeis[p.membro_id] || 'jogador'} onChange={(e) => setPapeis((s) => ({ ...s, [p.membro_id]: e.target.value }))}>
                {FUNCOES.filter((f) => podeAdmin || f.v !== 'admin_geral').map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
              </select>
              <button className="btn btn-primary" disabled={decidir.isPending} onClick={() => decidir.mutate({ membroId: p.membro_id, aprovar: true, papel: papeis[p.membro_id] || 'jogador' })}>
                <Check size={16} /> Aprovar
              </button>
              <button className="btn btn-outline" disabled={decidir.isPending} onClick={() => decidir.mutate({ membroId: p.membro_id, aprovar: false })}>
                <X size={16} /> Recusar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return <div className="card" style={{ padding: 16, color: 'var(--text-muted)', fontSize: 14 }}>{texto}</div>
}
