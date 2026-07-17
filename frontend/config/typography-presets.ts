/**
 * Typography preset definitions.
 *
 * Each preset bundles a body font, heading font, and mono font along with
 * sensible defaults for font size, line height, and reading width.
 * Rooms reference presets by `id`; users can override individual values.
 */

export type TypographyPreset = {
  id: string;
  name: string;
  description: string;
  fontBody: string;
  fontHeading: string;
  fontMono: string;
  defaultFontSize: number;
  defaultLineHeight: number;
  defaultReadingWidth: number;
};

export const TYPOGRAPHY_PRESETS: TypographyPreset[] = [
  {
    id: "classic-book",
    name: "Classic Book",
    description: "Elegant serif typography for long-form reading.",
    fontBody: "'Source Serif 4', Georgia, 'Times New Roman', serif",
    fontHeading: "'Source Serif 4', Georgia, serif",
    fontMono: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    defaultFontSize: 18,
    defaultLineHeight: 1.85,
    defaultReadingWidth: 680,
  },
  {
    id: "modern-sans",
    name: "Modern Sans",
    description: "Clean sans-serif for a modern reading experience.",
    fontBody: "'Inter', system-ui, -apple-system, sans-serif",
    fontHeading: "'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
    defaultFontSize: 17,
    defaultLineHeight: 1.8,
    defaultReadingWidth: 720,
  },
  {
    id: "technical",
    name: "Technical",
    description: "Optimized for documentation, research papers, and code.",
    fontBody: "'Inter', system-ui, sans-serif",
    fontHeading: "'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', 'Fira Code', monospace",
    defaultFontSize: 16,
    defaultLineHeight: 1.7,
    defaultReadingWidth: 800,
  },
  {
    id: "comfort-reading",
    name: "Comfort Reading",
    description: "Large text and generous spacing for relaxed reading.",
    fontBody: "'Source Serif 4', Georgia, serif",
    fontHeading: "'Inter', system-ui, sans-serif",
    fontMono: "'JetBrains Mono', monospace",
    defaultFontSize: 20,
    defaultLineHeight: 2.0,
    defaultReadingWidth: 640,
  },
];

const presetIndex = new Map(TYPOGRAPHY_PRESETS.map((p) => [p.id, p]));

export function getPresetById(id: string): TypographyPreset {
  return presetIndex.get(id) ?? presetIndex.get("modern-sans")!;
}
