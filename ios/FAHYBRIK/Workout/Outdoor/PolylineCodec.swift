import Foundation

/// A geographic point for route encoding — pure (no CoreLocation) so the codec is
/// unit-tested without a location stack. The live capture bridges
/// `CLLocationCoordinate2D` → `RoutePoint` at the call site.
struct RoutePoint: Equatable {
    let lat: Double
    let lon: Double
}

/// Google "Encoded Polyline Algorithm Format" at precision 5 — the de-facto standard
/// for a COMPACT run trace (≈1 m resolution at a fraction of the bytes of a JSON
/// array of coordinates). Pure + deterministic: encode/decode round-trip to the
/// stored precision. Used to ship an outdoor run's GPS trace in the execution payload
/// (#64) and render it back on the athlete's session detail. The web side keeps a
/// byte-for-byte twin so the trace decodes identically server-side.
enum PolylineCodec {
    /// Coordinate scaling for precision 5 (1e5) — five decimals ≈ 1.1 m at the
    /// equator, the resolution the standard pins and the backend stores.
    static let precision: Double = 1e5

    /// Encode an ordered coordinate list to the compact polyline string. Deltas are
    /// taken from the previous point (starting at 0,0), zig-zag encoded and chunked
    /// into 5-bit groups — so a dense-but-nearby trace stays tiny.
    static func encode(_ points: [RoutePoint]) -> String {
        var out = ""
        out.reserveCapacity(points.count * 6)
        var prevLat = 0
        var prevLon = 0
        for p in points {
            let lat = Int((p.lat * precision).rounded())
            let lon = Int((p.lon * precision).rounded())
            appendValue(lat - prevLat, to: &out)
            appendValue(lon - prevLon, to: &out)
            prevLat = lat
            prevLon = lon
        }
        return out
    }

    /// Decode a polyline string back to coordinates. A truncated trailing value (a
    /// corrupt tail) is dropped rather than throwing — a partial trace still renders.
    static func decode(_ encoded: String) -> [RoutePoint] {
        let scalars = Array(encoded.unicodeScalars)
        var points: [RoutePoint] = []
        var index = 0
        var lat = 0
        var lon = 0
        while index < scalars.count {
            guard let dLat = nextValue(scalars, &index) else { break }
            guard let dLon = nextValue(scalars, &index) else { break }
            lat += dLat
            lon += dLon
            points.append(RoutePoint(lat: Double(lat) / precision, lon: Double(lon) / precision))
        }
        return points
    }

    /// Number of coordinate pairs encoded — the metadata the server persists
    /// (`point_count`) without a full float decode. Each value ends on a unit whose
    /// continuation bit (0x20) is clear; lat+lon is two values per point.
    static func pointCount(_ encoded: String) -> Int {
        var terminators = 0
        for scalar in encoded.unicodeScalars where (Int(scalar.value) - 63) & 0x20 == 0 {
            terminators += 1
        }
        return terminators / 2
    }

    // MARK: - Signed value codec (zig-zag + 5-bit chunks + 63 offset)

    private static func appendValue(_ value: Int, to out: inout String) {
        var v = value < 0 ? ~(value << 1) : (value << 1)
        while v >= 0x20 {
            out.unicodeScalars.append(Unicode.Scalar(UInt32((0x20 | (v & 0x1f)) + 63))!)
            v >>= 5
        }
        out.unicodeScalars.append(Unicode.Scalar(UInt32(v + 63))!)
    }

    private static func nextValue(_ scalars: [Unicode.Scalar], _ index: inout Int) -> Int? {
        var shift = 0
        var result = 0
        while index < scalars.count {
            let byte = Int(scalars[index].value) - 63
            index += 1
            result |= (byte & 0x1f) << shift
            shift += 5
            if byte & 0x20 == 0 {
                return (result & 1) != 0 ? ~(result >> 1) : (result >> 1)
            }
        }
        return nil   // truncated final value
    }
}
