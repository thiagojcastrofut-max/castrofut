import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './lib/auth'
import { Splash } from './components/Splash'
import { ConfigAviso } from './components/ConfigAviso'
import { ProtectedLayout } from './components/ProtectedLayout'
import Login from './pages/Login'
import Cadastro from './pages/Cadastro'
import RecuperarSenha from './pages/RecuperarSenha'
import Dashboard from './pages/Dashboard'
import Jogadores from './pages/Jogadores'
import Membros from './pages/Membros'
import Financeiro from './pages/Financeiro'
import Aprovacoes from './pages/Aprovacoes'
import Grupos from './pages/Grupos'
import SemGrupo from './pages/SemGrupo'

export default function App() {
  const { carregando, session, configurado } = useAuth()

  if (!configurado) return <ConfigAviso />
  if (carregando) return <Splash />

  if (!session) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/recuperar" element={<RecuperarSenha />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route path="/sem-grupo" element={<SemGrupo />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="jogadores" element={<Jogadores />} />
        <Route path="membros" element={<Membros />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="aprovacoes" element={<Aprovacoes />} />
        <Route path="grupos" element={<Grupos />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
