import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, X, Swords, Star, ArrowLeft, Crown, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'

interface Jog { id: string; nome: string; apelido: string | null; nivel_tecnico: number | null }
interface SJ { id: string; jogador_id: string; time: string | null; ordem_pick: number | null; jogador?: Jog }
interface Serie {
  id: string; org_id: string; nome: string | null; formato: number; status: string
  capitao_a: string; capitao_b: string; vez: string; vitorias_a: number; vitorias_b: number
  vitorias_necessarias: number; vencedor: string | null
  equipe_a_nome: string | null; equipe_b_nome: string | null; inscricao_ate: string | null
}
interface Churrasco { id: string; valor_total: number; equipe_perdedora: string | null }

const apel = (j?: Jog) => j?.apelido || j?.nome || '—'

export default function Series() {
  const { orgId, temPapel } = useAuth()
  const podeGerir = temPapel('admin_geral', 'comissao')
  const [sel, setSel] = useState<string | null>(null)
  const [criar, setCriar] = useState(false)

  const { data } = useQuery({
    queryKey: ['series', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Serie[]> => (await supabase.from('series').select('*').eq('org_id', orgId).order('criado_em', { ascending: false })).data as Serie[] || [],
  })

  if (sel) return <Draft serieId={sel} onVoltar={() => setSel(null)} />

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>Séries</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>Melhor de N com capitães escolhendo os times.</p>
        </div>
        {podeGerir && <button className="btn btn-primary" onClick={() => setCriar(true)}><Plus size={16} /> Nova série</button>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {(data || []).map((s) => (
          <button key={s.id} className="card" onClick={() => setSel(s.id)} style={{ padding: 14, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}>
            <Swords size={20} color="var(--grass-light)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: 'var(--text)' }}>{s.nome || 'Série'} · melhor de {s.formato}</div>
              <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>Time A {s.vitorias_a} × {s.vitorias_b} Time B</div>
            </div>
            <span className="badge" style={{ background: s.status === 'encerrada' ? 'var(--bg-elev)' : s.status === 'em_andamento' ? 'rgba(15,138,60,.15)' : 'rgba(245,158,11,.15)', color: s.status === 'encerrada' ? 'var(--text-hint)' : s.status === 'em_andamento' ? 'var(--grass-light)' : 'var(--warn)' }}>
              {s.status === 'inscricao' ? 'Inscrições abertas' : s.status === 'draft' ? 'Escolhendo times' : s.status === 'em_andamento' ? 'Em andamento' : 'Encerrada'}
            </span>
          </button>
        ))}
        {data && data.length === 0 && <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Nenhuma série ainda.</div>}
      </div>

      {criar && <CriarSerie orgId={orgId!} onClose={() => setCriar(false)} onCriada={(id) => { setCriar(false); setSel(id) }} />}
    </div>
  )
}

/* ============ Draft em tempo real ============ */
function Draft({ serieId, onVoltar }: { serieId: string; onVoltar: () => void }) {
  const { orgId, usuario, temPapel } = useAuth()
  const qc = useQueryClient()
  const podeGerir = temPapel('admin_geral', 'comissao')

  const { data: meu } = useQuery({
    queryKey: ['meu-jogador', orgId], enabled: !!orgId && !!usuario,
    queryFn: async () => (await supabase.from('jogadores').select('id').eq('org_id', orgId).eq('user_id', usuario!.id).maybeSingle()).data as { id: string } | null,
  })
  const { data } = useQuery({
    queryKey: ['serie', serieId], enabled: !!serieId,
    queryFn: async () => {
      const { data: s } = await supabase.from('series').select('*').eq('id', serieId).single()
      const { data: sj } = await supabase.from('series_jogadores').select('*, jogador:jogadores(id,nome,apelido,nivel_tecnico)').eq('serie_id', serieId)
      return { serie: s as Serie, jogadores: (sj || []) as SJ[] }
    },
  })

  // Realtime: qualquer mudança na série/escolhas recarrega o board
  useEffect(() => {
    const ch = supabase.channel('draft-' + serieId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'series_jogadores', filter: `serie_id=eq.${serieId}` }, () => qc.invalidateQueries({ queryKey: ['serie', serieId] }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'series', filter: `id=eq.${serieId}` }, () => qc.invalidateQueries({ queryKey: ['serie', serieId] }))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [serieId, qc])

  const escolher = useMutation({
    mutationFn: async (jid: string) => { const { error } = await supabase.rpc('escolher_jogador', { p_serie_id: serieId, p_jogador_id: jid }); if (error) throw error },
    onError: (e) => alert((e as Error).message),
  })
  const mover = useMutation({
    mutationFn: async ({ jid, time }: { jid: string; time: string | null }) => { const { error } = await supabase.rpc('mover_jogador', { p_serie_id: serieId, p_jogador_id: jid, p_time: time }); if (error) throw error },
    onError: (e) => alert((e as Error).message),
  })
  const fechar = useMutation({
    mutationFn: async () => { const { error } = await supabase.rpc('fechar_times', { p_serie_id: serieId }); if (error) throw error },
    onError: (e) => alert((e as Error).message),
  })
  const { data: chur } = useQuery({
    queryKey: ['churrasco', serieId], enabled: !!serieId,
    queryFn: async () => (await supabase.from('churrascos').select('*').eq('serie_id', serieId).maybeSingle()).data as Churrasco | null,
  })
  const regJogo = useMutation({ mutationFn: async (v: 'a' | 'b') => { const { error } = await supabase.rpc('registrar_jogo_serie', { p_serie_id: serieId, p_vencedor: v }); if (error) throw error }, onSuccess: () => qc.invalidateQueries({ queryKey: ['serie', serieId] }), onError: (e) => alert((e as Error).message) })
  const desfazer = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('desfazer_jogo_serie', { p_serie_id: serieId }); if (error) throw error }, onSuccess: () => qc.invalidateQueries({ queryKey: ['serie', serieId] }), onError: (e) => alert((e as Error).message) })
  const criarChur = useMutation({ mutationFn: async (valor: number) => { const { error } = await supabase.rpc('criar_churrasco', { p_serie_id: serieId, p_valor: valor }); if (error) throw error }, onSuccess: () => qc.invalidateQueries({ queryKey: ['churrasco', serieId] }), onError: (e) => alert((e as Error).message) })
  const podeJuiz = temPapel('admin_geral', 'comissao', 'juiz')

  if (!data?.serie) return <div className="card" style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando…</div>
  const s = data.serie
  const js = data.jogadores
  const meuId = meu?.id
  const nomeA = s.equipe_a_nome || 'Time A'
  const nomeB = s.equipe_b_nome || 'Time B'
  if (s.status === 'inscricao') return <Inscricao serieId={serieId} s={s} js={js} orgId={orgId!} meuId={meuId} podeGerir={podeGerir} nomeA={nomeA} nomeB={nomeB} onVoltar={onVoltar} />
  const souCapA = meuId === s.capitao_a, souCapB = meuId === s.capitao_b
  const draft = s.status === 'draft'
  const minhaVez = draft && ((s.vez === 'a' && souCapA) || (s.vez === 'b' && souCapB) || podeGerir)
  const podeAjustar = draft && (souCapA || souCapB || podeGerir)

  const pool = js.filter((x) => !x.time).sort((a, b) => apel(a.jogador).localeCompare(apel(b.jogador)))
  const timeA = js.filter((x) => x.time === 'a').sort((a, b) => (a.ordem_pick || 0) - (b.ordem_pick || 0))
  const timeB = js.filter((x) => x.time === 'b').sort((a, b) => (a.ordem_pick || 0) - (b.ordem_pick || 0))
  const soma = (arr: SJ[]) => arr.reduce((t, x) => t + (x.jogador?.nivel_tecnico || 0), 0)

  const vezLabel = s.vez === 'a' ? nomeA : nomeB

  function Coluna({ titulo, arr, time, cap }: { titulo: string; arr: SJ[]; time: 'a' | 'b'; cap: string }) {
    return (
      <div className="card" style={{ padding: 12, flex: 1, minWidth: 150 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <b style={{ color: 'var(--text)' }}>{titulo}</b>
          <span style={{ fontSize: 11, color: 'var(--text-hint)' }}>{arr.length} · <Star size={10} style={{ fill: '#f5c518', color: '#f5c518' }} /> {soma(arr)}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {arr.map((x) => (
            <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text)', background: 'var(--bg-elev)', borderRadius: 7, padding: '6px 8px' }}>
              {x.jogador_id === cap && <Crown size={13} color="#f5c518" />}
              <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{apel(x.jogador)}</span>
              <Niv n={x.jogador?.nivel_tecnico} />
              {podeAjustar && x.jogador_id !== cap && (
                <div style={{ display: 'flex', gap: 3 }}>
                  <MiniBtn l={time === 'a' ? 'B' : 'A'} onClick={() => mover.mutate({ jid: x.jogador_id, time: time === 'a' ? 'b' : 'a' })} />
                  <MiniBtn l="↩" onClick={() => mover.mutate({ jid: x.jogador_id, time: null })} />
                </div>
              )}
            </div>
          ))}
          {arr.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-hint)' }}>—</div>}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 10, padding: '4px 8px' }} onClick={onVoltar}><ArrowLeft size={16} /> Voltar</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 4px' }}>{s.nome || 'Série'} · melhor de {s.formato}</h1>

      {draft ? (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, background: minhaVez ? 'rgba(15,138,60,.12)' : 'var(--bg-card)', borderColor: minhaVez ? 'var(--grass)' : 'var(--border)' }}>
          {pool.length === 0
            ? <span style={{ color: 'var(--text-muted)' }}>Todos escolhidos! Ajuste os times se quiser e clique em <b>Fechar times</b>.</span>
            : <span style={{ color: 'var(--text)' }}>Vez do <b style={{ color: 'var(--grass-light)' }}>{vezLabel}</b>{minhaVez ? ' — é a sua vez! Toque num jogador disponível.' : ' — aguardando o capitão…'}</span>}
        </div>
      ) : (
        <div className="badge" style={{ background: 'rgba(15,138,60,.15)', color: 'var(--grass-light)', marginBottom: 14 }}>Times fechados · {s.status === 'encerrada' ? 'série encerrada' : 'em andamento'}</div>
      )}

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <Coluna titulo={nomeA} arr={timeA} time="a" cap={s.capitao_a} />
        <Coluna titulo={nomeB} arr={timeB} time="b" cap={s.capitao_b} />
      </div>

      {draft && (
        <>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hint)', textTransform: 'uppercase', letterSpacing: .5, margin: '4px 0 8px' }}>Disponíveis ({pool.length})</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {pool.map((x) => (
              <button key={x.id} className="card" disabled={!minhaVez || escolher.isPending}
                onClick={() => escolher.mutate(x.jogador_id)}
                style={{ padding: '8px 12px', cursor: minhaVez ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 7, opacity: minhaVez ? 1 : 0.6 }}>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{apel(x.jogador)}</span>
                <Niv n={x.jogador?.nivel_tecnico} />
              </button>
            ))}
            {pool.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-hint)' }}>Pool vazio.</span>}
          </div>
          {podeAjustar && (
            <button className="btn btn-primary" disabled={fechar.isPending || timeA.length < 1 || timeB.length < 1} onClick={() => fechar.mutate()}>
              <Lock size={16} /> Fechar times e iniciar série
            </button>
          )}
        </>
      )}

      {!draft && (
        <ResultadoSerie s={s} chur={chur || null} podeJuiz={podeJuiz} podeGerir={podeGerir} nomeA={nomeA} nomeB={nomeB}
          onJogo={(v) => regJogo.mutate(v)} onDesfazer={() => desfazer.mutate()} onChurrasco={(v) => criarChur.mutate(v)} />
      )}
    </div>
  )
}

function ResultadoSerie({ s, chur, podeJuiz, podeGerir, nomeA, nomeB, onJogo, onDesfazer, onChurrasco }: {
  s: Serie; chur: Churrasco | null; podeJuiz: boolean; podeGerir: boolean; nomeA: string; nomeB: string
  onJogo: (v: 'a' | 'b') => void; onDesfazer: () => void; onChurrasco: (valor: number) => void
}) {
  const [valor, setValor] = useState('')
  const encerrada = s.status === 'encerrada'
  const jogos = s.vitorias_a + s.vitorias_b
  const campeaTxt = s.vencedor === 'a' ? nomeA : nomeB
  const perdedoraTxt = s.vencedor === 'a' ? nomeB : nomeA
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ textAlign: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>Série · melhor de {s.formato} (precisa {s.vitorias_necessarias})</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)' }}>
          {nomeA} <span style={{ color: 'var(--grass-light)' }}>{s.vitorias_a}</span> × <span style={{ color: 'var(--grass-light)' }}>{s.vitorias_b}</span> {nomeB}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-hint)' }}>{jogos} jogo(s) disputado(s)</div>
      </div>

      {!encerrada && podeJuiz && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => onJogo('a')}>{nomeA} venceu</button>
          <button className="btn btn-primary" onClick={() => onJogo('b')}>{nomeB} venceu</button>
          {jogos > 0 && <button className="btn btn-ghost" onClick={onDesfazer}>Desfazer último</button>}
        </div>
      )}

      {encerrada && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f5c518', marginBottom: 2 }}>🏆 Campeã: {campeaTxt}</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>🍖 Churrasco por conta do {perdedoraTxt}</div>
          {chur ? (
            <div className="badge" style={{ background: 'rgba(15,138,60,.15)', color: 'var(--grass-light)' }}>
              Churrasco lançado: {(chur.valor_total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — dividido entre o {perdedoraTxt} (ver Financeiro → Cartões/Débitos)
            </div>
          ) : podeGerir ? (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div><label className="label">Valor total do churrasco (R$)</label><input className="input" style={{ width: 160 }} value={valor} onChange={(e) => setValor(e.target.value)} placeholder="0,00" /></div>
              <button className="btn btn-primary" disabled={!valor} onClick={() => onChurrasco(parseFloat(valor.replace(',', '.')))}>Gerar cobrança</button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Niv({ n }: { n: number | null | undefined }) {
  return <span style={{ fontSize: 11, color: '#f5c518', display: 'inline-flex', alignItems: 'center', gap: 2 }}><Star size={10} style={{ fill: '#f5c518' }} />{n || 0}</span>
}
function MiniBtn({ l, onClick }: { l: string; onClick: () => void }) {
  return <button onClick={onClick} style={{ width: 22, height: 22, borderRadius: 6, border: '1px solid var(--border-strong)', background: 'var(--bg-card)', color: 'var(--text-muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', lineHeight: 1 }}>{l}</button>
}

/* ============ Fase de inscrição (enquete) ============ */
function Inscricao({ serieId, s, js, orgId, meuId, podeGerir, nomeA, nomeB, onVoltar }: {
  serieId: string; s: Serie; js: SJ[]; orgId: string; meuId?: string; podeGerir: boolean; nomeA: string; nomeB: string; onVoltar: () => void
}) {
  const qc = useQueryClient()
  const [na, setNa] = useState(s.equipe_a_nome || ''); const [nb, setNb] = useState(s.equipe_b_nome || '')
  const [addId, setAddId] = useState('')
  const souCapitao = meuId === s.capitao_a || meuId === s.capitao_b
  const souInscrito = js.some((x) => x.jogador_id === meuId)
  const prazoPassou = s.inscricao_ate ? new Date(s.inscricao_ate) < new Date() : false
  const inv = () => qc.invalidateQueries({ queryKey: ['serie', serieId] })

  const { data: jogs } = useQuery({
    queryKey: ['jogs-ativos', orgId], enabled: podeGerir,
    queryFn: async (): Promise<Jog[]> => (await supabase.from('jogadores').select('id,nome,apelido,nivel_tecnico').eq('org_id', orgId).eq('situacao', 'ativo').order('nome')).data as Jog[] || [],
  })
  const naoInscritos = (jogs || []).filter((j) => !js.some((x) => x.jogador_id === j.id))

  const participar = useMutation({ mutationFn: async (v: boolean) => { const { error } = await supabase.rpc('inscrever_serie', { p_serie_id: serieId, p_participar: v }); if (error) throw error }, onSuccess: inv, onError: (e) => alert((e as Error).message) })
  const addRem = useMutation({ mutationFn: async ({ jid, inc }: { jid: string; inc: boolean }) => { const { error } = await supabase.rpc('inscrever_jogador_serie', { p_serie_id: serieId, p_jogador_id: jid, p_incluir: inc }); if (error) throw error }, onSuccess: () => { setAddId(''); inv() }, onError: (e) => alert((e as Error).message) })
  const abrir = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('abrir_draft', { p_serie_id: serieId }); if (error) throw error }, onSuccess: inv, onError: (e) => alert((e as Error).message) })
  const salvarNomes = useMutation({ mutationFn: async () => { const { error } = await supabase.rpc('definir_nomes_times', { p_serie_id: serieId, p_nome_a: na || null, p_nome_b: nb || null }); if (error) throw error }, onSuccess: inv, onError: (e) => alert((e as Error).message) })

  const timeCap = (jid: string) => jid === s.capitao_a ? nomeA : jid === s.capitao_b ? nomeB : null

  return (
    <div>
      <button className="btn btn-ghost" style={{ marginBottom: 10, padding: '4px 8px' }} onClick={onVoltar}><ArrowLeft size={16} /> Voltar</button>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{s.nome || 'Série'} · inscrições abertas</h1>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '0 0 14px' }}>
        {s.inscricao_ate ? <>Prazo: <b style={{ color: prazoPassou ? 'var(--danger)' : 'var(--text)' }}>{new Date(s.inscricao_ate).toLocaleString('pt-BR')}</b>{prazoPassou ? ' (encerrado)' : ''}</> : 'Marque quem vai participar.'}
      </p>

      {(podeGerir || souCapitao) && (
        <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><label className="label">Nome do {nomeA}</label><input className="input" style={{ width: 150 }} value={na} onChange={(e) => setNa(e.target.value)} /></div>
          <div><label className="label">Nome do {nomeB}</label><input className="input" style={{ width: 150 }} value={nb} onChange={(e) => setNb(e.target.value)} /></div>
          <button className="btn btn-outline" onClick={() => salvarNomes.mutate()}>Salvar nomes</button>
        </div>
      )}

      {!souCapitao && meuId && !prazoPassou && (
        <button className={'btn ' + (souInscrito ? 'btn-outline' : 'btn-primary')} style={{ marginBottom: 14 }} disabled={participar.isPending}
          onClick={() => participar.mutate(!souInscrito)}>
          {souInscrito ? '✓ Estou dentro — sair da série' : 'Vou participar!'}
        </button>
      )}
      {souCapitao && <div className="badge" style={{ background: 'rgba(245,197,24,.15)', color: '#f5c518', marginBottom: 14 }}><Crown size={13} /> Você é capitão (já inscrito)</div>}

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-hint)', textTransform: 'uppercase', margin: '0 0 8px' }}>Inscritos ({js.length})</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
        {js.sort((a, b) => apel(a.jogador).localeCompare(apel(b.jogador))).map((x) => (
          <div key={x.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elev)', borderRadius: 7, padding: '7px 10px', fontSize: 14, color: 'var(--text)' }}>
            {timeCap(x.jogador_id) && <Crown size={13} color="#f5c518" />}
            <span style={{ flex: 1 }}>{apel(x.jogador)}{timeCap(x.jogador_id) ? <span style={{ color: 'var(--text-hint)', fontSize: 11 }}> · capitão {timeCap(x.jogador_id)}</span> : ''}</span>
            <Niv n={x.jogador?.nivel_tecnico} />
            {podeGerir && x.jogador_id !== s.capitao_a && x.jogador_id !== s.capitao_b && (
              <button className="btn btn-ghost" style={{ padding: 3 }} title="Remover" onClick={() => addRem.mutate({ jid: x.jogador_id, inc: false })}><X size={14} /></button>
            )}
          </div>
        ))}
      </div>

      {podeGerir && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 8, fontSize: 13 }}>Comissão</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
            <select className="input" style={{ flex: 1, minWidth: 160 }} value={addId} onChange={(e) => setAddId(e.target.value)}>
              <option value="">Adicionar quem não marcou…</option>
              {naoInscritos.map((j) => <option key={j.id} value={j.id}>{apel(j)}</option>)}
            </select>
            <button className="btn btn-outline" disabled={!addId} onClick={() => addRem.mutate({ jid: addId, inc: true })}>Adicionar</button>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={js.length < 2} onClick={() => { if (confirm('Encerrar inscrições e abrir o draft?')) abrir.mutate() }}>Abrir o draft</button>
        </div>
      )}
    </div>
  )
}

/* ============ Criar série ============ */
function CriarSerie({ orgId, onClose, onCriada }: { orgId: string; onClose: () => void; onCriada: (id: string) => void }) {
  const [nome, setNome] = useState('')
  const [formato, setFormato] = useState(3)
  const [nomeA, setNomeA] = useState('')
  const [nomeB, setNomeB] = useState('')
  const [prazo, setPrazo] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [capA, setCapA] = useState('')
  const [capB, setCapB] = useState('')
  const [erro, setErro] = useState('')
  const { data: jogs } = useQuery({
    queryKey: ['jogs-ativos', orgId], enabled: !!orgId,
    queryFn: async (): Promise<Jog[]> => (await supabase.from('jogadores').select('id,nome,apelido,nivel_tecnico').eq('org_id', orgId).eq('situacao', 'ativo').order('nome')).data as Jog[] || [],
  })
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const selecionados = (jogs || []).filter((j) => sel.has(j.id))

  const criar = useMutation({
    mutationFn: async () => {
      if (!capA || !capB || capA === capB) throw new Error('Escolha dois capitães diferentes.')
      const ids = new Set(sel); ids.add(capA); ids.add(capB)
      const { data, error } = await supabase.rpc('criar_serie', {
        p_org_id: orgId, p_partida_id: null, p_nome: nome || null, p_formato: formato,
        p_capitao_a: capA, p_capitao_b: capB, p_jogadores: Array.from(ids),
        p_nome_a: nomeA || null, p_nome_b: nomeB || null, p_inscricao_ate: prazo ? new Date(prazo).toISOString() : null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (id) => onCriada(id),
    onError: (e) => setErro((e as Error).message),
  })

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 60 }} />
      <div className="card" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 'min(460px,94%)', maxHeight: '88vh', overflowY: 'auto', zIndex: 61, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', margin: 0 }}>Nova série</h2>
          <button className="btn btn-ghost" style={{ padding: 6 }} onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10 }}>
            <div><label className="label">Nome (opcional)</label><input className="input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Pelada de sábado" /></div>
            <div><label className="label">Melhor de</label><select className="input" value={formato} onChange={(e) => setFormato(+e.target.value)}><option value={1}>1</option><option value={3}>3</option><option value={5}>5</option></select></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Nome do Time A</label><input className="input" value={nomeA} onChange={(e) => setNomeA(e.target.value)} placeholder="Ex.: Caveiras" /></div>
            <div><label className="label">Nome do Time B</label><input className="input" value={nomeB} onChange={(e) => setNomeB(e.target.value)} placeholder="Ex.: Fantasmas" /></div>
          </div>
          <div><label className="label">Prazo da inscrição (opcional)</label><input className="input" type="datetime-local" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
          <div>
            <label className="label">Pré-inscritos (opcional — os demais se inscrevem depois) ({sel.size})</label>
            <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border-strong)', borderRadius: 8, padding: 6 }}>
              {(jogs || []).map((j) => (
                <label key={j.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px', cursor: 'pointer', fontSize: 14, color: 'var(--text)' }}>
                  <input type="checkbox" checked={sel.has(j.id)} onChange={() => toggle(j.id)} />
                  <span style={{ flex: 1 }}>{apel(j)}</span><Niv n={j.nivel_tecnico} />
                </label>
              ))}
              {(jogs || []).length === 0 && <div style={{ fontSize: 13, color: 'var(--text-hint)', padding: 6 }}>Nenhum jogador ativo.</div>}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div><label className="label">Capitão A</label>
              <select className="input" value={capA} onChange={(e) => setCapA(e.target.value)}><option value="">—</option>{selecionados.map((j) => <option key={j.id} value={j.id}>{apel(j)}</option>)}</select></div>
            <div><label className="label">Capitão B</label>
              <select className="input" value={capB} onChange={(e) => setCapB(e.target.value)}><option value="">—</option>{selecionados.map((j) => <option key={j.id} value={j.id}>{apel(j)}</option>)}</select></div>
          </div>
          {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          <button className="btn btn-primary" disabled={criar.isPending || !capA || !capB} onClick={() => criar.mutate()}>{criar.isPending ? 'Criando…' : 'Criar e abrir inscrições'}</button>
          <p style={{ fontSize: 11.5, color: 'var(--text-hint)', margin: 0 }}>A série abre em <b>inscrição</b>: os jogadores marcam se vão participar (até o prazo). Depois a comissão abre o <b>draft</b> e os capitães escolhem.</p>
        </div>
      </div>
    </>
  )
}
