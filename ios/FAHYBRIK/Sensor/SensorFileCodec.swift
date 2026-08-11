import Foundation

/// Binary codec for archived wrist captures (plan fase 0).
///
/// Layout:
///   magic "FHSC" (4)
///   version u16 LE (2)
///   header JSON length u32 LE (4)
///   header JSON UTF-8
///   body: N × C × int16 LE samples at sample_hz
///         C = 6 en v1 (accel + gyro) · 9 en v2 (accel + gyro + gravedad)
///
/// v2 añade la gravedad porque sin ella no hay eje vertical, y sin eje vertical
/// no hay repetición ni velocidad (ver RepTracker). Los archivos v1 siguen
/// leyéndose con gravedad cero: nada de lo ya archivado queda huérfano.
struct SensorFileHeader: Codable, Equatable {
    var formatVersion: Int
    var executionLocalId: String?
    var startedAt: String            // ISO8601
    var sampleHz: Double
    var channels: [String]
    var captureMode: String
    var watchModel: String?
    var wrist: String?
    var appVersion: String?
    var windows: [SensorWindowLabel]
    var sampleCount: Int
}

enum SensorFileCodec {
    struct Decoded: Equatable {
        let header: SensorFileHeader
        let samples: [SensorSample]
    }

    static func encode(header: SensorFileHeader, samples: [SensorSample]) throws -> Data {
        var h = header
        h.sampleCount = samples.count
        h.channels = SensorFileFormat.channels
        h.formatVersion = Int(SensorFileFormat.version)

        let headerJSON = try JSONEncoder().encode(h)
        var data = Data()
        data.append(SensorFileFormat.magic)
        var version = SensorFileFormat.version.littleEndian
        data.append(Data(bytes: &version, count: 2))
        var headerLen = UInt32(headerJSON.count).littleEndian
        data.append(Data(bytes: &headerLen, count: 4))
        data.append(headerJSON)

        let stride = SensorFileFormat.channels.count * 2
        data.reserveCapacity(data.count + samples.count * stride)
        for s in samples {
            for value in SensorDecimator.quantize(s) {
                var le = value.littleEndian
                data.append(Data(bytes: &le, count: 2))
            }
        }
        return data
    }

    static func decode(_ data: Data) throws -> Decoded {
        guard data.count >= 10 else { throw CodecError.tooShort }
        guard data.prefix(4) == SensorFileFormat.magic else { throw CodecError.badMagic }

        let version: UInt16 = data.subdata(in: 4..<6).withUnsafeBytes { $0.load(as: UInt16.self).littleEndian }
        guard version >= 1, version <= SensorFileFormat.version else {
            throw CodecError.unsupportedVersion(version)
        }

        let headerLen = Int(data.subdata(in: 6..<10).withUnsafeBytes { $0.load(as: UInt32.self).littleEndian })
        let headerStart = 10
        let headerEnd = headerStart + headerLen
        guard headerEnd <= data.count else { throw CodecError.truncatedHeader }
        let header = try JSONDecoder().decode(SensorFileHeader.self, from: data.subdata(in: headerStart..<headerEnd))

        let body = data.subdata(in: headerEnd..<data.count)
        // El nº de canales lo manda la cabecera, no la versión: un archivo de una
        // build futura con más canales se lee por su propia declaración.
        let channels = header.channels.isEmpty
            ? (version >= 2 ? SensorFileFormat.channels.count : SensorFileFormat.channelsV1.count)
            : header.channels.count
        let stride = channels * 2
        guard stride > 0, body.count % stride == 0 else { throw CodecError.misalignedBody }
        let n = body.count / stride
        var samples: [SensorSample] = []
        samples.reserveCapacity(n)
        let dt = header.sampleHz > 0 ? 1.0 / header.sampleHz : 1.0 / SensorFileFormat.targetHz
        for i in 0..<n {
            let base = i * stride
            func i16(_ index: Int) -> Int16 {
                guard index < channels else { return 0 }
                let off = base + index * 2
                return body.subdata(in: off..<(off + 2)).withUnsafeBytes {
                    $0.load(as: Int16.self).littleEndian
                }
            }
            let s = SensorDecimator.dequantize(
                ax: i16(0), ay: i16(1), az: i16(2),
                gx: i16(3), gy: i16(4), gz: i16(5),
                grx: i16(6), gry: i16(7), grz: i16(8),
                t: Double(i) * dt
            )
            samples.append(s)
        }
        return Decoded(header: header, samples: samples)
    }

    enum CodecError: Error, Equatable {
        case tooShort
        case badMagic
        case unsupportedVersion(UInt16)
        case truncatedHeader
        case misalignedBody
    }
}
