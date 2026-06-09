-- Week template: coach focus + notes (not rigid "steps" — metadata only).
alter table program_week_templates
  add column if not exists focus text,
  add column if not exists coach_notes text;
