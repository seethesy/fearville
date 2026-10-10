import Foundation
import SwiftUI

struct NativePreferences: Codable, Equatable {
    var music: Double = 0
    var sfx: Double = 60
    var muteInBackground = true
    var reducedMotion = false
    var largerText = false
    var showOnline = true
    var fields: [String: FieldValue] { ["music": .number(music), "sfx": .number(sfx), "muteInBackground": .bool(muteInBackground), "reducedMotion": .bool(reducedMotion), "largerText": .bool(largerText), "showOnline": .bool(showOnline)] }
}
struct NativeProfileDefaults: Decodable {
    let lobbyName: String; let avatar: String; let deathEffect: String; let settings: NativePreferences
}
// Flexible, typed JSON preserves the full server record as statistics evolve.
enum HubJSON: Decodable, Identifiable {
    case object([String: HubJSON]), array([HubJSON]), string(String), number(Double), bool(Bool), null
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null }
        else if let x = try? c.decode(Bool.self) { self = .bool(x) }
        else if let x = try? c.decode(Double.self) { self = .number(x) }
        else if let x = try? c.decode(String.self) { self = .string(x) }
        else if let x = try? c.decode([HubJSON].self) { self = .array(x) }
        else { self = .object(try c.decode([String: HubJSON].self)) }
    }
    subscript(_ key: String) -> HubJSON { if case .object(let x) = self { return x[key] ?? .null }; return .null }
    var items: [HubJSON] { if case .array(let x) = self { return x }; return [] }
    var fields: [String: HubJSON] { if case .object(let x) = self { return x }; return [:] }
    var text: String { switch self { case .string(let x): return x; case .number(let x): return x.formatted(.number.precision(.fractionLength(0...2))); case .bool(let x): return x ? "Yes" : "No"; default: return "" } }
    var number: Double { if case .number(let x) = self { return x }; return 0 }
    var flag: Bool { if case .bool(let x) = self { return x }; return number != 0 }
    var isNull: Bool { if case .null = self { return true }; return false }
    var id: String { self["id"].text.isEmpty ? self["role"].text + self["team"].text : self["id"].text }
}
let nativeAvatars: [(String, String, String)] = [
    ("raven", "Raven", "bird"), ("ghost", "Ghost", "cloud.fog"), ("moon", "Moon", "moon"), ("cat", "Black cat", "cat"), ("skull", "Skull", "person.crop.circle.badge.xmark"), ("flame", "Ember", "flame"), ("rose", "Night rose", "camera.macro"), ("eye", "Watcher", "eye"), ("bat", "Nightwing", "moon.stars"), ("spider", "Widow", "ant"), ("wolf", "Moonhound", "dog"), ("crown", "Lost monarch", "crown"), ("dagger", "Silver blade", "scissors"), ("lantern", "Lamplighter", "lamp.desk"), ("key", "Gatekeeper", "key"), ("book", "Spellbinder", "book.closed"), ("hourglass", "Timekeeper", "hourglass"), ("gem", "Amethyst", "diamond"), ("mushroom", "Toadstool", "leaf"), ("mask", "Masquerade", "theatermasks")
]
let nativeEffects: [(String, String)] = [("spirit", "Departing spirit"), ("embers", "Last ember"), ("petals", "Fallen petals"), ("mist", "Into the fog"), ("none", "Quiet farewell")]
func nativeRoleIcon(_ team: String) -> String { ["townsfolk": "house", "outsider": "theatermasks", "traveler": "figure.walk", "minion": "eye", "demon": "flame"][team] ?? "moon.stars" }
func hubDate(_ timestamp: Double) -> String { Date(timeIntervalSince1970: timestamp / 1000).formatted(date: .abbreviated, time: .omitted) }

extension TableStore {
    func presence(_ online: Bool) async {
        guard accountState?.account != nil else { return }
        let _: OKReply? = try? await request("api/accounts/presence", body: ["online": .bool(online)])
    }
    func refreshSocial() async {
        guard accountState?.account != nil else { return }
        do { socialState = try await request("api/social") } catch { self.error = error.localizedDescription }
    }
    func socialAction(_ body: [String: FieldValue]) async {
        working = true; error = ""; defer { working = false }
        do {
            let data: HubJSON = try await request("api/social", body: body)
            if body["action"]?.text == "acceptInvite" { try acceptNativeSeat(data) }
            await refreshSocial()
        } catch { self.error = error.localizedDescription }
    }
    func saveAccount(_ fields: [String: FieldValue]) async throws {
        let next: AccountState = try await request("api/accounts", body: fields)
        accountState = next; preferences = next.profile?.settings ?? NativePreferences(); NativeAudio.shared.apply(preferences)
    }
    func exitLobby(host: Bool) async {
        working = true; error = ""; defer { working = false }
        do { let _: OKReply = try await request("api/session", body: ["action": .string(host ? "deleteLobby" : "leaveLobby")]); forgetSeat(); await refreshAccount() }
        catch { self.error = error.localizedDescription }
    }
}
