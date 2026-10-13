// FEAR-93: Google (and other web) sign-in on iOS through
// ASWebAuthenticationSession. Google blocks OAuth inside WebViews; this sheet
// is Apple's supported sign-in browser and hands the fearville:// callback
// straight back to us, with no "Open in Fearville?" prompt.
//
// JS: Capacitor.Plugins.FearvilleAuth.start({ url }) resolves
//   { url: "fearville://signin?code=…" } or { cancelled: true }.
// Register it in FearvilleBridgeViewController (see mobile/README.md).

import AuthenticationServices
import Capacitor

@objc(FearvilleAuthPlugin)
public class FearvilleAuthPlugin: CAPPlugin, CAPBridgedPlugin,
    ASWebAuthenticationPresentationContextProviding
{
    public let identifier = "FearvilleAuthPlugin"
    public let jsName = "FearvilleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
            url.scheme == "https"
        else {
            call.reject("An https sign-in URL is required.")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(
                url: url, callbackURLScheme: "fearville"
            ) { [weak self] callback, error in
                self?.session = nil
                if let callback {
                    call.resolve(["url": callback.absoluteString])
                } else if let error = error as? ASWebAuthenticationSessionError,
                    error.code == .canceledLogin
                {
                    call.resolve(["cancelled": true])
                } else {
                    call.reject(error?.localizedDescription ?? "Sign-in failed.")
                }
            }
            session.presentationContextProvider = self
            // Share Safari's cookies so a player already signed in to Google
            // doesn't have to type their password again.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not open sign-in.")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession)
        -> ASPresentationAnchor
    {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
