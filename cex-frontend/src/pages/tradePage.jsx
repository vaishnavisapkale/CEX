import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { deposit, balance as getBalance } from "../api/wallet";
import { getDepth, getRecentTrades, getMyOrders } from "../api/market";
import { submitOrder, cancelOrder } from "../api/order";
import { createChart, ColorType, CrosshairMode } from "lightweight-charts";

const SYMBOLS = [{ sym: "BTC", name: "Bitcoin", base: 1000 }];

const inr = (n) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (n, d = 2) => n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

function toBook(depth) {
  let ca = 0, cb = 0;
  const asks = (depth.asks || []).map((a) => { ca += a.qty; return { price: a.price, size: a.qty, cum: +ca.toFixed(4) }; });
  const bids = (depth.bids || []).map((b) => { cb += b.qty; return { price: b.price, size: b.qty, cum: +cb.toFixed(4) }; });
  return { asks, bids, maxCum: Math.max(ca, cb) || 1, totBid: cb, totAsk: ca };
}

export default function TradePage() {
  const [active, setActive] = useState("BTC");
  const meta = SYMBOLS.find((s) => s.sym === active);

  const [book, setBook]     = useState({ asks: [], bids: [], maxCum: 1, totBid: 0, totAsk: 0 });
  const [trades, setTrades] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookTab, setBookTab] = useState("BOOK");

  const [side, setSide]   = useState("buy");
  const [otype, setOtype] = useState("limit");
  const [price, setPrice] = useState(String(meta.base));
  const [qty, setQty]     = useState("");
  const [flash, setFlash] = useState(null);

  const [depositOpen, setDepositOpen]     = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [bal, setBal] = useState({ INR: { available: 0, locked: 0 }, BTC: { available: 0, locked: 0 } });

  const [accountOpen, setAccountOpen]       = useState(false);
  const [candleInterval, setCandleInterval] = useState(60_000);
  const [lowerTab, setLowerTab]             = useState("OPEN");

  const { user, logout, token } = useAuth();
  const navigate = useNavigate();

  // balances
  const inrAvailable = bal.INR?.available ?? 0;
  const inrLocked    = bal.INR?.locked    ?? 0;
  const btcAvailable = bal.BTC?.available ?? 0;
  const btcLocked    = bal.BTC?.locked    ?? 0;


  const openOrders   = orders.filter((o) => o.status === "open" || o.status === "partially_filled");
  const orderHistory = orders.filter((o) => o.status === "filled" || o.status === "cancelled");
  const fillHistory  = orders.flatMap((o) =>
    (o.fills || []).map((f) => ({
      key:    f.fillId || `${o.orderId}-${f.createdAt}`,
      symbol: o.symbol,
      side:   o.side,
      price:  f.price,
      qty:    f.qty,
      time:   new Date(f.createdAt).toLocaleTimeString("en-IN", { hour12: false }),
    }))
  );

  const last = trades.length > 0 ? trades[0].price : meta.base;
  const up   = true;

  const buy        = side === "buy";
  const effPrice   = otype === "market" ? last : parseFloat(price) || 0;
  const orderValue = effPrice * (parseFloat(qty) || 0);
  const maxQty     = buy ? (effPrice ? Math.floor(inrAvailable / effPrice) : 0) : btcAvailable;
  const WS_URL     = import.meta.env.VITE_WS_URL || "ws://localhost:3000";

 
  async function refreshOrders() {
    try {
      const data = await getMyOrders();
      setOrders(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("Failed to refresh orders", e);
    }
  }

  async function loadBalance() {
    try {
      const data = await getBalance();
      setBal({
        INR: data.INR ?? { available: 0, locked: 0 },
        BTC: data.BTC ?? { available: 0, locked: 0 },
      });
    } catch (err) {
      console.warn("Balance fetch failed", err);
    }
  }


  useEffect(() => {
    getDepth(active)
      .then((d) => setBook(toBook(d)))
      .catch((e) => console.warn("Depth snapshot failed", e));

    getRecentTrades(active)
      .then((t) => setTrades(Array.isArray(t) ? [...t].reverse() : []))
      .catch((e) => console.warn("Trades snapshot failed", e));

    if (token) {
      refreshOrders();
      loadBalance();
    }

    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe",        symbol: active }));
      ws.send(JSON.stringify({ type: "subscribe_trades", symbol: active }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "depth" && msg.data) {
          setBook(toBook(msg.data));
        } else if (msg.type === "trades" && Array.isArray(msg.data)) {
          setTrades((prev) => [...msg.data, ...prev].slice(0, 200));
          if (token) refreshOrders();
        }
      } catch (e) {
        console.warn("Bad WS message", e);
      }
    };

    ws.onerror = (e) => console.warn("WS error", e);

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe",        symbol: active }));
        ws.send(JSON.stringify({ type: "unsubscribe_trades", symbol: active }));
      }
      ws.close();
    };
  }, [active, token]);


  function switchSymbol(sym) {
    const m = SYMBOLS.find((s) => s.sym === sym);
    setActive(sym);
    setBook({ asks: [], bids: [], maxCum: 1, totBid: 0, totAsk: 0 });
    setTrades([]);
    setOrders([]);
    setPrice(String(m.base));
    setQty("");
  }

  function setPct(p) {
    const q = buy
      ? Math.floor((maxQty * p) / 100)
      : parseFloat(((maxQty * p) / 100).toFixed(4));
    setQty(String(q));
  }

  async function submit() {
    const q = parseFloat(qty);
    if (!q || q <= 0)
      return setFlash({ ok: false, msg: "Enter a quantity" });
    if (otype === "limit" && (!parseFloat(price) || parseFloat(price) <= 0))
      return setFlash({ ok: false, msg: "Enter a price" });
    if (buy && orderValue > inrAvailable)
      return setFlash({ ok: false, msg: "Insufficient INR balance" });
    if (!buy && q > btcAvailable)
      return setFlash({ ok: false, msg: "Insufficient BTC balance" });

    try {
      const payload = { type: otype, side, symbol: active, qty: q };
      if (otype === "limit") payload.price = parseFloat(price);
      await submitOrder(payload);
      setFlash({ ok: true, msg: `Order submitted: ${side} ${q} ${active}` });
      setQty("");
      await Promise.all([loadBalance(), refreshOrders()]);
    } catch (err) {
      setFlash({ ok: false, msg: err.message || "Order submission failed" });
    }
  }

  async function cancelOpen(orderId) {
    try {
      await cancelOrder(orderId);
      await Promise.all([refreshOrders(), loadBalance()]);
    } catch (err) {
      setFlash({ ok: false, msg: err.message || "Cancel failed" });
    }
  }

  function closeDeposit() {
    setDepositOpen(false);
    setDepositAmount("");
  }

  async function submitDeposit() {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0)
      return setFlash({ ok: false, msg: "Enter a valid deposit amount" });
    try {
      await deposit(amount, "INR");
      setFlash({ ok: true, msg: `Deposited ₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })} INR` });
      closeDeposit();
      await loadBalance();
    } catch (err) {
      setFlash({ ok: false, msg: err.message || "Deposit failed" });
    }
  }

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 2400);
    return () => clearTimeout(id);
  }, [flash]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-200 font-sans antialiased overflow-hidden text-sm">

      {/* ── Top nav ── */}
      <nav className="flex items-center justify-between px-4 h-14 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-7">
          <Brand />
          <div className="hidden md:flex items-center gap-5 text-sm text-zinc-400">
            <span className="text-white hover:cursor-pointer">Spot</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {token ? (
            <>
              <button
                onClick={() => setDepositOpen(true)}
                className="px-3 py-1.5 rounded-lg text-zinc-950 text-sm font-semibold bg-linear-to-r from-[#ff8600] to-[#fb923c] shadow-lg shadow-orange-500/20 hover:from-[#e05500] hover:to-[#f97316] transition-colors"
              >
                Deposit
              </button>
              <button className="px-3 py-1.5 rounded-lg text-[#ff8600] text-sm font-semibold border border-[#ff8600] bg-transparent hover:bg-[#ff8600] hover:text-black transition-colors">
                Withdraw
              </button>

              <div className="relative">
                <button
                  onClick={() => setAccountOpen((o) => !o)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-[#ff8600] hover:border-zinc-700 transition-colors"
                >
                  <span className="text-sm font-semibold">{user?.username?.[0]?.toUpperCase() ?? "U"}</span>
                </button>

                {accountOpen && (
                  <div className="absolute right-0 z-10 mt-2 w-56 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-zinc-500">Account</div>
                    <div className="mt-2 text-sm font-semibold text-white">{user?.username ?? "Trader"}</div>
                    <div className="mt-3 rounded-2xl bg-zinc-900 p-3 space-y-3">
                      <div>
                        <div className="text-[11px] text-zinc-500 mb-1">INR</div>
                        <div className="space-y-0.5 text-sm">
                          <div className="flex justify-between text-zinc-400">
                            <span>Available</span>
                            <span className="text-white font-mono">₹{inrAvailable.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Locked</span>
                            <span className="text-zinc-500 font-mono">₹{inrLocked.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                          </div>
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-zinc-500 mb-1">BTC</div>
                        <div className="space-y-0.5 text-sm">
                          <div className="flex justify-between text-zinc-400">
                            <span>Available</span>
                            <span className="text-white font-mono">{btcAvailable.toLocaleString("en-IN", { maximumFractionDigits: 8 })}</span>
                          </div>
                          <div className="flex justify-between text-zinc-400">
                            <span>Locked</span>
                            <span className="text-zinc-500 font-mono">{btcLocked.toLocaleString("en-IN", { maximumFractionDigits: 8 })}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => { logout(); navigate("/signin"); }}
                      className="mt-3 w-full rounded-full bg-[#ff8600] px-3 py-2 text-sm font-semibold text-black hover:bg-[#e05500] transition-colors"
                    >
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <Link
              to="/signin"
              className="px-4 py-2 rounded-lg bg-[#ff8600] text-black text-sm font-semibold hover:bg-[#e05500] transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </nav>

      {flash && (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div className={`pointer-events-auto w-full max-w-xl rounded-3xl border px-4 py-3 text-sm font-semibold shadow-2xl shadow-black/30 backdrop-blur-xl transition-opacity duration-200 ${flash.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>
            {flash.msg}
          </div>
        </div>
      )}

      {/* ── Market header ── */}
      <div className="flex items-center gap-8 px-4 h-12 border-b border-zinc-800 shrink-0 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: "rgba(255,134,0,0.18)", color: "#ff8600" }}>{active[0]}</div>
          <select value={active} onChange={(e) => switchSymbol(e.target.value)} className="bg-transparent text-white font-semibold text-base outline-none cursor-pointer">
            {SYMBOLS.map((s) => <option key={s.sym} value={s.sym} className="bg-zinc-900">{s.sym}/INR</option>)}
          </select>
        </div>
        <div className={"font-mono text-lg shrink-0 " + (up ? "text-emerald-400" : "text-[#ff8600]")}>{num(last, 1)}</div>
      </div>

      {/* ── Main 3-column area ── */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0">

        {/* Chart */}
        <div className="flex-1 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-800 min-h-0">
          <div className="flex items-center gap-3 px-3 h-10 border-b border-zinc-800 shrink-0">
            <span className="text-xs font-semibold text-white font-mono">{active}/INR</span>
            <div className="flex items-center gap-0.5">
              {[["1m", 60_000], ["5m", 300_000], ["15m", 900_000], ["1h", 3_600_000]].map(([label, ms]) => (
                <button
                  key={label}
                  onClick={() => setCandleInterval(ms)}
                  className={"px-2 py-0.5 rounded text-xs font-mono transition-colors " +
                    (candleInterval === ms ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300")}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <PriceLineChart trades={trades} intervalMs={candleInterval} />
          </div>
        </div>

        {/* Order book / trades */}
        <div className="w-full lg:w-80 flex flex-col border-b lg:border-b-0 lg:border-r border-zinc-800 shrink-0 min-h-0">
          <div className="flex items-center gap-4 px-3 h-10 border-b border-zinc-800 shrink-0">
            <button onClick={() => setBookTab("BOOK")}   className={"text-sm font-medium " + (bookTab === "BOOK"   ? "text-white" : "text-zinc-500")}>Book</button>
            <button onClick={() => setBookTab("TRADES")} className={"text-sm font-medium " + (bookTab === "TRADES" ? "text-white" : "text-zinc-500")}>Trades</button>
          </div>
          {bookTab === "BOOK" ? (
            <div className="flex-1 flex flex-col min-h-0 font-mono text-xs">
              <div className="grid grid-cols-3 px-3 py-1.5 text-zinc-500 text-[11px] shrink-0">
                <span>Price (INR)</span><span className="text-right">Size</span><span className="text-right">Total</span>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col justify-end">
                {book.asks.slice().reverse().map((r, i) => <BookRow key={"a" + i} r={r} max={book.maxCum} color="rose" />)}
              </div>
              <div className={"px-3 py-1.5 font-mono text-sm border-y border-zinc-800 shrink-0 " + (up ? "text-emerald-400" : "text-rose-400")}>{num(last, 1)}</div>
              <div className="flex-1 overflow-hidden">
                {book.bids.map((r, i) => <BookRow key={"b" + i} r={r} max={book.maxCum} color="emerald" />)}
              </div>
              <RatioBar bid={book.totBid} ask={book.totAsk} />
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto font-mono text-xs">
              <div className="grid grid-cols-3 px-3 py-1.5 text-zinc-500 text-[11px] sticky top-0 bg-zinc-950">
                <span>Price</span><span className="text-right">Size</span><span className="text-right">Time</span>
              </div>
              {trades.length === 0 && <div className="py-6 text-center text-zinc-600">Waiting for trades…</div>}
              {trades.map((t, i) => (
                <div key={i} className="grid grid-cols-3 px-3 py-0.5">
                  <span className={t.side === "buy" ? "text-emerald-400" : "text-rose-400"}>{num(t.price, 1)}</span>
                  <span className="text-right text-zinc-300">{t.qty}</span>
                  <span className="text-right text-zinc-500">
                    {typeof t.time === "number" ? new Date(t.time).toLocaleTimeString("en-IN", { hour12: false }) : t.time}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Order form — gated by submit only ── */} 
        <div className="w-full lg:w-72  flex-col shrink-0 overflow-y-auto">
          <div className="grid grid-cols-2 m-2 rounded-lg overflow-hidden border border-zinc-800">
            <button onClick={() => setSide("buy")} className={"py-2.5 text-sm font-semibold " + (buy ? "bg-emerald-500/15 text-emerald-400" : "text-zinc-500")}>Buy</button>
            <button onClick={() => setSide("sell")} className={"py-2.5 text-sm font-semibold " + (!buy ? "text-zinc-500" : "text-zinc-500")} style={!buy ? { backgroundColor: "rgba(255,134,0,0.15)", color: "#ff8600" } : {}}>Sell</button>
          </div>

          <div className="flex items-center gap-4 px-3 text-sm">
            {["limit", "market"].map((t) => (
              <button key={t} onClick={() => setOtype(t)} className={"pb-1.5 border-b-2 " + (otype === t ? "border-[#ff8600] text-white" : "border-transparent text-zinc-500")}>
                {t === "limit" ? "limit" : "market"}
              </button>
            ))}
          </div>

          <div className="px-3 mt-4 flex justify-between text-xs">
            <span className="text-zinc-500">Balance</span>
            <span className="font-mono text-zinc-300">
                  {buy
                    ? `₹${inrAvailable.toLocaleString("en-IN", { maximumFractionDigits: 2 })} INR`
                    : `${btcAvailable.toLocaleString("en-IN", { maximumFractionDigits: 8 })} BTC`}
                </span>
              </div>

              <div className="px-3 mt-3">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-zinc-500">Price</span>
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => setPrice(last.toFixed(1))} className="text-[#ff8600] hover:text-[#e05500]">Mid</button>
                    <button onClick={() => book.bids[0] && setPrice(book.bids[0].price.toFixed(1))} className="text-[#ff8600] hover:text-[#e05500]">BBO</button>
                  </div>
                </div>
                <input type="number" disabled={otype === "market"} value={otype === "market" ? "" : price} placeholder={otype === "market" ? "Market" : ""}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 font-mono text-zinc-100 outline-none focus:border-[#ff8600] disabled:text-zinc-600" />
              </div>

              <div className="px-3 mt-4">
                <span className="text-xs text-zinc-500 block mb-1">Quantity ({active})</span>
                <input type="number" value={qty} onChange={(e) => setQty(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 font-mono text-zinc-100 outline-none focus:border-[#ff8600]" />
                <input type="range" min="0" max="100"
                  value={maxQty ? Math.min(100, Math.round(((parseFloat(qty) || 0) / maxQty) * 100)) : 0}
                  onChange={(e) => setPct(+e.target.value)}
                  className="w-full mt-3" style={{ accentColor: "#ff8600" }} />
                <div className="flex justify-between text-[11px] text-zinc-600"><span>0</span><span>100%</span></div>
              </div>

              <div className="px-3 mt-3">
                <span className="text-xs text-zinc-500 block mb-1">Order Value</span>
                <div className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 font-mono text-zinc-300">{inr(orderValue)}</div>
              </div>

              <div className="px-3 mt-4">
                <button onClick={() => { if (!token) return navigate('/signin'); submit(); }}
                  className={"w-full py-3 rounded-lg font-semibold text-black " + (buy ? "bg-emerald-500 hover:bg-emerald-400" : "")}
                  style={!buy ? { backgroundColor: "#ff8600" } : {}}
                >
                  {token ? (buy ? `Buy ${active}` : `Sell ${active}`) : 'Sign in first'}
                </button>
              </div>

              {/* <div className="px-3 mt-4 flex gap-4 text-xs text-zinc-500">
                <label className="flex items-center gap-1.5"><input type="checkbox" style={{ accentColor: "#ff8600" }} /> Post Only</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" style={{ accentColor: "#ff8600" }} /> IOC</label>
              </div> */}
        </div>
      </div>

      {/* ── Bottom panel — fixed height, scrolls internally ── */}
      <div className="h-64 shrink-0 overflow-hidden rounded-t-3xl border-t border-zinc-800 bg-zinc-950/95 shadow-inner shadow-black/20 flex flex-col">
        <div className="flex items-center gap-3 px-4 h-12 border-b border-zinc-800 shrink-0 bg-zinc-950/90 backdrop-blur-sm">
          {[
            ["OPEN",    "Open Orders",   openOrders.length],
            ["FILLS",   "Fill History",  fillHistory.length],
            ["HISTORY", "Order History", orderHistory.length],
          ].map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setLowerTab(key)}
              className={"h-9 rounded-full px-4 text-sm font-medium flex items-center gap-2 transition-colors " +
                (lowerTab === key ? "bg-[#ff8600]/15 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-white/5")}
            >
              {label}
              <span className="rounded bg-zinc-800 px-1.5 text-[11px] text-zinc-400">{count}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto font-mono text-xs min-h-0 p-2">

          {lowerTab === "OPEN" && (
            <>
              <div className="grid grid-cols-7 gap-3 px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                <span>Symbol</span><span>Side</span><span>Type</span>
                <span className="text-right">Price</span><span className="text-right">Qty</span>
                <span className="text-right">Filled</span><span className="text-right">Action</span>
              </div>
              {openOrders.length === 0 && <Empty label="No open orders" />}
              {openOrders.map((o) => (
                <div key={o.orderId} className="grid grid-cols-7 gap-3 px-4 py-2.5 border-b border-zinc-800/50 items-center">
                  <span className="text-white">{o.symbol}</span>
                  <span className={String(o.side).toLowerCase() === "buy" ? "text-emerald-400" : "text-rose-400"}>{String(o.side).toUpperCase()}</span>
                  <span className="text-zinc-400">{String(o.type).toUpperCase()}</span>
                  <span className="text-right text-zinc-300">{o.price != null ? o.price.toFixed(1) : "MKT"}</span>
                  <span className="text-right text-zinc-300">{o.qty}</span>
                  <span className="text-right text-zinc-400">{o.filledQty}/{o.qty}</span>
                  <span className="text-right">
                    <button
                      onClick={() => cancelOpen(o.orderId)}
                      className="px-2.5 py-1 rounded border border-zinc-700 text-zinc-400 hover:border-rose-500 hover:text-rose-400 transition-colors text-[11px] whitespace-nowrap"
                    >
                      Cancel
                    </button>
                  </span>
                </div>
              ))}
            </>
          )}

          {lowerTab === "FILLS" && (
            <>
              <div className="grid grid-cols-6 gap-3 px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                <span>Symbol</span><span>Side</span>
                <span className="text-right">Price</span><span className="text-right">Qty</span>
                <span className="text-right">Value</span><span className="text-right">Time</span>
              </div>
              {fillHistory.length === 0 && <Empty label="No fills yet" />}
              {fillHistory.map((f) => (
                <div key={f.key} className="grid grid-cols-6 gap-3 px-4 py-2.5 border-b border-zinc-800/50 items-center">
                  <span className="text-white">{f.symbol}</span>
                  <span className={String(f.side).toLowerCase() === "buy" ? "text-emerald-400" : "text-rose-400"}>{String(f.side).toUpperCase()}</span>
                  <span className="text-right text-zinc-300">{num(f.price, 1)}</span>
                  <span className="text-right text-zinc-300">{f.qty}</span>
                  <span className="text-right text-zinc-400">{inr(f.qty * f.price)}</span>
                  <span className="text-right text-zinc-500">{f.time}</span>
                </div>
              ))}
            </>
          )}

          {lowerTab === "HISTORY" && (
            <>
              <div className="grid grid-cols-6 gap-3 px-4 py-2 text-[11px] uppercase tracking-wider text-zinc-500 border-b border-zinc-800 sticky top-0 bg-zinc-950">
                <span>Symbol</span><span>Side</span><span>Type</span>
                <span className="text-right">Price</span><span className="text-right">Qty</span>
                <span className="text-right">Status</span>
              </div>
              {orderHistory.length === 0 && <Empty label="No order history" />}
              {orderHistory.map((o) => (
                <div key={o.orderId} className="grid grid-cols-6 gap-3 px-4 py-2.5 border-b border-zinc-800/50 items-center">
                  <span className="text-white">{o.symbol}</span>
                  <span className={String(o.side).toLowerCase() === "buy" ? "text-emerald-400" : "text-rose-400"}>{String(o.side).toUpperCase()}</span>
                  <span className="text-zinc-400">{String(o.type).toUpperCase()}</span>
                  <span className="text-right text-zinc-300">{o.price != null ? o.price.toFixed(1) : "MKT"}</span>
                  <span className="text-right text-zinc-300">{o.qty}</span>
                  <span className={"text-right " + (o.status === "filled" ? "text-emerald-400" : "text-rose-400")}>{o.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Deposit modal — INR only ── */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
          <div className="w-full max-w-md rounded-4xl border border-zinc-800 bg-zinc-950/95 p-8 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.25em] text-[#ff8600]">Deposit funds</div>
                <h2 className="mt-3 text-2xl font-semibold text-white">Add INR balance</h2>
                <p className="mt-2 text-sm text-zinc-500">Enter the amount of INR to add to your account.</p>
              </div>
              <button onClick={closeDeposit} className="rounded-full p-2 text-zinc-400 hover:text-white transition-colors">✕</button>
            </div>

            <div className="mt-6">
              <label className="block text-sm text-zinc-400 mb-2">Amount (INR)</label>
              <input
                type="number" min="0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="₹0.00"
                className="w-full rounded-3xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-[#ff8600] no-spinner"
              />
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button onClick={closeDeposit} className="w-full rounded-full border border-zinc-800 px-4 py-3 text-sm text-zinc-300 hover:border-zinc-700 transition-colors sm:w-auto">
                Cancel
              </button>
              <button onClick={submitDeposit} className="w-full rounded-full bg-linear-to-r from-[#ff8600] to-[#fb923c] px-4 py-3 text-sm font-semibold text-zinc-950 hover:from-[#e05500] hover:to-[#f97316] transition-colors sm:w-auto">
                Confirm deposit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// Sub-components

function BookRow({ r, max, color }) {
  const pct = (r.cum / max) * 100;
  const bg  = color === "rose" ? "rgba(244,63,94,0.10)" : "rgba(16,185,129,0.10)";
  const txt = color === "rose" ? "text-rose-400"        : "text-emerald-400";
  return (
    <div className="relative grid grid-cols-3 px-3 py-px">
      <div className="absolute inset-y-0 right-0" style={{ width: pct + "%", background: bg }} />
      <span className={"relative " + txt}>{r.price.toFixed(1)}</span>
      <span className="relative text-right text-zinc-300">{r.size}</span>
      <span className="relative text-right text-zinc-500">{r.cum}</span>
    </div>
  );
}

function Empty({ label }) {
  return <div className="py-8 text-center text-zinc-600 font-sans">{label}</div>;
}

function RatioBar({ bid, ask }) {
  const total = bid + ask || 1;
  const bp    = (bid / total) * 100;
  return (
    <div className="shrink-0 px-3 py-2">
      <div className="flex h-1.5 rounded-full overflow-hidden">
        <div style={{ width: bp + "%" }} className="bg-emerald-500/70" />
        <div style={{ width: 100 - bp + "%" }} className="bg-rose-500/70" />
      </div>
      <div className="flex justify-between text-[10px] mt-1 font-mono">
        <span className="text-emerald-400">{bp.toFixed(0)}%</span>
        <span className="text-rose-400">{(100 - bp).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function buildCandles(trades, intervalMs) {
  const sorted  = [...trades].reverse();
  const buckets = new Map();
  for (const t of sorted) {
    const secKey = Math.floor(t.time / intervalMs) * Math.floor(intervalMs / 1000);
    if (!buckets.has(secKey)) {
      buckets.set(secKey, { time: secKey, open: t.price, high: t.price, low: t.price, close: t.price });
    } else {
      const b = buckets.get(secKey);
      b.high  = Math.max(b.high, t.price);
      b.low   = Math.min(b.low,  t.price);
      b.close = t.price;
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function PriceLineChart({ trades, intervalMs }) {
  const containerRef = useRef(null);
  const chartRef     = useRef(null);
  const seriesRef    = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#09090b" },
        textColor: "#71717a",
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#1c1c1f" },
        horzLines: { color: "#1c1c1f" },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "#3f3f46", width: 1, style: 2, labelBackgroundColor: "#27272a" },
        horzLine: { color: "#3f3f46", width: 1, style: 2, labelBackgroundColor: "#27272a" },
      },
      rightPriceScale: {
        borderColor: "#27272a",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 12,
        minBarSpacing: 4,
      },
      handleScale: { axisPressedMouseMove: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
    });

    const series = chart.addCandlestickSeries({
      upColor:       "#10b981",
      downColor:     "#f43f5e",
      borderVisible: false,
      wickUpColor:   "#10b981",
      wickDownColor: "#f43f5e",
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      chart.applyOptions({ width, height });
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current  = null;
      seriesRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!seriesRef.current) return;
    const candles = buildCandles(trades, intervalMs);
    seriesRef.current.setData(candles);
    if (candles.length > 0) chartRef.current?.timeScale().fitContent();
  }, [trades, intervalMs]);

  return (
    <div className="w-full h-full relative">
      <div ref={containerRef} className="w-full h-full" />
      {trades.length < 2 && (
        <div className="absolute inset-0 flex items-center justify-center text-zinc-600 text-xs pointer-events-none">
          Place crossing orders to see the price chart
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="13" width="4" height="8" rx="1" fill="#ff8600" />
        <rect x="7" y="8" width="4" height="13" rx="1" fill="#ff8600" />
        <rect x="13" y="3" width="4" height="18" rx="1" fill="#ff8600" />
      </svg>
      <span className="font-semibold tracking-tight text-white">CEX-Spot</span>
    </div>
  );
}
