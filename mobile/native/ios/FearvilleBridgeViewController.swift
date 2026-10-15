import Capacitor
import UIKit

class FearvilleBridgeViewController: CAPBridgeViewController {
    private var pendingInvite: URL?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(FearvilleAuthPlugin())
        let navigation = FearvilleNavigationPlugin()
        navigation.initialInvite = pendingInvite
        pendingInvite = nil
        bridge?.registerPluginInstance(navigation)
        statusBarStyle = .lightContent
        webView?.backgroundColor = UIColor(red: 18 / 255, green: 13 / 255, blue: 20 / 255, alpha: 1)
        webView?.scrollView.backgroundColor = webView?.backgroundColor
    }

    func openInvite(_ url: URL) {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "FearvilleSiteURL") as? String,
            let site = URL(string: raw), FearvilleURLPolicy.invite(url, site: site)
        else { return }
        if let webView {
            webView.load(URLRequest(url: url))
        } else {
            pendingInvite = url
        }
    }
}
