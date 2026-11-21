import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Ban, RotateCcw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import type { Papel } from '../lib/types'

interface MembroRow {
  membro_id: string
  user_id: string
  nome: string
  email: string | null
  papel: Papel
  status: string
  criado_em: string
}

const FUNCOES: { v: Papel; l: string }[] = [
  { v: 'jogador', l: 'Jogador (sem cargo)' },
  { v: 'comissao', l: 'Comissão' },
  { v: 'tesoureiro', l: 'Tesoureiro' },
  { v: 'juiz', l: 'Juiz' },
  { v: 'admin_geral', l: 'Administrador Geral' },
]

export default function Membros() {
  const { orgId, usuario, temPapel } = useAuth()
  const qc = useQueryClient()
  const podeVer = temPapel('admin_geral', 'comissao')
  const podeDefinir = temPapel('admin_geral') // super-admin incluso

  const { data, isLoading, error } = useQuery({
    queryKey: ['membros', orgId],
    enabled: !!orgId && podeVer,
    queryFn: async (): Promise<MembroRow[]> => {
      const { data, error } = await supabase.rpc('membros_do_grupo', { p_org_id: orgId })
      if (error) throw error
      return (data || []) as MembroRow[]
    },
  })

  const mudarPapel = useMutation({
    mutationFn: async ({ id, papel }: { id: string; papel: Papel }) => {
      const { error } = await supabase.rpc('definir_papel', { p_membro_id: id, p_papel: papel })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
    onError: (e) => alert((e as Error).message),
  })

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.rpc('definir_status_membro', { p_membro_id: id, p_status: status })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['membros', orgId] }),
    onError: (e) => alert((e as Error).message),
  })

  if (!podeVer) return <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Acesso restrito à comissão/administração.</div>

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Membros & Funções</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 18px' }}>
        Todos são jogadores. Aqui você define quem tem uma <b>função extra</b> (comissão, tesoureiro, juiz, administrador).
      </p>

      {isLoading && <Aviso t="Carregando…" />}
      {error && <Aviso t={'Erro: ' + (error as Error).message} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data?.map((m) => {
          const souEu = m.user_id === usuario?.id
          const editavel = podeDefinir && !souEu && m.status === 'ativo'
          return (
            <div key={m.membro_id} className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', opacity: m.status === 'bloqueado' ? 0.55 : 1 }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                  {m.nome} {souEu && <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>(você)</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{m.email}</div>
              </div>

              {m.status === 'pendente' ? (
                <span className="badge" style={{ background: 'rgba(245,158,11,.15)', color: 'var(--warn)' }}>⏳ pendente — aprovar em Aprovações</span>
              ) : m.status === 'bloqueado' ? (
                <span className="badge" style={{ background: 'rgba(239,68,68,.15)', color: 'var(--danger)' }}>bloqueado</span>
              ) : null}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  className="input" style={{ width: 'auto', minWidth: 190 }}
                  value={m.papel} disabled={!editavel || mudarPapel.isPending}
                  onChange={(e) => mudarPapel.mutate({ id: m.membro_id, papel: e.target.value as Papel })}
                >
                  {FUNCOES.map((f) => <option key={f.v} value={f.v}>{f.l}</option>)}
                </select>

                {podeDefinir && !souEu && m.status !== 'pendente' && (
                  m.status === 'bloqueado' ? (
                    <button className="btn btn-outline" style={{ padding: '7px 10px' }} title="Reativar" onClick={() => mudarStatus.mutate({ id: m.membro_id, status: 'ativo' })}>
                      <RotateCcw size={15} />
                    </button>
                  ) : (
                    <button className="btn btn-outline" style={{ padding: '7px 10px', color: 'var(--danger)', borderColor: 'var(--danger)' }} title="Bloquear acesso"
                      onClick={() => { if (confirm(`Bloquear o acesso de ${m.nome}?`)) mudarStatus.mutate({ id: m.membro_id, status: 'bloqueado' }) }}>
                      <Ban size={15} />
                    </button>
                  )
                )}
              </div>
            </div>
          )
        })}
        {data && data.length === 0 && <Aviso t="Nenhum membro ainda." />}
      </div>

      {!podeDefinir && <p style={{ fontSize: 12, color: 'var(--text-hint)', marginTop: 12 }}>Só o Administrador Geral pode alterar funções.</p>}
    </div>
  )
}

function Aviso({ t }: { t: string }) {
  return <div className="card" style={{ padding: 16, color: 'var(--text-muted)', fontSize: 14 }}>{t}</div>
}
