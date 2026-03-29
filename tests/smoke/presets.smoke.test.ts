import { describe, expect, it } from "vitest";
import { icpInputSchema } from "@revon-tinyfish/contracts";
import { DEMO_PRESETS } from "../../apps/web/src/demoPresets";

describe("preset validation smoke", () => {
  it("keeps every preset schema-valid and stable", () => {
    const ids = new Set<string>();
    const recommended = DEMO_PRESETS.filter((preset) => preset.recommended);

    expect(DEMO_PRESETS.length).toBeGreaterThanOrEqual(2);
    expect(recommended).toHaveLength(1);

    for (const preset of DEMO_PRESETS) {
      expect(() => icpInputSchema.parse(preset.input)).not.toThrow();
      expect(ids.has(preset.id)).toBe(false);
      ids.add(preset.id);
      expect(preset.label.length).toBeGreaterThan(3);
      expect(preset.note.length).toBeGreaterThan(3);
      expect(preset.input.maxResults).toBeLessThanOrEqual(8);
    }

    expect(recommended[0]?.id).toBe("uk-digital-agencies");
  });
});
