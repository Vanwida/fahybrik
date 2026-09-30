import Foundation

// EL CIRCUITO Y LA HYROX EN LA MUÑECA (P10; espejo de `screens/reloj-circuito/`). Cada estación y cada tramo de
// carrera es SU paso, con su parcial; el crono total (la puntuación) va bajo el contexto en TODAS las caras y no se
// va nunca. Lo que cambia según lo que haces:
//
//   carrera     LA MISMA cara de correr (el objetivo del coach manda) con la posición «Run 3/8 · 1000 m» y el
//               total bajo el contexto. Nada propio del circuito: la carrera de un circuito es correr.
//   estación    el nombre, la dosis y la carga («Sled Push · 50 m · 152 kg»). Si algo la mide (el monitor de la
//               máquina) el héroe es lo que falta; si nada la mide, el crono de la estación con «lo dices tú».
//   Roxzone     un paso propio si el coach la escribe en la lista: «entras a Wall Balls», con su crono.
//   descanso    el común (P8), con «Viene:» lo que sigue.
//
// La cabecera, el «Run 3» y el texto del deshacer salen de las mismas funciones que el iPhone
// (`formatoCircuito`, `tituloCircuito`, `avisoCircuito`): el formato (rondas o HYROX) viaja en el paso.
// Páginas: Paso → Ruta → Datos.

extension Vivo {

    /// «Run 3/8 · 1000 m» / «Ronda 2/5 · Run 1000 m» / «Estación 3/8» / «Ronda 2/5 · Estación 2/3»: dónde estás, sin el
    /// nombre del formato, que el título y la ruta ya dicen.
    static func contextoCircuito(_ p: Paso, _ f: FormatoCircuito) -> [String] {
        let formato = formatoCircuito(p, f)
        if p.clase == .carrera {
            let titulo = tituloCircuito(p, f)
            if f == .hyrox { return titulo }
            return [formato.first { $0.hasPrefix("Ronda") }, titulo.joined(separator: " ")].compactMap { $0 }
        }
        let resto = Array(formato.dropFirst())
        return resto.isEmpty ? formato : resto
    }

    /// El turno de dobles delante de la posición («Dobles · te toca»): lo que no cabe se quita por el final.
    private static func conTurno(_ contexto: [String], _ p: Paso) -> [String] {
        (p.dobles.map { [formatoDobles($0)] } ?? []) + contexto
    }

    // MARK: - La cara

    /// La cara de un paso de circuito, o `nil` si es lo común (un descanso, una recuperación).
    static func caraCircuito(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ x: EntornoMuneca) -> CaraMuneca? {
        let p = e.paso
        guard let f = p.circuito, p.rol != .descanso else { return nil }
        switch p.clase {
        case .roxzone: return .paso(caraRoxzone(e, l, x, f))
        case .estacion: return .paso(caraEstacion(e, l, lam, x, f))
        case .carrera:
            return .paso(caraPaso(conRitmoConRpe(lam, l), e, l, x.medidas, contexto: conTurno(contextoCircuito(p, f), p),
                                  total: lineaTotal(totalDelBloque(e))))
        default: return nil
        }
    }

    /// La estación. Medida: «SkiErg · 1000 m», lo que falta y el /500 de ahora. Declarada: «Sled Push» con su dosis y
    /// su carga, y el crono de la estación con «lo dices tú».
    private static func caraEstacion(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ x: EntornoMuneca, _ f: FormatoCircuito) -> CaraPaso {
        let p = e.paso
        let medida = estacionMedida(p)
        var d = PartesDeCara(contexto: conTurno(contextoCircuito(p, f), p), heroe: heroeDeFamilia(p, l, e.zonas))
        d.titulo = tituloCircuito(p, f).joined(separator: " · ")
        // Lo que nadie mide se dice entero: sin el monitor de la máquina, el atleta esperaba que contara solo.
        if !medida { d.dosis = (dosisCompleta(p) + (p.maquina != nil ? ["sin monitor"] : [])).joined(separator: " · ") }
        // El pacto de un reparto de dobles manda sobre la nota del enlace; el cue del coach, si no hay otra.
        d.nota = p.dobles.flatMap(pactoDe).map { NotaLamina(texto: $0, esencial: true) } ?? lam.nota
        d.total = lineaTotal(totalDelBloque(e))
        if p.medida.mide == .ergo { d.segundo = LineaVista(valor: fmtSplit(l.split500, p.maquina), unidad: unidadSplit(p.maquina)) }
        d.accion = claveCircuito(p)?.rawValue
        d.pulso = lineaPulso(p, l, e.zonas, e.reglas)
        return caraDeFamilia(d, x.medidas, accion: x.accion)
    }

    /// La Roxzone: entrada («entras a Wall Balls», con su dosis y su carga) o salida («sales a Run 4/8»). Nadie la
    /// detecta: el atleta la cierra con «empiezo» y «salgo a correr».
    private static func caraRoxzone(_ e: EstadoVivo, _ l: Lecturas, _ x: EntornoMuneca, _ f: FormatoCircuito) -> CaraPaso {
        let p = e.paso
        let sig = e.siguiente
        let entrada = p.roxzone == .entrada
        var d = PartesDeCara(contexto: ["Roxzone"] + (entrada ? (sig.map { contextoCircuito($0, f) } ?? []) : ["salida"]),
                             heroe: HeroeVista(clase: .crono, texto: fmtReloj(l.t)))
        if let sig {
            d.titulo = entrada ? "entras a \(sig.nombre ?? "")" : "sales a \(tituloCircuito(sig, f).first ?? nombreClase(.carrera))"
            if entrada { d.dosis = dosisCompleta(sig).joined(separator: " · ") }
        }
        d.total = lineaTotal(totalDelBloque(e))
        d.accion = claveCircuito(p)?.rawValue
        d.pulso = lineaPulso(p, l, e.zonas, e.reglas)
        return caraDeFamilia(d, x.medidas, accion: x.accion)
    }

    // MARK: - La página Ruta

    /// La lista del coach, tramos y estaciones, con lo hecho y su parcial, lo de ahora con su crono y lo que viene.
    /// `nil` si el paso no es de un circuito (una estación suelta): la Estructura de siempre.
    static func paginaRutaDelCircuito(_ e: EstadoVivo) -> PaginaEstructuraMuneca? {
        guard let f = e.paso.circuito else { return nil }
        let hyrox = f == .hyrox
        let ruta = rutaDelCircuito(e.pasos, i: e.i, parciales: e.parciales, terminado: e.terminado, hyrox: hyrox)
        var listados = 0
        var hechos = 0
        let filas: [FilaLista] = ruta.compactMap { fila in
            guard case let .paso(_, paso, estado, parcial, suelta) = fila else { return nil }
            if !suelta { listados += 1; if estado == .hecho { hechos += 1 } }
            // Lo que no está en la lista del coach (la Roxzone, un descanso) solo sale mientras estás en ello.
            let nombre = suelta ? (paso.roxzone.map { "Roxzone · \($0.rawValue)" } ?? nombreEnRuta(paso, runsNumerados: false)) : nombreEnRuta(paso, runsNumerados: hyrox)
            let valor = parcial.map { fmtReloj($0.segundos) } ?? (estado == .ahora ? fmtReloj(e.lecturas.t) : nil)
            return FilaLista(linea: nombre, detalle: valor, estado: FilaEstructura.Estado(rawValue: estado.rawValue) ?? .pendiente)
        }
        let rox = roxzoneDe(e.pasos, i: e.i, t: e.lecturas.t, parciales: e.parciales, terminado: e.terminado)
        return PaginaEstructuraMuneca(titulo: ["Ruta", rox.map { "Roxzone \(fmtReloj($0))" } ?? "\(hechos)/\(listados)"], filas: ventanaDeLista(filas))
    }

    // MARK: - La página Datos

    /// El total, los km CORRIDOS y su ritmo medio (solo los tramos de carrera: dividir por el tiempo con estaciones
    /// daba 9:30/km cuando se corrió a 4:50), la Roxzone sumada y el pulso.
    static func filasDeDatosCircuito(_ e: EstadoVivo, _ l: Lecturas) -> [FilaDatoVista] {
        let seg = e.paso.origen?.segmento
        let esTramo: (Int) -> Bool = { e.pasos.indices.contains($0) && e.pasos[$0].clase == .carrera && e.pasos[$0].origen?.segmento == seg }
        let cerrados = e.parciales.filter { esTramo($0.i) && $0.metros != nil }
        let vivo: (m: Double, s: Double) = (esTramo(e.i) && (e.metrosPaso ?? 0) > 0) ? (e.metrosPaso ?? 0, l.t) : (0, 0)
        let metros = cerrados.reduce(0) { $0 + ($1.metros ?? 0) } + vivo.m
        let segundos = cerrados.reduce(0) { $0 + $1.segundos } + vivo.s
        let d = metros > 0 ? fmtDistancia(metros) : nil
        var filas = [
            FilaDatoVista(valor: fmtReloj(totalDelBloque(e)), unidad: "total"),
            FilaDatoVista(valor: d?.valor ?? "—", unidad: "\(d?.unidad ?? "km") corridos"),
            FilaDatoVista(valor: metros > 50 ? fmtRitmo(segundos / (metros / 1000)) : "—", unidad: "/km al correr"),
        ]
        if let rox = roxzoneDe(e.pasos, i: e.i, t: l.t, parciales: e.parciales, terminado: e.terminado) {
            filas.append(FilaDatoVista(valor: fmtReloj(rox), unidad: "Roxzone"))
        }
        filas.append(filaDePulso(e, l))
        return filas
    }
}
