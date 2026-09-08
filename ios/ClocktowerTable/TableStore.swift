import Foundation
import Security
import SwiftUI

private enum Keychain {
    static let service = "ClocktowerTable.session"
    static func load() -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "session", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func save(_ token: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "session"]
        SecItemDelete(query as CFDictionary)
        var values = query
        values[kSecValueData as String] = Data(token.utf8)
        values[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(values as CFDictionary, nil) == errSecSuccess else { throw NSError(domain: "Keychain", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not securely save the session."]) }
    }
    static func clear() { let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: "session"]; SecItemDelete(query as CFDictionary) }
}
@MainActor final class TableStore: ObservableObject {
    @Published var game: GameState?
    @Published var error = ""
    @Published var online = false
    @Published var working = false
    @Published var offset: Double = 0
    @Published var notice = ""
    @Published var authenticated = false
    private var token = ""
    let baseURL: URL
    private let network: URLSession
    init() {
        baseURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "ClocktowerAPIURL") as? String ?? "https://clocktower-table.phatsyloaf.chatgpt.site")!
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        network = URLSession(configuration: config)
        token = Keychain.load() ?? ""
        authenticated = !token.isEmpty
    }
    private func request<T: Decodable>(_ path: String, body: [String: FieldValue]? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !token.isEmpty { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { req.httpMethod = "POST"; req.httpBody = try JSONEncoder().encode(body) }
        let (data,response) = try await network.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            let failure = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "The server is unavailable or requires access. Ask the Storyteller to check the app’s hosting access."
            if http.statusCode == 401 { authenticated = false }
            throw NSError(domain: "Clocktower", code: http.statusCode, userInfo: [NSLocalizedDescriptionKey: failure])
        }
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw NSError(domain: "Clocktower", code: 0, userInfo: [NSLocalizedDescriptionKey: "The server did not return game data. The backend must allow player access before using the native app."]) }
    }
    func enter(action: String, name: String, code: String = "", recovery: String = "") async {
        working = true; error = ""
        defer { working = false }
        do {
            let reply: SessionReply = try await request("api/session", body: ["action": .string(action), "name": .string(name), "code": .string(code.uppercased()), "recoveryKey": .string(recovery)])
            try Keychain.save(reply.token); token = reply.token; authenticated = true
            await refresh()
        } catch { self.error = error.localizedDescription }
    }
    func refresh() async {
        guard authenticated else { return }
        do {
            let next: GameState = try await request("api/game")
            if let previous = game, let message = next.messages.last, previous.messages.last?.id != message.id {
                notice = message.from == "host" ? "New message from your Storyteller." : "New player message."
            }
            game = next; offset = next.serverNow / 1000 - Date().timeIntervalSince1970; online = true
        } catch { online = false; self.error = error.localizedDescription }
    }
    func perform(_ action: GameAction, values: [String: FieldValue], preview: Bool, version: Int) async throws -> ActionReply {
        var body = values; body["action"] = .string(action.action); body["preview"] = .bool(preview); body["version"] = .number(Double(version))
        let reply: ActionReply = try await request("api/game", body: body)
        if let next = reply.game { game = next; notice = reply.summary; await refresh() }
        return reply
    }
    var recoveryKey: String { token }
    func leave() { Keychain.clear(); token = ""; game = nil; authenticated = false; online = false; error = "" }
}

