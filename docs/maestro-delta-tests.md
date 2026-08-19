# Delta del Documento Maestro — Modelo de Tests (para pegar en v1.1)

> Contexto: el Maestro v1.0 (2025) no contempla tests de campo; los ritmos/cargas se ponían a mano por sesión. Pablo pidió en el chat (jun 2026) que **la app meta los ritmos** a partir de tests. Esto reconcilia ambos: el test es la **fuente** que auto-rellena los campos que ya existen, con override del coach. Pegar estas piezas en las secciones indicadas.

---

## § 05 · Proceso del Atleta — añadir paso

**Paso 3-bis — Tests iniciales y de control**

Tras el onboarding, el atleta realiza una batería de tests estandarizados que calibran su plan. Cada coach define su propio set de tests (igual que su biblioteca de bloques). Cada test mide algo concreto y alimenta una referencia objetiva:

- **Test de carrera** (time trial, p.ej. 5k) → ritmos de entrenamiento por zona (modelo VDOT).
- **Test de ergómetro** (2000m remo / ski) → splits /500m por banda (modelo Concept2).
- **Test de fuerza** (RM por levantamiento) → cargas por %RM (1RM estimado, Epley).

Los tests se repiten cada microciclo (control de progreso). Si el atleta aún no tiene tests, se usan sus datos auto-declarados del onboarding como referencia **provisional** hasta el primer test.

## § 07 · El Papel de la IA — matizar

Los ritmos y cargas **no se ponen a ojo**: salen de una **derivación objetiva** (VDOT / Concept2 / Epley) a partir de los tests del atleta. La biblioteca se escribe en términos relativos (zona, %RM, RIR, "ritmo umbral") y el sistema los resuelve a valores absolutos por atleta usando su perfil de referencia. La IA y el coach trabajan sobre esos valores; el coach puede ajustarlos.

## § 09 · Modelo de Datos — añadir / matizar

- **`methodology_tests`** (por coach — ya existe): catálogo de tests. Cada test define protocolo, qué benchmark escribe (`output_field`), qué ancla calibra (`feeds_anchor`), cadencia y frescura.
- **`athlete_test_results`** (nuevo): cada ejecución de un test por un atleta — `athlete_id`, `test_slug`, `modality`, `completed_at`, `result_value`, `result_unit`, `source` (manual | garmin | concept2 | healthkit), `created_by`, `notes`. Da historial → progreso entre bloques.
- **`athlete_benchmarks`** (ya existe): valores de referencia actuales del atleta (1RM, 5k/10k, remo 2k, ski 1k, LTHR/FCmáx, FTP). Un resultado de test escribe aquí su `output_field`.
- **Resolución al asignar:** al publicar la semana, el sistema resuelve los objetivos relativos de cada sesión a ritmos/cargas absolutos usando los benchmarks del atleta. El valor calculado es el default; **el coach puede sobrescribirlo** y el override se guarda aparte (re-materializar no lo borra).

## § 10 · Biblioteca — nota

El **apartado de Tests es por coach**, igual que la biblioteca de bloques: cada coach crea, edita y archiva sus propios tests. Lo que no se personaliza es la **derivación** (VDOT / Concept2 / %RM): el coach define el protocolo, pero el cálculo del ritmo/carga es objetivo y común.

## Principio que queda fijado

La objetividad la da la **fórmula**, no el criterio del coach. El coach pone el método (qué tests, qué bloques, qué prioridades) y puede ajustar; la app calcula. Es una app que **crea** entrenos a partir de datos, no un entreno gestionado a mano.
