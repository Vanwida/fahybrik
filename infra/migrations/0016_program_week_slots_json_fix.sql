-- Fix program_week_templates.slots_json stored as jsonb string (double JSON.stringify).
update program_week_templates
set slots_json = (slots_json #>> '{}')::jsonb
where jsonb_typeof(slots_json) = 'string';
