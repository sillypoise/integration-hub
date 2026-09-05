import Link from "next/link";
import { DemoEntry } from "./ui/demo_entry";

export default function Home() {
    return (
        <div className="landing">
            <LandingHeader />
            <main id="main" tabIndex={-1}>
                <section className="hero">
                    <div className="hero-copy">
                        <div className="eyebrow">INDEPENDENT PROJECT · PRODUCT CONCEPT</div>
                        <h1>
                            Every customer update.
                            <br />
                            <em>Accounted for.</em>
                        </h1>
                        <p>
                            Keep commerce and CRM in step. Send a synthetic customer update, then
                            follow the real queue, mapping, and destination result.
                        </p>
                        <DemoEntry fresh={false} />
                        <p className="hero-footnote">
                            No sign-up. No credentials. Your own isolated workspace.
                        </p>
                        <a href="#how-it-works" className="text-link">
                            Explore the flow ↓
                        </a>
                    </div>
                    <PipelineIllustration />
                </section>
                <section className="landing-details" id="how-it-works">
                    <div className="section-heading">
                        <span className="eyebrow">SMALL SCOPE. COMPLETE FLOW.</span>
                        <h2>Not just a dashboard. A working integration.</h2>
                    </div>
                    <div className="feature-grid">
                        {[
                            [
                                "01",
                                "Accept it durably",
                                "The source event and background job commit together. There is no gap between accepting an update and queuing it.",
                            ],
                            [
                                "02",
                                "Apply it once",
                                "A deterministic mapping and an idempotent CRM upsert turn repeated delivery into one logical effect.",
                            ],
                            [
                                "03",
                                "Inspect the evidence",
                                "See the result, committed attempts, source timestamps, and correlation IDs—not fabricated performance metrics.",
                            ],
                        ].map(([number, title, description]) => (
                            <article key={number}>
                                <span className="feature-number">{number}</span>
                                <h3>{title}</h3>
                                <p>{description}</p>
                            </article>
                        ))}
                    </div>
                </section>
            </main>
            <footer className="landing-footer">
                <span>Integration Hub · Independent Project</span>
                <span>Built with Next.js, PostgreSQL & pg-boss</span>
            </footer>
        </div>
    );
}

function LandingHeader() {
    return (
        <header className="landing-header">
            <Link href="/" className="brand" prefetch={false}>
                <span className="brand-mark" aria-hidden="true">
                    ↗
                </span>
                Integration Hub
            </Link>
            <span className="badge neutral">Public demo · Synthetic data</span>
        </header>
    );
}

function PipelineIllustration() {
    return (
        <aside
            className="pipeline-preview"
            aria-label="Illustrated synchronization flow, not live data"
        >
            <div className="preview-heading">
                <span className="eyebrow">THE PATH OF ONE UPDATE</span>
                <span className="badge neutral">Illustration</span>
            </div>
            <div className="pipeline-node">
                <span className="provider-mark" aria-hidden="true">
                    C
                </span>
                <div>
                    <h2>Commerce</h2>
                    <p>Customer updated</p>
                </div>
                <span className="badge neutral">Simulated</span>
            </div>
            <div className="pipeline-path">
                <span aria-hidden="true">↓</span>
                <p>Validate & persist</p>
            </div>
            <div className="pipeline-worker">
                <span aria-hidden="true">⇄</span>
                <div>
                    <strong>Durable synchronization</strong>
                    <p>PostgreSQL queue · Validated mapping</p>
                </div>
            </div>
            <div className="pipeline-path">
                <span aria-hidden="true">↓</span>
                <p>Idempotent upsert</p>
            </div>
            <div className="pipeline-node">
                <span className="provider-mark destination" aria-hidden="true">
                    R
                </span>
                <div>
                    <h2>CRM</h2>
                    <p>Customer synchronized</p>
                </div>
                <span className="badge neutral">Simulated</span>
            </div>
            <div className="preview-footnote">
                <span aria-hidden="true">↳</span> One event. One logical destination effect.
            </div>
        </aside>
    );
}
