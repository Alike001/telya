import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "./components/site-header";
import { MobileBottomDock } from "./components/mobile-bottom-dock";
import { ConversationalHome } from "./components/conversational-home";
import { PaymentActivityPanel } from "./components/payment-activity-panel";
import { AccountToolsPanel } from "./components/account-tools-panel";

const routes = [
  ["Stellar", "Stellar", "Direct USDC"],
  ["Base", "Base", "Direct USDC"],
  ["Base", "Stellar", "Circle CCTP"],
  ["Stellar", "Base", "Circle CCTP"],
] as const;

export default function HomePage() {
  return (
    <main>
      <SiteHeader />

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
            <Link className="primary-action" href="/onboarding">
              <span>Get started with Passkey</span>
              <ArrowRight className="inline-arrow" aria-hidden="true" />
            </Link>
            <a className="secondary-action" href="#composer">
              <span>Try conversational payment</span>
            </a>
          </div>
        </div>

        {/* Conversational Home & Payment Review Surface */}
        <div className="route-stage" id="composer" aria-label="Conversational payment surface">
          <ConversationalHome />
        </div>
      </section>

      <AccountToolsPanel />

      <section className="activity-section shell" id="activity" aria-label="Authenticated payment activity">
        <PaymentActivityPanel />
      </section>

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
              <span className="row-arrow" aria-hidden="true">
                <ArrowRight className="row-arrow-icon" />
              </span>
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

      <MobileBottomDock />
    </main>
  );
}
