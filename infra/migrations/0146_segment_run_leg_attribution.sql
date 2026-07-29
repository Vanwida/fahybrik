-- 0146_segment_run_leg_attribution.sql
--
-- QUE UN TRAMO DE CARRERA SEPA QUE ES, Y CONTRA QUE COMPARARSE.
--
-- El problema que cierra. Una sesion de series es un CONTRASTE: cinco fuertes y cuatro
-- trotes. El motor en vivo grababa SOLO los tramos de trabajo, asi que un 5x1000 llegaba
-- con cinco ritmos y nada contra lo que medirlos -- el equivalente a guardar los numeros
-- y tirar las unidades. Y aunque se grabaran, la fila no tenia como decir si era una
-- serie o el trote de vuelta: la unica columna de orden era `position`, que es el orden
-- del BLOQUE del coach, no el del tramo. Sin esas dos cosas no existe ninguna analitica
-- de series, ni ahora ni retroactivamente.
--
-- Tres columnas, y las tres van juntas o ninguna: describen un bout de la lista PLANA de
-- tramos de una prescripcion de carrera.
--
--   leg_index   Indice 0-based en la lista plana de tramos de la prescripcion:
--               repeticiones desplegadas, fases en orden, RECUPERACIONES INCLUIDAS.
--               Es EXACTAMENTE el mismo espacio de indices que produce
--               `flattenSegments()` (shared/domain/prescription/run-structure.ts) y su
--               espejo `RunStructure.expandedLegs()` en Swift. Por eso «tramo 3 hecho»
--               casa con «tramo 3 prescrito» sin zipear por orden de llegada -- que es
--               lo que hacia run-compliance y lo que se rompia en cuanto el numero de
--               laps dejaba de coincidir con el numero de series.
--
--   leg_role    'work' | 'recovery'. EL contraste. Espeja `Segment.kind` de la gramatica.
--
--   leg_phase   'warmup' | 'main' | 'cooldown'. Espeja `Phase.role`.
--               Hace falta ADEMAS del rol, y no es un lujo: en la gramatica un
--               calentamiento es literalmente `kind: 'work'` -- verificado en la
--               prescripcion 2574 de produccion, cuyo elemento de warmup es
--               {"kind": "work", "measure": {"s": 600}}. Sin la fase, un trote de diez
--               minutos es indistinguible de una serie, y un 5x1000 se lee como un
--               7x1000 cuya primera «serie» dura diez minutos. Eso es dato fabricado
--               llegando al coach, que es justo lo que prohibe el §7 del contrato.
--
-- POR QUE NULL ES EL DEFECTO, Y POR QUE ESTA MIGRACION NO MUEVE UN SOLO DATO.
-- NULL significa «esta fila no es un bout de una carrera estructurada»: toda fila de
-- fuerza, de erg, de una carrera de un solo tramo, y las 206 filas que hay hoy en
-- produccion. Los lectores preguntan por `coalesce(leg_role, 'work') <> 'recovery'`,
-- asi que lo que ya estaba guardado sigue contando como trabajo exactamente igual que
-- ayer. Cero reescritura, cero backfill, cero cambio en ninguna cifra existente.
-- No se puede backfillear: el dato de las recuperaciones nunca se escribio.
--
-- Verificado contra produccion antes de escribir esto: 206 filas en segment_executions,
-- 157 de modalidad 'run', de las cuales 151 son semilla ('demo'). Ninguna ejecucion
-- real ha grabado jamas una carrera estructurada, asi que ninguna fila existente
-- deberia llevar estas columnas rellenas -- y ninguna las lleva.
--
-- Los CHECK aceptan NULL a proposito (un CHECK con NULL evalua a NULL, no a falso, y la
-- fila pasa). Asi las filas viejas no necesitan tocarse. El indice parcial sirve al
-- unico acceso nuevo: recorrer los tramos de una ejecucion en orden de tramo.
--
-- El runner envuelve el fichero en UNA transaccion (sin begin/commit aqui). Ningun
-- comentario lleva ';'.

alter table segment_executions add column if not exists leg_index integer;
alter table segment_executions add column if not exists leg_role text;
alter table segment_executions add column if not exists leg_phase text;

alter table segment_executions drop constraint if exists segment_executions_leg_index_chk;
alter table segment_executions add constraint segment_executions_leg_index_chk
  check (leg_index is null or leg_index >= 0);

alter table segment_executions drop constraint if exists segment_executions_leg_role_chk;
alter table segment_executions add constraint segment_executions_leg_role_chk
  check (leg_role is null or leg_role in ('work', 'recovery'));

alter table segment_executions drop constraint if exists segment_executions_leg_phase_chk;
alter table segment_executions add constraint segment_executions_leg_phase_chk
  check (leg_phase is null or leg_phase in ('warmup', 'main', 'cooldown'));

-- Los tres describen el mismo hecho: o esta la atribucion completa o no esta. Una fila
-- con rol pero sin indice no se puede casar con la prescripcion, y una con indice pero
-- sin rol no se puede distinguir de su recuperacion -- que son los dos agujeros que esta
-- migracion cierra. Se impide guardar media atribucion.
alter table segment_executions drop constraint if exists segment_executions_leg_all_or_none_chk;
alter table segment_executions add constraint segment_executions_leg_all_or_none_chk
  check (
    (leg_index is null and leg_role is null and leg_phase is null)
    or (leg_index is not null and leg_role is not null and leg_phase is not null)
  );

create index if not exists segment_executions_execution_leg_idx
  on segment_executions (execution_id, leg_index)
  where leg_index is not null;

comment on column segment_executions.leg_index is
  'Indice 0-based en la lista PLANA de tramos de la prescripcion (repeticiones desplegadas, fases en orden, recuperaciones incluidas). Mismo espacio que flattenSegments() / RunStructure.expandedLegs(). NULL = la fila no es un bout de carrera estructurada.';
comment on column segment_executions.leg_role is
  'work | recovery. El contraste que define una sesion de series. NULL = no aplica, y los lectores lo tratan como trabajo (coalesce(leg_role, ''work'')).';
comment on column segment_executions.leg_phase is
  'warmup | main | cooldown. Necesario ademas del rol porque en la gramatica un calentamiento es kind: work, y sin la fase un trote de calentamiento se cuenta como una serie.';
