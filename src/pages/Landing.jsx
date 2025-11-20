// File: src/pages/Landing.jsx
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-black text-white">
      <div className="w-full max-w-xl mx-auto text-center space-y-10">
        {/* Title + tagline */}
        <div className="space-y-3">
          <p className="text-xs tracking-[0.35em] uppercase text-blue-400/80">
            Flow State Financial
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold">
            Flow State Financial Manager
          </h1>
          <p className="text-sm text-white/60">
            Secure lead distribution and tracking for the Flow State team.
          </p>
        </div>

        {/* Login / signup buttons (above logo) */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/login" className="btn btn-primary w-full sm:w-auto">
            Login
          </Link>
          <Link
            to="/signup"
            className="btn w-full sm:w-auto hover:bg-white/5 text-blue-300 border-blue-500/60"
          >
            Sign up with invite code
          </Link>
        </div>

        {/* Big logo below buttons */}
        <div className="mt-4">
          <img
            src="/flowstate-logo.png"
            alt="Flow State Financial"
            className="mx-auto max-w-xs sm:max-w-sm"
          />
        </div>
      </div>
    </main>
  );
}
