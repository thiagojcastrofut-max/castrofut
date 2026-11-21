import { useQuery } from '@tanstack/react-query'
import { Goal, Footprints, CalendarCheck, ShieldAlert } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Estat {
  jogador_id: string; nome: string; apelido: string | null; foto_url: string | null; posicao_principal: string | null
  presencas: number; gols: number; assistencias: number; amarelos: number; azuis: number; vermelhos: number
}
const apel = (e: Estat) => e.apelido || e.nome
const inic = (e: Estat) => e.nome.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')
const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`

export default function Rankings() {
  const { orgId, usuario } = useAuth()
  const { data } = useQuery({
    queryKey: ['estatisticas', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Estat[]> => (await supabase.from('vw_estatisticas').select('*').eq('org_id', orgId)).data as Estat[] || [],
  })
  const { data: meu } = useQuery({
    queryKey: ['meu-jogador', orgId], enabled: !!orgId && !!usuario,
    queryFn: async () => (await supabase.from('jogadores').select('id').eq('org_id', orgId).eq('user_id', usuario!.id).maybeSingle()).data as { id: string } | null,
  })
  const lista = data || []
  const minha = lista.find((e) => e.jogador_id === meu?.id)
  const cartoes = (e: Estat) => e.amarelos + e.azuis + e.vermelhos

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 14px' }}>Rankings & Estatísticas</h1>

      {minha && (
        <div className="card" style={{ padding: 16, marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hint)', textTransform: 'uppercase', marginBottom: 10 }}>Minha ficha</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(80px,1fr))', gap: 10 }}>
            <Mini l="Jogos" v={minha.presencas} />
            <Mini l="Gols" v={minha.gols} c="var(--grass-light)" />
            <Mini l="Assist." v={minha.assistencias} c="#42a5f5" />
            <Mini l="🟨" v={minha.amarelos} />
            <Mini l="🟥" v={minha.vermelhos} />
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
        <Quadro titulo="Artilheiros" icon={Goal} dados={[...lista].filter((e) => e.gols > 0).sort((a, b) => b.gols - a.gols)} valor={(e) => e.gols} sufixo="gols" />
        <Quadro titulo="Assistências" icon={Footprints} dados={[...lista].filter((e) => e.assistencias > 0).sort((a, b) => b.assistencias - a.assistencias)} valor={(e) => e.assistencias} sufixo="assist." />
        <Quadro titulo="Presença" icon={CalendarCheck} dados={[...lista].filter((e) => e.presencas > 0).sort((a, b) => b.presencas - a.presencas)} valor={(e) => e.presencas} sufixo="jogos" />
        <Quadro titulo="Cartões" icon={ShieldAlert} dados={[...lista].filter((e) => cartoes(e) > 0).sort((a, b) => cartoes(b) - cartoes(a))} valor={cartoes} sufixo="cartões" />
      </div>

      {lista.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)', marginTop: 14 }}>Ainda sem dados. As estatísticas aparecem conforme as partidas são registradas.</div>}
    </div>
  )
}

function Mini({ l, v, c }: { l: string; v: number; c?: string }) {
  return (
    <div style={{ textAlign: 'center', background: 'var(--bg-elev)', borderRadius: 9, padding: '10px 6px' }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: c || 'var(--text)' }}>{v}</div>
      <div style={{ fontSize: 10.5, color: 'var(--text-hint)' }}>{l}</div>
    </div>
  )
}

function Quadro({ titulo, icon: Icon, dados, valor, sufixo }: { titulo: string; icon: typeof Goal; dados: Estat[]; valor: (e: Estat) => number; sufixo: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Icon size={18} color="var(--grass-light)" />
        <b style={{ color: 'var(--text)' }}>{titulo}</b>
      </div>
      {dados.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-hint)' }}>Sem registros.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {dados.slice(0, 10).map((e, i) => (
            <div key={e.jogador_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 24, textAlign: 'center', fontSize: i < 3 ? 15 : 12, color: 'var(--text-muted)', fontWeight: 700 }}>{medal(i)}</span>
              {e.foto_url ? <img src={e.foto_url} width={28} height={28} style={{ borderRadius: '50%', objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-elev)', color: 'var(--grass-light)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>{inic(e)}</div>}
              <span style={{ flex: 1, color: 'var(--text)', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{apel(e)}</span>
              <b style={{ color: 'var(--grass-light)' }}>{valor(e)}</b>
              <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{sufixo}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
