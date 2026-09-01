# Propuesta — cortafuegos mínimo para que un test no use producción

**Estado: APLICADA** (PASO 3, 2026-08-14). Guard en `web/tests/setup/env.ts` + `prod-db-guard.ts`. Sin commit en ese paso.

Complementa `docs/safety-cleanup-inventory.md` §B.4–B.6. Este texto es la verificación independiente de esa sesión, más el cambio mínimo que falta.

---

## Qué es verdad hoy (medido)

1. Vitest **no** carga `.env.local`. El dummy de `web/tests/setup/env.ts` y el `DATABASE_URL` de `.env.local` no coinciden (hashes distintos). `TEST_DATABASE_URL` estaba ausente en la shell de esta sesión.
2. Las **101** suites `*.db.test.ts` usan `describeWithDb`. Cero excepciones. Sin `TEST_DATABASE_URL` se saltan en alto (`[test-db] TEST_DATABASE_URL not set`). Run verificado: 130 ficheros skipped / 686 tests skipped; ninguna suite `.db` se ejecutó.
3. Ningún test importa el cliente vivo de `@/lib/db` para consultar. Los imports de `@/lib/db` en tests son `import type`.
4. `docs/architecture-map.md` §11 afirma que Vitest carga `.env.local` y puede escribir en prod por `DATABASE_URL`. **Eso es falso.** El riesgo real es otro (abajo). No se ha corregido el mapa en este paso.

---

## El agujero

Dos sitios, los dos silenciosos:

### 1. `web/tests/setup/env.ts` cede ante la shell

```ts
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://test-user:test-pass@127.0.0.1:5432/test-db';
}
```

Si la sesión ya exportó `DATABASE_URL` (`source .env.local`, un `DATABASE_URL=… pnpm test`, un agente que lo heredó), el dummy **no se aplica**. El cliente de `web/lib/db/index.ts` apuntaría a esa URL. Hoy ningún test la usa para escribir, pero el import de módulo crea el cliente contra ella.

Sonda de esta sesión: con `DATABASE_URL` ya puesta, la guarda **conserva** el valor heredado.

### 2. Nadie valida `TEST_DATABASE_URL`

`web/tests/utils/test-db.ts` acepta cualquier cadena no vacía y conecta con `ssl: 'require'`, `max: 1`. Si esa cadena es la de main, las 101 suites **escriben** en producción y el reporte sale verde.

`.env.example` ya avisa de que debe ser una rama desechable. Eso no impide pegar la URL de prod.

---

## Qué no es este informe

`infra/scripts/_db.ts` carga `.env.local` al importar y va a main por defecto. Es un agujero **mayor** que el de los tests (migrate / seed / backfill). No forma parte de esta protección. Merece su propia decisión. Solo `seed_demo.ts` y un puñado de seeds/retypes comprueban host, y varios se pueden forzar con `SEED_DEMO_ALLOW_MAIN=1`.

Tampoco se propone linter nuevo, ni tocar componentes, ni corregir aquí `architecture-map.md` §11.

---

## Protección mínima (un fichero de setup)

Un solo cambio de código: `web/tests/setup/env.ts`. Cero hosts cableados. Cero secretos nuevos.

1. **Guardar** (sin imprimir) el `DATABASE_URL` heredado de la shell, si existe.
2. **Leer** el `DATABASE_URL` de `.env.local` de la raíz, si el fichero existe. Parsear la clave; no loguear el valor.
3. **Pisar siempre** `process.env.DATABASE_URL` con el dummy `127.0.0.1`. Quitar la guarda `if (!…)`. Ningún test debe crear el cliente vivo contra prod, venga lo que venga en la shell.
4. Si `TEST_DATABASE_URL` está set, extraer su host y compararlo con:
   - el host del `DATABASE_URL` heredado (paso 1)
   - el host del `DATABASE_URL` de `.env.local` (paso 2)
5. Si **cualquier** comparación coincide → `throw` al arrancar Vitest. Mensaje: que apunte `TEST_DATABASE_URL` a una rama Neon desechable. El run no llega a `describeWithDb`.

Cómo sacar el host: `new URL(url).host`, con fallback `/@([^/?]+)/` por si llega una URI rara. Comparar hosts, no la cadena entera (user/password pueden diferir y el host de Neon identifica la rama).

No hardcodear `ep-aged-base`. Si un día cambia el endpoint de main, la comparación contra `.env.local` sigue valiendo.

Fuera de este cambio, y solo si se aplica después:

- Un comentario extra en `.env.example` encima de `TEST_DATABASE_URL=`: se pasa **en línea**, nunca se `export`ea, nunca se escribe en `.env.local`.
- Corregir `docs/architecture-map.md` §11: Vitest no carga `.env.local`; el riesgo es la guarda que cede + `TEST_DATABASE_URL` sin validar.

---

## Por qué esto y no más

- No hace falta tocar las 101 suites: todas pasan por `describeWithDb` → `getTestDbUrl()` → `TEST_DATABASE_URL`.
- No hace falta un allowlist de hosts de test (eso sería método / infra del día).
- Fallar al arrancar es mejor que skip: un `TEST_DATABASE_URL` mal puesto no debe parecer «las .db se saltaron».
- Aplicarlo es ~20 líneas. No se aplica en este paso.
