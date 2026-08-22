export default function AppIndex() {
  return (
    <main style={{ fontFamily: "system-ui", padding: 32, maxWidth: 560, lineHeight: 1.55 }}>
      <h2 style={{ margin: "0 0 8px" }}>Price Test is geïnstalleerd</h2>
      <p style={{ margin: "0 0 16px", color: "#52514e" }}>
        Het instellen en de cijfers staan op het eigen dashboard, buiten de Shopify-admin.
      </p>
      <a
        href="/dashboard"
        target="_blank"
        rel="noreferrer"
        style={{
          display: "inline-block", padding: "9px 15px", borderRadius: 10,
          background: "#0b0b0b", color: "#fff", textDecoration: "none", fontWeight: 500,
        }}
      >
        Dashboard openen
      </a>
    </main>
  );
}
