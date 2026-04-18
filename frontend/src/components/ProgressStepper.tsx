import { ArrowRight, CheckCheck, FileSearch, Globe2, MessagesSquare, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  { id: 0, label: "Start", icon: Sparkles, path: "/" },
  { id: 1, label: "Ingest", icon: FileSearch, path: "/ingest" },
  { id: 2, label: "Refine", icon: MessagesSquare, path: "/refine" },
  { id: 3, label: "Export", icon: Globe2, path: "/export" },
];

type ProgressStepperProps = {
  currentStep: number;
  sessionId: string | null;
};

export function ProgressStepper({ currentStep, sessionId }: ProgressStepperProps) {
  return (
    <div className="flex items-center gap-1 bg-surface-dark/50 p-1 rounded-2xl border border-ui-outline-soft/50">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isDone = step.id < currentStep;
        const isEnabled = step.id <= 1 || Boolean(sessionId);
        const to =
          step.id === 0
            ? "/"
            : step.id === 1
              ? "/ingest"
              : step.id === 2
              ? `/refine/${sessionId ?? ""}`
              : `/export/${sessionId ?? ""}`;

        return (
          <div key={step.id} className="flex items-center">
            <Link
              to={isEnabled ? to : "#"}
              className={[
                "flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all duration-300",
                isActive
                  ? "bg-white text-primary shadow-premium scale-105"
                  : isDone
                    ? "text-success hover:bg-success/10"
                    : "text-steel-muted hover:text-ink hover:bg-white/50",
                !isEnabled ? "pointer-events-none opacity-30" : "",
              ].join(" ")}
            >
              <div className={[
                "flex h-5 w-5 items-center justify-center rounded-lg transition-colors",
                isActive ? "bg-primary text-white" : isDone ? "bg-success text-white" : "bg-steel/10"
              ].join(" ")}>
                {isDone
                  ? <CheckCheck className="h-3 w-3" />
                  : <Icon className="h-3 w-3" />
                }
              </div>
              <span className="hidden lg:inline">{step.label}</span>
            </Link>
            {index < steps.length - 1 ? (
              <div className="mx-1 text-steel-muted/30">
                <ArrowRight className="h-3 w-3" />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
