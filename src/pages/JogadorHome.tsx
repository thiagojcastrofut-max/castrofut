import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Check, CircleSlash, MapPin, Clock, Wallet, Swords, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

const brl = (n: number) => (n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hojeISO = () => new Date().toISOString().slice(0, 10)
const diaSemana = (d: string) => new Date(d + 'T00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })

interface Part { id: string; data: string; hora: string | null; local: string | null; status: string; presencas?: { jogador_id: string; status: string }[] }

export default function JogadorHome() {
  const { orgId, usuario, membros } = useAuth()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const org = membros.find((m) => m.org_id === orgId)?.organizacao

  const { data: meu } = useQuery({
    queryKey: ['meu-jogador', orgId], enabled: !!orgId && !!usuario,
    queryFn: async () => (await supabase.from('jogadores').select('id').eq('org_id', orgId).eq('user_id', usuario!.id).maybeSingle()).data as { id: string } | null,
  })
  const { data: prox } = useQuery({
    queryKey: ['prox-partida', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Part | null> => {
      const { data } = await supabase.from('partidas').select('*, presencas(jogador_id,status)').eq('org_id', orgId).eq('status', 'agendada').gte('data', hojeISO()).order('data').limit(1)
      return (data?.[0] as Part) || null
    },
  })
  const { data: mens } = useQuery({
    queryKey: ['minhas-mens', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('mensalidades').select('valor,desconto,valor_pago,status').eq('org_id', orgId)).data as { valor: number; desconto: number; valor_pago: number; status: string }[] || [],
  })
  const { data: debs } = useQuery({
    queryKey: ['meus-deb', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('debitos').select('valor,status').eq('org_id', orgId)).data as { valor: number; status: string }[] || [],
  })
  const { data: seriesAbertas } = useQuery({
    queryKey: ['series-insc', orgId], enabled: !!orgId,
    queryFn: async () => (await supabase.from('series').select('id,nome').eq('org_id', orgId).eq('status', 'inscricao')).data as { id: string; nome: string | null }[] || [],
  })

  const confirmar = useMutation({
    mutationFn: async (status: string) => { const { error } = await supabase.rpc('confirmar_presenca', { p_partida_id: prox!.id, p_status: status }); if (error) throw error },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prox-partida', orgId] }),
    onError: (e) => alert((e as Error).message),
  })

  const aberto = (mens || []).filter((m) => m.status === 'aberta' || m.status === 'parcial').reduce((s, m) => s + (m.valor - m.desconto - m.valor_pago), 0)
    + (debs || []).filter((d) => d.status === 'aberto').reduce((s, d) => s + d.valor, 0)
  const meuStatus = prox?.presencas?.find((x) => x.jogador_id === meu?.id)?.status
  const confirmados = prox?.presencas?.filter((x) => x.status === 'confirmado').length || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Olá, {usuario?.nome?.split(' ')[0] || 'craque'}! 👋</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13.5, margin: 0 }}>{org?.nome}</p>
      </div>

      {/* Próxima partida */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hint)', textTransform: 'uppercase', marginBottom: 8 }}>Próxima partida</div>
        {prox ? (
          <>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text)', textTransform: 'capitalize' }}>{diaSemana(prox.data)}</div>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', color: 'var(--text-muted)', fontSize: 13, margin: '4px 0 2px' }}>
              {prox.hora && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Clock size={13} /> {prox.hora.slice(0, 5)}</span>}
              {prox.local && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {prox.local}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-hint)', marginBottom: 12 }}>{confirmados} confirmado(s)</div>
            {meu ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className={'btn ' + (meuStatus === 'confirmado' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1 }} disabled={confirmar.isPending} onClick={() => confirmar.mutate('confirmado')}><Check size={16} /> Vou</button>
                <button className={'btn ' + (meuStatus === 'recusado' ? 'btn-primary' : 'btn-outline')} style={{ flex: 1 }} disabled={confirmar.isPending} onClick={() => confirmar.mutate('recusado')}><CircleSlash size={16} /> Não vou</button>
              </div>
            ) : <div style={{ fontSize: 12.5, color: 'var(--text-hint)' }}>Sua ficha de jogador ainda não está vinculada.</div>}
          </>
        ) : <div style={{ color: 'var(--text-muted)', fontSize: 13.5 }}>Nenhuma partida agendada no momento.</div>}
      </div>

      {/* Minhas cobranças */}
      <button className="card" onClick={() => navigate('/financeiro')} style={{ padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 42, height: 42, borderRadius: 10, background: aberto > 0 ? 'rgba(245,158,11,.15)' : 'rgba(47,207,107,.15)', display: 'grid', placeItems: 'center' }}>
          <Wallet size={20} color={aberto > 0 ? 'var(--warn)' : 'var(--grass-light)'} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>Minhas cobranças em aberto</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: aberto > 0 ? 'var(--warn)' : 'var(--grass-light)' }}>{brl(aberto)}</div>
          {aberto > 0 && org?.pix_chave && <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>Pix: {org.pix_chave}</div>}
        </div>
        <ChevronRight size={18} color="var(--text-hint)" />
      </button>

      {/* Séries com inscrição aberta */}
      {(seriesAbertas || []).length > 0 && (
        <button className="card" onClick={() => navigate('/series')} style={{ padding: 16, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, borderColor: 'var(--grass)' }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'rgba(15,138,60,.15)', display: 'grid', placeItems: 'center' }}><Swords size={20} color="var(--grass-light)" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)' }}>Inscrição aberta!</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{(seriesAbertas || []).length} série(s) esperando você marcar presença.</div>
          </div>
          <ChevronRight size={18} color="var(--text-hint)" />
        </button>
      )}
    </div>
  )
}
