import { useState } from "react";
import { signUp } from "../lib/auth";
import { useNavigate, Link } from "react-router-dom";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    setErr("");

    const trimmed = code.trim();
    if (!trimmed) {
      setErr("An invite code is required.");
      return;
    }

    try {
      setBusy(true);
      await signUp({ email, password: pass, full_name: name, code: trimmed });

      // 👇 Change: send them back to the landing hub instead of /leads
      nav("/");
    } catch (e) {
      setErr(e.message || "Sign up failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-md mx-auto mt-16 card p-6">
      <h2 className="text-xl font-semibold mb-4">Sign up</h2>
      <p className="text-sm text-white/60 mb-2">
        You must have a valid invite code.
      </p>
      {err && <p className="text-red-400 text-sm mb-2">{err}</p>}
      <form onSubmit={submit} className="space-y-3">
        <input
          className="w-full p-3 rounded bg-white/5 border border-white/10"
          placeholder="Full name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <input
          type="email"
          className="w-full p-3 rounded bg-white/5 border border-white/10"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          className="w-full p-3 rounded bg-white/5 border border-white/10"
          placeholder="Password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          minLength={6}
          required
        />
        <input
          className="w-full p-3 rounded bg-white/5 border border-white/10"
          placeholder="Invite code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button
          className="btn btn-primary w-full"
          disabled={busy || !code.trim()}
        >
          {busy ? "Creating..." : "Create account"}
        </button>
      </form>
      <p className="text-sm text-white/60 mt-3">
        Have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}
