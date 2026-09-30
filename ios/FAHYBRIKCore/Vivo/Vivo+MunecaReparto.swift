import Foundation

// EL REPARTO DE LA MUÑECA POR FAMILIA — qué cara y qué páginas lleva cada familia (`Vivo.familiaMuneca`).
// Es UNA función por pregunta y cada una decide con `familia`, en un sitio: `cuadroMuneca` no distingue
// familias, solo junta lo que estas dicen. Lo que cada familia pone (sus caras, sus filas de Datos, su Ruta)
// vive en su fichero: `Vivo+MunecaFuerza`, `+MunecaErgo`, `+MunecaWod`, `+MunecaCircuito`, `+MunecaDobles`.

extension Vivo {

    // MARK: - La cara

    /// Qué cara pinta el paso vivo. Cada familia trae las suyas; lo demás es la cara de siempre (el paso a su
    /// objetivo). `nil` de una familia = «esto es lo común» (una recuperación, un descanso).
    static func caraDeMuneca(_ e: EstadoVivo, _ l: Lecturas, _ lam: Lamina, _ a: AnotarMuneca, _ x: EntornoMuneca,
                             familia: FamiliaMuneca?, wod w: EstadoWod) -> CaraMuneca {
        let p = e.paso
        let m = x.medidas
        if e.terminado { return .completada }
        switch familia {
        case .relevo?: return .paso(caraRelevo(e, l, m, accion: x.accion))
        case .wod?: if let c = caraWod(e, l, lam, w, x) { return c }
        case .circuito?: if let c = caraCircuito(e, l, lam, x) { return c }
        default: break
        }
        if p.rol == .recuperacion { return .recupera(caraRecupera(e, l, lam, x)) }
        if p.rol == .descanso {
            if let anota = caraDeAnotar(e, l, a, m) { return anota }
            let deFuerza = anteriorTrabajo(e.pasos, e.i).map { esFuerza(e.pasos[$0]) } ?? false
            return .descanso(caraDescanso(e, l, m, viene: deFuerza ? vieneDe(e.pasos, e.i, a.registro, m) : nil))
        }
        if p.rol == .transicion, p.clase == .fuerza, let c = caraColocate(e, l, a, m, accion: x.accion) { return .colocate(c) }
        if p.rol == .trabajo, esFuerza(p), let c = caraSerie(e, l, a, m, accion: x.accion) { return .serie(c) }
        if esErgoMuneca(p) { return .paso(caraErgo(e, l, lam, m, accion: x.accion)) }
        return .paso(caraPaso(lam, e, l, m))
    }

    // MARK: - Las páginas de la corona

    /// Las páginas que la corona recorre: correr, Paso → Datos → Vueltas → Estructura; fuerza, Serie → Ejercicios →
    /// Datos; ergo, Paso → Series → Datos → Estructura; el WOD y el circuito, las suyas. Con un dato enfocado o en la
    /// campana de un AMRAP, solo Paso: la corona es de ese dato.
    static func paginasDeLaCorona(_ e: EstadoVivo, familia: FamiliaMuneca?, corona: CampoAnotar?, puntuacion: Bool) -> [PaginaMuneca] {
        if corona != nil || puntuacion { return [.paso] }
        switch familia {
        case .fuerza?: return [.paso, .ejercicios, .datos]
        case .ergo?: return hayPaginaDeSeriesErgo(e) ? [.paso, .vueltas, .datos, .estructura] : [.paso, .datos, .estructura]
        case .wod?: return paginasDeWod(e.paso)
        case .circuito?: return [.paso, .estructura, .datos]
        case .relevo?: return [.paso, .datos]
        default: return [.paso, .datos, .vueltas, .estructura]
        }
    }

    // MARK: - Las tres páginas

    static func paginaDatosDeMuneca(_ e: EstadoVivo, _ l: Lecturas, _ familia: FamiliaMuneca?, _ a: AnotarMuneca, _ w: EstadoWod, _ m: MedidasMuneca) -> PaginaDatosMuneca {
        switch familia {
        case .fuerza?: return paginaDatosFuerza(e, a, l, m)
        case .ergo?: return PaginaDatosMuneca(titulo: ["Sesión"], filas: filasDeDatosErgo(e, l))
        case .wod?, .relevo?: return PaginaDatosMuneca(titulo: ["Sesión"], filas: filasDeDatosWod(e, l, w))
        case .circuito?: return PaginaDatosMuneca(titulo: ["Sesión"], filas: filasDeDatosCircuito(e, l))
        default: return PaginaDatosMuneca(titulo: ["Sesión"], filas: filasDeDatos(e.sesion, l, zonas: e.zonas, fuente: e.paso.entorno == .cinta ? "cinta" : nil))
        }
    }

    static func paginaVueltasDeMuneca(_ e: EstadoVivo, _ familia: FamiliaMuneca?, _ registro: RegistroVueltas, _ w: EstadoWod) -> PaginaVueltasMuneca {
        if familia == .ergo { return paginaVueltasErgo(e) }
        if familia == .wod, let pagina = paginaVueltasWod(e, w) { return pagina }
        let (objetivo, enCurso) = vueltaEnCurso(e, registro: registro)
        let v = filasDeVueltas(e.vueltas + registro.vueltas, objetivo: objetivo, visibles: enCurso != nil ? 4 : 5)
        return PaginaVueltasMuneca(titulo: v.titulo, enCurso: enCurso, filas: v.filas, vacia: (v.filas.isEmpty && enCurso == nil) ? "Aún ninguna" : nil)
    }

    static func paginaEstructuraDeMuneca(_ e: EstadoVivo, _ familia: FamiliaMuneca?) -> PaginaEstructuraMuneca {
        if familia == .circuito, let ruta = paginaRutaDelCircuito(e) { return ruta }
        if familia == .wod, let pagina = paginaTareasDelAmrap(e.paso) { return pagina }
        let filas = estructuraDe(e.pasos, i: e.i).map { f -> FilaLista in
            let t = textoFila(f)
            return FilaLista(linea: t.linea, detalle: t.detalle, estado: f.estado)
        }
        return PaginaEstructuraMuneca(titulo: ["Estructura"], filas: ventanaDeLista(filas))
    }

    // MARK: - El aviso de deshacer

    /// Lo que dice el aviso al cerrar a mano: el del circuito (la carrera es «Run 3 cerrado»), el de lo que marca
    /// el WOD («Ronda 4 anotada», «Bench Press hecho») o el de siempre.
    static func avisoDelCierre(_ p: Paso, wod w: EstadoWod) -> String {
        if let f = p.circuito { return avisoCircuito(p, f) }
        return avisoWod(p, ronda: (w.rondas[p.id]?.count ?? 0) + 1) ?? avisoDeCierre(p)
    }
}
