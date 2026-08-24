import Foundation

// Cambiar el NÚMERO de series de un ejercicio en vivo. Reps y carga ya se podían
// ajustar serie a serie; el recuento no.
extension WorkoutSession {

    /// Se pueden quitar series mientras quede más de una y la que se quita no esté
    /// hecha: borrar trabajo registrado es otra cosa, y para eso está saltarla.
    func puedeQuitarSerie(_ index: Int) -> Bool {
        guard setRecords.indices.contains(index), setRecords.count > 1 else { return false }
        return !setRecords[index].confirmed
    }

    /// Una serie más, copiando la prescripción de la última: si el atleta añade
    /// una, la quiere igual que la que acaba de hacer.
    func anadirSerie() {
        guard !isFinished, let ultima = setRecords.last else { return }
        setRecords.append(SetRecord(
            setIndex: setRecords.count + 1,
            repsPrescribed: ultima.repsPrescribed,
            repsPrescribedMax: ultima.repsPrescribedMax,
            repsActual: ultima.repsPrescribed,
            loadPrescribedKg: ultima.loadPrescribedKg,
            loadActualKg: nil,
            rpe: nil,
            rir: nil,
            status: "done",
            confirmed: false,
            tempo: ultima.tempo,
            restS: ultima.restS,
            isApproach: false
        ))
        Haptics.light()
    }

    func quitarSerie(_ index: Int) {
        guard puedeQuitarSerie(index) else { return }
        // `setIndex` es constante, así que renumerar es reconstruir la fila con su
        // nuevo número. Sale más código y a cambio el número de una serie no puede
        // cambiar por debajo a nadie que ya la tenga en la mano.
        var quedan = setRecords
        quedan.remove(at: index)
        setRecords = quedan.enumerated().map { i, r in
            SetRecord(
                setIndex: i + 1,
                repsPrescribed: r.repsPrescribed,
                repsPrescribedMax: r.repsPrescribedMax,
                repsActual: r.repsActual,
                loadPrescribedKg: r.loadPrescribedKg,
                loadActualKg: r.loadActualKg,
                rpe: r.rpe,
                rir: r.rir,
                status: r.status,
                confirmed: r.confirmed,
                tempo: r.tempo,
                restS: r.restS,
                isApproach: r.isApproach
            )
        }
        Haptics.light()
    }
}
