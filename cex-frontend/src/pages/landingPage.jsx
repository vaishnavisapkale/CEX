import React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const STEPS = [
  { n: "01", t: "Fund", b: "Fund your account with demo balances." },
  { n: "02", t: "Trade", b: "Place market or limit orders on BTC, ETH, SOL, and other supported assets." },
  { n: "03", t: "Settle", b: "Orders execute against the order book and balances update instantly." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans antialiased flex flex-col">
      {/* Nav */}
      <nav className="border-b border-zinc-800/80">
        <div className="max-w-5xl mx-auto px-5 h-16 flex items-center justify-between">
          <Brand />
          <div className="flex items-center gap-2">
            <Link to="/signin" className="px-3.5 py-2 text-sm text-zinc-300 hover:text-white transition-colors">Sign in</Link>
            <Link to="/trade" className="px-4 py-2 text-sm font-medium rounded-lg bg-[#ff8600] text-black hover:bg-[#e05500] transition-colors">
              Get started
            </Link>
          </div>
        </div>
      </nav>

{/* Hero */}
      <section className="flex-1 max-w-3xl mx-auto px-5 pt-28 pb-24 text-center">
        <div className="font-mono text-xs tracking-widest uppercase mb-6" style={{ color: "#ff8600" }}>
          Spot trading · Bitcoin, Ethereum, Solana
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tight leading-tight text-white">
          Trade crypto on a {" "}
          <span className="bg-gradient-to-r from-[#ff8600] via-[#ffb347] to-[#ffd580] bg-clip-text text-transparent">transparent</span> orderbook.</h1>
        <p className="mt-6 text-lg text-zinc-400 leading-relaxed max-w-md mx-auto">
         Real-time market depth, market & limit orders, and instant balance updates. No hidden spreads.
        </p>
        <div className="mt-9 flex flex-wrap justify-center gap-3">
          <Link to="/trade" className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-[#ff8600] text-black font-medium hover:bg-[#e05500] transition-colors">
  Start trading <ArrowRight size={18} />
</Link>
          <a href="#how" className="inline-flex items-center px-6 py-3.5 rounded-xl border border-zinc-700 text-zinc-200 font-medium hover:border-zinc-500 transition-colors">
            How it works
          </a>
        </div>
        <p className="mt-6 text-sm text-zinc-600">Live order book, real-time pricing, professional-grade execution.</p>

        {/* Steps */}
        <div id="how" className="mt-28 grid sm:grid-cols-3 gap-10 text-left">
          {STEPS.map((s) => (
            <div key={s.n} className="border-t border-zinc-800 pt-5">
              <div className="font-mono text-sm mb-3" style={{ color: "#ff8600" }}>{s.n}</div>
              <h3 className="text-base font-medium text-white mb-1.5">{s.t}</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800/80">
        <div className="max-w-5xl mx-auto px-5 py-8 flex flex-wrap items-center justify-between gap-4 text-sm">
          <Brand small />
          <span className="text-zinc-600">A demo exchange, built for learning — not real money.</span>
          <span className="text-zinc-600">© {new Date().getFullYear()} CEX-Spot</span>
        </div>
      </footer>
    </div>
  );
}

function Brand({ small }) {
  return (
    <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="13" width="4" height="8" rx="1" fill="#ff8600" />
        <rect x="7" y="8" width="4" height="13" rx="1" fill="#ff8600" />
        <rect x="13" y="3" width="4" height="18" rx="1" fill="#ff8600" />
      </svg>
      <span className={(small ? "text-base" : "text-lg") + " font-semibold tracking-tight text-white"}>CEX-Spot</span>
    </div>
  );
}
