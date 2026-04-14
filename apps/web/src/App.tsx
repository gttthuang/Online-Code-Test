export function App() {
  return (
    <main className="app-shell">
      <section className="hero-panel">
        <p className="eyebrow">Frontend MVP</p>
        <h1>Online Code Test</h1>
        <p className="hero-copy">
          The web app is now on a real React + Vite scaffold. Next commits will connect login,
          role-based dashboards, and the main candidate flow.
        </p>
      </section>

      <section className="status-grid">
        <article className="status-card">
          <h2>Current State</h2>
          <p>Vite dev server, React entry, shared contracts ready.</p>
        </article>

        <article className="status-card">
          <h2>Next Up</h2>
          <p>Auth session, candidate workspace, admin workspace.</p>
        </article>
      </section>
    </main>
  );
}
