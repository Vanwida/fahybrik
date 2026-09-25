'use client';

// «perfil» — Perfil › Privacidad: donde se cambia lo que se dijo en la hoja.
//
// Las filas son las de Perfil de verdad (`ProfileNavRow` / `deviceRowContent`,
// transcritas en `screens/devices/atoms.tsx`): glifo en acento, título 13
// semibold, línea de 11, y el interruptor de marca a la derecha. No se inventa
// una fila de ajustes nueva para una pantalla nueva.
//
// La línea bajo la fila DICE QUÉ PASA AHORA, no qué es el interruptor: con él
// encendido, para qué sirve lo que sube; apagado, que no sube nada y que tus
// entrenos no pierden nada. Retirar el sí cuesta un toque, igual que darlo — sin
// confirmación ni «¿seguro?», que es como se castiga cambiar de idea.
//
// LA PUERTA ES NUEVA (Alex, 25-09): Perfil gana «Privacidad», y dentro vive
// también lo que hoy anda suelto — «Exportar mis datos» (en Cuenta) y la política
// (en Ayuda y legal) —, con sus filas y su texto de hoy.
//
// Apagar BORRA lo ya subido (Alex, 25-09: retirar el permiso es retirarlo del
// todo), y la línea lo dice. Eso obliga a un mecanismo en el servidor antes del
// Swift. Lo que NO promete: que encenderlo suba los entrenos de antes — no está
// decidido.

import { useState } from 'react';
import { DeviceGroup, DeviceRow, Hairline, IOSSwitch, NavBar } from '../devices/atoms';
import { Glyph } from '../devices/glyphs';
import { SP } from '../devices/tokens';
import { PERFIL, VERSION_CONSENTIMIENTO } from './texto';

export function Privacidad({ inicial, onLog }: { inicial: boolean; onLog: (linea: string) => void }) {
  const [subir, setSubir] = useState(inicial);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <NavBar title={PERFIL.titulo} onBack={() => onLog('‹ Perfil')} />
      <div
        className="twin-scroll"
        style={{
          flex: '1 1 auto',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: SP.s,
          padding: `${SP.l}px ${SP.xl}px ${SP.xxl}px`,
        }}
      >
        <DeviceGroup title={PERFIL.grupo} caption={PERFIL.grupoPie}>
          <DeviceRow
            icon="watch.analog"
            title={PERFIL.fila}
            subtitle={subir ? PERFIL.filaSi : PERFIL.filaNo}
            trailing={
              <IOSSwitch
                on={subir}
                label={PERFIL.fila}
                onChange={(siguiente) => {
                  setSubir(siguiente);
                  onLog(
                    siguiente
                      ? `Encendido → consentimiento ${VERSION_CONSENTIMIENTO}; el movimiento de los próximos entrenos del reloj sube`
                      : 'Apagado → se retira el consentimiento y se borra lo subido; no se sube más movimiento. Tus entrenos, igual',
                  );
                }}
              />
            }
          />
        </DeviceGroup>
        <p style={{ margin: 0, padding: `0 ${SP.xs}px`, font: '400 11px/1.45 var(--twin-font-sans)', color: 'var(--twin-faint)' }}>
          {PERFIL.notaAlPie}
        </p>
        <DeviceGroup title={PERFIL.grupoDatos} caption={PERFIL.grupoDatosPie}>
          <DeviceRow
            icon="square.and.arrow.up"
            title={PERFIL.exportar}
            subtitle={PERFIL.exportarLinea}
            trailing={<Glyph name="chevron.right" size={11} color="var(--twin-faint)" weight={2.6} />}
            onTap={() => onLog('Exportar mis datos → el JSON de siempre')}
          />
          <Hairline />
          <DeviceRow
            icon="lock.shield"
            title={PERFIL.politica}
            subtitle={PERFIL.politicaLinea}
            trailing={<Glyph name="chevron.right" size={11} color="var(--twin-faint)" weight={2.6} />}
            onTap={() => onLog('Política de privacidad → la hoja legal de siempre')}
          />
        </DeviceGroup>
      </div>
    </div>
  );
}
