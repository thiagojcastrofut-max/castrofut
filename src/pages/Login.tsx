import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { AuthShell } from '../components/AuthShell'

export default function Login() {
  const { entrar } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      await entrar(email.trim(), senha)
    } catch (err) {
      setErro(traduzErro((err as Error).message))
    } finally {
      setCarregando(false)
    }
  }

  return (
    <AuthShell titulo="Entrar" subtitulo="Acesse sua conta do grupo">
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label className="label">E-mail</label>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label">Senha</label>
          <input className="input" type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </div>
        {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
        <button className="btn btn-primary" type="submit" disabled={carregando}>
          {carregando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 13 }}>
        <Link to="/recuperar" style={{ color: 'var(--text-muted)' }}>Esqueci a senha</Link>
        <Link to="/cadastro" style={{ color: 'var(--grass-light)', fontWeight: 600 }}>Criar conta</Link>
      </div>
    </AuthShell>
  )
}

function traduzErro(msg: string) {
  if (/invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar.'
  return msg
}
