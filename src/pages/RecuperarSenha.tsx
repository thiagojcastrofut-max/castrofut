import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AuthShell } from '../components/AuthShell'

export default function RecuperarSenha() {
  const [email, setEmail] = useState('')
  const [ok, setOk] = useState(false)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErro('')
    setCarregando(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login`,
      })
      if (error) throw error
      setOk(true)
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <AuthShell titulo="Recuperar senha" subtitulo="Enviaremos um link para redefinir">
      {ok ? (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Se existir uma conta com esse e-mail, você receberá um link para criar uma nova senha.
        </p>
      ) : (
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="label">E-mail</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          {erro && <div style={{ color: 'var(--danger)', fontSize: 13 }}>{erro}</div>}
          <button className="btn btn-primary" type="submit" disabled={carregando}>
            {carregando ? 'Enviando…' : 'Enviar link'}
          </button>
        </form>
      )}
      <div style={{ textAlign: 'center', marginTop: 14, fontSize: 13 }}>
        <Link to="/login" style={{ color: 'var(--text-muted)' }}>Voltar para o login</Link>
      </div>
    </AuthShell>
  )
}
