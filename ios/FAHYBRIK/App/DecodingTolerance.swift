import Foundation

// AUDIT-B3 — decode-tolerance helpers so a backend shape change (a field gone null, a
// malformed row in a list) degrades gracefully instead of throwing and blanking a whole
// screen. Applied ONLY where the audit found real fragility; the shape the server ALWAYS
// sends stays required — this is not a licence to optionalize everything.
//
// The array-lossy wrapper `@LossyArray` already exists (Plan/AssignmentDetail.swift — the
// canonical no-infinite-loop pattern), Codable + Equatable. Here we ADD the Hashable
// conformance some response bundles need, two scalar defaults, and ABSENT-KEY tolerance
// for all three (a missing key would otherwise throw before the wrapper's own init runs).

/// `@LossyArray` is Hashable when its element is — several response bundles that use it
/// (CarrerasOverview, RunningAnalysis) are Hashable. Explicit `hash(into:)` because
/// synthesis can't cross the file that declares the struct.
extension LossyArray: Hashable where Element: Hashable {
    func hash(into hasher: inout Hasher) { hasher.combine(wrappedValue) }
}

/// A string that decodes to "" when the wire value is null (present-but-null).
@propertyWrapper
struct DefaultEmptyString: Codable, Equatable, Hashable {
    var wrappedValue: String
    init(wrappedValue: String = "") { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        wrappedValue = (try? decoder.singleValueContainer().decode(String.self)) ?? ""
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}

/// A Bool that decodes to false when the wire value is null.
@propertyWrapper
struct DefaultFalse: Codable, Equatable, Hashable {
    var wrappedValue: Bool
    init(wrappedValue: Bool = false) { self.wrappedValue = wrappedValue }
    init(from decoder: Decoder) throws {
        wrappedValue = (try? decoder.singleValueContainer().decode(Bool.self)) ?? false
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        try c.encode(wrappedValue)
    }
}

// Absent-key tolerance: a MISSING key would make the synthesized parent decode throw
// before the wrapper runs — supply the wrapper's default instead. `try?` also covers a
// present-but-wrong-TYPE value (e.g. a list arriving as a string). `throws` on the
// signature matches the synthesized `try container.decode(…)` call site; it never throws.
extension KeyedDecodingContainer {
    func decode<E>(_ type: LossyArray<E>.Type, forKey key: Key) throws -> LossyArray<E> {
        ((try? decodeIfPresent(LossyArray<E>.self, forKey: key)) ?? nil) ?? LossyArray(wrappedValue: [])
    }
    func decode(_ type: DefaultEmptyString.Type, forKey key: Key) throws -> DefaultEmptyString {
        ((try? decodeIfPresent(DefaultEmptyString.self, forKey: key)) ?? nil) ?? DefaultEmptyString()
    }
    func decode(_ type: DefaultFalse.Type, forKey key: Key) throws -> DefaultFalse {
        ((try? decodeIfPresent(DefaultFalse.self, forKey: key)) ?? nil) ?? DefaultFalse()
    }
}
