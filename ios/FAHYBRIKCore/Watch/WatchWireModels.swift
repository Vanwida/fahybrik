import Foundation
import HealthKit

// MARK: - Watch ⇄ iPhone wire models (THE single shared transport shape)
//
// Compiled into BOTH the iPhone (FAHYBRIK) and watch (FAHYBRIKWatch) targets, so
// the day's session + readiness (iPhone → Watch) and the finished execution
// (Watch → iPhone) are described in exactly ONE place. Before this, the iOS
// service and the watch plan model each hand-maintained a mirror struct that
// silently drifted; there is now no second definition to keep in sync.
//
// TRANSPORT
//   iPhone → Watch : the encoded `WatchTodayPayload` is placed as a single `Data`
//                    value under `WatchWireKeys.today` in the WCSession
//                    applicationContext (overwrite semantics — always "today").
//   Watch → iPhone : the encoded `WatchExecutionEnvelope` is placed under
//                    `WatchWireKeys.executionResult` in a WCSession
//                    transferUserInfo (queued across launches / reachability).

/// iPhone → Watch: today's session (or a genuine rest day) + readiness. Encoded as
/// JSON `Data` inside the WCSession applicationContext under `WatchWireKeys.today`.
///
/// `dayKind` splits the two shapes the wrist must render: on a `.session` day the
/// assignment fields (id / title / activityKind) are present and the watch can run
/// the workout; on a `.rest` day they are all nil — the athlete still glances the
/// readiness fields, so a rest day is a REAL push, never an empty/cleared context
/// (that is reserved for logout / no-data). See WatchConnectivityiOSService.
struct WatchTodayPayload: Codable, Equatable {
    let dayKind: String               // WatchDayKind.session | .rest
    let assignmentId: String?         // nil on rest days
    let title: String?                // nil on rest days
    let focus: String?
    let estDurationMinutes: Int?
    let intensityLabel: String?
    let activityKind: String?         // "running" | "strength" | "hyrox" | "mixed"; nil on rest days
    // The athlete's HR zones exactly as the SERVER resolved them. The wrist
    // classifies against these absolute bands — it never derives its own from a
    // max, which is how the watch used to tint a pulse one zone away from what
    // the phone recorded for the same beat. Nil = the athlete has no zones yet;
    // the wrist then shows the pulse with no zone rather than inventing one.
    // Optional so an older watch binary still decodes the payload.
    let athleteHrZones: HRZoneProfile?
    let readinessScore: Int?
    let readinessDelta7d: Int?
    let readinessWorstDriver: String? // e.g. "Sueño 6h 10m" — worst component, human label
    let isDone: Bool                  // true once execution landed; watch shows completed state
    let doneCompleteness: String?     // "full" | "partial" when isDone; nil otherwise
    let isDoubles: Bool               // true when this is a dobles-pair session (wrist logs it jointly)
    // #23 — dobles partner + sharing context for the wrist:
    //   partnerFirstName → the "DOBLES · con {nombre}" badge (brief + done) and the
    //                      "Compartir con {nombre}" copy. Nil → "tu compañero".
    //   partnerVisibility → the assignment's coach/athlete visibility ("shared" |
    //                      "self_only"). A self_only dobles session is PRIVATE: the
    //                      wrist never offers to share it (mirrors #22 hiding "Hacerla
    //                      juntos"). Optional so older phone/watch binaries decode.
    let partnerFirstName: String?     // nil on non-dobles / rest days
    let partnerVisibility: String?    // "shared" | "self_only"; nil on non-dobles
    let detailJson: Data?             // full AssignmentDetail JSON (verbatim API body) — watch builds WorkoutPlan from it
    /// El acento del club del atleta (o nil = naranja de fábrica). Embebido AQUÍ,
    /// no en una clave aparte del applicationContext: `updateApplicationContext`
    /// sustituye el diccionario ENTERO en cada envío, así que una clave separada
    /// exigiría la misma disciplina de "incluirla siempre" sin ahorrar nada — y
    /// viaja gratis en el mismo mecanismo de persistencia + arranque en frío que
    /// ya tiene `today` (WatchPlanModel). Ver ClubAccentPayload en iOS
    /// (ios/FAHYBRIK/Theme/ClubTheme.swift) — mismos tres hexes, ya resueltos.
    let clubAccent: WatchClubAccentPayload?
}

/// El acento del club, tal y como lo manda el teléfono al reloj — mismos hexes
/// que `ClubAccentPayload.fill/press/text` en iOS (sin `onFill`: el reloj no
/// tiene hoy ningún token de texto SOBRE el relleno naranja, así que no hay
/// nada que remapear). `nil` en cualquier campo nunca ocurre en la práctica
/// (el servidor solo emite un acento con los tres hexes ya resueltos), pero el
/// hex se valida igualmente al pintar — ver WatchTheme.
struct WatchClubAccentPayload: Codable, Equatable {
    let fill: String
    let press: String
    let text: String
}

/// The two day shapes a `WatchTodayPayload` carries. String-backed (not an enum
/// case) so it rides the wire verbatim through the plain coder both ends share.
enum WatchDayKind {
    static let session = "session"
    static let rest = "rest"
}

/// Watch → iPhone: finished execution. Encoded as JSON `Data` inside the WCSession
/// transferUserInfo under `WatchWireKeys.executionResult`.
struct WatchExecutionEnvelope: Codable {
    let assignmentId: String
    let payloadJson: Data             // JSON-encoded WorkoutExecutionPayload (same DTO the phone posts)
    // #23 — the wrist's SHARE decision for a dobles session: true → log jointly
    // (link + share with the partner), false → log solo. Defaulted at finish from
    // the coach's partner_visibility (shared→true, self_only→false) and only the
    // athlete's summary toggle mutates it. Optional so an older watch binary (no
    // field) decodes and the phone falls back to its prior always-joint behavior.
    let shareWithPartner: Bool?
    /// EL CUPÓN DE LA TRAZA. La serie medida en la muñeca no cabe en este sobre —
    /// pesa cientos de KB y viaja como FICHERO por su propia cola. Las dos colas no
    /// se ordenan entre sí, así que este id local es lo que las vuelve a juntar en el
    /// teléfono: llegue antes el sobre o antes el fichero, el segundo cierra el par.
    /// Opcional para que un binario de reloj anterior siga decodificando (misma razón
    /// que `shareWithPartner`); nil = ese reloj no manda traza.
    var traceLocalId: String? = nil
}

/// Reloj → iPhone: la SERIE medida en la muñeca, como fichero.
///
/// Va por `transferFile` y no dentro del sobre por tamaño: una sesión de 90 min son
/// ~110 KB y Apple no publica ningún tope para `transferUserInfo`, así que meterla
/// ahí sería apostar contra un límite que no está escrito. `transferFile` es el que
/// Apple describe para «más que un diccionario de valores», encola en segundo plano
/// y no exige que el teléfono esté a tiro al enviar — que es justo el caso: salir a
/// correr con el reloj y dejar el teléfono en casa.
struct WatchTraceFile: Codable {
    /// El mismo id que viaja en `WatchExecutionEnvelope.traceLocalId`.
    let localId: String
    let traces: [WorkoutTraceDTO]
}

// MARK: - Calle o cinta, dicho y no adivinado

/// CALLE O CINTA, PARA HEALTHKIT. Una sola regla, porque hay dos sitios que arman una
/// sesión de reloj —el espejo desde el teléfono y la del reloj a solas— y si cada uno
/// decidiera por su cuenta acabarían midiendo la misma carrera de dos maneras.
///
/// POR QUÉ IMPORTA, Y NO ES COSMÉTICO. `locationType` es la pista con la que watchOS
/// decide si la distancia la MIDE con el GPS del reloj o la ESTIMA con el
/// acelerómetro. Dejarlo en `.unknown` —como estaba— entrega a una heurística una
/// decisión que casi siempre podemos responder con certeza, y una carrera por la calle
/// puede acabar con distancia de podómetro: peor ritmo, peores parciales, y un archivo
/// que miente sin avisar.
enum WorkoutLocationType {

    /// `environment` es la respuesta del atleta (calle/cinta) cuando la hay.
    ///
    /// CUANDO NO LA HAY, el defecto para correr es CALLE, y es deliberado: `.outdoor`
    /// enciende el GPS y, si no hay cobertura —bajo techo—, watchOS cae solo a la
    /// estimación del acelerómetro. `.indoor` en cambio PROHÍBE el GPS, así que
    /// equivocarse hacia ahí sí destruye la medida. Se paga algo de batería en una
    /// cinta y no se pierde ninguna carrera de calle.
    ///
    /// Lo que NO es este defecto: una respuesta. La buena es que la muñeca pregunte
    /// calle o cinta como ya hace el teléfono — eso es pantalla nueva y lo decide Alex.
    static func resolve(
        activityKind: String?,
        environment: RunEnvironment?
    ) -> HKWorkoutSessionLocationType {
        guard activityKind == "running" else { return .indoor }
        switch environment {
        case .treadmill, .indoor: return .indoor
        case .outdoor:            return .outdoor
        case nil:                 return .outdoor
        }
    }
}

// MARK: - Transport keys + limits

/// WCSession dictionary keys. Versioned so a future shape change can coexist with
/// an old watch/phone binary mid-rollout rather than silently mis-decoding.
enum WatchWireKeys {
    static let today = "today_v2"
    static let executionResult = "execution_result_v1"
    /// Clave de la metadata de `transferFile` que marca un fichero como TRAZA (el
    /// otro fichero que cruza este cable es el archivo inercial de sensores, que va
    /// con `execution_local_id`). Con esto el teléfono sabe a quién dárselo sin
    /// abrirlo ni adivinar por la extensión.
    static let traceLocalId = "trace_local_id_v1"
}

// MARK: - Coders (the single encode/decode contract, shared by both ends)

enum WatchWire {
    /// applicationContext has a ~65 KB practical ceiling; keep the encoded
    /// `WatchTodayPayload` comfortably under it. When the embedded detail pushes
    /// past this, the push drops `detailJson` and the watch falls back to the
    /// summary-only brief (it can still run a minimal session from the title).
    static let maxContextBytes = 60_000

    /// Coder for the WRAPPER payloads (`WatchTodayPayload` / `WatchExecutionEnvelope`)
    /// AND the embedded `WorkoutExecutionPayload`. PLAIN — no key strategy — used
    /// symmetrically on both ends. Deliberately NOT `.convertTo/FromSnakeCase`: that
    /// pair is not a clean inverse for a name like `readinessDelta7d`
    /// (`readiness_delta7d` decodes back to `readinessDelta7D`, silently dropping the
    /// field — the same asymmetry ReadinessService.swift documents). A plain coder
    /// keeps the wrappers' camelCase keys verbatim, and the execution DTO's ALREADY
    /// snake_case property names verbatim (they mirror the backend Zod schema, so the
    /// phone re-submits them through the exact DTO the live finish posts).
    static let encoder = JSONEncoder()
    static let decoder = JSONDecoder()

    /// Coder for the embedded `AssignmentDetail` ONLY. Its camelCase properties are
    /// decoded from a snake_case body via the app-wide `.convertFrom/ToSnakeCase`
    /// strategy (and its two digit-boundary trap keys are pinned with explicit
    /// CodingKeys, so it round-trips cleanly). This is the identical config
    /// `AssignmentDetailCache` uses, so the embedded body is byte-compatible with the
    /// phone's own on-disk cache.
    static let detailEncoder: JSONEncoder = {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }()
    static let detailDecoder: JSONDecoder = {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }()

    /// Remove every `exercise_video_url` from an encoded AssignmentDetail body — the
    /// watch never plays technique video, so the URLs are dead weight against the
    /// applicationContext ceiling. Shape-agnostic (walks the JSON tree, not the Swift
    /// model), and degrades to the original bytes on any serialization hiccup so a
    /// strip failure never blocks the push.
    static func strippingVideoURLs(from detailData: Data) -> Data {
        guard let object = try? JSONSerialization.jsonObject(with: detailData) else { return detailData }
        let pruned = removingKey("exercise_video_url", from: object)
        guard let out = try? JSONSerialization.data(withJSONObject: pruned) else { return detailData }
        return out
    }

    private static func removingKey(_ key: String, from value: Any) -> Any {
        if let dict = value as? [String: Any] {
            var copy: [String: Any] = [:]
            for (k, v) in dict where k != key {
                copy[k] = removingKey(key, from: v)
            }
            return copy
        }
        if let array = value as? [Any] {
            return array.map { removingKey(key, from: $0) }
        }
        return value
    }
}

// MARK: - Display helpers (kept next to the model so both watch views read one source)

extension WatchTodayPayload {
    // BORRADOS el 29-jul: `durationLabel` y `intensityDisplay`. Los dos devolvían
    // «—» cuando el dato no venía, que es exactamente lo que prohíbe el §7 del
    // contrato (lo que no se sabe NO se pinta, ni con guiones), y `durationLabel`
    // además escribía una cuarta grafía del mismo rato («1h 10m»). Ninguno tenía
    // llamantes — el reloj pinta su pastilla desde `estDurationMinutes` con
    // `Formato.duracionPrevista`, que es el canónico.

    /// The activity kind mapped to a HealthKit workout type for the wrist's live
    /// session. Lives HERE (next to the payload) so both the current brief and the
    /// teammate's new views read the same mapping. Mirrors the vocabulary the phone
    /// sends in `activityKind` ("running" | "strength" | "hyrox" | "mixed").
    var healthKitActivityType: HKWorkoutActivityType {
        switch activityKind {
        case "running"?:  return .running
        case "strength"?: return .functionalStrengthTraining
        case "hyrox"?:    return .functionalStrengthTraining
        case "mixed"?:    return .mixedCardio
        default:          return .other
        }
    }

    /// Calle o cinta para la sesión del reloj cuando la lleva ÉL solo. Ver
    /// `WorkoutLocationType.resolve`: en la muñeca no hay quien conteste esa pregunta,
    /// así que sale del valor por defecto declarado.
    var healthKitLocationType: HKWorkoutSessionLocationType {
        WorkoutLocationType.resolve(activityKind: activityKind, environment: nil)
    }

    /// A copy flagged as completed — the watch shows the finished state and the
    /// phone re-pushes this after a watch-originated execution lands. Carries the
    /// completeness ("full" | "partial") so the wrist tells "Sesión completada"
    /// apart from a partial. Everything else (including `detailJson`) is preserved
    /// so the session stays inspectable.
    func markingDone(completeness: String) -> WatchTodayPayload {
        with(isDone: true, doneCompleteness: completeness, detailJson: detailJson)
    }

    /// A copy WITHOUT the embedded detail — the size-cap fallback. The watch still
    /// gets the brief (title / focus / duration / readiness) and runs a minimal
    /// title-only session, re-fetching the full body on next open.
    func droppingDetail() -> WatchTodayPayload {
        with(isDone: isDone, doneCompleteness: doneCompleteness, detailJson: nil)
    }

    private func with(isDone: Bool, doneCompleteness: String?, detailJson: Data?) -> WatchTodayPayload {
        WatchTodayPayload(
            dayKind: dayKind,
            assignmentId: assignmentId,
            title: title,
            focus: focus,
            estDurationMinutes: estDurationMinutes,
            intensityLabel: intensityLabel,
            activityKind: activityKind,
            athleteHrZones: athleteHrZones,
            readinessScore: readinessScore,
            readinessDelta7d: readinessDelta7d,
            readinessWorstDriver: readinessWorstDriver,
            isDone: isDone,
            doneCompleteness: doneCompleteness,
            isDoubles: isDoubles,
            partnerFirstName: partnerFirstName,
            partnerVisibility: partnerVisibility,
            detailJson: detailJson,
            clubAccent: clubAccent
        )
    }

    // MARK: - Dobles display helpers (one source, read by brief / done / summary)

    /// Partner's display name, or a neutral fallback. Used in the badge and the
    /// "Compartir con {nombre}" copy.
    var partnerDisplayName: String {
        let trimmed = partnerFirstName?.trimmingCharacters(in: .whitespacesAndNewlines)
        return (trimmed?.isEmpty == false) ? trimmed! : "tu compañero"
    }

    /// The "DOBLES · con {nombre}" badge text, or nil when this isn't a dobles
    /// session (so the badge simply doesn't render).
    var doublesBadgeText: String? {
        guard isDoubles else { return nil }
        return "DOBLES · con \(partnerDisplayName)"
    }

    /// Whether the wrist may offer to SHARE this dobles result with the partner. A
    /// self_only session is private (never shared silently — #22), so the summary
    /// shows no share toggle and logs it solo. Non-dobles → never shareable.
    var isDoublesShareable: Bool {
        isDoubles && partnerVisibility?.lowercased() != "self_only"
    }
}
