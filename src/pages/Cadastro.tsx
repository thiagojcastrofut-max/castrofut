import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthShell } from '../components/AuthShell'
import type { Posicao, Pe } from '../lib/types'

const POSICOES: { v: Posicao; l: string }[] = [
  { v: 'goleiro', l: 'Goleiro' }, { v: 'zagueiro', l: 'Zagueiro' }, { v: 'lateral', l: 'Lateral' },
  { v: 'volante', l: 'Volante' }, { v: 'meia', l: 'Meia' }, { v: 'atacante', l: 'Atacante' },
]
const PES: { v: Pe; l: string }[] = [
  { v: 'direito', l: 'Direito' }, { v: 'esquerdo', l: 'Esquerdo' }, { v: 'ambidestro', l: 'Ambidestro' },
]

export default function Cadastro() {
  const [orgs, setOrgs] = useState<{ id: string; nome: string }[]>([])
  const [form, setForm] = useState({
    nome: '', email: '', telefone: '', senha: '', org_id: '',
    posicao_principal: '' as Posicao | '', posicao_secundaria: '' as Posicao | '', pe_dominante: '' as Pe | '', nascimento: '',
  })
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState(false)
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    supabase.rpc('orgs_para_cadastro').then(({ data }) => {
      if (Array.isArray(data)) setOrgs(data as { id: string; nome: string }[])
    })
  }, [])

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    if (!form.org_id) { setErro('Escolha o grupo.'); return }
    setCarregando(true)
    try {
      const { error } = await supabase.auth.signUp({
        email: form.email.trim(),
        password: form.senha,
        options: {
          data: {
            nome: form.nome.trim(),
            telefone: form.telefone.trim(),
            org_id: form.org_id,
            posicao_principal: form.posicao_principal || null,
            posicao_secundaria: form.posicao_secundaria || null,
            pe_dominante: form.pe_dominante || null,
            nascimento: form.nascimento || null,
          },
        },
      })
      if (error) throw error
      setOk(true)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  if (ok) {
    return (
      <AuthShell titulo="Cadastro enviado! ✅">
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Seu cadastro foi enviado para o grupo. Um membro da <b>comissão</b> vai validar seu acesso.
          Se o sistema pedir, confirme seu e-mail. Assim que for aprovado, você já poderá entrar.
        </p>
        <Link to="/login" className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>Voltar para o login</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell titulo="Criar conta" subtitulo="Preencha seus dados — a comissão valida seu acesso">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Campo label="Grupo">
          <select className="input" value={form.org_id} onChange={set('org_id')} required>
            <option value="">Selecione o grupo…</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
          </select>
        </Campo>
        <Campo label="Nome completo"><input className="input" value={form.nome} onChange={set('nome')} required /></Campo>
        <Campo label="E-mail"><input className="input" type="email" value={form.email} onChange={set('email')} required /></Campo>
        <Campo label="Telefone (WhatsApp)"><input className="input" value={form.telefone} onChange={set('telefone')} placeholder="(31) 9...." /></Campo>
        <Campo label="Senha"><input className="input" type="password" value={form.senha} onChange={set('senha')} required minLength={6} /></Campo>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Campo label="Posição principal">
            <select className="input" value={form.posicao_principal} onChange={set('posicao_principal')}>
              <option value="">—</option>
              {POSICOES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </Campo>
          <Campo label="Posição secundária">
            <select className="input" value={form.posicao_secundaria} onChange={set('posicao_secundaria')}>
              <option value="">—</option>
              {POSICOES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </Campo>
          <Campo label="Pé dominante">
            <select className="input" value={form.pe_dominante} onChange={set('pe_dominante')}>
              <option value="">—</option>
              {PES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
            </select>
          </Campo>
          <Campo label="Nascimento"><input className="input" type="date" value={form.nascimento} onChange={set('nascimento')} /></Campo>
        </div>

        {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
        <button className="btn btn-primary" type="submit" disabled={carregando}>
          {carregando ? 'Enviando…' : 'Enviar cadastro'}
        </button>
      </form>
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
        <Link to="/login" style={{ color: 'var(--text-muted)' }}>Já tenho conta — entrar</Link>
      </div>
    </AuthShell>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="label">{label}</label>{children}</div>
}
