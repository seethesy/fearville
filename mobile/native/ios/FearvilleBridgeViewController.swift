// FEAR-93: registers the app's own plugins with Capacitor.
// In Main.storyboard, set the Bridge View Controller's custom class to this.

import Capacitor
import UIKit

class FearvilleBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(FearvilleAuthPlugin())
    }
}
