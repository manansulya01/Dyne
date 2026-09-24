/**
 * Static 2D fallback for the 3D campus scene.
 * Rendered during SSR, while the WebGL canvas loads, and permanently
 * when WebGL is unavailable or fails. Never blank: pure SVG, no JS needed.
 */
export default function CampusFallback() {
  return (
    <div
      className="flex h-full w-full items-center justify-center bg-zinc-950 p-4 sm:p-8"
      role="img"
      aria-label="Illustration of the Macro Vision Academy campus connected through the Dyne network"
    >
      <svg
        viewBox="0 0 640 420"
        className="h-auto w-full max-w-2xl"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <radialGradient id="dyne-fallback-glow" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#164e63" stopOpacity="0.9" />
            <stop offset="55%" stopColor="#0c1424" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#09090b" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="dyne-fallback-bld" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3f4c63" />
            <stop offset="100%" stopColor="#1c2333" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="640" height="420" rx="24" fill="#09090b" />
        <rect x="0" y="0" width="640" height="420" rx="24" fill="url(#dyne-fallback-glow)" />
        {/* ground paths */}
        <g stroke="#2b3648" strokeWidth="10" strokeLinecap="round" opacity="0.9">
          <path d="M320 330 L320 210" />
          <path d="M320 250 L150 250" />
          <path d="M320 250 L490 250" />
          <path d="M220 250 L220 160" />
          <path d="M420 250 L420 160" />
        </g>
        {/* network connections */}
        <g stroke="#22d3ee" strokeWidth="1.5" opacity="0.55">
          <path d="M320 120 L170 190" />
          <path d="M320 120 L470 190" />
          <path d="M320 120 L240 110" />
          <path d="M320 120 L400 110" />
          <path d="M170 190 L240 110" />
          <path d="M470 190 L400 110" />
          <path d="M170 190 L470 190" strokeDasharray="5 5" />
        </g>
        {/* buildings */}
        <g>
          <rect x="140" y="190" width="60" height="70" rx="4" fill="url(#dyne-fallback-bld)" />
          <rect x="440" y="190" width="60" height="70" rx="4" fill="url(#dyne-fallback-bld)" />
          <rect x="215" y="90" width="50" height="70" rx="4" fill="url(#dyne-fallback-bld)" />
          <rect x="375" y="90" width="50" height="70" rx="4" fill="url(#dyne-fallback-bld)" />
          <rect x="292" y="180" width="56" height="80" rx="4" fill="url(#dyne-fallback-bld)" />
        </g>
        {/* lit windows */}
        <g fill="#67e8f9" opacity="0.85">
          <rect x="148" y="200" width="12" height="8" rx="1" />
          <rect x="166" y="200" width="12" height="8" rx="1" />
          <rect x="148" y="214" width="12" height="8" rx="1" />
          <rect x="448" y="200" width="12" height="8" rx="1" />
          <rect x="466" y="214" width="12" height="8" rx="1" />
          <rect x="222" y="100" width="10" height="7" rx="1" />
          <rect x="382" y="100" width="10" height="7" rx="1" />
          <rect x="300" y="192" width="10" height="7" rx="1" />
          <rect x="314" y="192" width="10" height="7" rx="1" />
        </g>
        {/* network hub */}
        <rect x="314" y="120" width="12" height="62" rx="3" fill="#3f4c63" />
        <circle cx="320" cy="112" r="10" fill="#22d3ee" />
        <circle cx="320" cy="112" r="16" fill="none" stroke="#22d3ee" strokeWidth="1.5" opacity="0.5" />
        {/* activity nodes */}
        <g>
          <circle cx="170" cy="184" r="7" fill="#22d3ee" />
          <circle cx="470" cy="184" r="7" fill="#a78bfa" />
          <circle cx="240" cy="104" r="7" fill="#fbbf24" />
          <circle cx="400" cy="104" r="7" fill="#22d3ee" />
          <circle cx="320" cy="174" r="7" fill="#f472b6" />
        </g>
      </svg>
    </div>
  );
}
