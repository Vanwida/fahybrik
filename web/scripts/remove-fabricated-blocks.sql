-- remove-fabricated-blocks.sql
--
-- Removes the ~10 FABRICATED blocks (and their block_exercises) that an old
-- seed injected on top of the coach's real Excel library.
--
-- GROUND TRUTH: docs/Grupos_Entrenamiento_HYROX.xlsx has EXACTLY 97 sessions.
-- The demo DB (ep-flat-wind) had 107 blocks on coach 4 (Pablo) and on the two
-- clones (coaches 29, 30). The 10 extras are NOT in the Excel — they were
-- generated from "Plantilla_HYROX_12sem*" / "fahybrik-semana1*" sources
-- (perfil Fuerza/Resistencia variants, Semana 10/11/12 sims, pista tests).
--
-- The fabricated set is identified by content provenance: source_ref pointing
-- at a non-Excel template ('Plantilla_HYROX...' or 'fahybrik-semana...').
-- Every block traceable to an Excel session uses source_ref 'S<n> – <Día>'
-- (or 'Semanas 7-9'), never those template names.
--
-- Idempotent: re-running deletes nothing once the set is gone.
-- Transactional: the post-condition assertion rolls everything back if any of
-- the three coaches does not end at exactly 97 blocks.
-- Host guard lives in the runner (remove-fabricated-blocks.sh) — run via that.

BEGIN;

-- The fabricated set, scoped to the three affected coaches and to non-Excel
-- provenance. Slugs differ across clones (--c29 / --c30 suffix) so we match on
-- coach + source_ref, which is identical across the clones.
CREATE TEMP TABLE _fabricated ON COMMIT DROP AS
SELECT id, coach_id, slug, source_ref, title
FROM blocks
WHERE coach_id IN (4, 29, 30)
  AND (
        source_ref LIKE 'Plantilla\_HYROX%' ESCAPE '\'
     OR source_ref LIKE 'fahybrik-semana%'
  );

\echo '--- fabricated blocks to remove ---'
SELECT coach_id, id, title FROM _fabricated ORDER BY coach_id, id;

-- Delete dependent rows explicitly (block_exercises also cascades, but be explicit).
DELETE FROM block_exercises WHERE block_id IN (SELECT id FROM _fabricated);
DELETE FROM blocks         WHERE id       IN (SELECT id FROM _fabricated);

-- Post-condition: each of the three coaches must end at exactly 97 blocks.
DO $$
DECLARE
  c4  int; c29 int; c30 int;
BEGIN
  SELECT count(*) INTO c4  FROM blocks WHERE coach_id = 4;
  SELECT count(*) INTO c29 FROM blocks WHERE coach_id = 29;
  SELECT count(*) INTO c30 FROM blocks WHERE coach_id = 30;
  RAISE NOTICE 'final counts: coach4=%, coach29=%, coach30=%', c4, c29, c30;
  IF c4 <> 97 OR c29 <> 97 OR c30 <> 97 THEN
    RAISE EXCEPTION 'post-condition failed (expected 97/97/97, got %/%/%) — rolling back', c4, c29, c30;
  END IF;
END $$;

COMMIT;
