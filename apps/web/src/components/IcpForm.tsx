import { useState, type FormEvent } from "react";
import { icpInputSchema, type IcpInput, type StartRunRequest } from "@revon-tinyfish/contracts";
import { DEFAULT_DEMO_INPUT, DEMO_PRESETS, type DemoPreset } from "../demoPresets";
import { buildIcpSignature, createCorrelationId, logWebTrace } from "../lib/debugTrace";

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
  eyebrow = "Prospect sourcing",
  title = "New prospect sourcing workflow",
  description = "The agent navigates live company websites and public directories, evaluates each prospect against your ICP, and returns a ranked shortlist.",
  onSubmit,
}: IcpFormProps) {
  const [form, setForm] = useState<IcpInput>(DEFAULT_DEMO_INPUT);
  const [experimentLabel, setExperimentLabel] = useState<string>(DEMO_PRESETS[0]?.experimentLabel ?? "");
  const [modeIntent, setModeIntent] = useState("backend_auto");
  const [qualityIntent, setQualityIntent] = useState("accept_degraded");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const parsed = icpInputSchema.parse(form);
      const correlationId = createCorrelationId();
      const payloadSignature = buildIcpSignature(parsed);

      logWebTrace("IcpForm.handleSubmit", {
        correlationId,
        invocationKey: `submit:${payloadSignature}`,
        details: {
          payloadSignature,
          isSubmitting,
          experimentLabel,
          modeIntent,
          qualityIntent,
        },
      });

      setError(null);
      await onSubmit(
        {
          input: parsed,
          ...(experimentLabel.trim() ? { experimentLabel: experimentLabel.trim() } : {}),
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
    setError(null);
  }

  return (
    <section className="panel panel-form">
      <div className="panel-header">
        <p className="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p className="muted">{description}</p>
      </div>

      {showPresets ? (
        <div className="preset-row">
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
            >
              <strong>{preset.label}</strong>
              <span>{preset.recommended ? `${preset.note} | safest option` : preset.note}</span>
            </button>
          ))}
        </div>
      ) : null}

      <form className="icp-form" onSubmit={handleSubmit}>
        {operatorMode ? (
          <>
            <label>
              <span>Execution mode</span>
              <select value={modeIntent} onChange={(event) => setModeIntent(event.target.value)}>
                <option value="backend_auto">Auto-select</option>
                <option value="prefer_live">Prefer live agent</option>
                <option value="explicit_mock">Review-safe path</option>
              </select>
            </label>

            <label>
              <span>Output quality</span>
              <select
                value={qualityIntent}
                onChange={(event) => setQualityIntent(event.target.value)}
              >
                <option value="accept_degraded">Accept degraded output</option>
                <option value="healthy_only">Require healthy output</option>
              </select>
            </label>

            <p className="muted form-note">
              Execution mode and output quality are operator hints. Actual execution path and
              output quality are determined by the backend.
            </p>
          </>
        ) : null}

        <label>
          <span>Target market</span>
          <input
            value={form.targetMarket}
            onChange={(event) => updateField("targetMarket", event.target.value)}
            placeholder="e.g. UK digital agencies, B2B SaaS, healthcare providers"
          />
        </label>

        <label>
          <span>Geography</span>
          <input
            value={form.location}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="e.g. United Kingdom, DACH region, US Northeast"
          />
        </label>

        <label>
          <span>Company size</span>
          <select
            value={form.companySize}
            onChange={(event) => updateField("companySize", event.target.value as IcpInput["companySize"])}
          >
            <option value="any">Any size</option>
            <option value="1-10">1–10 employees</option>
            <option value="11-50">11–50 employees</option>
            <option value="51-200">51–200 employees</option>
            <option value="201-1000">201–1000 employees</option>
            <option value="1000+">1000+ employees</option>
          </select>
        </label>

        <label>
          <span>ICP keywords</span>
          <input
            value={form.keywords}
            onChange={(event) => updateField("keywords", event.target.value)}
            placeholder="e.g. outbound sales, SaaS, hiring, expansion-stage"
          />
        </label>

        <label>
          <span>Decision-maker role</span>
          <input
            value={form.decisionMakerRole}
            onChange={(event) => updateField("decisionMakerRole", event.target.value)}
            placeholder="e.g. VP Sales, Marketing Director, CTO"
          />
        </label>

        <label>
          <span>Max prospects</span>
          <input
            type="number"
            min={1}
            max={8}
            value={form.maxResults}
            onChange={(event) => updateField("maxResults", Number(event.target.value))}
          />
        </label>

        <label>
          <span>Experiment label</span>
          <input
            value={experimentLabel}
            onChange={(event) => setExperimentLabel(event.target.value)}
            placeholder="e.g. q2_uk_agency_outbound"
          />
        </label>

        {error ? <p className="inline-error">{error}</p> : null}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Launching workflow..." : "Launch prospect sourcing workflow"}
        </button>
      </form>
    </section>
  );
}
