import Foundation

// LAS CARAS DE LA SERIE DE FUERZA (P11) — el nombre del ejercicio PRIMERO (A1/A2 en
// superserie), la serie k/K, las reps (o la cuenta del sensor, o la cuenta atrás de una
// isometría), la carga y el esfuerzo —los dos ejes de la dosis—, la acción del momento y lo
// que viene. Espejo de `screens/reloj-fuerza/caras.tsx`. La vista solo pinta lo que sale aquí.
//
//   CaraSerie     la serie en curso.
//   CaraColocate  el paso corto antes de una isometría que no sale de un descanso.
//   CaraCuenta    el 3-2-1 / GO con el nombre y la dosis que está en la barra (la carga
//                 declarada, en cascada): `caraCuentaFuerza`.
//
// Presupuesto vertical: el héroe se queda lo que sobra. Si una fila no cabe sin bajar el héroe
// de `heroeMinimoSerie`, se cae la de menos prioridad: primero el cue, luego se funden la carga y el
// esfuerzo en una línea, luego la pista de la acción y por último «Luego ·».

extension Vivo {

    // MARK: - El nombre del ejercicio: una línea si cabe bajo las esquinas; si no, dos

    struct NombreMedido: Equatable {
        /// Ya con el hueco de la superserie delante de la primera línea.
        var lineas: [String]
        var slot: String?
        var cuerpo: Double
        var alto: Double
    }

    /// El héroe de una serie no baja de aquí (alto de caja en pt: ≈ 45 pt de cuerpo).
    static let heroeMinimoSerie: Double = 38

    /// Los cuerpos a los que baja el nombre, del mayor al menor; el último recurso (17 pt) parte por donde sea.
    private static let cuerposNombre: [Double] = [22, 20, 18]
    private static let cuerpoNombreMinimo: Double = 17

    private static func partirNombre(_ texto: String, _ c: Double) -> (String, String)? {
        let w = texto.split(separator: " ").map(String.init)
        var mejor: (String, String)? = nil
        var peor = Double.infinity
        guard w.count > 1 else { return nil }
        for k in 1..<w.count {
            let a = w[..<k].joined(separator: " ")
            let b = w[k...].joined(separator: " ")
            if a.hasSuffix("·") || b.hasPrefix("·") { continue }
            let m = Swift.max(anchoTexto(a, c), anchoTexto(b, c))
            if m < peor { peor = m; mejor = (a, b) }
        }
        return mejor
    }

    /// Cómo va el nombre: la primera fila cabe bajo las esquinas de arriba (`anchoCabeza`).
    static func medirNombre(slot: String?, nombre: String, _ m: MedidasMuneca) -> NombreMedido {
        let texto = slot.map { "\($0) · \(nombre)" } ?? nombre
        for c in cuerposNombre.prefix(2) where anchoTexto(texto, c) <= m.anchoCabeza {
            return NombreMedido(lineas: [texto], slot: slot, cuerpo: c, alto: Fila.instruccion.alto)
        }
        for c in cuerposNombre {
            if let par = partirNombre(texto, c), anchoTexto(par.0, c) <= m.anchoCabeza, anchoTexto(par.1, c) <= m.anchoUtil {
                return NombreMedido(lineas: [par.0, par.1], slot: slot, cuerpo: c, alto: 2 * (c * interlineaEnDos).rounded())
            }
        }
        let par = partirNombre(texto, cuerpoNombreMinimo)
        return NombreMedido(lineas: par.map { [$0.0, $0.1] } ?? [texto], slot: slot, cuerpo: cuerpoNombreMinimo, alto: 2 * 19)
    }

    // MARK: - La serie

    struct CaraSerie: Equatable {
        var nombre: NombreMedido
        /// «Serie 2/4 · 20″ · por pierna · cuenta el reloj» (o «lo dices tú»), en tinta2.
        var posicion: LineaTexto
        var heroe: HeroeMuneca
        /// «121–131 kg · 65–70 % RM», «carga tuya · última 140 kg».
        var carga: LineaTexto?
        /// «RIR 3 · tempo 3-1-1».
        var esfuerzo: LineaTexto?
        var cue: NotaVista?
        /// «doble toque · serie hecha»; en un reloj bajo cae, y con él «Luego ·», antes que el héroe.
        var pista: NotaVista?
        var luego: NotaVista?
    }

    /// «Serie 2/4 · 20″ · por pierna · cuenta el reloj». Quién cuenta las reps, siempre dicho: el sensor o el atleta.
    private static func partesPosicionSerie(_ p: Paso) -> [String] {
        var partes = [quienSerie(p)]
        if p.medida.tipo == .tiempo { partes.append(fmtDuracion(p.medida.prescrito ?? 0)) }
        if let lado = p.fuerza?.porLado { partes.append("por \(lado.rawValue)") }
        if p.medida.tipo == .reps { partes.append(p.medida.mide == .sensor ? "cuenta el reloj" : "lo dices tú") }
        return partes
    }

    /// La línea de la carga: «121–131 kg · 65–70 % RM», «127,5 kg · 65–70 % RM», «carga tuya · última 140 kg».
    static func textoLineaCarga(_ f: FichaFuerza, arrastrada: Double?) -> String? {
        guard let kg = textoCarga(f, arrastrada: arrastrada) else { return nil }
        if let pct = textoPct(f.carga), kg != pct { return "\(kg) · \(pct)" }
        return kg
    }

    /// El héroe de la serie: la cuenta atrás de una isometría, la cuenta del sensor (el 0 es medido, no
    /// inventado) o las reps que toca hacer.
    static func heroeDeSerie(_ p: Paso, _ l: Lecturas) -> HeroeVista {
        let reps = p.medida.prescrito ?? 0
        if p.medida.tipo == .tiempo { return HeroeVista(clase: .falta, texto: fmtReloj((faltaDe(p, l) ?? 0).rounded(.up)), etiqueta: "quedan") }
        if p.medida.mide == .sensor { return HeroeVista(clase: .crono, texto: String(Int(l.hecho ?? 0)), unidad: "/ \(Int(reps))") }
        return HeroeVista(clase: .crono, texto: String(Int(reps)), unidad: "reps")
    }

    private static func altoDeNota(_ n: NotaVista) -> Double { filaDeNota(n).alto }

    /// El héroe con un alto ya calculado (las caras de fuerza llevan filas de alto propio, como el nombre en dos líneas).
    static func heroeConAlto(_ h: HeroeVista, alto: Double, _ m: MedidasMuneca) -> HeroeMuneca {
        let libre = alto - (h.etiqueta != nil ? Fila.etiquetaHeroe.alto : 0)
        return HeroeMuneca(vista: h, talla: tallaHeroe(h.texto, unidad: h.unidad, ancho: m.anchoHeroe, altoMax: libre), altoMax: libre)
    }

    static func caraSerie(_ e: EstadoVivo, _ l: Lecturas, _ a: AnotarMuneca, _ m: MedidasMuneca, accion: FilaDeAccion) -> CaraSerie? {
        let p = e.paso
        guard let f = p.fuerza else { return nil }
        let nombre = medirNombre(slot: p.posicion?.slot, nombre: p.nombre ?? "", m)
        let posicion = contextoQueCabe(partesPosicionSerie(p), m)
        var carga = textoLineaCarga(f, arrastrada: cargaArrastrada(e.pasos, e.i, a.registro)).map { instruccionQueCabe($0, m) }
        var partesEsfuerzo: [String] = []
        if let ef = f.esfuerzo { partesEsfuerzo.append(textoEsfuerzo(ef)) }
        if let t = p.tempo { partesEsfuerzo.append("tempo \(textoTempo(t))") }
        var esfuerzo: LineaTexto? = partesEsfuerzo.isEmpty ? nil : contextoQueCabe(partesEsfuerzo, m)
        // Espacios que no parten: si el cue va en dos líneas, «Coach ·» no se queda solo.
        var cue: NotaVista? = (esfuerzo == nil ? p.cue : nil).map { notaVista("Coach\u{00A0}·\u{00A0}\($0)", ancho: m.anchoUtil) }
        var pista: NotaVista? = notaVista("doble toque · serie hecha", ancho: m.anchoUtil)
        var luego = textoLuego(e.pasos, e.i).map { notaVista($0, prefijo: "Luego ·", ancho: m.anchoPie) }

        func alto() -> Double {
            altoLibre([
                nombre.alto,
                Fila.contexto.alto,
                carga.map(altoDeInstruccion) ?? -huecoFila,
                esfuerzo != nil ? Fila.contexto.alto : -huecoFila,
                cue.map(altoDeNota) ?? -huecoFila,
                accion == .pista ? pista.map(altoDeNota) ?? -huecoFila : Fila.boton.alto,
                luego.map(altoDeNota) ?? -huecoFila,
            ], m)
        }
        if alto() < heroeMinimoSerie { cue = nil }
        // Con el nombre en dos líneas no caben los dos ejes en dos filas: van en una («carga tuya · RIR 3»).
        if alto() < heroeMinimoSerie, let c = carga, let ef = esfuerzo {
            carga = instruccionQueCabe([c.texto, ef.texto].joined(separator: " · "), m)
            esfuerzo = nil
        }
        // Un reloj bajo: lo que cierra la cara cae antes que el héroe. Primero la pista de texto (la mano ya sabe cerrar la
        // serie: no puede ser la última fila, las esquinas se la comen) y luego «Luego ·».
        if alto() < heroeMinimoSerie, accion == .pista { pista = nil }
        if alto() < heroeMinimoSerie { luego = nil }

        return CaraSerie(nombre: nombre, posicion: posicion, heroe: heroeConAlto(heroeDeSerie(p, l), alto: alto(), m),
                         carga: carga, esfuerzo: esfuerzo, cue: cue, pista: pista, luego: luego)
    }

    // MARK: - Colócate

    struct CaraColocate: Equatable {
        var contexto: LineaTexto
        var nombre: NombreMedido
        /// «Serie 1/3 · 20″».
        var dosis: LineaTexto
        var heroe: HeroeMuneca
        /// «doble toque · empezar ya»; en un reloj bajo cae, y con él el pulso, antes que el héroe.
        var pista: NotaVista?
        /// El pulso, monocromo, en la fila de abajo (solo con la acción en pista).
        var pulso: LineaDeDato?
    }

    /// «Colócate»: la cuenta atrás corta antes de una serie por tiempo que no viene de un descanso. `siguiente`
    /// es la serie a la que entra. Monocromo, como todo lo que no es trabajo.
    static func caraColocate(_ e: EstadoVivo, _ l: Lecturas, _ a: AnotarMuneca, _ m: MedidasMuneca, accion: FilaDeAccion) -> CaraColocate? {
        guard let s = e.siguiente, s.fuerza != nil else { return nil }
        let p = e.paso
        let nombre = medirNombre(slot: s.posicion?.slot, nombre: s.nombre ?? "", m)
        let falta = faltaDe(p, l)
        let pista = notaVista("doble toque · empezar ya", ancho: m.anchoUtil)
        var pulso = lineaPulso(p, l, nil, e.reglas)
        pulso.zona = nil
        let conPulso = accion == .pista
        var filas = [
            FilaAjustable(papel: .contexto, alto: Fila.contexto.alto),
            FilaAjustable(papel: .titulo, alto: nombre.alto),
            FilaAjustable(papel: .dosis, alto: Fila.contexto.alto),
            FilaAjustable(papel: .pista, alto: accion == .pista ? filaDeNota(pista).alto : Fila.boton.alto, cede: 3),
        ]
        if conPulso { filas.append(FilaAjustable(papel: .pulso, alto: Fila.tercero.alto, cede: 2)) }
        let heroe = HeroeVista(clase: .falta, texto: falta.map { String(Int($0.rounded(.up))) } ?? "—", unidad: "s")
        let (ajuste, heroeMedido) = ajustarConHeroe(filas, heroe: heroe, m)
        return CaraColocate(
            contexto: contextoQueCabe(["Colócate"], m),
            nombre: nombre,
            dosis: contextoQueCabe([quienSerie(s), dosisSerie(s, arrastrada: nil)], m),
            heroe: heroeMedido,
            pista: ajuste.queda(.pista) ? pista : nil,
            pulso: conPulso && ajuste.queda(.pulso) ? lineaDeDato(pulso, cuerpo: TipoMuneca.tercero, ancho: m.anchoPie) : nil
        )
    }

    // MARK: - El 3-2-1 y el GO de una serie

    /// El 3-2-1 o el GO de una serie: el nombre, su dosis con la carga que está en la barra y el número.
    static func caraCuentaFuerza(_ n: Int, _ p: Paso, arrastrada: Double?, _ m: MedidasMuneca) -> CaraCuenta {
        let nombre = medirNombre(slot: p.posicion?.slot, nombre: p.nombre ?? "", m)
        let alto = altoLibre([nombre.alto, Fila.contexto.alto], m)
        let numero = HeroeVista(clase: .crono, texto: n > 0 ? String(n) : "GO")
        return CaraCuenta(contexto: contextoQueCabe([quienSerie(p), dosisSerie(p, arrastrada: arrastrada)], m), que: nil,
                          numero: heroeConAlto(numero, alto: alto, m), nombre: nombre)
    }
}
