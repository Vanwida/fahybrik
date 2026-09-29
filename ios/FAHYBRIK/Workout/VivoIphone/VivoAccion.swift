import SwiftUI

// LA FRANJA DE ACCIÓN (I5.8) — lo que se toca, en la zona del pulgar (espejo
// de `kit-iphone-vivo/accion.tsx`).
//   UNA acción primaria por estado, grande (64 pt) y naranja, con un VOCABULARIO
//   CERRADO (`Vivo.ClavePrimaria`). Pausa a su lado. Terminar = mantener pulsado
//   1 s (Apple Fitness, Strava) con hoja que dice lo hecho. Nunca un botón que
//   diga «Terminar» y cierre otra cosa.
//   VivoAvisoDeshacer   5 s para deshacer un cierre a mano, sobre la franja.
//   VivoHojaTerminar    «¿Terminar aquí?» con lo hecho: Terminar y guardar · las salidas
//                       del host (guardar para luego, cerrar el bloque) · Seguir · Descartar.

struct VivoPrimaria: Equatable {
    var clave: Vivo.ClavePrimaria
    /// Se puede ver pero no pulsar todavía, y por qué («sin GPS»).
    var desactivada: String? = nil
    static func == (a: VivoPrimaria, b: VivoPrimaria) -> Bool { a.clave == b.clave && a.desactivada == b.desactivada }
}

struct VivoFranjaAccion: View {
    let primaria: VivoPrimaria?
    let pausado: Bool
    let alPausar: (Bool) -> Void
    let alPrimaria: () -> Void
    /// Se llama cuando el atleta MANTUVO Terminar 1 s: abre la hoja.
    let alTerminar: () -> Void

    @State private var manteniendo = false
    @State private var pista = false
    @State private var completado = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if pista {
                VivoEtiqueta(texto: "mantén 1 s para terminar").offset(y: -22).transition(.opacity)
            }
            HStack(spacing: 12) {
                VivoBotonRedondo(nombre: pausado ? "Reanudar" : "Pausa", variante: pausado ? .primaria : .superficie, accion: { alPausar(!pausado) }) {
                    VivoIcono(sistema: pausado ? "play.fill" : "pause.fill", talla: 26)
                }
                if let p = primaria {
                    VivoBoton(etiqueta: p.desactivada.map { "\(p.clave.texto) · \($0)" } ?? p.clave.texto,
                              variante: p.clave.esPrimaria ? .primaria : .superficie,
                              desactivado: p.desactivada != nil || pausado,
                              accion: alPrimaria)
                } else {
                    VivoEtiqueta(texto: pausado ? "en pausa" : "manda el reloj")
                        .frame(maxWidth: .infinity, minHeight: VivoTokens.Alto.accion)
                }
                // Parar, no una ×: una × se lee como descartar. Se mantiene 1 s y sale la hoja.
                ZStack {
                    VivoBotonRedondo(nombre: "Terminar (mantener pulsado 1 s)") {
                        VStack(spacing: 1) {
                            VivoIcono(sistema: "stop.fill", talla: 20)
                            VivoEtiqueta(texto: "mantén", tono: VivoColor.tinta)
                        }
                    }
                    .allowsHitTesting(false)
                    if manteniendo {
                        VivoAnilloHold().frame(width: 64, height: 64).allowsHitTesting(false)
                    }
                }
                .contentShape(Circle())
                .gesture(
                    LongPressGesture(minimumDuration: VivoTokens.Duracion.terminar)
                        .onEnded { _ in
                            completado = true
                            manteniendo = false
                            alTerminar()
                        }
                        .simultaneously(with: DragGesture(minimumDistance: 0)
                            .onChanged { _ in if !manteniendo, !completado { manteniendo = true } }
                            .onEnded { _ in
                                if manteniendo, !completado {
                                    withAnimation { pista = true }
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { withAnimation { pista = false } }
                                }
                                manteniendo = false
                                completado = false
                            })
                )
            }
            .frame(height: VivoTokens.Alto.accion)
        }
        .padding(.horizontal, VivoTokens.margen)
        .padding(.bottom, VivoTokens.Alto.pieAccion)
    }
}

/// El anillo que se llena mientras se mantiene Terminar: 1 s, en tinta.
private struct VivoAnilloHold: View {
    @State private var progreso: CGFloat = 0
    var body: some View {
        Circle()
            .trim(from: 0, to: progreso)
            .stroke(VivoColor.tinta, style: StrokeStyle(lineWidth: 3, lineCap: .round))
            .rotationEffect(.degrees(-90))
            .padding(2)
            .onAppear { withAnimation(.linear(duration: VivoTokens.Duracion.terminar)) { progreso = 1 } }
    }
}

// MARK: - Deshacer

/// 5 s para deshacer un cierre a mano: una píldora sobre la franja, con su barra que se vacía.
struct VivoAvisoDeshacer: View {
    let aviso: String
    let alDeshacer: () -> Void
    @State private var drena: CGFloat = 1

    var body: some View {
        Button(action: alDeshacer) {
            HStack(spacing: 12) {
                Text(aviso).font(.system(size: VivoTokens.TI.botonMenor.cuerpo, weight: .semibold)).foregroundStyle(VivoColor.tinta).lineLimit(1)
                Text("Deshacer").font(.system(size: VivoTokens.TI.botonMenor.cuerpo, weight: .bold)).foregroundStyle(VivoColor.accion)
            }
            .padding(.horizontal, 18)
            .frame(height: VivoTokens.TI.botonMenor.alto + 4)
            .background(VivoColor.superficie2, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.boton, style: .continuous))
            .overlay(alignment: .top) {
                GeometryReader { g in
                    Rectangle().fill(VivoColor.tinta2).frame(width: g.size.width * drena, height: 3)
                }
                .frame(height: 3)
                .clipShape(RoundedRectangle(cornerRadius: VivoTokens.Radio.boton, style: .continuous))
            }
            .clipShape(RoundedRectangle(cornerRadius: VivoTokens.Radio.boton, style: .continuous))
            .shadow(color: .black.opacity(0.5), radius: 15, y: 12)
        }
        .buttonStyle(VivoPulsarStyle())
        .onAppear { withAnimation(.linear(duration: VivoTokens.Duracion.deshacer)) { drena = 0 } }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

// MARK: - La hoja de terminar

/// Las salidas de la hoja, además de Terminar y guardar / Seguir. Cada una la
/// resuelve el host (la misma semántica que el shell viejo); nil = no se ofrece.
struct VivoSalidas {
    /// «Guardar para luego»: pausa, guarda la instantánea y cierra; se retoma
    /// desde el aviso de entreno a medias (Card 142, `onSoftLeave`).
    var guardarParaLuego: (() -> Void)? = nil
    /// «Cerrar solo este bloque»: registra lo hecho del bloque y pasa al siguiente
    /// (`endBlockEarly`). Solo si queda otro bloque detrás.
    var cerrarBloque: (() -> Void)? = nil
    /// «Descartar entreno»: no se guarda nada y la sesión vuelve a pendiente (`onExit`). Pide confirmación.
    var descartar: (() -> Void)? = nil
}

/// «¿Terminar aquí?» — lo hecho, y las salidas: Terminar y guardar (naranja), las
/// del host (guardar para luego, cerrar el bloque), Seguir y, al final y en
/// sutil, Descartar con su confirmación. Una sola hoja para salir del vivo.
struct VivoHojaTerminar: View {
    let resumen: Vivo.ResumenTerminar
    let alTerminar: () -> Void
    let alSeguir: () -> Void
    var salidas = VivoSalidas()
    @Environment(\.vivoLienzo) private var lienzo
    @State private var confirmarDescarte = false

    var body: some View {
        ZStack(alignment: lienzo.horizontal ? .center : .bottom) {
            VivoColor.velo.ignoresSafeArea().onTapGesture(perform: alSeguir)
            VStack(spacing: 12) {
                Capsule().fill(VivoColor.carril).frame(width: 40, height: 5).padding(.bottom, 4)
                if confirmarDescarte { descarte } else { terminar }
            }
            .padding(.top, 18)
            .padding(.horizontal, VivoTokens.margen)
            .padding(.bottom, lienzo.horizontal ? 18 : 12)
            .frame(maxWidth: lienzo.horizontal ? 620 : .infinity)
            .background(VivoColor.superficie, in: UnevenRoundedRectangle(topLeadingRadius: VivoTokens.Radio.hoja, bottomLeadingRadius: lienzo.horizontal ? VivoTokens.Radio.hoja : 0, bottomTrailingRadius: lienzo.horizontal ? VivoTokens.Radio.hoja : 0, topTrailingRadius: VivoTokens.Radio.hoja, style: .continuous))
            .padding(.bottom, lienzo.horizontal ? 12 : 0)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
        .accessibilityAddTraits(.isModal)
        .animation(.easeOut(duration: 0.2), value: confirmarDescarte)
    }

    /// En horizontal las salidas menores van de dos en dos y bajan a 44 pt: la hoja cabe sin scroll.
    private var alto: CGFloat { lienzo.horizontal ? VivoTokens.TI.botonMenor.alto : VivoTokens.TI.boton.alto }
    private var columnas: [GridItem] { Array(repeating: GridItem(.flexible(), spacing: 10), count: lienzo.horizontal ? 2 : 1) }

    private func titulo(_ t: String) -> some View {
        Text(t)
            .font(.system(size: VivoTokens.TI.posicion, weight: .bold))
            .foregroundStyle(VivoColor.tinta)
            .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var terminar: some View {
        titulo("¿Terminar aquí?")
        VivoCuerpo(texto: Text("Llevas ").foregroundStyle(VivoColor.tinta2)
                   + Text(resumen.titulo)
                   + resumen.lineas.reduce(Text("")) { $0 + Text(" · ").foregroundStyle(VivoColor.tinta2) + Text($1) }
                   + Text(". Lo hecho se guarda; lo que falta queda sin hacer.").foregroundStyle(VivoColor.tinta2))
            .frame(maxWidth: .infinity, alignment: .leading)
        VStack(spacing: 10) {
            VivoBoton(etiqueta: "Terminar y guardar", variante: .primaria, alto: alto, accion: alTerminar)
            LazyVGrid(columns: columnas, spacing: 10) {
                if let g = salidas.guardarParaLuego {
                    VivoBoton(etiqueta: "Guardar para luego", alto: alto, accion: g)
                        .accessibilityHint("Pausa y guarda el progreso. Lo retomas donde lo dejas.")
                }
                if let b = salidas.cerrarBloque {
                    VivoBoton(etiqueta: "Cerrar solo este bloque", alto: alto, accion: b)
                        .accessibilityHint("Guarda lo hecho del bloque y pasa al siguiente.")
                }
                VivoBoton(etiqueta: "Seguir", alto: alto, accion: alSeguir)
                if salidas.descartar != nil {
                    VivoBoton(etiqueta: "Descartar entreno", variante: .sutil, alto: VivoTokens.TI.botonMenor.alto) { confirmarDescarte = true }
                        .accessibilityHint("No guarda nada. Pide confirmación.")
                }
            }
        }
        .padding(.top, 6)
    }

    @ViewBuilder
    private var descarte: some View {
        titulo("¿Descartar el entreno?")
        VivoCuerpo(texto: Text("No se guarda nada de lo que llevas y la sesión vuelve a quedar pendiente. No se puede deshacer.").foregroundStyle(VivoColor.tinta2))
            .frame(maxWidth: .infinity, alignment: .leading)
        LazyVGrid(columns: columnas, spacing: 10) {
            // Lo seguro es lo grande: descartar nunca es el toque fácil.
            VivoBoton(etiqueta: "Seguir entrenando", variante: .primaria, alto: alto) { confirmarDescarte = false; alSeguir() }
            VivoBoton(etiqueta: "Descartar y salir", alto: alto) { salidas.descartar?() }
        }
        .padding(.top, 6)
    }
}

// MARK: - Pausa y terminado

/// El velo de la pausa: el vivo se atenúa y «EN PAUSA» sobre el sujeto. Debajo,
/// cuándo se reanuda sola (si la pidió el atleta: `Vivo.quedaParaReanudar`) y la
/// voz de los avisos, que se silencia o se devuelve aquí (el mismo ajuste que la
/// vista vieja, `AudioCoachSettings`). Reanudar sigue siendo la franja.
struct VivoVeloPausa: View {
    /// Cuándo pidió el atleta la pausa. nil = no se reanuda sola (no se cuenta nada).
    var desde: Date? = nil
    @AppStorage(AudioCoachSettings.enabledKey) private var vozActiva = true

    var body: some View {
        VStack(spacing: 14) {
            Text("EN PAUSA")
                .font(.system(size: VivoTokens.TI.posicion, weight: .bold))
                .tracking(2.6)
                .foregroundStyle(VivoColor.tinta)
                .padding(.horizontal, 18).padding(.vertical, 10)
                .background(VivoColor.velo, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.chip, style: .continuous))
                .allowsHitTesting(false)
            if desde != nil {
                TimelineView(.periodic(from: .now, by: 1)) { ctx in
                    if let n = Vivo.quedaParaReanudar(desde: desde, ahora: ctx.date) {
                        VivoEtiqueta(texto: "sigue sola en \(n) s", tono: VivoColor.tinta)
                            .padding(.horizontal, 12).padding(.vertical, 6)
                            .background(VivoColor.velo, in: Capsule())
                    }
                }
                .allowsHitTesting(false)
            }
            VivoBotonRedondo(nombre: vozActiva ? "Silenciar la voz" : "Activar la voz",
                             talla: VivoTokens.TI.botonMenor.alto,
                             accion: alternarVoz) {
                VivoIcono(sistema: vozActiva ? "speaker.wave.2.fill" : "speaker.slash.fill", talla: 18)
            }
            VivoEtiqueta(texto: vozActiva ? "voz" : "voz apagada").allowsHitTesting(false)
        }
        .offset(y: -80)
        .transition(.opacity)
    }

    private func alternarVoz() {
        vozActiva.toggle()
        if !vozActiva { AudioCoach.shared.stopSpeaking() }
        Haptics.light()
    }
}

/// La sesión acabó (sola o a mano): un instante antes de pasar al resumen.
struct VivoTerminado: View {
    let titulo: String
    let detalle: String
    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark")
                .font(.system(size: 32, weight: .bold))
                .foregroundStyle(VivoColor.tinta)
                .frame(width: 64, height: 64)
                .background(VivoColor.superficie2, in: Circle())
            Text(titulo).font(.system(size: 28, weight: .bold)).foregroundStyle(VivoColor.tinta).multilineTextAlignment(.center)
            VivoEtiqueta(texto: detalle)
        }
        .padding(VivoTokens.margen)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(VivoColor.fondo)
        .transition(.opacity)
    }
}
