import { useState, type FormEvent } from "react";
import { icpInputSchema, type IcpInput } from "@revon-tinyfish/contracts";

interface IcpFormProps {
  isSubmitting: boolean;
  onSubmit: (input: IcpInput) => Promise<void>;
}

interface DemoPreset {
  id: string;
  label: string;
  note: string;
  recommended?: boolean;
  input: IcpInput;
}

const DEMO_PRESETS: DemoPreset[] = [
  {
    id: "london-digital-marketing",
    label: "London digital agencies",
    note: "Recommended live demo path",
    recommended: true,
    input: {
      targetMarket: "Digital marketing",
      location: "London",
      companySize: "11-50",
      keywords: "B2B, SaaS, growth",
      decisionMakerRole: "Founder",
      maxResults: 5,
    },
  },
  {
    id: "berlin-web-development",
    label: "Berlin web dev shops",
    note: "Good fallback live preset",
    input: {
      targetMarket: "Web development",
      location: "Berlin",
      companySize: "11-50",
      keywords: "B2B, product, SaaS",
      decisionMakerRole: "Managing Director",
      maxResults: 4,
    },
  },
  {
    id: "amsterdam-seo",
    label: "Amsterdam SEO agencies",
    note: "Smaller, focused prospect list",
    input: {
      targetMarket: "SEO",
      location: "Amsterdam",
      companySize: "11-50",
      keywords: "lead generation, B2B",
      decisionMakerRole: "Founder",
      maxResults: 4,
    },
  },
];

const DEFAULT_INPUT: IcpInput = DEMO_PRESETS[0]?.input ?? {
  targetMarket: "Digital marketing",
  location: "London",
  companySize: "11-50",
  keywords: "B2B, SaaS, growth",
  decisionMakerRole: "Founder",
  maxResults: 5,
};

export function IcpForm({ isSubmitting, onSubmit }: IcpFormProps) {
  const [form, setForm] = useState<IcpInput>(DEFAULT_INPUT);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const parsed = icpInputSchema.parse(form);
      setError(null);
      await onSubmit(parsed);
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
    setError(null);
  }

  return (
    <section className="panel panel-form">
      <div className="panel-header">
        <p className="eyebrow">Live web-agent demo</p>
        <h2>Launch a TinyFish lead run</h2>
        <p className="muted">
          TinyFish browses public directories and real company websites, then returns a ranked
          Revon-ready shortlist. Use the recommended preset if you want the safest live path.
        </p>
      </div>

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

      <form className="icp-form" onSubmit={handleSubmit}>
        <label>
          <span>Target market</span>
          <input
            value={form.targetMarket}
            onChange={(event) => updateField("targetMarket", event.target.value)}
            placeholder="Digital marketing"
          />
        </label>

        <label>
          <span>Location</span>
          <input
            value={form.location}
            onChange={(event) => updateField("location", event.target.value)}
            placeholder="London"
          />
        </label>

        <label>
          <span>Company size</span>
          <select
            value={form.companySize}
            onChange={(event) => updateField("companySize", event.target.value as IcpInput["companySize"])}
          >
            <option value="any">Any</option>
            <option value="1-10">1-10</option>
            <option value="11-50">11-50</option>
            <option value="51-200">51-200</option>
            <option value="201-1000">201-1000</option>
            <option value="1000+">1000+</option>
          </select>
        </label>

        <label>
          <span>Keywords</span>
          <input
            value={form.keywords}
            onChange={(event) => updateField("keywords", event.target.value)}
            placeholder="B2B, SaaS, growth"
          />
        </label>

        <label>
          <span>Target role</span>
          <input
            value={form.decisionMakerRole}
            onChange={(event) => updateField("decisionMakerRole", event.target.value)}
            placeholder="Founder"
          />
        </label>

        <label>
          <span>Max results</span>
          <input
            type="number"
            min={1}
            max={8}
            value={form.maxResults}
            onChange={(event) => updateField("maxResults", Number(event.target.value))}
          />
        </label>

        {error ? <p className="inline-error">{error}</p> : null}

        <button className="primary-button" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Starting run..." : "Start TinyFish run"}
        </button>
      </form>
    </section>
  );
}
