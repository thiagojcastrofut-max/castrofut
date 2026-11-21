import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { AuthShell } from '../components/AuthShell'

export default function SemGrupo() {
  const { membros, usuario, sair } = useAuth()
  const navigate = useNavigate()
  const pendentes = membros.filter((m) => m.status === 'pendente')
  const recusados = membros.filter((m) => m.status === 'recusado')

  async function logout() {
    await sair()
    navigate('/login')
  }

  return (
    <AuthShell titulo={`Olá, ${usuario?.nome?.split(' ')[0] || ''}! 👋`}>
      {pendentes.length > 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Seu cadastro em <b>{pendentes.map((m) => m.organizacao?.nome).join(', ')}</b> está
          <b style={{ color: 'var(--warn)' }}> aguardando aprovação</b> da comissão. Você receberá acesso assim que for validado.
        </p>
      ) : recusados.length > 0 ? (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Seu cadastro não foi aprovado. Fale com a comissão do grupo para mais informações.
        </p>
      ) : (
        <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Você ainda não faz parte de nenhum grupo. Peça o link de cadastro à comissão do seu grupo.
        </p>
      )}
      <button className="btn btn-outline" style={{ width: '100%', marginTop: 18 }} onClick={logout}>Sair</button>
    </AuthShell>
  )
}
