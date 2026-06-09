# Nutrición — follow-ups backend

iOS Nutrición ya implementado (módulo `ios/FAHYBRIK/Nutrition/`) — usa
`NutritionService` con `useMockData = true`. Para activar producción el
backend (otra sesión paralela) necesita:

## 1. Schema — `shared/schema/nutrition.ts`

Tablas nuevas, snake_case, todas con columnas explícitas (sin JSON blobs
excepto donde se indica):

### `food_items`
Catálogo de alimentos. Cacheado de Open Food Facts + custom user entries.

| columna                | tipo            | notas                              |
| ---------------------- | --------------- | ---------------------------------- |
| `id`                   | uuid PK         |                                    |
| `source`               | enum            | `off` · `custom` · `ai_estimated`  |
| `external_id`          | text            | Open Food Facts product code       |
| `name`                 | text            | español por defecto                |
| `brand`                | text nullable   |                                    |
| `barcode`              | text nullable   | EAN-13 / UPC                       |
| `kcal_per_100g`        | numeric         |                                    |
| `protein_g_per_100g`   | numeric         |                                    |
| `carbs_g_per_100g`     | numeric         |                                    |
| `fat_g_per_100g`       | numeric         |                                    |
| `fiber_g_per_100g`     | numeric nullable|                                    |
| `sugar_g_per_100g`     | numeric nullable|                                    |
| `image_url`            | text nullable   |                                    |
| `created_at`           | timestamptz     | `default now()`                    |
| `updated_at`           | timestamptz     |                                    |

Index: `barcode` (unique parcial donde no null), `external_id`,
tsvector sobre `name` para búsqueda fuzzy.

### `food_logs`
Una fila por entrada del atleta.

| columna           | tipo            | notas                                                       |
| ----------------- | --------------- | ----------------------------------------------------------- |
| `id`              | uuid PK         |                                                             |
| `athlete_id`      | uuid FK         | `athletes.id` cascade                                       |
| `food_item_id`    | uuid FK         | `food_items.id` (catálogo)                                  |
| `portion_grams`   | numeric         | el cliente envía gramos, server calcula totales por fila    |
| `meal_type`       | enum            | `breakfast` · `lunch` · `dinner` · `snack` · `pre_workout` · `post_workout` |
| `logged_at`       | timestamptz     | hora real de consumo (puede ser pasada o futura)            |
| `source`          | enum            | `db` · `barcode` · `photo` · `manual`                       |
| `note`            | text nullable   |                                                             |
| `created_at`      | timestamptz     |                                                             |

Index: `(athlete_id, logged_at DESC)`.

### `food_image_analyses` (opcional, fase 2)
Histórico de análisis IA si queremos auditoría o re-prompting.

| `id` `athlete_id` `image_url` `depth_url` `model_response_json` `food_item_id_estimated` `created_at` |

## 2. Endpoints API

### `GET /api/nutrition/search?q={query}`
Open Food Facts via pasarela (proxy con caché). Devuelve top 20 por
relevancia textual. Filtros opcionales: `lang=es`, `country=ES`.

Response: `{ items: FoodItem[] }`.

### `GET /api/nutrition/barcode/:code`
Lookup por barcode. Devuelve `{ found: boolean, item?: FoodItem }`.
Cachear local DB primero, fallback a Open Food Facts API. Si no existe,
crear en `food_items` con `source='off'` y devolver.

### `POST /api/nutrition/analyze-image`
Body: `{ image_base64: string, depth_base64?: string, meal_type?: MealType }`.

Pipeline:
1. Llamar al modelo visión (decisión LLM pendiente — Alex elige).
2. Si hay `depth_base64`, pasarlo al modelo (LiDAR mejora estimación
   volumétrica de porciones).
3. Crear `food_items` row con `source='ai_estimated'`.
4. Devolver `{ item: FoodItem, confidence: 0–1 }`.

### `GET /api/nutrition/logs?date={ISO8601}`
Lista de food_logs del día. Server devuelve también `totals` calculados
(kcal/protein_g/carbs_g/fat_g) para no recalcular cliente.

Response: `{ logs: FoodLog[], totals: MacroTotals }`.

### `POST /api/nutrition/logs`
Body: `{ food_item_id, portion_grams, meal_type, logged_at?, source, note? }`.
Server valida (athlete_id viene del token) y persiste. Devuelve el FoodLog
canónico (con `id` UUID generado).

### `PATCH /api/nutrition/logs/:id`
Actualiza porción o meal_type.

### `DELETE /api/nutrition/logs/:id`

## 3. Decisiones pendientes (Alex)

- **Proveedor food DB**: Open Food Facts es libre y tiene buena cobertura
  europea. Alternativas comerciales (Nutritionix, FatSecret, USDA
  FoodData Central) si la cobertura de marcas españolas es pobre.
  *Recomendación blanda*: Open Food Facts default, evaluar gaps tras 2
  semanas en producción.
- **Modelo de visión para análisis foto/LiDAR**: pendiente — no propongo.
  Cuando elijas, integramos en `/api/nutrition/analyze-image`.
- **Macros targets por atleta**: actualmente cliente usa
  `MacroTargets.demoMarcVidal` hardcoded. Necesitamos que el perfil del
  atleta exponga `target_kcal`, `target_protein_g`, `target_carbs_g`,
  `target_fat_g` — calculados desde peso / fase entrenamiento /
  superávit-déficit o editables por el coach.

## 4. UI gating mientras no haya backend

`NutritionService.useMockData = true` por ahora. Cuando los endpoints
estén live: cambiar el flag a `false` y borrar la rama mock. El shape
del `FoodItem` / `FoodLog` Codable iOS YA coincide con el contrato
propuesto arriba (snake_case en JSON).

## 5. Sync robusto

El cliente hace optimistic update + reconciliación. El backend debe:

- Devolver el FoodLog con ID canónico en la respuesta de POST.
- Ser idempotente en POST si el cliente reenvía con el mismo
  `tmp-` ID en el body (incluir `client_temp_id` en payload). Evita
  duplicados cuando la red parpadea.
- 200/201 OK incluso si la fecha es de un día anterior (atleta editando
  pasado).
