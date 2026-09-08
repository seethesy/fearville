import Foundation

struct Choice: Decodable, Hashable { let value: String; let label: String }
enum FieldValue: Codable, Hashable {
    case string(String), number(Double), bool(Bool)
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let v = try? c.decode(Bool.self) { self = .bool(v) }
        else if let v = try? c.decode(Double.self) { self = .number(v) }
        else { self = .string(try c.decode(String.self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .string(let s): try c.encode(s); case .number(let n): try c.encode(n); case .bool(let b): try c.encode(b) }
    }
    var text: String { switch self { case .string(let s): return s; case .number(let n): return n.rounded() == n ? String(Int(n)) : String(n); case .bool(let b): return String(b) } }
    var flag: Bool { if case .bool(let b) = self { return b }; return false }
}
struct ActionField: Decodable, Identifiable {
    let key: String; let label: String; let type: String; let value: FieldValue?; let options: [Choice]?; let required: Bool?; let min: Double?; let max: Double?; let hint: String?
    var id: String { key }
}
struct GameAction: Decodable, Identifiable {
    let action: String; let title: String; let description: String; let fields: [ActionField]; let danger: Bool?
    var id: String { action + title }
}
struct Seat: Decodable, Identifiable {
    let id: String; let name: String; let seat: Int; let alive: Bool; let ghost: Bool; let role: String?; let shown: String?; let notes: String?; let poisoned: Bool?; let protected: Bool?; let used: Bool?; let nominated: Bool; let hasNominated: Bool
}
struct Character: Decodable { let name: String; let description: String; let alignment: String }
struct NightTask: Decodable, Identifiable { let key: String; let role: String; let player: String; let name: String; let done: Bool; var id: String { key } }
struct GameMessage: Decodable, Identifiable { let id: String; let from: String; let to: String; let text: String; let at: Double; let kind: String }
struct LogEntry: Decodable, Identifiable { let id: String; let text: String; let at: Double }
struct Ballot: Decodable, Identifiable { let id: String; let by: String; let target: String; let count: Int; let threshold: Int }
struct ActiveBallot: Decodable { let id: String; let by: String; let target: String; let threshold: Int; let myVote: Bool? }
struct Leader: Decodable { let target: String; let name: String; let count: Int; let tied: Bool }
struct GameState: Decodable {
    let code: String; let hostName: String; let host: Bool; let me: String; let phase: String; let phaseLabel: String; let day: Int; let night: Int; let version: Int; let serverNow: Double; let deadline: Double?; let remaining: Double; let winner: String
    let players: [Seat]; let character: Character?; let tasks: [NightTask]; let issues: [String]; let hints: [String]; let active: ActiveBallot?; let ballots: [Ballot]; let leader: Leader; let messages: [GameMessage]; let log: [LogEntry]; let controls: [GameAction]
    func name(_ id: String) -> String { id == "host" ? "Storyteller" : players.first(where: { $0.id == id })?.name ?? "Everyone" }
}
struct SessionReply: Decodable { let code: String; let token: String }
struct ActionReply: Decodable { let summary: String; let version: Int?; let game: GameState? }
struct APIError: Decodable { let error: String }
struct ScriptRole: Decodable, Identifiable { let id: String; let name: String; let team: String; let description: String }
