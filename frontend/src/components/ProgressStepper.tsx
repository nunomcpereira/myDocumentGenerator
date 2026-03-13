import { CheckCheck, FileSearch, Globe2, MessagesSquare } from "lucide-react";
import { Link } from "react-router-dom";

const steps = [
  { id: 1, label: "Ingest", icon: FileSearch, path: "/" },
  { id: 2, label: "Refine", icon: MessagesSquare, path: "/refine" },
  { id: 3, label: "Export", icon: Globe2, path: "/export" },
];

type ProgressStepperProps = {
  currentStep: number;
  sessionId: string | null;
};

export function ProgressStepper({ currentStep, sessionId }: ProgressStepperProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-full border border-white/60 bg-white/70 p-3 shadow-panel backdrop-blur">
      {steps.map((step) => {
        const Icon = step.icon;
        const isActive = step.id === currentStep;
        const isEnabled = step.id === 1 || Boolean(sessionId);
        const to =
          step.id === 1
            ? "/"
            : step.id === 2
              ? `/refine/${sessionId ?? ""}`
              : `/export/${sessionId ?? ""}`;

        return (
          <Link
            key={step.id}
            to={isEnabled ? to : "#"}
            className={[
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm transition",
              isActive ? "bg-ink text-sand" : "bg-sand/70 text-ink hover:bg-white",
              !isEnabled ? "pointer-events-none opacity-40" : "",
            ].join(" ")}
          >
            {step.id < currentStep ? <CheckCheck className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            <span>{step.label}</span>
          </Link>
        );
      })}
    </div>
  );
}