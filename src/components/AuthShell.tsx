import type { ReactNode } from 'react'

export function AuthShell({ titulo, subtitulo, children }: { titulo: string; subtitulo?: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 18 }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 42 }}>⚽</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--text)', marginTop: 4 }}>Futebol Manager</div>
        </div>
        <div className="card" style={{ padding: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', margin: '0 0 2px' }}>{titulo}</h1>
          {subtitulo && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>{subtitulo}</p>}
          {children}
        </div>
      </div>
    </div>
  )
}
