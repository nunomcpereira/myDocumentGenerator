import { BotMessageSquare } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { ProgressStepper } from "./components/ProgressStepper";
import { ExportScreen } from "./pages/ExportScreen";
import { IngestionScreen } from "./pages/IngestionScreen";
import { RefinementScreen } from "./pages/RefinementScreen";
import type { SessionSnapshot } from "./lib/types";

const initialSnapshot: SessionSnapshot = {
  sessionId: null,
  previewMarkdown: "",
  warnings: [],
};

function WorkflowRoutes({ snapshot, onSnapshotChange }: { snapshot: SessionSnapshot; onSnapshotChange: (snapshot: SessionSnapshot) => void }) {
  const navigate = useNavigate();

  return (
    <Routes>
      <Route
        path="/"
        element={
          <IngestionScreen
            onInitialized={(nextSnapshot) => {
              onSnapshotChange(nextSnapshot);
              navigate(`/refine/${nextSnapshot.sessionId}`);
            }}
          />
        }
      />
      <Route
        path="/refine/:sessionId"
        element={<RefinementRoute snapshot={snapshot} onSnapshotChange={onSnapshotChange} />}
      />
      <Route path="/export/:sessionId" element={<ExportRoute snapshot={snapshot} />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RefinementRoute({ snapshot, onSnapshotChange }: { snapshot: SessionSnapshot; onSnapshotChange: (snapshot: SessionSnapshot) => void }) {
  const { sessionId } = useParams();
  if (!snapshot.sessionId || snapshot.sessionId !== sessionId) {
    return <Navigate to="/" replace />;
  }
  return <RefinementScreen snapshot={snapshot} onUpdated={onSnapshotChange} />;
}

function ExportRoute({ snapshot }: { snapshot: SessionSnapshot }) {
  const { sessionId } = useParams();
  if (!snapshot.sessionId || snapshot.sessionId !== sessionId) {
    return <Navigate to="/" replace />;
  }
  return <ExportScreen snapshot={snapshot} />;
}

export default function App() {
  const location = useLocation();
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(() => {
    const raw = window.sessionStorage.getItem("documentation-engine-session");
    return raw ? (JSON.parse(raw) as SessionSnapshot) : initialSnapshot;
  });

  useEffect(() => {
    window.sessionStorage.setItem("documentation-engine-session", JSON.stringify(snapshot));
  }, [snapshot]);

  const currentStep = snapshot.sessionId
    ? location.pathname.startsWith("/export")
      ? 3
      : location.pathname.startsWith("/refine")
        ? 2
        : 1
    : 1;

  return (
    <div className="mx-auto min-h-screen max-w-[1480px] px-4 py-6 sm:px-6 lg:px-10">
      <header className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-3 rounded-full border border-white/70 bg-white/75 px-4 py-2 shadow-panel backdrop-blur">
            <BotMessageSquare className="h-4 w-4 text-ember" />
            <span className="text-sm text-ink">Documentation Generation & Localization Engine</span>
          </div>
          <h1 className="mt-4 max-w-4xl font-serif text-4xl text-ink sm:text-5xl">
            API-first specification generation, analyst-guided refinement, and structural localization.
          </h1>
        </div>
        <ProgressStepper currentStep={currentStep} sessionId={snapshot.sessionId} />
      </header>

      {snapshot.warnings.length > 0 ? (
        <div className="mb-6 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {snapshot.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      ) : null}

      <WorkflowRoutes snapshot={snapshot} onSnapshotChange={setSnapshot} />
    </div>
  );
}