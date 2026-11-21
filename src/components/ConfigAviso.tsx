export function ConfigAviso() {
  return (
    <div style={{ minHeight: '100svh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="card" style={{ maxWidth: 520, padding: 28 }}>
        <div style={{ fontSize: 34 }}>⚙️⚽</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: '12px 0 8px', color: 'var(--text)' }}>
          Falta conectar o Supabase
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
          Preencha o arquivo <code>.env</code> na raiz do projeto com os dados do seu projeto Supabase
          (painel do Supabase → <b>Settings → API</b>):
        </p>
        <pre
          style={{
            background: 'var(--bg-elev)', border: '1px solid var(--border-strong)', borderRadius: 10,
            padding: 14, marginTop: 14, fontSize: 12.5, color: 'var(--text)', overflowX: 'auto', textAlign: 'left',
          }}
        >{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}</pre>
        <p style={{ color: 'var(--text-hint)', fontSize: 12.5, marginTop: 12 }}>
          Depois reinicie o servidor de desenvolvimento (<code>npm run dev</code>).
        </p>
      </div>
    </div>
  )
}
