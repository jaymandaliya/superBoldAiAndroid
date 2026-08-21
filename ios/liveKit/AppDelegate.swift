import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import FirebaseCore

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?
  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {

    FirebaseApp.configure()

    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "liveKit",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // ✅ ADDED: Required for PayU UPI deep-link callback
  //
  // How it works:
  // 1. User taps Pay via UPI in PayU SDK
  // 2. iOS opens PhonePe / GPay / Paytm
  // 3. User completes payment in UPI app
  // 4. UPI app calls back YOUR app using your URL scheme (livekit://)
  // 5. iOS calls THIS method with the result URL
  // 6. RCTLinkingManager forwards it to React Native Linking module
  // 7. PayU SDK picks it up → fires onPaymentSuccess / onPaymentFailure
  //
  // WITHOUT THIS: Payment completes in UPI app but your app
  // never gets the callback → payment appears to hang forever
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    return RCTLinkingManager.application(app, open: url, options: options)
  }

  // ✅ ADDED: Required for Universal Links (https-based deep links)
  // Some newer UPI apps use https universal links instead of custom schemes
  func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    return RCTLinkingManager.application(
      application,
      continue: userActivity,
      restorationHandler: restorationHandler
    )
  }
}

// ─────────────────────────────────────────────────────────────
// ReactNativeDelegate — unchanged from your original
// ─────────────────────────────────────────────────────────────
class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}