// The Coach page: the diet coach and the gym coach on one screen (see components/CoachHub.jsx).
import CoachHub from "../components/CoachHub";

export default function CoachPage({ onBack }) {
  return (
    <div className="page-coach">
      <header className="page-head">
        {onBack && <button type="button" className="back" onClick={onBack} aria-label="Back to Home">← Home</button>}
        <h1>Coach</h1>
      </header>
      <CoachHub />
    </div>
  );
}
