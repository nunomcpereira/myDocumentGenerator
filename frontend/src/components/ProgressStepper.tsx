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
    <div className="wizard-stepper flex flex-wrap items-center gap-2 rounded-full border border-white/60 bg-white/70 p-3 shadow-panel backdrop-blur">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
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
          <div key={step.id} className="flex items-center gap-2">
            <Link
              to={isEnabled ? to : "#"}
              className={[
                "wizard-step flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
                isActive ? "wizard-step-active bg-ink text-sand" : "wizard-step-inactive bg-sand/70 text-ink hover:bg-white",
                !isEnabled ? "pointer-events-none opacity-40" : "",
              ].join(" ")}
            >
              {step.id < currentStep ? <CheckCheck className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              <span>{step.label}</span>
            </Link>
            {index < steps.length - 1 ? <ArrowRight className="wizard-step-arrow h-4 w-4 text-steel/70" /> : null}
          </div>
        );
      })}
    </div>
  );
}