import SwiftUI

// «GUARDADO EN TU MÓVIL» — un entreno terminado que el servidor rechazó (DECISIONS
// 2026-09-25, «Qué ve el atleta»; el doble: `guardado-en-movil`).
//
// EL MODELO, que es lo que hay que tener claro antes de pintar: un rechazo hoy es
// casi siempre un fallo NUESTRO (el servidor acepta cualquier entreno terminado). No
// hay nada que el atleta pueda arreglar, así que nada de esto le pide nada —ni
// reintentar, ni reclasificar, ni rellenar—. Su trabajo está a salvo en el móvil
// (`RequestQueue.rejected`) y eso es lo único que tiene que saber. Lo demás es
// nuestro: lo vemos en el registro técnico y lo arreglamos.
//
// Aquí vive lo que se repite en más de un sitio: guardar el rechazo, el aviso (al
// cerrar el resumen y al abrir la fila «Sin subir» del historial) y la franja de abajo
// del resumen. La fila y la ficha del historial, en History/EntrenoSinSubir.swift.

// MARK: - Guardar

enum GuardadoEnElMovil {
    /// El servidor rechazó el GUARDAR del resumen: el entreno se queda en el móvil tal
    /// y como se envió (`RequestQueue.keepRejected`), y el borrador B-02 se borra —si
    /// no, el próximo arranque volvería a encolar el mismo entreno (sin RPE), el
    /// servidor lo rechazaría otra vez y habría dos copias del mismo trabajo—.
    ///
    /// Sin cuerpo (no se pudo codificar, que con estos tipos no pasa) el borrador NO se
    /// borra: entonces es la única copia en el móvil, y el próximo arranque la pasa a la
    /// cola, que la guarda al rechazarla. Lo que el aviso dice sigue siendo verdad.
    static func guardar(path: String, body: Data?, bearer: String?, status: Int?) async {
        guard let body else { return }
        await RequestQueue.shared.keepRejected(path: path, body: body, bearer: bearer, status: status ?? 0)
        FinishedWorkoutDraft.clear()
    }
}

extension FreeWorkoutAPI {
    /// El cuerpo de un libre tal y como sale por el cable: snake_case e ISO 8601, el
    /// mismo codificador que el POST en vivo (`APIClient`). `Prescription` lleva claves
    /// camelCase de Swift (`workS` → `work_s`), así que un `JSONEncoder()` pelado
    /// mandaría otra cosa. Una sola fuente para la cola, el borrador B-02 y el rechazo
    /// guardado: lo que el móvil guarda es lo que se envió.
    static func cuerpoDeCola(_ payload: FreeWorkoutPayload) -> Data? {
        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        return try? enc.encode(payload)
    }
}

// MARK: - El aviso

/// El copy es el de Alex (25-09), palabra por palabra: el título dice dónde ESTÁ el
/// entreno, la línea dice qué pasa y que no hay nada que hacer. Sin «error», sin
/// «fallo», sin un REINTENTAR que no puede funcionar.
///
/// LA REGLA DE TONO: ni rojo, ni ámbar, ni triángulo. Lo único teñido es el check
/// dentro del móvil, que es el hecho que importa (está a salvo). Una alerta aquí
/// mentiría en la otra dirección: el atleta no ha perdido nada. Superficie en reposo,
/// sin tinte: se lee como una nota del registro, no como un error encima de él.
struct AvisoGuardadoEnElMovil: View {
    var body: some View {
        HStack(alignment: .top, spacing: Theme.Spacing.m) {
            IconoMovilGuardado()
                .padding(.top, 1)
            VStack(alignment: .leading, spacing: 3) {
                Text("Guardado en tu móvil")
                    .scaledFont(15, weight: .semibold, relativeTo: .subheadline)
                    .foregroundStyle(Theme.Color.foreground)
                Text("No se ha podido subir. Lo estamos revisando; no tienes que hacer nada.")
                    .scaledFont(13, relativeTo: .footnote)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, Theme.Spacing.m + 2)
        .padding(.horizontal, Theme.Spacing.l)
        .background(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .fill(Theme.Color.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Radius.l, style: .continuous)
                .stroke(Theme.Color.hairline, lineWidth: 1)
        )
        .accessibilityElement(children: .combine)
    }
}

/// «Guardado en este aparato»: el móvil —el sitio, en la tinta del texto— con un check
/// dentro —el hecho, en `ok`—. No hay un SF Symbol que diga las dos cosas.
struct IconoMovilGuardado: View {
    var body: some View {
        ZStack {
            Image(systemName: "iphone")
                .font(.system(size: 22, weight: .regular))
                .foregroundStyle(Theme.Color.foreground)
            Image(systemName: "checkmark")
                .font(.system(size: 9, weight: .heavy))
                .foregroundStyle(Theme.Color.ok)
        }
        .frame(width: 22, height: 22)
        .accessibilityHidden(true)
    }
}

// MARK: - La franja de abajo del resumen

/// Lo que sustituye a GUARDAR / REINTENTAR cuando el servidor rechaza el entreno: el
/// aviso, UNA acción (CERRAR) y la línea que une el aviso con el historial, que es
/// donde el atleta lo va a volver a ver. La línea ocupa el sitio de «qué pasa después
/// de tocar»; es la única frase añadida al copy de Alex.
struct FranjaGuardadoEnElMovil: View {
    let onCerrar: () -> Void

    var body: some View {
        VStack(spacing: 10) {
            AvisoGuardadoEnElMovil()
            // La misma altura que GUARDAR: el botón no salta al asentarse la pantalla.
            ExpertPrimaryButton(title: "CERRAR", height: 46, action: onCerrar)
            Text("Lo tienes en tu historial, marcado «Sin subir».")
                .scaledFont(11, weight: .medium, relativeTo: .caption2)
                .foregroundStyle(Theme.Color.faint)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
        }
    }
}
