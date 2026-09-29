import SwiftUI

// PASADAS — tu historial y lo que dice de ti. Espejo de `pasadas.tsx`.
//
// En orden de la pregunta con la que se abre: ¿cómo me fue la última? → ¿cómo me fue contra lo
// previsto? → ¿dónde perdí tiempo? (estaciones, ritmo) → ¿voy a mejor? (evolución) → todas mis
// carreras. Cada fila del historial se despliega a sus parciales; las de dobles y relevos dicen que
// los tiempos son DEL EQUIPO (un tiempo compartido no es el tuyo).
//
// Estados: con datos · en frío (esqueletos con la forma final) · vacío con su salida (importar el
// historial) · error del análisis (local, con «Reintentar»). Con el sujeto ya siendo la invitación
// (vacío) esta sección no existe: el póster lleva las dos salidas y repetirlas aquí sería el mismo
// hueco dos veces.

// MARK: - Tu última carrera (la tarjeta, cuando el sujeto es otra cosa)

private struct TarjetaUltima: View {
    let carrera: CarreraPasada
    let lectura: LecturaCarreras

    var body: some View {
        let resumen = DecideCarreras.resumenDe(carrera, lectura.pasadas)
        let equipo = DecideCarreras.etiquetaEquipo(carrera.formato)
        let conQuien = DecideCarreras.textoEquipo(carrera.companeros)
        let fecha = carrera.fecha.flatMap { FechaES.corta($0, hoy: lectura.hoy) } ?? "Fecha por confirmar"
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Tu última carrera").papel(.etiqueta).foregroundStyle(Theme.Color.accentText)
                Text(carrera.nombre)
                    .papel(.seccion)
                    .foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(fecha) · \(carrera.division.etiqueta)").papel(.nota).foregroundStyle(Theme.Color.muted)
            }
            if let total = resumen.totalS {
                Text(Formato.clock(total, enHoras: false))
                    .papel(.sujeto)
                    .foregroundStyle(Theme.Color.foreground)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
            }
            if equipo != nil {
                CintaCarreras(icono: { IconoCarreras(.equipo, tam: 18) }) {
                    Text("Tiempo del equipo\(conQuien.map { " · \($0)" } ?? "")")
                }
            } else {
                PildoraDelta(deltaS: resumen.deltaAnteriorS)
            }
            PildoraPuesto(texto: resumen.puesto)
            ParcialesCarrera(resumen: resumen)
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .tarjetaCarreras()
        .accessibilityElement(children: .contain)
    }
}

// MARK: - Una fila del historial

private struct ParcialKm: View {
    let etiqueta: String
    let valor: String

    var body: some View {
        VStack(spacing: 2) {
            Text(etiqueta).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
            Text(valor).papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 6)
        .padding(.horizontal, 4)
        .background(Theme.Color.surfaceSunken, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(etiqueta): \(valor)")
    }
}

/// Los parciales de una carrera abierta: los km, las estaciones y los totales de correr y RoxZone.
private struct ParcialesDeFila: View {
    let carrera: CarreraPasada

    var body: some View {
        let equipo = carrera.formato.esDeEquipo
        let vueltas = carrera.vueltas.enumerated().compactMap { i, s in s.map { (km: i + 1, s: $0) } }
        let estaciones = carrera.estaciones.compactMap { e in e.segundos.map { (indice: e.indice, s: $0) } }.sorted { $0.indice < $1.indice }
        VStack(alignment: .leading, spacing: 14) {
            if equipo {
                HStack(alignment: .top, spacing: Theme.Spacing.m - 2) {
                    IconoCarreras(.equipo, tam: 18).foregroundStyle(Theme.Color.info).padding(.top, 1)
                    Text("Parciales del equipo: tiempos compartidos, no individuales.")
                        .papel(.notaFuerte)
                        .foregroundStyle(Theme.Color.foreground)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, Theme.Spacing.m)
                .padding(.vertical, Theme.Spacing.m - 2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.Color.infoTint, in: RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Radius.fila, style: .continuous).strokeBorder(Theme.Color.info.opacity(0.34), lineWidth: 1))
                .accessibilityElement(children: .combine)
            }
            if !vueltas.isEmpty {
                VStack(alignment: .leading, spacing: Theme.Spacing.s) {
                    Text(equipo ? "Carrera · equipo, por km" : "Carrera · por km").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 4), spacing: 6) {
                        ForEach(vueltas, id: \.km) { v in ParcialKm(etiqueta: "km \(v.km)", valor: Formato.clock(v.s)) }
                    }
                }
            }
            if !estaciones.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(equipo ? "Estaciones · equipo" : "Estaciones").papel(.etiqueta).foregroundStyle(Theme.Color.muted)
                    ForEach(estaciones, id: \.indice) { e in
                        HStack(alignment: .firstTextBaseline, spacing: Theme.Spacing.m - 2) {
                            Text(HyroxStation.labels[e.indice] ?? "Estación \(e.indice)")
                                .papel(.nota)
                                .foregroundStyle(Theme.Color.muted)
                            Spacer(minLength: Theme.Spacing.s)
                            Text(Formato.clock(e.s)).papel(.notaPesada).foregroundStyle(Theme.Color.foreground)
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
            if carrera.correrS != nil || carrera.roxzoneS != nil {
                HStack(spacing: Theme.Spacing.m) {
                    if let s = carrera.correrS { Total(etiqueta: "Carrera", s: s) }
                    if let s = carrera.roxzoneS { Total(etiqueta: "RoxZone", s: s) }
                }
            }
        }
    }

    private struct Total: View {
        let etiqueta: String
        let s: Int

        var body: some View {
            VStack(alignment: .leading, spacing: 2) {
                Text(etiqueta).papel(.notaFuerte).foregroundStyle(Theme.Color.muted)
                Text(Formato.clock(s)).papel(.cuerpoFuerte).monospacedDigit().foregroundStyle(Theme.Color.foreground)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }
}

private struct FilaPasada: View {
    let carrera: CarreraPasada
    let hoy: String
    let alImportar: () -> Void

    @State private var abierta = false

    private var pendiente: Bool { carrera.resultadoS == nil }
    private var conParciales: Bool {
        carrera.vueltas.contains { ($0 ?? 0) > 0 } || carrera.estaciones.contains { ($0.segundos ?? 0) > 0 }
    }
    private var abre: Bool { !pendiente && conParciales }
    private var linea: String {
        "\(carrera.fecha.flatMap { FechaES.corta($0, hoy: hoy) } ?? "Fecha por confirmar") · \(carrera.division.etiqueta)"
    }

    private var voz: String {
        [
            carrera.nombre,
            linea,
            DecideCarreras.etiquetaEquipo(carrera.formato),
            DecideCarreras.textoEquipo(carrera.companeros),
            pendiente ? "resultado pendiente, toca para importarlo" : carrera.resultadoS.map { Formato.clock($0, enHoras: false) },
        ].compactMap { $0 }.joined(separator: ". ")
    }

    var body: some View {
        VStack(spacing: 0) {
            if abre || pendiente {
                Button {
                    Haptics.light()
                    if pendiente { alImportar() } else { withAnimation(.easeOut(duration: 0.2)) { abierta.toggle() } }
                } label: { cabecera }
                    .buttonStyle(PressScaleStyle(escala: 0.99))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(voz)
                    .accessibilityHint(pendiente ? "" : (abierta ? "Parciales abiertos" : "Toca para ver los parciales"))
                    .accessibilityAddTraits(.isButton)
            } else {
                cabecera
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(voz)
            }
            if abierta && abre {
                ParcialesDeFila(carrera: carrera)
                    .padding(EdgeInsets(top: 14, leading: 16, bottom: 16, trailing: 16))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .overlay(alignment: .top) { Rectangle().fill(Theme.Color.hairline).frame(height: 1) }
            }
        }
        .tarjetaCarreras()
    }

    private var cabecera: some View {
        let equipo = DecideCarreras.etiquetaEquipo(carrera.formato)
        let conQuien = DecideCarreras.textoEquipo(carrera.companeros)
        return HStack(alignment: .top, spacing: Theme.Spacing.m) {
            VStack(alignment: .leading, spacing: 6) {
                Text(carrera.nombre).papel(.cuerpoFuerte).foregroundStyle(Theme.Color.foreground)
                    .fixedSize(horizontal: false, vertical: true)
                Text(linea).papel(.nota).foregroundStyle(Theme.Color.muted)
                if equipo != nil || carrera.tipoEvento == .deka {
                    HStack(spacing: 6) {
                        if let equipo { ChipCarreras(equipo, estilo: .acento) { IconoCarreras(.equipo, tam: 16) } }
                        if carrera.tipoEvento == .deka { ChipCarreras("DEKA", estilo: .velo) }
                        if let conQuien { Text(conQuien).papel(.notaFuerte).foregroundStyle(Theme.Color.muted) }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            VStack(alignment: .trailing, spacing: 6) {
                if let total = carrera.resultadoS {
                    Text(Formato.clock(total, enHoras: false))
                        .papel(.cuerpoFuerte)
                        .monospacedDigit()
                        .foregroundStyle(Theme.Color.foreground)
                } else {
                    HStack(spacing: 6) {
                        IconoDia(.cronometro, tam: 18)
                        Text("Resultado pendiente").papel(.rotulo)
                    }
                    .foregroundStyle(Theme.Color.muted)
                    .multilineTextAlignment(.trailing)
                }
                if abre || pendiente {
                    IconoDia(.chevron, tam: 18)
                        .foregroundStyle(Theme.Color.muted)
                        .rotationEffect(.degrees(pendiente ? 0 : (abierta ? -90 : 90)))
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.l)
        .padding(.vertical, 14)
        .frame(maxWidth: .infinity, minHeight: 72, alignment: .topLeading)
        .contentShape(Rectangle())
    }
}

// MARK: - El historial

private struct HistorialCarreras: View {
    let pasadas: [CarreraPasada]
    let hoy: String
    let alImportar: () -> Void
    let alQuitarImportacion: () -> Void

    @State private var abierto = false

    /// Desde cuántas carreras se pliega el historial, y cuántas quedan a la vista al plegar.
    static let plegarDesde = 5
    static let visiblesPlegado = 3

    var body: some View {
        let orden = DecideCarreras.ordenarPasadas(pasadas)
        let plegable = orden.count >= Self.plegarDesde
        let visibles = plegable && !abierto ? Array(orden.prefix(Self.visiblesPlegado)) : orden
        let hayImportadas = orden.contains { $0.resultadoS != nil }
        VStack(alignment: .leading, spacing: 10) {
            SubTituloCarreras(
                titulo: "Historial",
                nota: "\(orden.count) \(orden.count == 1 ? "carrera" : "carreras"), la más reciente primero. Toca una para ver sus parciales."
            )
            VStack(spacing: 10) {
                ForEach(visibles) { c in FilaPasada(carrera: c, hoy: hoy, alImportar: alImportar) }
            }
            if plegable {
                BotonTextoCarreras(
                    abierto ? "Ver menos" : "Ver \(orden.count - Self.visiblesPlegado) más",
                    expandido: abierto,
                    accion: { withAnimation(.easeOut(duration: 0.2)) { abierto.toggle() } },
                    icono: { EmptyView() },
                    derecha: { GiroCarreras(abierto: abierto) }
                )
                .tarjetaCarreras()
            }
            // Importar el perfil equivocado trae el historial de un desconocido: la salida es clara y sobria.
            if hayImportadas {
                BotonTextoCarreras("¿No eres tú? Eliminar carreras importadas", tono: .suave, centrado: true, accion: alQuitarImportacion) {
                    IconoCarreras(.sinPersona, tam: 20)
                }
            }
        }
    }
}

// MARK: - La sección

struct PasadasCarreras: View {
    let lectura: LecturaCarreras
    let sujeto: SujetoCarreras
    let alImportar: () -> Void
    let alQuitarImportacion: () -> Void
    let alAbrirEstacion: (String) -> Void
    let alAbrirPredichoVsReal: () -> Void
    let alReintentarAnalisis: () -> Void

    var body: some View {
        switch sujeto {
        case .vacio, .error:
            // El póster vacío ya lleva las dos salidas; y en error la sección no sabe qué enseñar aún.
            EmptyView()
        case .cargando:
            frio
        default:
            if lectura.pasadas.isEmpty { vacio } else { conDatos }
        }
    }

    private var frio: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            SkeletonBar(width: 110, height: 26, radius: 8).frame(minHeight: 44, alignment: .leading)
            VStack(alignment: .leading, spacing: Theme.Spacing.m) {
                SkeletonBar(width: 150, height: 15, radius: 5)
                SkeletonBar(height: 22, radius: 7).frame(maxWidth: 220)
                SkeletonBar(width: 140, height: 44, radius: 10)
                SkeletonBar(height: 32, radius: 16).frame(maxWidth: 260)
            }
            .padding(Theme.Spacing.l)
            .frame(maxWidth: .infinity, minHeight: 168, alignment: .topLeading)
            .tarjetaCarreras()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Cargando tu historial")
        .accessibilityAddTraits(.updatesFrequently)
    }

    private var vacio: some View {
        VStack(alignment: .leading, spacing: Theme.Spacing.m) {
            TituloSeccionDia("Pasadas")
            VacioCarreras(
                titulo: "Aún no hay carreras pasadas",
                mensaje: "Busca tu nombre e importa tu historial de HYROX, individuales y dobles, y verás aquí tus parciales, tus puntos débiles y tu evolución.",
                icono: { IconoCarreras(.bandera, tam: 24) },
                salida: { SalidaAccionCarreras("Importar historial", accion: alImportar) { IconoDia(.mas, tam: 20, peso: .bold) } }
            )
        }
    }

    private var conDatos: some View {
        let ultima = DecideCarreras.ultimaConResultado(lectura.pasadas)
        // Con el análisis aún por llegar hay que dejarle su sitio si se espera uno (hay una individual con resultado).
        let esperaAnalisis = lectura.pasadas.contains { $0.formato == .individual && $0.resultadoS != nil }
        return VStack(alignment: .leading, spacing: 22) {
            TituloSeccionDia("Pasadas") {
                PastillaSeccion("Importar", accion: alImportar) { IconoDia(.mas, tam: 18, peso: .bold) }
            }
            if sujeto.tipo != .ultima, let ultima { TarjetaUltima(carrera: ultima, lectura: lectura) }
            if let a = lectura.analisis, let predicho = a.predichoVsReal {
                PuertaPredichoVsRealCarreras(predicho: predicho, nombre: a.nombre, alAbrir: alAbrirPredichoVsReal)
            }
            if lectura.cargaAnalisis == .fria, esperaAnalisis { EsqueletoAnalisisCarreras() }
            if lectura.cargaAnalisis == .error, esperaAnalisis { AnalisisConErrorCarreras(alReintentar: alReintentarAnalisis) }
            if let a = lectura.analisis, lectura.cargaAnalisis == .lista {
                if lectura.conCoach { InformeCarreras(analisis: a) }
                EstacionesCarreras(analisis: a, alAbrir: alAbrirEstacion)
                RitmoPorKmCarreras(analisis: a)
            }
            EvolucionCarreras(pasadas: lectura.pasadas)
            if DecideCarreras.soloDeEquipo(lectura.pasadas) {
                Text("El análisis por estación y por km sale de tus carreras individuales: en dobles y relevos el tiempo es del equipo.")
                    .papel(.nota)
                    .foregroundStyle(Theme.Color.muted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HistorialCarreras(
                pasadas: lectura.pasadas,
                hoy: lectura.hoy,
                alImportar: alImportar,
                alQuitarImportacion: alQuitarImportacion
            )
        }
    }
}
