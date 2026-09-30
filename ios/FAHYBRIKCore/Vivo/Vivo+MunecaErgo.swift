import Foundation

// EL ERGO (remo, ski, bici) EN LA MUÑECA — el objetivo manda, como corriendo (P3). Espejo de
// `screens/reloj-wod/caras-ergo.tsx`. La cara es la misma `CaraPaso` de correr, con lo que el
// ergo cambia, decidido aquí y no en la vista:
//
//   a /500 con monitor    héroe = el /500 ACTUAL contra su banda (▲▼ y palabra), debajo los metros
//                         que quedan y el pulso.
//   a /500 sin monitor    los metros los dices tú: el héroe cae a lo que llevas, el /500 va como
//                         instrucción (lo lees en el monitor) y la serie se cierra con la acción.
//   a zona                héroe = el pulso contra la zona del coach, fondo teñido.
//   segundo objetivo (M1) un techo de pulso («máx 142 ppm») o el tope de ritmo tipado («no más lento
//                         de 2:10/500»): a la vista, y solo avisa por donde debe.
//
// El monitor de la máquina (PM5) lo lleva el móvil: el reloj en solitario nunca lo tiene, y en espejo
// solo cuando el móvil lo dice (`EstadoVivo.maquinaEnlazada`). Sin él se cae a pulso y crono, y se dice.

extension Vivo {

    /// ¿Lo pinta la cara de ergo? Un tramo de máquina suelto (remo, ski o bici), no una estación de ruta
    /// ni una ventana de EMOM (esas son de otras familias).
    static func esErgoMuneca(_ p: Paso) -> Bool {
        p.rol == .trabajo && p.wod == nil && p.clase == .ergo && p.maquina.map { $0.tipo != .cinta } == true
    }

    /// ¿Nadie mide este paso? Sin la máquina enlazada los metros y el /500 los lees tú en el monitor.
    static func ergoSinMonitor(_ p: Paso, enlazada: Maquina.Tipo?) -> Bool {
        p.medida.mide == .atleta || (p.medida.mide == .ergo && enlazada != p.maquina?.tipo)
    }

    // MARK: - El segundo objetivo (M1)

    /// «no más lento de 6:00/km», «no más rápido de 1:58/500», o el rango si trae los dos.
    static func textoTope(_ o: Objetivo, _ maquina: Maquina?) -> String {
        guard o.papel == .secundario, o.eje == .ritmo || o.eje == .split500 else { return fmtObjetivo(o, maquina) }
        let f: (Double) -> String = o.eje == .ritmo ? { "\(fmtRitmo($0))/km" } : { "\(fmtSplit($0, maquina))\(unidadSplit(maquina))" }
        switch (o.min, o.max) {
        case let (nil, mx?): return "no más lento de \(f(mx))"
        case let (mn?, nil): return "no más rápido de \(f(mn))"
        default: return fmtObjetivo(o, maquina)
        }
    }

    /// El segundo objetivo del paso, a la vista. `conTecho`: también un techo de pulso (el ergo lo enseña como
    /// nota; correr ya lo lleva en la línea del pulso, «▲ alto»). El tope de ritmo tipado, con su marca si se pasa.
    static func topeDe(_ p: Paso, _ l: Lecturas, _ zonas: ZonasCoach?, _ reglas: ReglasAviso, _ m: MedidasMuneca, conTecho: Bool) -> NotaVista? {
        if conTecho, let t = objetivoDe(p, .techo) { return notaVista(textoTope(t, p.maquina), ancho: m.anchoUtil) }
        guard let o = p.objetivos.first(where: { $0.papel == .secundario && ($0.eje == .ritmo || $0.eje == .split500) }) else { return nil }
        var texto = textoTope(o, p.maquina)
        if let v = valorDeEje(o.eje, l) {
            let ver = veredictoDe(o, v, holgura: holguraDe(o.eje, reglas), zonas: zonas)
            if ver != .dentro { let w = palabraVeredicto(o.eje, ver); texto += " · \(w.marca ?? "") \(w.texto)" }
        }
        return notaVista(texto, ancho: m.anchoUtil)
    }

    // MARK: - La cara

    /// «Remo 2/4», «Remo · tramo 3/5», o el nombre solo.
    private static func cabezaDeErgo(_ p: Paso) -> String {
        let nombre = p.nombre ?? nombreMaquinaCorto(p.maquina) ?? nombreClase(.ergo)
        if let s = p.posicion?.serie { return "\(nombre) \(s.n)/\(s.de)" }
        if let r = p.posicion?.ronda { return "\(nombre) \(r.n)/\(r.de)" }
        if let t = p.posicion?.tramo { return "\(nombre) · tramo \(t.n)/\(t.de)" }
        return nombre
    }

    static func caraErgo(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ m: MedidasMuneca, accion: FilaDeAccion) -> CaraPaso {
        let p = e.paso
        let declarada = ergoSinMonitor(p, enlazada: e.maquinaEnlazada)
        // M7: el damper, si el coach lo dijo, cierra el contexto (es lo primero que se cae si no cabe).
        let contexto = contextoQueCabe([cabezaDeErgo(p), fmtPrescrito(p.medida)] + (p.maquina?.damper.map { ["damper \($0)"] } ?? []), m)
        let nota = (declarada ? "sin \(nombreMaquina(p.maquina) ?? "la máquina") · lo dices tú" : lam.nota).map { notaVista($0, ancho: m.anchoUtil) }
        // Sin máquina que lo mida, el /500 es la instrucción (se lee en el monitor): una banda sin marca durante toda la serie sería un calibre roto.
        let banda = declarada ? nil : lam.banda
        let instruccion: String? = declarada ? principal(p).map { "a \(fmtObjetivo($0, p.maquina))" } : lam.instruccion
        let tope = topeDe(p, l, e.zonas, e.reglas, m, conTecho: true)
        let tercero: LineaVista? = lam.heroe.clase == .pulso
            ? (p.medida.mide == .ergo && !declarada ? LineaVista(valor: fmtSplit(l.split500, p.maquina), unidad: unidadSplit(p.maquina)) : nil)
            : lam.tercero
        let clave = clavePorDefecto(p)
        let pista = (p.cierre == .atleta ? clave : nil).map { notaVista("doble toque · \($0.rawValue)", ancho: m.anchoUtil) }

        var filas: [Fila] = [.contexto]
        if let nota { filas.append(filaDeNota(nota)) }
        if banda != nil { filas.append(.banda) }
        if instruccion != nil { filas.append(.instruccion) }
        if let tope { filas.append(filaDeNota(tope)) }
        if lam.segundo != nil { filas.append(.segundo) }
        if let pista { filas.append(accion == .boton ? .boton : filaDeNota(pista)) }
        if tercero != nil { filas.append(.tercero) }
        return CaraPaso(
            contexto: contexto,
            nota: nota,
            heroe: heroeMuneca(lam.heroe, filas: filas, m),
            banda: banda,
            instruccion: instruccion.map { instruccionQueCabe($0, m) },
            segundo: lam.segundo.map { lineaDeDato($0, cuerpo: TipoMuneca.segundo, ancho: (tercero != nil || pista != nil) ? m.anchoUtil : m.anchoPie) },
            tercero: tercero.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoPie) },
            tope: tope,
            pista: pista
        )
    }

    // MARK: - Las páginas: Paso → Series → Datos → Estructura

    /// El tramo de trabajo con serie o tramo de ergo de la sesión: si lo hay, hay página de Series.
    private static func trabajoDeErgo(_ pasos: [Paso]) -> Paso? {
        pasos.first { $0.clase == .ergo && $0.rol == .trabajo && ($0.posicion?.serie != nil || $0.posicion?.tramo != nil) }
    }

    static func hayPaginaDeSeriesErgo(_ e: EstadoVivo) -> Bool { trabajoDeErgo(e.pasos) != nil }

    /// El /500 de una vuelta (s por 500 m), si se midieron sus metros.
    private static func splitDeVuelta(_ v: Vuelta) -> Double? {
        guard let m = v.metros, m > 0 else { return nil }
        return v.segundos * 500 / m
    }

    /// Las series (o los tramos) del ergo, la última arriba, cada una contra su objetivo. Solo cuentan las de máquina.
    static func paginaVueltasErgo(_ e: EstadoVivo) -> PaginaVueltasMuneca {
        let pasos = e.pasos
        let trabajo = trabajoDeErgo(pasos)
        let o = trabajo.flatMap(principal)
        let porSplit = o?.eje == .split500
        let propios = e.parciales.filter { $0.i < pasos.count && pasos[$0.i].clase == .ergo }
        let vueltas = vueltasDe(pasos, parciales: propios, zonas: e.zonas, reglas: e.reglas)
        let filas: [FilaSplit] = vueltas.reversed().prefix(4).map { v in
            let n = v.tanda.map { "\($0)·\(v.n)" } ?? String(v.n)
            if porSplit {
                // Sin metros medidos no hay /500 que juzgar: su tiempo, y se dice por qué.
                guard let s = splitDeVuelta(v) else { return FilaSplit(n: n, valor: fmtReloj(v.segundos), juicio: JuicioVuelta(texto: "sin /500", fuera: false)) }
                return FilaSplit(n: n, valor: fmtSplit(s, trabajo?.maquina), juicio: juicioDe(v).map { JuicioVuelta(texto: $0.texto, fuera: $0.fuera) })
            }
            return FilaSplit(n: n, valor: fmtReloj(v.segundos), detalle: v.ppm.map { "\(num($0)) ppm" },
                             juicio: juicioDe(v).map { JuicioVuelta(texto: $0.texto, fuera: $0.fuera) })
        }
        let p = e.paso
        let cuenta = p.posicion?.serie ?? p.posicion?.tramo
        let enCurso: FilaSplit? = (p.rol == .trabajo && p.clase == .ergo) ? cuenta.map { FilaSplit(n: String($0.n), valor: fmtReloj(e.lecturas.t), detalle: palabraAhora) } : nil
        let titulo = (porSplit && o != nil) ? ["Series", fmtObjetivo(o!, trabajo?.maquina)] : ["Tramos"]
        return PaginaVueltasMuneca(titulo: titulo, enCurso: enCurso, filas: enCurso != nil ? Array(filas.prefix(3)) : filas,
                                   vacia: (filas.isEmpty && enCurso == nil) ? "Aún ninguna" : nil)
    }

    /// Los Datos del ergo: el tiempo, los metros que se movieron (de máquina y corridos), el /500 medio y el pulso.
    static func filasDeDatosErgo(_ e: EstadoVivo, _ l: Lecturas) -> [FilaDatoVista] {
        let maquina = e.pasos.first { $0.maquina != nil }?.maquina
        var filas = [FilaDatoVista(valor: fmtReloj(e.sesion.t), unidad: "total")]
        let metros = (e.sesion.metros ?? 0) + e.sesionErgoM
        if metros > 0 { filas.append(FilaDatoVista(valor: String(Int(metros.rounded())), unidad: "m")) }
        // El /500 medio de lo trabajado: las recuperaciones no reman.
        let conMetros = e.vueltas.filter { ($0.metros ?? 0) > 0 && $0.eje == .split500 }
        let metrosMedios = conMetros.reduce(0) { $0 + ($1.metros ?? 0) }
        if metrosMedios > 0 {
            let medio = conMetros.reduce(0) { $0 + $1.segundos } * 500 / metrosMedios
            filas.append(FilaDatoVista(valor: fmtSplit(medio, maquina), unidad: "\(unidadSplit(maquina)) medio"))
        }
        let ppm = l.viejo(.ppm) ? nil : l.ppm
        filas.append(FilaDatoVista(valor: ppm.map { String(Int($0.rounded())) } ?? "—", unidad: "ppm", ppm: ppm,
                                   zona: (ppm != nil && e.zonas != nil) ? zonaVista(ppm!, e.zonas!) : nil, glifo: true))
        return filas
    }
}
