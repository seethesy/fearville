import Capacitor
import UIKit
import WebKit

// Let Capacitor retain its navigation delegate (including server.errorPath).
// Override only top-level navigation; the bridge must never follow a lookalike
// host or expose plugins to an external site.
@objc(FearvilleNavigationPlugin)
public class FearvilleNavigationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "FearvilleNavigationPlugin"
    public let jsName = "FearvilleNavigation"
    public let pluginMethods: [CAPPluginMethod] = []
    var initialInvite: URL?

    @objc public override func shouldOverrideLoad(_ action: WKNavigationAction) -> NSNumber? {
        guard action.targetFrame == nil || action.targetFrame?.isMainFrame == true,
            let url = action.request.url, let config = bridge?.config
        else { return nil }

        // Redirect before the initial root navigation starts. Cancelling an
        // already-running root load can otherwise race server.errorPath.
        if let invite = initialInvite {
            initialInvite = nil
            if FearvilleURLPolicy.invite(invite, site: config.serverURL) {
                DispatchQueue.main.async { [weak self] in
                    self?.webView?.load(URLRequest(url: invite))
                }
                return true
            }
        }
        let local = FearvilleURLPolicy.sameOrigin(url, config.localURL)
        let hosted = FearvilleURLPolicy.sameOrigin(url, config.serverURL)
        if local || (hosted && !FearvilleURLPolicy.browserOnly(url)) {
            return nil
        }
        // ASWebAuthenticationSession owns sign-in, not navigation callbacks.
        if ["https", "http", "mailto", "tel"].contains(url.scheme ?? "") {
            UIApplication.shared.open(url, options: [:])
        }
        return true
    }
}
