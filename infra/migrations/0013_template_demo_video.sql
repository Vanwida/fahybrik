-- Workout-level demo video (YouTube) Pablo attaches in the template builder.
-- Segment-level overrides live in template_segments.params_json.video_url.

alter table templates
  add column if not exists demo_video_url text;

comment on column templates.demo_video_url is
  'Canonical YouTube watch URL for whole-workout demo; embedded in-app for athletes.';
