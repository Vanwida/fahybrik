import Foundation

// Snake_case JSON convention to match shared/schema/* TypeScript Zod schemas.
enum APIBase {
    static var url: URL {
        if let s = Bundle.main.object(forInfoDictionaryKey: "FahybrikApiBase") as? String,
           let u = URL(string: s) {
            return u
        }
        return URL(string: "https://app.fahybrik.com")!
    }
}

enum APIError: Error {
    case invalidResponse
    case http(Int, Data)
    case offline
    case decoding(Error)
}

actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(session: URLSession = .shared) {
        self.session = session

        let dec = JSONDecoder()
        dec.keyDecodingStrategy = .convertFromSnakeCase
        dec.dateDecodingStrategy = .iso8601
        self.decoder = dec

        let enc = JSONEncoder()
        enc.keyEncodingStrategy = .convertToSnakeCase
        enc.dateEncodingStrategy = .iso8601
        self.encoder = enc
    }

    func post<TBody: Encodable, TResp: Decodable>(
        path: String,
        body: TBody,
        bearer: String? = nil
    ) async throws -> TResp {
        var req = URLRequest(url: APIBase.url.appendingPathComponent(path))
        req.httpMethod = "POST"
        req.addValue("application/json", forHTTPHeaderField: "Content-Type")
        if let bearer { req.addValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        req.httpBody = try encoder.encode(body)

        let (data, resp) = try await session.data(for: req)
        guard let http = resp as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError.http(http.statusCode, data)
        }
        if TResp.self == Empty.self {
            return Empty() as! TResp
        }
        do {
            return try decoder.decode(TResp.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    func postRaw<TBody: Encodable>(
        path: String,
        body: TBody,
        bearer: String? = nil
    ) async throws {
        let _: Empty = try await post(path: path, body: body, bearer: bearer)
    }
}

struct Empty: Codable {}
