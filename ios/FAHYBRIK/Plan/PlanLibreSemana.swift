import SwiftUI

// «TU SEMANA» DEL ATLETA LIBRE (antes `SemanaAtletaOperativa`, en la vieja pestaña) — la semana REAL que programa el
// propio atleta: el mismo carril de siete días que el Plan con coach, el panel del día que toques y lo que
// llevas hecho. FH-102: mover, editar y borrar sus propias sesiones.
//
// Es la semana propia (`planWeek`), no la demostración bloqueada de «Cómo se arregla»: esa es la competencia que
// vende el embudo; esta es la del atleta. El carril es el de `CarrilPlan` con el tono suave del acento (no hay una
// card debajo a la que atar una muesca) y sin deslizar: solo hay una semana.

/// Lo que un atleta libre puede hacerle a una sesión suya: editar y mover mientras no esté hecha, borrar siempre.
/// Más corto que el del coach: sin técnica, sin preguntar y sin marcar (todo lo que hace lo hace él).
extension AthleteWeekDaySession {
    func accionesLibres() -> [AccionDeSesion] {
        var a: [AccionDeSesion] = []
        if isSelfOrigin, estado != .hecha {
            a.append(AccionDeSesion(clave: .editarLibre, etiqueta: "Editar entreno libre", simbolo: "pencil"))
        }
        if isSelfOrigin, puedeMoverse {
            a.append(AccionDeSesion(clave: .mover, etiqueta: "Mover a otro día", simbolo: "calendar"))
        }
        if isSelfOrigin {
            a.append(AccionDeSesion(clave: .borrarLibre, etiqueta: "Borrar entreno libre", simbolo: "trash", destructiva: true))
        }
        return a
    }
}

struct SemanaPropiaPlan<OpcionesSesion: View, OpcionesDia: View>: View {
    let semana: SemanaDelPlan
    let hoyIso: String
    /// Sin el botón «Programar entreno» cuando ya es la acción anclada de la pantalla.
    let conBoton: Bool
    @Binding var seleccion: String?
    let alAbrir: (AthleteWeekDaySession) -> Void
    let alProgramar: () -> Void
    @ViewBuilder let menuDeSesion: (AthleteWeekDaySession, SemanaDelPlan) -> OpcionesSesion
    @ViewBuilder let menuDelDia: (DiaDelPlan) -> OpcionesDia

    private var dia: DiaDelPlan? {
        semana.dias.first { $0.isoDate == (seleccion ?? hoyIso) } ?? semana.hoy ?? semana.dias.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Tu semana") {
                Text("toca un día").papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
            }
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                CarrilPlan(
                    dias: semana.dias, hoyIso: hoyIso, mostradoIso: dia?.isoDate, tono: .acento,
                    alPulsar: { seleccion = $0.isoDate }, alDeslizar: { _ in }, menu: menuDelDia)
                if let dia { panel(dia) }
            }
            .padding(EdgeInsets(top: 12, leading: 12, bottom: 6, trailing: 12))
            .tarjetaDia(alAncho: true)
            if conBoton {
                Button(action: { Haptics.medium(); alProgramar() }) {
                    HStack(spacing: 10) {
                        IconoDia(.mas, tam: 20, peso: .bold)
                        Text("Programar entreno").papel(.cuerpoFuerte)
                    }
                    .foregroundStyle(Theme.Color.foreground)
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .overlay(RoundedRectangle(cornerRadius: Theme.Radius.tarjeta, style: .continuous)
                        .strokeBorder(Theme.Color.foreground.opacity(0.30), lineWidth: 1.5))
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressScaleStyle())
            }
        }
    }

    private func panel(_ dia: DiaDelPlan) -> some View {
        let rotulo = PlanLibreCopy.rotuloDelPanel(iso: dia.isoDate, hoy: hoyIso)
        return VStack(alignment: .leading, spacing: 6) {
            Text(FechasDelPlan.etiqueta(de: dia.isoDate, hoy: hoyIso) + (rotulo.isEmpty ? "" : " · \(rotulo)"))
                .papel(.etiqueta).foregroundStyle(Theme.Color.muted)
            if dia.sesiones.isEmpty {
                Text(PlanLibreCopy.textoDiaVacio(iso: dia.isoDate, hoy: hoyIso))
                    .papel(.cuerpo).foregroundStyle(Theme.Color.foreground)
                    .padding(.bottom, 8)
            } else {
                VStack(spacing: 0) {
                    ForEach(dia.sesiones) { s in
                        FilaDelDiaPlan(sesion: s, dia: dia, hoyIso: hoyIso, alAbrir: { alAbrir(s) }, menu: { menuDeSesion(s, semana) })
                    }
                }
            }
            if let resumen = PlanLibreCopy.resumenDeSemana(semana) {
                Text(resumen).papel(.notaFuerte).foregroundStyle(Theme.Color.muted).padding(.bottom, 12)
            }
        }
        .padding(.horizontal, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Una sesión del día elegido: su punto de modalidad, el título, lo que dura, cómo está y su «···».
private struct FilaDelDiaPlan<Opciones: View>: View {
    let sesion: AthleteWeekDaySession
    let dia: DiaDelPlan
    let hoyIso: String
    let alAbrir: () -> Void
    @ViewBuilder let menu: () -> Opciones

    private var estado: EstadoSesion { sesion.estado.efectivo(enDia: dia.isoDate, hoy: hoyIso) }

    var body: some View {
        HStack(spacing: 0) {
            Button(action: { Haptics.light(); alAbrir() }) {
                HStack(spacing: Theme.Spacing.m) {
                    ModalityDot(modality: sesion.modality, size: 10)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(sesion.title).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                        if let meta = DuracionDeSesion.texto(sesion) { Text(meta).papel(.nota).foregroundStyle(Theme.Color.muted) }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    SelloEstadoDia(estado: estado.sello, tam: 24)
                }
                .padding(.vertical, 10)
                .frame(minHeight: 64)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(sesion.title), \(estado == .saltada ? "sin hacer" : estado.trabajada ? "hecha" : "por hacer")")
            .accessibilityAddTraits(.isButton)
            MenuDia(etiqueta: "Acciones de \(sesion.title)", opciones: menu) {
                IconoDia(.puntos, tam: 22, peso: .bold)
                    .foregroundStyle(Theme.Color.muted)
                    .frame(width: Theme.Size.toque)
                    .frame(maxHeight: .infinity)
                    .contentShape(Rectangle())
            }
        }
        .overlay(alignment: .top) { Hairline() }
    }
}
