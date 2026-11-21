import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Send, X, CheckCircle2, Ban, FileText, FileSpreadsheet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { exportarPDF, exportarExcel } from '../lib/report'
import type { Organizacao } from '../lib/types'

const brl = (n: number | null | undefined) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hojeISO = () => new Date().toISOString().slice(0, 10)
const mesAtual = () => new Date().toISOString().slice(0, 7) // YYYY-MM
const compDate = (mes: string) => mes + '-01'
const labelMes = (d: string) => { const [y, m] = d.slice(0, 7).split('-'); return `${m}/${y}` }

interface Mensalidade {
  id: string; org_id: string; jogador_id: string; competencia: string; valor: number; desconto: number
  valor_pago: number; vencimento: string | null; status: string; isencao_motivo: string | null
  jogador?: { nome: string; apelido: string | null; telefone: string | null }
}
interface Lancamento { id: string; tipo: string; categoria: string | null; descricao: string | null; valor: number; data: string }

export default function Financeiro() {
  const { orgId, temPapel, membros } = useAuth()
  const podeVer = temPapel('admin_geral', 'tesoureiro', 'comissao')
  const org = membros.find((m) => m.org_id === orgId)?.organizacao
  if (!podeVer) return <MinhasMensalidades orgId={orgId!} org={org} />
  return <Gestao orgId={orgId!} org={org} podeGerir={temPapel('admin_geral', 'tesoureiro')} />
}

/* ===================== Visão do jogador ===================== */
function MinhasMensalidades({ orgId, org }: { orgId: string; org?: Organizacao }) {
  const { data } = useQuery({
    queryKey: ['minhas-mens', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Mensalidade[]> => {
      const { data, error } = await supabase.from('mensalidades').select('*').eq('org_id', orgId).order('competencia', { ascending: false })
      if (error) throw error
      return (data || []) as Mensalidade[]
    },
  })
  const devo = (data || []).filter((m) => m.status !== 'paga' && m.status !== 'isenta' && m.status !== 'cancelada')
  const total = devo.reduce((s, m) => s + (m.valor - m.desconto - m.valor_pago), 0)
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Minhas mensalidades</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 16px' }}>Acompanhe seus pagamentos do grupo.</p>
      <div className="card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>Em aberto</div>
        <div style={{ fontSize: 26, fontWeight: 800, color: total > 0 ? 'var(--warn)' : 'var(--grass-light)' }}>{brl(total)}</div>
        {total > 0 && org?.pix_chave && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 6 }}>Pix: <b style={{ color: 'var(--text)' }}>{org.pix_chave}</b>{org.pix_titular ? ` (${org.pix_titular})` : ''}</div>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(data || []).map((m) => <LinhaMens key={m.id} m={m} />)}
        {data && data.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhuma mensalidade lançada ainda.</div>}
      </div>
    </div>
  )
}

function LinhaMens({ m }: { m: Mensalidade }) {
  return (
    <div className="card" style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{labelMes(m.competencia)}</div>
        <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{m.vencimento ? 'vence ' + new Date(m.vencimento).toLocaleDateString('pt-BR') : ''}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontWeight: 700, color: 'var(--text)' }}>{brl(m.valor - m.desconto)}</div>
        <StatusBadge s={m.status} />
      </div>
    </div>
  )
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, [string, string]> = {
    aberta: ['#f59e0b', 'Em aberto'], parcial: ['#3b82f6', 'Parcial'], paga: ['#2fcf6b', 'Paga'],
    isenta: ['#9e9e9e', 'Isenta'], cancelada: ['#9e9e9e', 'Cancelada'],
  }
  const [c, l] = map[s] || ['#9e9e9e', s]
  return <span className="badge" style={{ background: c + '22', color: c }}>{l}</span>
}

/* ===================== Gestão (admin/tesoureiro/comissão) ===================== */
function Gestao({ orgId, org, podeGerir }: { orgId: string; org?: Organizacao; podeGerir: boolean }) {
  const [aba, setAba] = useState<'resumo' | 'mensalidades' | 'lancamentos' | 'relatorios' | 'config'>('mensalidades')
  const abas = [
    ['resumo', 'Resumo'], ['mensalidades', 'Mensalidades'], ['lancamentos', 'Receitas / Despesas'], ['relatorios', 'Relatórios'], ['config', 'Configuração'],
  ] as const
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 12px' }}>Financeiro</h1>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {abas.map(([k, l]) => (
          <button key={k} className={'btn ' + (aba === k ? 'btn-primary' : 'btn-outline')} style={{ padding: '7px 13px' }} onClick={() => setAba(k)}>{l}</button>
        ))}
      </div>
      {aba === 'resumo' && <Resumo orgId={orgId} />}
      {aba === 'mensalidades' && <Mensalidades orgId={orgId} org={org} podeGerir={podeGerir} />}
      {aba === 'lancamentos' && <Lancamentos orgId={orgId} podeGerir={podeGerir} />}
      {aba === 'relatorios' && <Relatorios orgId={orgId} grupo={org?.nome} />}
      {aba === 'config' && <Config orgId={orgId} org={org} podeGerir={podeGerir} />}
    </div>
  )
}

function Resumo({ orgId }: { orgId: string }) {
  const mes = mesAtual()
  const { data: mens } = useQuery({
    queryKey: ['resumo-mens', orgId, mes], enabled: !!orgId,
    queryFn: async () => (await supabase.from('mensalidades').select('valor,desconto,valor_pago,status,competencia').eq('org_id', orgId).eq('competencia', compDate(mes))).data as Mensalidade[] | null,
  })
  const { data: lanc } = useQuery({
    queryKey: ['resumo-lanc', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('lancamentos').select('tipo,valor,data').eq('org_id', orgId)).data as Lancamento[] | null,
  })
  const { data: pags } = useQuery({
    queryKey: ['resumo-pag', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('pagamentos').select('valor,data_recebimento').eq('org_id', orgId)).data as { valor: number; data_recebimento: string }[] | null,
  })
  const aReceber = (mens || []).filter((m) => m.status === 'aberta' || m.status === 'parcial').reduce((s, m) => s + (m.valor - m.desconto - m.valor_pago), 0)
  const recebMes = (pags || []).filter((p) => p.data_recebimento?.slice(0, 7) === mes).reduce((s, p) => s + p.valor, 0)
  const totalReceitas = (lanc || []).filter((l) => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0) + (pags || []).reduce((s, p) => s + p.valor, 0)
  const totalDespesas = (lanc || []).filter((l) => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)
  const saldo = totalReceitas - totalDespesas
  const cards = [
    ['A receber (mês)', aReceber, '#f59e0b'], ['Recebido (mês)', recebMes, '#2fcf6b'],
    ['Despesas (total)', totalDespesas, '#ef4444'], ['Saldo em caixa', saldo, '#2fcf6b'],
  ] as const
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
      {cards.map(([l, v, c]) => (
        <div key={l} className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>{l}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: c, marginTop: 4 }}>{brl(v)}</div>
        </div>
      ))}
    </div>
  )
}

function Mensalidades({ orgId, org, podeGerir }: { orgId: string; org?: Organizacao; podeGerir: boolean }) {
  const qc = useQueryClient()
  const [mes, setMes] = useState(mesAtual())
  const [venc, setVenc] = useState(() => mesAtual() + '-10')
  const [filtro, setFiltro] = useState<'todos' | 'aberto' | 'pago'>('todos')
  const [pagar, setPagar] = useState<Mensalidade | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['mensalidades', orgId, mes], enabled: !!orgId,
    queryFn: async (): Promise<Mensalidade[]> => {
      const { data, error } = await supabase.from('mensalidades')
        .select('*, jogador:jogadores(nome,apelido,telefone)').eq('org_id', orgId).eq('competencia', compDate(mes))
      if (error) throw error
      return ((data || []) as Mensalidade[]).sort((a, b) => (a.jogador?.nome || '').localeCompare(b.jogador?.nome || ''))
    },
  })

  const gerar = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('gerar_mensalidades', { p_org_id: orgId, p_competencia: compDate(mes), p_vencimento: venc || null })
      if (error) throw error
      return data as number
    },
    onSuccess: (n) => { qc.invalidateQueries({ queryKey: ['mensalidades', orgId, mes] }); alert(`${n} mensalidade(s) gerada(s).`) },
    onError: (e) => alert((e as Error).message),
  })
  const isentar = useMutation({
    mutationFn: async (m: Mensalidade) => {
      const { error } = await supabase.rpc('definir_mensalidade', { p_id: m.id, p_valor: null, p_desconto: null, p_status: 'isenta', p_isencao_motivo: 'Isento pela tesouraria' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mensalidades', orgId, mes] }),
    onError: (e) => alert((e as Error).message),
  })

  const lista = useMemo(() => (data || []).filter((m) => {
    if (filtro === 'aberto') return m.status === 'aberta' || m.status === 'parcial'
    if (filtro === 'pago') return m.status === 'paga' || m.status === 'isenta'
    return true
  }), [data, filtro])
  const totalAberto = (data || []).filter((m) => m.status === 'aberta' || m.status === 'parcial').reduce((s, m) => s + (m.valor - m.desconto - m.valor_pago), 0)

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div><label className="label">Mês</label><input className="input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 150 }} /></div>
        {podeGerir && (
          <>
            <div><label className="label">Vencimento</label><input className="input" type="date" value={venc} onChange={(e) => setVenc(e.target.value)} style={{ width: 160 }} /></div>
            <button className="btn btn-primary" disabled={gerar.isPending} onClick={() => gerar.mutate()}><Plus size={16} /> Gerar mês</button>
          </>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          {(['todos', 'aberto', 'pago'] as const).map((k) => (
            <button key={k} className={'btn ' + (filtro === k ? 'btn-primary' : 'btn-outline')} style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setFiltro(k)}>
              {k === 'todos' ? 'Todos' : k === 'aberto' ? 'Em aberto' : 'Pagos'}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Em aberto no mês</span>
        <b style={{ color: 'var(--warn)' }}>{brl(totalAberto)}</b>
      </div>

      {isLoading ? <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando…</div>
        : lista.length === 0 ? <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhuma mensalidade neste mês. {podeGerir && 'Clique em "Gerar mês".'}</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lista.map((m) => {
                const resta = m.valor - m.desconto - m.valor_pago
                return (
                  <div key={m.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <div style={{ fontWeight: 700, color: 'var(--text)' }}>{m.jogador?.apelido || m.jogador?.nome || '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{brl(m.valor - m.desconto)}{m.valor_pago > 0 && m.status !== 'paga' ? ` · pago ${brl(m.valor_pago)}` : ''}</div>
                    </div>
                    <StatusBadge s={m.status} />
                    {podeGerir && m.status !== 'paga' && m.status !== 'isenta' && m.status !== 'cancelada' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {m.jogador?.telefone && <a className="btn btn-outline" style={{ padding: '6px 9px' }} href={waLink(m.jogador.telefone, msgCobranca(m, org))} target="_blank" rel="noreferrer" title="Cobrar no WhatsApp"><Send size={14} /></a>}
                        <button className="btn btn-outline" style={{ padding: '6px 9px' }} title="Isentar" onClick={() => isentar.mutate(m)}><Ban size={14} /></button>
                        <button className="btn btn-primary" style={{ padding: '6px 11px' }} onClick={() => setPagar(m)}><CheckCircle2 size={14} /> Pagar</button>
                      </div>
                    )}
                    {podeGerir && <span style={{ fontSize: 11, color: 'var(--text-hint)', minWidth: 60, textAlign: 'right' }}>{resta > 0 ? 'resta ' + brl(resta) : ''}</span>}
                  </div>
                )
              })}
            </div>
          )}

      {pagar && <PagamentoModal m={pagar} orgId={orgId} mes={mes} onClose={() => setPagar(null)} />}
    </div>
  )
}

function PagamentoModal({ m, orgId, mes, onClose }: { m: Mensalidade; orgId: string; mes: string; onClose: () => void }) {
  const qc = useQueryClient()
  const resta = m.valor - m.desconto - m.valor_pago
  const [valor, setValor] = useState(String(resta.toFixed(2)))
  const [data, setData] = useState(hojeISO())
  const [forma, setForma] = useState('pix')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const v = parseFloat(valor.replace(',', '.'))
      if (!(v > 0)) throw new Error('Informe um valor válido.')
      const { error } = await supabase.rpc('registrar_pagamento', { p_mensalidade_id: m.id, p_valor: v, p_data: data, p_forma: forma, p_comprovante: null, p_obs: obs || null })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mensalidades', orgId, mes] }); onClose() },
    onError: (e) => setErro((e as Error).message),
  })
  return (
    <Modal onClose={onClose} titulo={`Pagamento — ${m.jogador?.apelido || m.jogador?.nome || ''}`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label className="label">Valor (resta {brl(resta)})</label><input className="input" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div><label className="label">Data</label><input className="input" type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div><label className="label">Forma</label>
            <select className="input" value={forma} onChange={(e) => setForma(e.target.value)}>
              <option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="outro">Outro</option>
            </select>
          </div>
        </div>
        <div><label className="label">Observação</label><input className="input" value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
        <button className="btn btn-primary" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Registrar pagamento'}</button>
      </div>
    </Modal>
  )
}

function Lancamentos({ orgId, podeGerir }: { orgId: string; podeGerir: boolean }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ tipo: 'despesa', categoria: '', descricao: '', valor: '', data: hojeISO() })
  const { data } = useQuery({
    queryKey: ['lancamentos', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Lancamento[]> => (await supabase.from('lancamentos').select('*').eq('org_id', orgId).order('data', { ascending: false })).data as Lancamento[] || [],
  })
  const add = useMutation({
    mutationFn: async () => {
      const v = parseFloat(form.valor.replace(',', '.'))
      if (!(v > 0)) throw new Error('Valor inválido.')
      const { error } = await supabase.from('lancamentos').insert({ org_id: orgId, tipo: form.tipo, categoria: form.categoria || null, descricao: form.descricao || null, valor: v, data: form.data })
      if (error) throw error
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lancamentos', orgId] }); setForm({ ...form, categoria: '', descricao: '', valor: '' }) },
    onError: (e) => alert((e as Error).message),
  })
  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from('lancamentos').delete().eq('id', id); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lancamentos', orgId] }),
  })
  return (
    <div>
      {podeGerir && (
        <div className="card" style={{ padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, alignItems: 'end' }}>
          <div><label className="label">Tipo</label><select className="input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></div>
          <div><label className="label">Categoria</label><input className="input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Aluguel, arbitragem…" /></div>
          <div><label className="label">Descrição</label><input className="input" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div><label className="label">Valor</label><input className="input" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" /></div>
          <div><label className="label">Data</label><input className="input" type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></div>
          <button className="btn btn-primary" disabled={add.isPending} onClick={() => add.mutate()}><Plus size={16} /> Lançar</button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(data || []).map((l) => (
          <div key={l.id} className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge" style={{ background: (l.tipo === 'receita' ? '#2fcf6b' : '#ef4444') + '22', color: l.tipo === 'receita' ? '#2fcf6b' : '#ef4444' }}>{l.tipo === 'receita' ? 'Receita' : 'Despesa'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'var(--text)', fontWeight: 600 }}>{l.descricao || l.categoria || '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{l.categoria ? l.categoria + ' · ' : ''}{new Date(l.data).toLocaleDateString('pt-BR')}</div>
            </div>
            <b style={{ color: l.tipo === 'receita' ? 'var(--grass-light)' : 'var(--danger)' }}>{l.tipo === 'receita' ? '+' : '−'} {brl(l.valor)}</b>
            {podeGerir && <button className="btn btn-ghost" style={{ padding: 6 }} onClick={() => del.mutate(l.id)}><Trash2 size={15} /></button>}
          </div>
        ))}
        {data && data.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhum lançamento ainda.</div>}
      </div>
    </div>
  )
}

function Config({ orgId, org, podeGerir }: { orgId: string; org?: Organizacao; podeGerir: boolean }) {
  const { recarregar } = useAuth()
  const [f, setF] = useState({ mensalidade_padrao: String(org?.mensalidade_padrao ?? ''), pix_chave: org?.pix_chave || '', pix_titular: org?.pix_titular || '', banco: org?.banco || '' })
  const [msg, setMsg] = useState('')
  const salvar = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('salvar_config_financeira', {
        p_org_id: orgId, p_mensalidade_padrao: f.mensalidade_padrao ? parseFloat(f.mensalidade_padrao.replace(',', '.')) : null,
        p_pix_chave: f.pix_chave || null, p_pix_titular: f.pix_titular || null, p_banco: f.banco || null,
      })
      if (error) throw error
    },
    onSuccess: async () => { await recarregar(); setMsg('Salvo!') },
    onError: (e) => setMsg((e as Error).message),
  })
  if (!podeGerir) return <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Só admin/tesoureiro edita a configuração financeira.</div>
  return (
    <div className="card" style={{ padding: 18, maxWidth: 460 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div><label className="label">Mensalidade padrão (R$)</label><input className="input" value={f.mensalidade_padrao} onChange={(e) => setF({ ...f, mensalidade_padrao: e.target.value })} placeholder="0,00" /></div>
        <div><label className="label">Chave Pix</label><input className="input" value={f.pix_chave} onChange={(e) => setF({ ...f, pix_chave: e.target.value })} /></div>
        <div><label className="label">Titular do Pix</label><input className="input" value={f.pix_titular} onChange={(e) => setF({ ...f, pix_titular: e.target.value })} /></div>
        <div><label className="label">Banco</label><input className="input" value={f.banco} onChange={(e) => setF({ ...f, banco: e.target.value })} placeholder="C6 Bank" /></div>
        {msg && <div style={{ fontSize: 13, color: msg === 'Salvo!' ? 'var(--grass-light)' : 'var(--danger)' }}>{msg}</div>}
        <button className="btn btn-primary" disabled={salvar.isPending} onClick={() => salvar.mutate()}>{salvar.isPending ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </div>
  )
}

/* ===================== Relatórios ===================== */
const ST_LABEL: Record<string, string> = { aberta: 'Em aberto', parcial: 'Parcial', paga: 'Paga', isenta: 'Isenta', cancelada: 'Cancelada' }

function Relatorios({ orgId, grupo }: { orgId: string; grupo?: string }) {
  const [mes, setMes] = useState(mesAtual())
  const { data: mens } = useQuery({
    queryKey: ['rel-mens', orgId, mes], enabled: !!orgId,
    queryFn: async (): Promise<Mensalidade[]> => ((await supabase.from('mensalidades').select('*, jogador:jogadores(nome,apelido,telefone)').eq('org_id', orgId).eq('competencia', compDate(mes))).data as Mensalidade[] || [])
      .sort((a, b) => (a.jogador?.nome || '').localeCompare(b.jogador?.nome || '')),
  })
  const { data: lanc } = useQuery({
    queryKey: ['rel-lanc', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Lancamento[]> => (await supabase.from('lancamentos').select('*').eq('org_id', orgId).order('data', { ascending: false })).data as Lancamento[] || [],
  })

  const periodo = 'Competência ' + labelMes(compDate(mes))
  const nomeJ = (m: Mensalidade) => m.jogador?.apelido || m.jogador?.nome || '—'

  function linhasMens(lista: Mensalidade[]) {
    return lista.map((m) => ({
      Jogador: nomeJ(m), Valor: brl(m.valor - m.desconto), Pago: brl(m.valor_pago),
      Resta: brl(Math.max(0, m.valor - m.desconto - m.valor_pago)), Situação: ST_LABEL[m.status] || m.status,
    }))
  }
  function bodyMens(lista: Mensalidade[]) {
    return lista.map((m) => [nomeJ(m), brl(m.valor - m.desconto), brl(m.valor_pago), brl(Math.max(0, m.valor - m.desconto - m.valor_pago)), ST_LABEL[m.status] || m.status])
  }

  const relatorios = [
    {
      key: 'mens', nome: 'Mensalidades do mês', desc: 'Todos os jogadores, valor, pago e situação.',
      pdf: () => exportarPDF({ arquivo: `mensalidades_${mes}`, titulo: 'Mensalidades', grupo, periodo, secoes: [{ titulo: 'Mensalidades', head: ['Jogador', 'Valor', 'Pago', 'Resta', 'Situação'], body: bodyMens(mens || []) }] }),
      xlsx: () => exportarExcel(`mensalidades_${mes}`, [{ nome: 'Mensalidades', linhas: linhasMens(mens || []) }]),
    },
    {
      key: 'inad', nome: 'Inadimplentes', desc: 'Somente quem está em aberto ou parcial no mês.',
      pdf: () => { const l = (mens || []).filter((m) => m.status === 'aberta' || m.status === 'parcial'); exportarPDF({ arquivo: `inadimplentes_${mes}`, titulo: 'Inadimplentes', grupo, periodo, secoes: [{ titulo: 'Em aberto', head: ['Jogador', 'Valor', 'Pago', 'Resta', 'Situação'], body: bodyMens(l) }] }) },
      xlsx: () => { const l = (mens || []).filter((m) => m.status === 'aberta' || m.status === 'parcial'); exportarExcel(`inadimplentes_${mes}`, [{ nome: 'Inadimplentes', linhas: linhasMens(l) }]) },
    },
    {
      key: 'ext', nome: 'Extrato (receitas/despesas)', desc: 'Todos os lançamentos do grupo.',
      pdf: () => exportarPDF({ arquivo: 'extrato', titulo: 'Extrato financeiro', grupo, secoes: [{ titulo: 'Lançamentos', head: ['Data', 'Tipo', 'Categoria', 'Descrição', 'Valor'], body: (lanc || []).map((l) => [new Date(l.data).toLocaleDateString('pt-BR'), l.tipo === 'receita' ? 'Receita' : 'Despesa', l.categoria || '', l.descricao || '', (l.tipo === 'receita' ? '+ ' : '− ') + brl(l.valor)]) }] }),
      xlsx: () => exportarExcel('extrato', [{ nome: 'Extrato', linhas: (lanc || []).map((l) => ({ Data: l.data, Tipo: l.tipo, Categoria: l.categoria || '', Descrição: l.descricao || '', Valor: l.valor })) }]),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <label className="label">Mês de referência</label>
        <input className="input" type="month" value={mes} onChange={(e) => setMes(e.target.value)} style={{ width: 160 }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: 12 }}>
        {relatorios.map((r) => (
          <div key={r.key} className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>{r.nome}</div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', margin: '4px 0 12px' }}>{r.desc}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={r.pdf}><FileText size={15} /> PDF</button>
              <button className="btn btn-outline" style={{ flex: 1 }} onClick={r.xlsx}><FileSpreadsheet size={15} /> Excel</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ===================== utilitários ===================== */
function Modal({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <div className="card" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(420px,94%)', zIndex: 61, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>{titulo}</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </>
  )
}

function waLink(telefone: string, texto: string) {
  let d = (telefone || '').replace(/\D/g, '')
  if (d && !d.startsWith('55') && d.length <= 11) d = '55' + d
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`
}
function msgCobranca(m: Mensalidade, org?: Organizacao) {
  const resta = m.valor - m.desconto - m.valor_pago
  const nome = m.jogador?.apelido || m.jogador?.nome || ''
  return `Olá, ${nome}! Tudo bem?\n\nLembrete da mensalidade do futebol referente a ${labelMes(m.competencia)}.\nValor: ${brl(resta)}.` +
    (m.vencimento ? `\nVencimento: ${new Date(m.vencimento).toLocaleDateString('pt-BR')}.` : '') +
    (org?.pix_chave ? `\n\nChave Pix: ${org.pix_chave}${org.pix_titular ? ` (${org.pix_titular})` : ''}${org.banco ? `\nBanco: ${org.banco}` : ''}` : '') +
    `\n\nApós o pagamento, favor encaminhar o comprovante. Obrigado!`
}
