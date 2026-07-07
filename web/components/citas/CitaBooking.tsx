'use client';

// FAHYBRID — standalone PUBLIC booking page body (/{locale}/cita/{token}).
// A branded near-black canvas (glow + grain + FAHYBRID wordmark, mirroring the
// onboarding intro) that greets the lead by name and drops the reusable
// BookingSlotPicker in. The token IS the credential — no auth. It fetches the
// context once only to personalise the greeting; the picker owns the booking
// flow independently, so it stays fully reusable.

import { useEffect, useState } from 'react';
import { BookingSlotPicker } from './BookingSlotPicker';
import './citas.css';

export function CitaBooking({ token }: { token: string }) {
  const [nombre, setNombre] = useState<string>('');

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/citas/context/${encodeURIComponent(token)}`, {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { nombre?: string };
        if (active && typeof data.nombre === 'string') setNombre(data.nombre.trim());
      } catch {
        // The greeting simply stays generic — never blocks the booking flow.
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="cita-wrap">
      <div className="cita-grain" aria-hidden="true" />
      <div className="cita-watermark" aria-hidden="true">
        FAHYBRID
      </div>
      <div className="cita-panel">
        <div className="cita-wordmark">
          <span className="cita-f">F</span>AHYBRID
        </div>
        <h1 className="cita-title">
          {nombre ? `Hola ${nombre}, reserva tu llamada con Pablo` : 'Reserva tu llamada con Pablo'}
        </h1>
        <p className="cita-sub">
          Elige tu hueco y listo — te llega el email con el enlace de la videollamada.
        </p>
        <BookingSlotPicker token={token} variant="public" />
      </div>
    </div>
  );
}

export default CitaBooking;
