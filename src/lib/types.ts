/** Papéis administrativos dentro de um grupo (multi-tenant). */
export type Papel = 'admin_geral' | 'tesoureiro' | 'comissao' | 'juiz' | 'jogador'

export const PAPEL_LABEL: Record<Papel, string> = {
  admin_geral: 'Administrador Geral',
  tesoureiro: 'Tesoureiro',
  comissao: 'Comissão',
  juiz: 'Juiz',
  jogador: 'Jogador',
}

/** Situação do vínculo do usuário com o grupo. */
export type StatusMembro = 'pendente' | 'ativo' | 'recusado' | 'bloqueado'

export interface Organizacao {
  id: string
  nome: string
  slug: string
  logo_url: string | null
  cor_primaria: string | null
  pix_chave: string | null
  pix_titular: string | null
  banco: string | null
  mensalidade_padrao: number | null
  multa_cartao_azul?: number | null
  multa_cartao_amarelo?: number | null
  multa_cartao_vermelho?: number | null
  ativo: boolean
  criado_em: string
}

export interface Usuario {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  foto_url: string | null
  super_admin: boolean
}

export interface Membro {
  id: string
  org_id: string
  user_id: string
  papel: Papel
  status: StatusMembro
  criado_em: string
  /** join opcional com a organização */
  organizacao?: Organizacao
}

/** Posições e pé dominante para o cadastro esportivo do jogador. */
export type Posicao = 'goleiro' | 'zagueiro' | 'lateral' | 'volante' | 'meia' | 'atacante'
export type Pe = 'direito' | 'esquerdo' | 'ambidestro'

export interface Jogador {
  id: string
  org_id: string
  user_id: string | null
  nome: string
  apelido: string | null
  foto_url: string | null
  telefone: string | null
  nascimento: string | null
  posicao_principal: Posicao | null
  posicao_secundaria: Posicao | null
  pe_dominante: Pe | null
  nivel_tecnico: number | null // 1 a 5
  situacao: 'ativo' | 'inativo'
  data_entrada: string | null
  obs: string | null
}
