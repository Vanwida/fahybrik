import Foundation

// LA CARA DE UNA FAMILIA CON RELOJ O DE CIRCUITO — el ensamblado común (P10, P12; espejo de las columnas de
// `screens/reloj-wod/caras-*.tsx` y `screens/reloj-circuito/caras.tsx`).
//
// Cada familia decide QUÉ dice cada fila (el contexto, el héroe, la tarea, lo que viene, la acción). Esta función
// las junta en una `CaraPaso` y le da al héroe lo que sobra de alto: cada fila que hay se declara UNA vez y su
// alto sale de la misma tabla que usa el resto de la muñeca (`Vivo.Fila`). Así ninguna familia hace la cuenta
// del espacio a mano y el héroe nunca pisa una fila.
//
// El orden en que se pintan las filas es el de `CaraPaso`: contexto, nota, título, dosis, total, héroe, banda,
// instrucción, bajo, «Luego», segundo, marcas, pista y el pulso, siempre la fila de abajo.

extension Vivo {

    /// Lo que una familia dice de un instante. Todo opcional menos el contexto y el héroe.
    struct PartesDeCara {
        var contexto: [String]
        var heroe: HeroeVista
        /// Honestidad o procedencia bajo el contexto («sin monitor · lo dices tú»).
        var nota: String? = nil
        /// El movimiento o la estación (22 pt), bajo el contexto.
        var titulo: String? = nil
        var dosis: String? = nil
        var total: LineaVista? = nil
        var instruccion: String? = nil
        var bajo: String? = nil
        /// «Luego ·» (o «Viene:») y lo que sigue.
        var luego: (prefijo: String, texto: String)? = nil
        var segundo: LineaVista? = nil
        var marcas: MarcasRonda? = nil
        /// La acción del momento, dicha corta: «hecho», «ronda hecha». `nil` = no hay (manda el reloj).
        var accion: String? = nil
        var pulso: LineaVista? = nil
    }

    static func caraDeFamilia(_ d: PartesDeCara, _ m: MedidasMuneca, accion: FilaDeAccion) -> CaraPaso {
        let nota = d.nota.map { notaVista($0, ancho: m.anchoUtil) }
        let dosis = d.dosis.map { notaVista($0, ancho: m.anchoUtil) }
        let bajo = d.bajo.map { notaVista($0, ancho: m.anchoUtil) }
        let luego = d.luego.map { notaVista($0.texto, prefijo: $0.prefijo, ancho: m.anchoUtil) }
        let pista = d.accion.map { notaVista("doble toque · \($0)", ancho: m.anchoUtil) }

        var filas: [Fila] = [.contexto]
        if let nota { filas.append(filaDeNota(nota)) }
        if d.titulo != nil { filas.append(.instruccion) }
        if let dosis { filas.append(filaDeNota(dosis)) }
        if d.total != nil { filas.append(.tercero) }
        if d.instruccion != nil { filas.append(.instruccion) }
        if let bajo { filas.append(filaDeNota(bajo)) }
        if let luego { filas.append(filaDeNota(luego)) }
        if d.segundo != nil { filas.append(.tercero) }
        if d.marcas != nil { filas.append(.pista) }
        if let pista { filas.append(accion == .boton ? .boton : filaDeNota(pista)) }
        if d.pulso != nil { filas.append(.tercero) }

        return CaraPaso(
            contexto: contextoQueCabe(d.contexto, m),
            nota: nota,
            heroe: heroeMuneca(d.heroe, filas: filas, m),
            instruccion: d.instruccion.map { instruccionQueCabe($0, m) },
            segundo: d.segundo.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoUtil) },
            tercero: d.pulso.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoPie) },
            pista: pista,
            titulo: d.titulo.map { instruccionQueCabe($0, m) },
            dosis: dosis,
            total: d.total.map { lineaDeDato($0, cuerpo: TipoMuneca.tercero, ancho: m.anchoUtil) },
            bajo: bajo,
            luego: luego,
            marcas: d.marcas
        )
    }

    /// El pulso sin la marca de su zona: la recuperación, el descanso y la campana no se tiñen (P6).
    static func pulsoMonocromo(_ p: Paso, _ l: Lecturas, _ e: EstadoVivo) -> LineaVista {
        var s = lineaPulso(p, l, e.zonas, e.reglas)
        s.zona = nil
        return s
    }

    /// El crono total, la puntuación de un For Time y de un circuito: «total 12:31», con el cap si lo hay.
    static func lineaTotal(_ t: Double, cap: Double? = nil) -> LineaVista {
        LineaVista(etiqueta: "total", valor: fmtReloj(t), unidad: cap.map { "· cap \(fmtDuracion($0))" })
    }

    /// El crono total del bloque del paso vivo: la sesión desde que empezó SU segmento, sin lo de antes (el
    /// calentamiento no puntúa). Se saca de los parciales, iguales en solitario y en espejo.
    static func totalDelBloque(_ e: EstadoVivo) -> Double {
        guard let s = e.paso.origen?.segmento, let primero = e.pasos.firstIndex(where: { $0.origen?.segmento == s }) else { return e.sesion.t }
        let antes = e.parciales.filter { $0.i < primero }.reduce(0) { $0 + $1.segundos }
        return Swift.max(0, e.sesion.t - antes)
    }

    /// La fila del pulso de la página Datos, con su zona.
    static func filaDePulso(_ e: EstadoVivo, _ l: Lecturas) -> FilaDatoVista {
        let ppm = l.viejo(.ppm) ? nil : l.ppm
        return FilaDatoVista(valor: ppm.map { String(Int($0.rounded())) } ?? "—", unidad: "ppm", ppm: ppm,
                             zona: (ppm != nil && e.zonas != nil) ? zonaVista(ppm!, e.zonas!) : nil, glifo: true)
    }
}
