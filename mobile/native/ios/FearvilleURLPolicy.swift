import Foundation

// Shared by navigation and Universal Link entry points. Never change an invite's
// origin: staging and production accounts/tables are separate environments.
enum FearvilleURLPolicy {
    static func sameOrigin(_ url: URL, _ origin: URL) -> Bool {
        url.scheme == origin.scheme && url.host == origin.host
            && (url.port ?? 443) == (origin.port ?? 443)
            && url.user == nil && url.password == nil
    }

    static func invite(_ url: URL, site: URL) -> Bool {
        guard url.scheme == "https", sameOrigin(url, site) else { return false }
        if url.path == "/friends" { return true }
        return url.path == "/table"
            && URLComponents(url: url, resolvingAgainstBaseURL: false)?
                .queryItems?.contains(where: { $0.name == "code" && !($0.value ?? "").isEmpty }) == true
    }

    static func browserOnly(_ url: URL) -> Bool {
        ["/privacy", "/store"].contains { url.path == $0 || url.path.hasPrefix($0 + "/") }
    }

    static func authCallback(_ url: URL) -> Bool {
        url.scheme == "fearville" && url.host == "signin"
            && url.user == nil && url.password == nil && url.port == nil
            && (url.path.isEmpty || url.path == "/")
    }
}
