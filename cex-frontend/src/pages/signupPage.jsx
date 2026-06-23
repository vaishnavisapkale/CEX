import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (password !== confirm) 
      { 
        setError("Passwords don't match"); 
        return; 
      }
    setLoading(true);
    try {
      await signup(username, password);
      navigate("/trade");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-200 font-sans antialiased flex flex-col items-center justify-center px-5">
      <div className="w-full max-w-sm mb-6 flex items-center justify-between">
         <Link to="/" className="flex items-center gap-2.5"><Brand /></Link>
        <Link to="/" className="text-sm text-zinc-400 hover:text-white transition-colors">← Back to home</Link>
       
      </div>

      <div className="w-full max-w-sm bg-zinc-900/80 border border-zinc-800 rounded-2xl p-8 shadow-2xl backdrop-blur">
        <div className="font-mono text-xs tracking-widest uppercase mb-3 text-center" style={{ color: "#ff8600" }}>Get started</div>
        <h1 className="text-3xl font-semibold tracking-tight text-white text-center mb-2">Create your account</h1>
        <p className="text-sm text-zinc-500 text-center mb-8">Start trading in minutes.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Username">
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-100 outline-none focus:border-[#ff8600] transition-colors" />
          </Field>
          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-100 outline-none focus:border-[#ff8600] transition-colors" />
          </Field>
          <Field label="Confirm password">
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2.5 text-zinc-100 outline-none focus:border-[#ff8600] transition-colors" />
          </Field>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#ff8600] text-black font-medium hover:bg-[#e05500] disabled:opacity-50 transition-colors">
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="text-sm text-zinc-500 text-center mt-6">
          Already have an account? <Link to="/signin" className="text-[#ff8600] hover:text-[#e05500]">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs text-zinc-500 mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}

function Brand() {
  return (
      <div className="flex items-center gap-2.5">
        <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect x="1" y="13" width="4" height="8" rx="1" fill="#ff8600" />
        <rect x="7" y="8" width="4" height="13" rx="1" fill="#ff8600" />
        <rect x="13" y="3" width="4" height="18" rx="1" fill="#ff8600" />
      </svg>
      <span className="text-lg font-semibold tracking-tight text-white">CEX-Spot</span>
    </div>
  );
}