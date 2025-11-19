// File: src/pages/Landing.jsx
import { Link } from "react-router-dom";

export default function Landing() {
  // TODO: replace with the real logo path (e.g. /flow-state-logo.png)
  const logoSrc = "/flow-state-logo.png";

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-lg w-full text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center">
          <div className="inline-flex items-center justify-center">
            <img
              src={logoSrc}
              alt="Flow State Financial"
              className="h-24 w-auto sm:h-32 object-contain drop-shadow-[0_0_40px_rgba(59,130,246,0.45)]"
              onError={(e) => {
                // fallback simple text if logo not found yet
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        </div>

        {/* App name */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Flow State Financial Manager
          </h1>
          <p className="text-sm sm:text-base text-white/70">
            Central hub for Flow State Financial&apos;s leads, assignments, and
            trades. Log in to manage your pipeline.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link to="/login" className="btn btn-primary w-full sm:w-40">
            Log In
          </Link>
          <Link
            to="/signup"
            className="btn w-full sm:w-40 border border-blue-500/60 bg-white/5 hover:bg-white/10 transition"
          >
            Sign Up
          </Link>
        </div>

        {/* Tiny footer text */}
        <p className="text-[11px] text-white/40 pt-4">
          Built for Flow State Financial agents &amp; managers.
        </p>
      </div>
    </main>
  );
}
