import Foundation
import Security
import SwiftUI
import AuthenticationServices
import CryptoKit

private enum Keychain {
    static let service = "ClocktowerTable.session"
    static func load(account: String = "session") -> String? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
    static func save(_ token: String, account: String = "session") throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
        SecItemDelete(query as CFDictionary)
        var values = query
        values[kSecValueData as String] = Data(token.utf8)
        values[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        guard SecItemAdd(values as CFDictionary, nil) == errSecSuccess else { throw NSError(domain: "Keychain", code: 1, userInfo: [NSLocalizedDescriptionKey: "Could not securely save the session."]) }
    }
    static func clear(account: String = "session") { let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]; SecItemDelete(query as CFDictionary) }
}
@MainActor final class TableStore: ObservableObject {
    @Published var game: GameState?
    @Published var error = ""
    @Published var online = false
    @Published var working = false
    @Published var offset: Double = 0
    @Published var notice = ""
    @Published var authenticated = false
    @Published var accountState: AccountState?
    private var accountCredential = ""
    private var webAuthentication: ASWebAuthenticationSession?
    private let authPresenter = OAuthPresenter()
    private var token = ""
    let baseURL: URL
    private let network: URLSession
    init() {
        baseURL = URL(string: Bundle.main.object(forInfoDictionaryKey: "ClocktowerAPIURL") as? String ?? "https://fearville.app")!
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 15
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        network = URLSession(configuration: config)
        token = Keychain.load() ?? ""
        accountCredential = Keychain.load(account: "account") ?? ""
        authenticated = !token.isEmpty
    }
    private func request<T: Decodable>(_ path: String, body: [String: FieldValue]? = nil) async throws -> T {
        var req = URLRequest(url: baseURL.appendingPathComponent(path))
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if !token.isEmpty { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if !accountCredential.isEmpty { req.setValue("Bearer " + accountCredential, forHTTPHeaderField: "X-Account-Authorization") }
        if let body { req.httpMethod = "POST"; req.httpBody = try JSONEncoder().encode(body) }
        let (data,response) = try await network.data(for: req)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        guard (200..<300).contains(http.statusCode) else {
            let failure = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "The server is unavailable or requires access. Ask the Storyteller to check the app’s hosting access."
            if http.statusCode == 401 && path == "api/game" { authenticated = false }
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


@MainActor private final class OAuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.first(where: { $0.isKeyWindow }) ?? ASPresentationAnchor()
    }
}
extension TableStore {
    func refreshAccount() async {
        do { let next: AccountState = try await request("api/accounts"); accountState = next }
        catch { self.error = error.localizedDescription }
    }
    func signIn(provider: String, link: Bool = false) async {
        working = true; error = ""; defer { working = false; webAuthentication = nil }
        do {
            let verifier = (UUID().uuidString + UUID().uuidString).replacingOccurrences(of: "-", with: "")
            let digest = Data(SHA256.hash(data: Data(verifier.utf8))).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            let start: SignInStart = try await request("api/accounts/start", body: ["provider": .string(provider), "link": .bool(link), "nativeChallenge": .string(digest)])
            guard let url = URL(string: start.url) else { throw URLError(.badURL) }
            let returned: URL = try await withCheckedThrowingContinuation { continuation in
                let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "clocktowertable") { url, error in
                    if let url { continuation.resume(returning: url) }
                    else { continuation.resume(throwing: error ?? URLError(.cancelled)) }
                }
                session.presentationContextProvider = authPresenter
                session.prefersEphemeralWebBrowserSession = true
                webAuthentication = session
                if !session.start() { continuation.resume(throwing: URLError(.cannotConnectToHost)) }
            }
            let items = URLComponents(url: returned, resolvingAgainstBaseURL: false)?.queryItems ?? []
            if let reason = items.first(where: { $0.name == "error" })?.value { throw NSError(domain: "Clocktower", code: 0, userInfo: [NSLocalizedDescriptionKey: reason]) }
            guard let code = items.first(where: { $0.name == "code" })?.value else { throw URLError(.badServerResponse) }
            let exchanged: SignInExchange = try await request("api/accounts/exchange", body: ["code": .string(code), "verifier": .string(verifier)])
            try Keychain.save(exchanged.accountToken, account: "account"); accountCredential = exchanged.accountToken
            await refreshAccount()
            notice = "Your account is connected."
        } catch { self.error = error.localizedDescription }
    }
    func resumeSeat(_ seat: SavedSeat) async {
        working = true; error = ""; defer { working = false }
        do {
            let reply: SessionReply = try await request("api/accounts", body: ["action": .string("resume"), "seat": .string(seat.id)])
            try Keychain.save(reply.token); token = reply.token; authenticated = true; await refresh()
        } catch { self.error = error.localizedDescription }
    }
    func attachCurrentSeat() async {
        do { let next: AccountState = try await request("api/accounts", body: ["action": .string("attach")]); accountState = next }
        catch { self.error = error.localizedDescription }
    }
    func endAccount(delete: Bool = false) async {
        working = true; error = ""; defer { working = false }
        do {
            let _: OKReply = try await request("api/accounts", body: ["action": .string(delete ? "delete" : "signout"), "confirm": .string(delete ? "DELETE" : "")])
            Keychain.clear(account: "account"); accountCredential = ""; accountState = nil; leave(); await refreshAccount()
        } catch { self.error = error.localizedDescription }
    }
}
