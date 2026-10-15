import Foundation

// FEAR-194: cases live in url-policy-cases.json, shared with the Android
// shell so both enforce identical rules. Foundation only, so this compiles
// and runs on Linux (the mobile-static CI job) as well as macOS.
//   swiftc mobile/native/ios/FearvilleURLPolicy.swift mobile/tests/ios-url-policy.swift -o work/ios-url-policy
//   work/ios-url-policy mobile/tests/url-policy-cases.json

struct PolicyCase: Decodable {
    let kind: String
    let url: String
    let site: String?
    let expected: Bool
}
struct PolicyCases: Decodable { let cases: [PolicyCase] }

@main
struct URLPolicyTests {
    static func main() {
        let path = CommandLine.arguments.dropFirst().first ?? "mobile/tests/url-policy-cases.json"
        guard let data = FileManager.default.contents(atPath: path),
              let fixture = try? JSONDecoder().decode(PolicyCases.self, from: data),
              !fixture.cases.isEmpty
        else {
            print("iOS URL policy: could not read cases from \(path)")
            exit(2)
        }
        var failures = 0
        for item in fixture.cases {
            guard let url = URL(string: item.url) else {
                print("FAIL unparseable URL \(item.url)")
                failures += 1
                continue
            }
            let actual: Bool
            switch item.kind {
            case "invite":
                guard let raw = item.site, let site = URL(string: raw) else {
                    print("FAIL invite case without a site: \(item.url)")
                    failures += 1
                    continue
                }
                actual = FearvilleURLPolicy.invite(url, site: site)
            case "browserOnly":
                actual = FearvilleURLPolicy.browserOnly(url)
            case "authCallback":
                actual = FearvilleURLPolicy.authCallback(url)
            default:
                print("FAIL unknown case kind \(item.kind)")
                failures += 1
                continue
            }
            if actual != item.expected {
                print("FAIL \(item.kind) \(item.url)\(item.site.map { " site=\($0)" } ?? ""): expected \(item.expected), got \(actual)")
                failures += 1
            }
        }
        if failures > 0 {
            print("iOS URL policy: \(failures) of \(fixture.cases.count) cases failed")
            exit(1)
        }
        print("iOS URL policy: \(fixture.cases.count) cases passed")
    }
}
