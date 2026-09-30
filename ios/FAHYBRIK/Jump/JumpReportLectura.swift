import Foundation

// LA LECTURA DEL INFORME DE SALTO — lo que la pantalla pinta, ya decidido a partir del `CmjReportDTO`.
//
// El informe de una ocurrencia no es «tres cifras en un diálogo»: es identidad → explosivo → respuesta a la
// carga → LRI → lectura → instantánea. Qué bloques hay y qué cifras llevan se decide aquí, en un tipo puro
// (`JumpReportLecturaTests`); la vista solo los traduce al kit.
//
// HONESTIDAD (CONTRATO-UI §7). Lo que el informe no sabe no se pinta: sin serie cargada no hay bloque de
// carga ni LRI, y una métrica que falta (la carga relativa, cuando no hay peso corporal) no sale como un
// guion — no sale. Las escalas vacías (el informe corto que se arma al guardar) no ofrecen «ver la escala».

struct LecturaInformeSalto: Equatable {
    let titulo: String
    /// «2 jul». Nil si el informe no trae fecha.
    let fecha: String?
    let altura: Altura
    /// Nil sin serie cargada.
    let carga: Carga?
    let lectura: String
    /// «Peso 76 kg · 3 intentos · se queda 47 cm». Nil si no hay nada que decir.
    let pie: String?
    let escalaDeAltura: EscalaDeSalto?
    let escalaDeLri: EscalaDeSalto?

    struct Altura: Equatable {
        let cm: Int
        let nivel: Int
        /// «Nivel 3 de 5 · Media».
        let frase: String
    }

    struct Carga: Equatable {
        /// «Con carga · 15 kg».
        let titulo: String
        let cm: Int
        /// «Nivel 4 de 5». Nil si el servidor no lo manda.
        let nivel: String?
        let metricas: [Metrica]
        let lri: Lri?
    }

    struct Metrica: Equatable, Identifiable {
        let rotulo: String
        let valor: String
        var id: String { rotulo }
    }

    struct Lri: Equatable {
        /// «0,85».
        let valor: String
        let nivel: Int?
        /// «Correcta · nivel 3 de 5».
        let frase: String?
    }

    static func desde(_ r: CmjReportDTO) -> LecturaInformeSalto {
        let cargaCm = r.loadedCm
        return LecturaInformeSalto(
            titulo: r.title,
            fecha: r.dateLabel.flatMap { $0.isEmpty ? nil : fechaCorta($0) },
            altura: Altura(
                cm: Int(r.unloadedCm.rounded()),
                nivel: r.heightLevel,
                frase: frase(nivel: r.heightLevel, etiqueta: r.heightLabel)
            ),
            carga: cargaCm.map { cm in
                Carga(
                    titulo: r.loadKg.map { "Con carga · \(Int($0.rounded())) kg" } ?? "Con carga",
                    cm: Int(cm.rounded()),
                    nivel: r.loadedHeightLevel.map { "Nivel \($0) de 5" },
                    metricas: [
                        r.dropAbsCm.map { Metrica(rotulo: "Caída", valor: JumpPhysics.displayCm($0)) },
                        r.dropRel.map { Metrica(rotulo: "Relativa", valor: porcentaje($0)) },
                        r.loadRel.map { Metrica(rotulo: "Carga / peso", valor: porcentaje($0)) },
                    ].compactMap { $0 },
                    lri: r.lri.map { lri in
                        Lri(
                            valor: ResumenDeSalto.textoLri(lri),
                            nivel: r.lriLevel,
                            frase: r.lriLabel.map { etiqueta in
                                r.lriLevel.map { "\(etiqueta) · nivel \($0) de 5" } ?? etiqueta
                            }
                        )
                    }
                )
            },
            lectura: r.lectura,
            pie: pie(r),
            escalaDeAltura: EscalaDeSalto.de(titulo: "Escala de altura", bandas: r.heightScale),
            escalaDeLri: cargaCm == nil ? nil : EscalaDeSalto.de(titulo: "Escala de respuesta a la carga", bandas: r.lriScale)
        )
    }

    /// «Nivel 3 de 5 · Media». El informe corto (`thin`) llama a su etiqueta «Nivel 3»: no se repite.
    static func frase(nivel: Int, etiqueta: String) -> String {
        let base = "Nivel \(nivel) de 5"
        return etiqueta.hasPrefix("Nivel") || etiqueta.isEmpty ? base : "\(base) · \(etiqueta)"
    }

    static func porcentaje(_ r: Double) -> String { "\(Int((r * 100).rounded())) %" }

    /// «Peso 76 kg · 3 intentos · se queda 47 cm».
    static func pie(_ r: CmjReportDTO) -> String? {
        var partes: [String] = []
        if let kg = r.bodyMassKg { partes.append("Peso \(Int(kg.rounded())) kg") }
        if !r.attempts.isEmpty { partes.append("\(r.attempts.count) intentos · se queda \(JumpPhysics.displayCm(r.unloadedCm))") }
        return partes.isEmpty ? nil : partes.joined(separator: " · ")
    }

    /// «2 jul» desde un ISO «YYYY-MM-DD…»; el texto tal cual si no se puede leer (jamás se adivina).
    static func fechaCorta(_ raw: String) -> String {
        FechaES.corta(String(raw.prefix(10))) ?? raw
    }
}

/// Una escala de niveles del informe (altura o LRI), con sus cortes tal como los manda el coach.
struct EscalaDeSalto: Equatable {
    let titulo: String
    let bandas: [CmjScaleBandDTO]

    /// Nil si no hay bandas: sin escala no hay «ver la escala».
    static func de(titulo: String, bandas: [CmjScaleBandDTO]) -> EscalaDeSalto? {
        bandas.isEmpty ? nil : EscalaDeSalto(titulo: titulo, bandas: bandas)
    }
}
