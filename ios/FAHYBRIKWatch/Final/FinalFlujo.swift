import SwiftUI

// EL FINAL, DE LA SESIÓN A LA ESFERA (P9, P13):
//
//   sello ─▶ RPE ─▶ resumen ─▶ «Listo»
//
//   sello    «Sesión completada» (o «terminada») con lo que decidió el motor: completa o parcial y por qué. Pasa solo.
//   RPE      la corona, 0–10 con las palabras del coach; a la sesión y a Salud. Se puede saltar.
//   resumen  el de corredor si la sesión era de correr; el de siempre si no.
//
// El resultado sale del reloj cuando el atleta contesta al RPE (`WatchWorkoutCoordinator.responderRpe`).

struct FinalFlujo: View {
    let session: WorkoutSession
    let coordinator: WatchWorkoutCoordinator
    /// «Listo»: confirma lo escenificado y vuelve a la esfera.
    let alListo: () -> Void

    private enum Fase { case sello, rpe, resumen }

    @State private var fase: Fase = .sello
    /// El resumen de corredor, calculado al llegar a él (las vueltas por km llegan al acabar). Nil = no es de correr.
    @State private var resumenCorrer: Vivo.ResumenCorrer?

    var body: some View {
        switch fase {
        case .sello:
            FinalSelloPantalla(session: session) { fase = .rpe }
        case .rpe:
            FinalRpe(palabra: { Vivo.palabraDelRpe($0, metodo: session.plan.wristMethod) }) { rpe in
                coordinator.responderRpe(rpe)
                resumenCorrer = Vivo.resumenDeCorrer(session, kmAuto: coordinator.vueltasAuto)
                fase = .resumen
            }
        case .resumen:
            resumen
        }
    }

    @ViewBuilder
    private var resumen: some View {
        if let resumenCorrer {
            FinalResumenCorrer(resumen: resumenCorrer, session: session, coordinator: coordinator, alListo: alListo)
        } else if SplitsView.hasSplits(session) {
            TabView {
                SummaryView(session: session, coordinator: coordinator, onDone: alListo)
                SplitsView(session: session)
            }
            .tabViewStyle(.verticalPage)
        } else {
            SummaryView(session: session, coordinator: coordinator, onDone: alListo)
        }
    }
}

/// El sello del final: «Sesión completada» si el plan acabó, «Sesión terminada» si el atleta la cerró antes; y la
/// línea de completitud con su motivo. Pasa solo al RPE (o al toque).
private struct FinalSelloPantalla: View {
    let session: WorkoutSession
    let alSeguir: () -> Void

    var body: some View {
        MunecaMedidor { _ in
            MunecaColumna {
                Spacer(minLength: 0)
                FinalSello()
                Text(session.terminoNatural ? "Sesión completada" : "Sesión terminada")
                    .font(MunecaTipo.fuente(Vivo.TipoMuneca.tercero, 600))
                    .foregroundStyle(MunecaPaleta.tinta)
                    .lineLimit(1)
                    .minimumScaleFactor(MunecaTipo.reduccionMaxima(Vivo.TipoMuneca.tercero))
                if let c = session.completitudFinal {
                    FinalNota(texto: Vivo.lineaCompletitud(c), tono: MunecaPaleta.tinta)
                    if let motivo = c.motivo { FinalNota(texto: motivo) }
                }
                if let solaS = session.guardadaSolaTrasS {
                    FinalNota(texto: "Guardada sola · \(Vivo.fmtDuracion(solaS)) sin moverte")
                }
                Spacer(minLength: 0)
            }
        }
        .background(MunecaPaleta.fondo.ignoresSafeArea())
        .contentShape(Rectangle())
        .onTapGesture(perform: alSeguir)
        .task {
            try? await Task.sleep(for: .seconds(FinalForma.selloSegundos))
            if !Task.isCancelled { alSeguir() }
        }
    }
}
