import { useState, type FormEvent } from "react";
import { Rocket, Settings2 } from "lucide-react";
import { icpInputSchema, type IcpInput, type StartRunRequest } from "@revon-tinyfish/contracts";
import { DEFAULT_DEMO_INPUT, DEMO_PRESETS, type DemoPreset } from "../demoPresets";
import { buildIcpSignature, createCorrelationId, logWebTrace } from "../lib/debugTrace";
import { buildTinyFishPromptPreview } from "../lib/promptPreview";

interface IcpFormProps {
  isSubmitting: boolean;
  showPresets?: boolean;
  operatorMode?: boolean;
  eyebrow?: string;
  title?: string;
  description?: string;
  onSubmit: (
    payload: StartRunRequest,
    trace: {
      correlationId: string;
      payloadSignature: string;
    },
  ) => Promise<void>;
}

export function IcpForm({
  isSubmitting,
  showPresets = true,
  operatorMode = false,
  eyebrow = "Prospect Sourcing",
  title = "New Prospect Sourcing Workflow",
  description = "The agent navigates live company websites and public directories, evaluates each prospect against your ICP, and returns a ranked shortlist.",
  onSubmit,
}: IcpFormProps) {
  const [form, setForm] = useState<IcpInput>(DEFAULT_DEMO_INPUT);
  const [experimentLabel, setExperimentLabel] = useState<string>(DEMO_PRESETS[0]?.experimentLabel ?? "");
  const [promptOverride, setPromptOverride] = useState("");
  const [modeIntent, setModeIntent] = useState("backend_auto");
  const [qualityIntent, setQualityIntent] = useState("accept_degraded");
  const [error, setError] = useState<string | null>(null);
  const promptPreview = buildTinyFishPromptPreview(form, promptOverride);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const parsed = icpInputSchema.parse(form);
      const correlationId = createCorrelationId();
      const payloadSignature = buildIcpSignature(parsed, promptOverride);

      logWebTrace("IcpForm.handleSubmit", {
        correlationId,
        invocationKey: `submit:${payloadSignature}`,
        details: {
          payloadSignature,
          isSubmitting,
          experimentLabel,
          promptOverride,
          modeIntent,
          qualityIntent,
        },
      });

      setError(null);
      await onSubmit(
        {
          input: parsed,
          ...(experimentLabel.trim() ? { experimentLabel: experimentLabel.trim() } : {}),
          promptOverride: promptOverride.trim(),
        },
        {
          correlationId,
          payloadSignature,
        },
      );
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Please review the ICP fields.";
      setError(message);
    }
  }

  function updateField<Key extends keyof IcpInput>(key: Key, value: IcpInput[Key]) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function applyPreset(preset: DemoPreset) {
    setForm(preset.input);
    setExperimentLabel(preset.experimentLabel);
    setPromptOverride("");
    setError(null);
  }

  return (
    <section className="panel" data-testid="icp-form-panel">
      <div className="panel-header">
        <p className="eyebrow">{eyebrow}</p>
        <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "1.25rem", marginTop: 8 }}>
          {title}
        </h2>
        <p className="muted" style={{ marginTop: 8, fontSize: "0.875rem", lineHeight: 1.6 }}>
          {description}
        </p>
      </div>

      {showPresets ? (
        <div className="preset-row" data-testid="preset-row">
          {DEMO_PRESETS.map((preset) => (
            <button
              className={`preset-button ${
                form.targetMarket === preset.input.targetMarket && form.location === preset.input.location
                  ? "selected"
                  : ""
              }`}
              key={preset.id}
              onClick={() => applyPreset(preset)}
              type="button"
              data-testid={`preset-${preset.id}`}
            >
              <strong>{preset.label}</strong>
              <span>{preset.recommended ? `${preset.note} | safest option` : preset.note}</span>
            </button>
          ))}
        </div>
      ) : null}

      <form className="icp-form" onSubmit={handleSubmit} data-testid="icp-form">
        {operatorMode ? (
          <div style={{
            padding: 16,
            background: "var(--bg-muted)",
            borderRadius: 10,
            marginBottom: 8,
            border: "1px solid var(--border-default)"
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Settings2 size={16} style={{ color: "var(--text-muted)" }} />
              <span style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
                Operator Settings
              </span>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <label>
                <span>Execution Mode</span>
                <select
                  value={modeIntent}
                  onChange={(event) => setModeIntent(event.target.value)}
                  data-testid="select-mode"
                >
                  <option value="backend_auto">Auto-select</option>
                  <option value="prefer_live">Prefer live agent</option>
                  <option value="explicit_mock">Review-safe path</option>
                </select>
              </label>

              <label>
                <span>Output Quality</span>
                <select
                  value={qualityIntent}
                  onChange={(event) => setQualityIntent(event.target.value)}
                  data-testid="select-quality"
                >
                  <option value="accept_degraded">Accept degraded output</option>
                  <option value="healthy_only">Require healthy output</option>
                </select>
              </label>
            </div>

            <p className="form-note" style={{ marginTop: 12, color: "var(--text-muted)" }}>
              Execution mode and output quality are operator hints. Actual execution path and
              output quality are determined by the backend.
            </p>
          </div>
        ) : null}

        <details style={{
          marginTop: 12,
          padding: 16,
          background: "var(--bg-muted)",
          borderRadius: 12,
          border: "1px solid var(--border-default)",
        }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, listStyle: "none" }}>
            TinyFish prompt preview
          </summary>
          <p className="form-note" style={{ marginTop: 8, color: "var(--text-muted)" }}>
            This is the task prompt the agent receives. It is not a system prompt, but it is the
            instruction set that matters for the live run.
          </p>
          <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
            <div>
              <strong style={{ display: "block", marginBottom: 6 }}>Directory discovery</strong>
              <pre style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontSize: "0.8rem",
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                background: "var(--panel-bg)",
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--border-default)",
                maxHeight: 220,
                overflow: "auto",
              }}>
                {promptPreview.directory}
              </pre>
            </div>
            <div>
              <strong style={{ display: "block", marginBottom: 6 }}>Website inspection</strong>
              <pre style={{
                margin: 0,
                whiteSpace: "pre-wrap",
                fontSize: "0.8rem",
                lineHeight: 1.5,
                color: "var(--text-secondary)",
                background: "var(--panel-bg)",
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--border-default)",
                maxHeight: 220,
                overflow: "auto",
              }}>
                {promptPreview.website}
              </pre>
            </div>
          </div>
        </details>

        <label>
          <span>Agent Instructions</span>
          <textarea
            value={promptOverride}
            onChange={(event) => setPromptOverride(event.target.value)}
            placeholder="Optional: add operator instructions that should shape the TinyFish task prompt. Example: Prioritize agencies with a visible contact page and public team bios."
            rows={5}
            data-testid="textarea-prompt-override"
          />
          <span className="form-note">
            This text is appended to the live task prompt and can be edited in the demo.
          </span>
        </label>

        <label>
          <span>Target Market</span>
          <input
            value={form.targetMarket}
            onChange={(event) => updateField("targetMarket", event.target.value)}
            placeholder="e.g. UK digital agencies, B2B SaaS, healthcare providers"
            data-testid="input-target-market"
          />
        </label>

        <label>
          <span>Geography</span>
          <input
            value={form.location}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="e.g. United Kingdom, DACH region, US Northeast"
            data-testid="input-location"
          />
        </label>

        <label>
          <span>Company Size</span>
          <select
            value={form.companySize}
            onChange={(event) => updateField("companySize", event.target.value as IcpInput["companySize"])}
            data-testid="select-company-size"
          >
            <option value="any">Any size</option>
            <option value="1-10">1-10 employees</option>
            <option value="11-50">11-50 employees</option>
            <option value="51-200">51-200 employees</option>
            <option value="201-1000">201-1000 employees</option>
            <option value="1000+">1000+ employees</option>
          </select>
        </label>

        <label>
          <span>ICP Keywords</span>
          <input
            value={form.keywords}
            onChange={(event) => updateField("keywords", event.target.value)}
            placeholder="e.g. outbound sales, SaaS, hiring, expansion-stage"
            data-testid="input-keywords"
          />
        </label>

        <label>
          <span>Decision-Maker Role</span>
          <input
            value={form.decisionMakerRole}
            onChange={(event) => updateField("decisionMakerRole", event.target.value)}
            placeholder="e.g. VP Sales, Marketing Director, CTO"
            data-testid="input-decision-maker"
          />
        </label>

        <label>
          <span>Max Prospects</span>
          <input
            type="number"
            min={1}
            max={8}
            value={form.maxResults}
            onChange={(event) => updateField("maxResults", Number(event.target.value))}
            data-testid="input-max-prospects"
          />
        </label>

        <label>
          <span>Experiment Label</span>
          <input
            value={experimentLabel}
            onChange={(event) => setExperimentLabel(event.target.value)}
            placeholder="e.g. q2_uk_agency_outbound"
            data-testid="input-experiment-label"
          />
        </label>

        {error ? <p className="inline-error">{error}</p> : null}

        <button
          className="primary-button"
          disabled={isSubmitting}
          type="submit"
          data-testid="submit-workflow-btn"
          style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
        >
          <Rocket size={18} />
          {isSubmitting ? "Launching workflow..." : "Launch Prospect Sourcing Workflow"}
        </button>
      </form>
    </section>
  );
}
