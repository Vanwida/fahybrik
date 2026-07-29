'use client';

// La barra cargada — el único dibujo de esta familia.
//
// Existe porque «100 kg» no es lo que haces con las manos: lo que haces es
// poner DOS discos de 20 por lado. El atleta llega a la barra, mira el móvil y
// tiene que saber qué coge sin dividir nada de cabeza a mitad de sesión.
//
// Se dibuja con divs y tokens: ni imágenes, ni hex sueltos. Y cambia en vivo
// cuando el registro sube o baja el peso, que es media gracia del gesto.

import { Label, Mono } from '../../kit';
import {
  ALTO_DISCO,
  BARRA_KG,
  COLOR_DISCO,
  GRUESO_DISCO,
  cargaDeBarra,
  kg,
  numeroTexto,
} from './data';

/** Alto del disco de 25 kg, en px. Los demás salen de ALTO_DISCO. */
const ALTO_MAX = 54;

function Disco({ peso }: { peso: number }) {
  const alto = Math.round(ALTO_MAX * (ALTO_DISCO[peso] ?? 0.5));
  return (
    <div
      title={kg(peso)}
      style={{
        width: GRUESO_DISCO[peso] ?? 8,
        height: alto,
        borderRadius: 3,
        background: COLOR_DISCO[peso] ?? 'var(--twin-muted)',
        boxShadow: 'var(--twin-shadow-card-tight)',
        flex: '0 0 auto',
      }}
    />
  );
}

/** El eje: manguito, agarre moleteado y manguito. */
function Eje({ ancho }: { ancho: number }) {
  return (
    <div
      style={{
        width: ancho,
        height: 7,
        borderRadius: 4,
        background: 'linear-gradient(to bottom, var(--twin-muted), var(--twin-faint))',
        flex: '0 0 auto',
      }}
    />
  );
}

/**
 * La barra entera, simétrica. `totalKg` es el peso CON barra — lo mismo que
 * dice la prescripción, para que no haya dos números que sumar.
 */
export function Barra({ totalKg }: { totalKg: number }) {
  const carga = cargaDeBarra(totalKg);
  if (!carga) return null;

  const izquierda = [...carga.porLado].reverse(); // el ligero, fuera

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          height: ALTO_MAX,
        }}
      >
        {izquierda.map((p, i) => (
          <Disco key={`i${i}`} peso={p} />
        ))}
        <Eje ancho={10} />
        <div
          style={{
            width: 74,
            height: 5,
            borderRadius: 3,
            background: 'linear-gradient(to bottom, var(--twin-fg), var(--twin-muted))',
            opacity: 0.55,
            flex: '0 0 auto',
          }}
        />
        <Eje ancho={10} />
        {carga.porLado.map((p, i) => (
          <Disco key={`d${i}`} peso={p} />
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Mono size={12} weight={700}>
          {carga.porLado.length > 0 ? `${numeroTexto(carga.kgPorLado)} por lado` : 'barra sola'}
        </Mono>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--twin-faint)' }} />
        <Label size={9}>barra de {BARRA_KG}</Label>
      </div>

      {carga.sobraKg > 0 && (
        <Mono size={11} color="var(--twin-warning)">
          sobran {kg(carga.sobraKg)} · no cuadra con discos
        </Mono>
      )}
    </div>
  );
}
