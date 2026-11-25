import { StellarWalletPanel } from "./stellar-wallet-panel";

const routes = [
  ["Stellar", "Stellar", "Direct USDC"],
  ["Base", "Base", "Direct USDC"],
  ["Base", "Stellar", "Circle CCTP"],
  ["Stellar", "Base", "Circle CCTP"],
] as const;

export default function HomePage() {
  return (
    <main>
      <header className="site-header shell">
        <a className="wordmark" href="#top" aria-label="Telya home">
          Telya<span aria-hidden="true">.</span>
        </a>
        <div className="header-actions">
          <span className="network-badge">
            <span className="status-dot" aria-hidden="true" />
            Testnet
          </span>
          <a className="health-link" href="/api/health">
            System health
          </a>
        </div>
      </header>

      <section className="hero shell" id="top">
        <div className="hero-copy">
          <p className="eyebrow">Conversational money movement</p>
          <h1>Move digital dollars without navigating the infrastructure.</h1>
          <p className="hero-support">
            Tell Telya who should receive USDC and how much. Telya resolves the
            recipient, explains the route, tracks every stage, and verifies the
            outcome.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#route-preview">
              See the route preview
              <span aria-hidden="true">→</span>
            </a>
            <span className="build-note">Public Build Week shell</span>
          </div>
        </div>

        <div className="route-stage" id="route-preview" aria-label="Route preview">
          <div className="dot-field" aria-hidden="true" />
          <article className="route-card">
            <div className="route-card-header">
              <div>
                <span className="card-kicker">Route preview</span>
                <strong>Send @alice 5 USDC</strong>
              </div>
              <span className="preview-badge">Not submitted</span>
            </div>

            <div className="route-path" aria-label="Base to Stellar through Circle CCTP">
              <div className="route-node">
                <span>From</span>
                <strong>Base</strong>
              </div>
              <div className="route-rail">
                <span className="rail-line" aria-hidden="true" />
                <small>Circle CCTP</small>
              </div>
              <div className="route-node destination">
                <span>To</span>
                <strong>Stellar</strong>
              </div>
            </div>

            <dl className="route-details">
              <div>
                <dt>Recipient gets</dt>
                <dd>5 USDC</dd>
              </div>
              <div>
                <dt>Recipient</dt>
                <dd>@alice</dd>
              </div>
              <div>
                <dt>Completion</dt>
                <dd>Recipient + amount verified</dd>
              </div>
            </dl>
          </article>
        </div>
      </section>

      <StellarWalletPanel />

      <section className="trust-section shell" aria-labelledby="trust-title">
        <p className="eyebrow">One rule at every stage</p>
        <div className="trust-grid">
          <h2 id="trust-title">Where is my money right now?</h2>
          <p>
            Telya never treats a source transaction as cross-chain completion.
            Completion requires destination finality and verification that the
            intended recipient received the accepted amount.
          </p>
        </div>
      </section>

      <section className="routes-section shell" aria-labelledby="routes-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Frozen P0 route matrix</p>
            <h2 id="routes-title">Four routes. One understandable experience.</h2>
          </div>
          <p>USDC only during the Buildathon. No unsupported chains or assets.</p>
        </div>

        <div className="route-list">
          {routes.map(([source, destination, rail], index) => (
            <article className="route-row" key={`${source}-${destination}`}>
              <span className="route-number">0{index + 1}</span>
              <strong>{source}</strong>
              <span className="row-arrow" aria-hidden="true">→</span>
              <strong>{destination}</strong>
              <span className="route-type">{rail}</span>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer shell">
        <div>
          <strong>Telya</strong>
          <p>Built on Stellar Testnet and Base Sepolia.</p>
        </div>
        <p>Live financial actions will always use real Testnet infrastructure.</p>
      </footer>
    </main>
  );
}
