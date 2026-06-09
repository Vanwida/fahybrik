export interface TemplateListItem {
  id: string;
  name: string;
  format: string;
  target_block: string;
  target_level: number | null;
  segment_count: number;
  is_draft: boolean;
}

export interface TemplateSegmentPreview {
  id: string;
  position: number;
  exercise_id: string;
  exercise_name: string;
  exercise_category: string;
  params_json: Record<string, unknown>;
  notes: string | null;
}

export interface TemplateDetail {
  id: string;
  name: string;
  format: string;
  target_block: string;
  description: string | null;
  coach_notes: string | null;
  segments: TemplateSegmentPreview[];
}
