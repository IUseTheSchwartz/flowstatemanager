import { useState } from "react";
import { signIn } from "../lib/auth";
import { useNavigate, Link } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState(""); const [pass, setPass] = useState("");
  const [err, setErr] = useState(""); const nav = useNavigate();
  async function submit(e){ e.preventDefault(); setErr("");
    try { await signIn(email, pass); nav("/leads"); } catch(e){ setErr(e.message); } }
  return (
    <div className="max-w-md mx-auto mt-16 card p-6">
      <h2 className="text-xl font-semibold mb-4">Login</h2>
      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <input className="w-full p-3 rounded bg-white/5 border border-white/10" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
        <input type="password" className="w-full p-3 rounded bg-white/5 border border-white/10" placeholder="Password" value={pass} onChange={e=>setPass(e.target.value)} />
        <button className="btn btn-primary w-full">Continue</button>
      </form>
      <p className="text-sm text-white/60 mt-3">No account? <Link to="/signup">Sign up</Link></p>
    </div>
  );
}
