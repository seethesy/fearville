import Foundation

@main
struct URLPolicyTests {
    static func main() {
        let staging = URL(string: "https://staging.fearville.app")!
        func invite(_ raw: String, site: URL = URL(string: "https://fearville.app")!) -> Bool {
            FearvilleURLPolicy.invite(URL(string: raw)!, site: site)
        }
        precondition(invite("https://fearville.app/table?code=ABCD"))
        precondition(invite("https://fearville.app/friends"))
        precondition(invite("https://staging.fearville.app/table?code=ABCD", site: staging))
        for raw in [
            "https://staging.fearville.app/table?code=ABCD",
            "https://fearville.app.evil.test/table?code=ABCD",
            "http://fearville.app/table?code=ABCD",
            "https://user@fearville.app/table?code=ABCD",
            "https://fearville.app:444/table?code=ABCD",
            "https://fearville.app/table", "https://fearville.app/table?code=",
            "https://fearville.app/privacy", "https://fearville.app/store",
            "https://fearville.app/api/accounts/exchange"
        ] { precondition(!invite(raw), raw) }
        precondition(!invite("https://fearville.app/table?code=ABCD", site: staging))
        for path in ["/privacy", "/privacy/", "/store", "/store/trust"] {
            precondition(FearvilleURLPolicy.browserOnly(URL(string: "https://fearville.app" + path)!))
        }
        precondition(!FearvilleURLPolicy.browserOnly(URL(string: "https://fearville.app/table")!))
        precondition(FearvilleURLPolicy.authCallback(URL(string: "fearville://signin?code=test")!))
        for raw in ["fearville://signin.evil?code=test", "https://signin?code=test", "fearville://signin/wrong", "fearville://user@signin?code=test"] {
            precondition(!FearvilleURLPolicy.authCallback(URL(string: raw)!))
        }
        print("iOS URL policy: passed")
    }
}
