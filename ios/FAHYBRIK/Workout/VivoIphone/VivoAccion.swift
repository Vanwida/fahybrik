import SwiftUI

// LA FRANJA DE ACCIÓN (I5.8) — lo que se toca, en la zona del pulgar (espejo
// de `kit-iphone-vivo/accion.tsx`).
//   UNA acción primaria por estado, grande (64 pt) y naranja, con un VOCABULARIO
//   CERRADO (`Vivo.ClavePrimaria`). Pausa a su lado. Terminar = mantener pulsado
//   1 s (Apple Fitness, Strava) con hoja que dice lo hecho. Nunca un botón que
//   diga «Terminar» y cierre otra cosa.
//   VivoAvisoDeshacer   5 s para deshacer un cierre a mano, sobre la franja.
//   VivoHojaTerminar    «¿Terminar aquí?» con lo hecho: Terminar y guardar · Seguir.

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

/// «¿Terminar aquí?» — lo hecho, y dos salidas: Terminar y guardar (naranja) o Seguir. Nunca un tercer botón.
struct VivoHojaTerminar: View {
    let resumen: Vivo.ResumenTerminar
    let alTerminar: () -> Void
    let alSeguir: () -> Void
    @Environment(\.vivoLienzo) private var lienzo

    var body: some View {
        ZStack(alignment: lienzo.horizontal ? .center : .bottom) {
            VivoColor.velo.ignoresSafeArea().onTapGesture(perform: alSeguir)
            VStack(spacing: 12) {
                Capsule().fill(VivoColor.carril).frame(width: 40, height: 5).padding(.bottom, 4)
                Text("¿Terminar aquí?")
                    .font(.system(size: VivoTokens.TI.posicion, weight: .bold))
                    .foregroundStyle(VivoColor.tinta)
                    .frame(maxWidth: .infinity, alignment: .leading)
                VivoCuerpo(texto: Text("Llevas ").foregroundStyle(VivoColor.tinta2)
                           + Text(resumen.titulo)
                           + resumen.lineas.reduce(Text("")) { $0 + Text(" · ").foregroundStyle(VivoColor.tinta2) + Text($1) }
                           + Text(". Lo hecho se guarda; lo que falta queda sin hacer.").foregroundStyle(VivoColor.tinta2))
                    .frame(maxWidth: .infinity, alignment: .leading)
                VStack(spacing: 10) {
                    VivoBoton(etiqueta: "Terminar y guardar", variante: .primaria, accion: alTerminar)
                    VivoBoton(etiqueta: "Seguir", variante: .superficie, accion: alSeguir)
                }
                .padding(.top, 6)
            }
            .padding(.top, 18)
            .padding(.horizontal, VivoTokens.margen)
            .padding(.bottom, lienzo.horizontal ? 18 : 12)
            .frame(maxWidth: lienzo.horizontal ? 520 : .infinity)
            .background(VivoColor.superficie, in: UnevenRoundedRectangle(topLeadingRadius: VivoTokens.Radio.hoja, bottomLeadingRadius: lienzo.horizontal ? VivoTokens.Radio.hoja : 0, bottomTrailingRadius: lienzo.horizontal ? VivoTokens.Radio.hoja : 0, topTrailingRadius: VivoTokens.Radio.hoja, style: .continuous))
            .padding(.bottom, lienzo.horizontal ? 12 : 0)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
        .accessibilityAddTraits(.isModal)
    }
}

// MARK: - Pausa y terminado

/// El velo de la pausa: el vivo se atenúa y «EN PAUSA» sobre el sujeto.
struct VivoVeloPausa: View {
    var body: some View {
        Text("EN PAUSA")
            .font(.system(size: VivoTokens.TI.posicion, weight: .bold))
            .tracking(2.6)
            .foregroundStyle(VivoColor.tinta)
            .padding(.horizontal, 18).padding(.vertical, 10)
            .background(VivoColor.velo, in: RoundedRectangle(cornerRadius: VivoTokens.Radio.chip, style: .continuous))
            .offset(y: -80)
            .allowsHitTesting(false)
            .transition(.opacity)
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
