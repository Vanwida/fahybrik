export interface TemplatePreviewBlock {
  title: string;
  exercises: string[];
}

export interface TemplatePreview {
  id: string;
  name: string;
  format: string;
  format_label: string;
  headline: string;
  blocks: TemplatePreviewBlock[];
  exercise_lines: string[];
  exercise_count: number;
  warmup: string | null;
  coach_notes: string | null;
}

export type TemplatePreviewMap = Record<string, TemplatePreview>;
