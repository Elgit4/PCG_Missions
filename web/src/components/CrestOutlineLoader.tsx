import { pcgCrestOutlinePath, pcgCrestViewBox } from "../assets/pcg-crest-outline";

export function CrestOutlineLoader({ label = "Preparing your ministry workspace" }: { label?: string }) {
  return (
    <main className="cmi-auth-loading cmi-outline-loading" role="status" aria-live="polite">
      <div className="cmi-loading-brand">
        <svg className="cmi-crest-outline" viewBox={pcgCrestViewBox} role="img" aria-label="PCG Missions crest being drawn">
          <path className="cmi-crest-outline-path" d={pcgCrestOutlinePath} fill="none" pathLength="1" />
        </svg>
        <span className="cmi-loading-name">PCG MISSIONS</span>
        <span className="cmi-loading-caption">PEOPLE · CARE · COMMUNITY</span>
      </div>
      <p className="cmi-loading-message">{label}</p>
    </main>
  );
}
