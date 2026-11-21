export function Splash() {
  return (
    <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center' }}>
      <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 40 }}>⚽</div>
        <div style={{ marginTop: 10, fontSize: 14 }}>Carregando…</div>
      </div>
    </div>
  )
}
