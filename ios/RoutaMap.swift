// ROUTA – carte native (MapLibre) sous l'interface web.
// La page web garde toute la logique et l'interface ; l'iPhone dessine la carte.
import UIKit
import WebKit
import Capacitor
import MapLibre
import CoreLocation
import QuartzCore
import AVFoundation
import Photos

// MARK: - WebView transparente : les touchers hors de l'interface vont à la carte

final class RoutaWebView: WKWebView {
    weak var routaMap: MLNMapView?
    var webRects: [CGRect] = []
    var mapActive = false

    override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
        if mapActive, let mv = routaMap, !mv.isHidden, bounds.contains(point) {
            var onWeb = false
            for r in webRects where r.contains(point) { onWeb = true; break }
            if !onWeb {
                let p = convert(point, to: mv)
                return mv.hitTest(p, with: event) ?? mv
            }
        }
        return super.hitTest(point, with: event)
    }
}

// MARK: - Contrôleur principal

@objc(RoutaBridgeViewController)
open class RoutaBridgeViewController: CAPBridgeViewController {
    let mapPlugin = RoutaMapPlugin()
    let carPlugin = RoutaCarPlugin()
    let geoPlugin = RoutaGeoPlugin()

    open override func webView(with frame: CGRect, configuration: WKWebViewConfiguration) -> WKWebView {
        let web = RoutaWebView(frame: frame, configuration: configuration)
        // doit être réglé avant le chargement de la page pour que la carte apparaisse dessous
        web.isOpaque = false
        web.scrollView.isOpaque = false
        return web
    }

    open override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(mapPlugin)
        // ROUTA ne coupe jamais la musique : session audio « ambiante » qui se mélange aux autres apps
        try? AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        bridge?.registerPluginInstance(carPlugin)
        bridge?.registerPluginInstance(geoPlugin)
        if let web = webView {
            web.isOpaque = false
            web.scrollView.isOpaque = false
            if #available(iOS 15.0, *) { web.underPageBackgroundColor = .clear }
        }
        // toujours la dernière version de l'app web au démarrage
        let types: Set<String> = [WKWebsiteDataTypeDiskCache, WKWebsiteDataTypeMemoryCache]
        WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: Date(timeIntervalSince1970: 0)) {}
    }
}

// MARK: - Plugin

@objc(RoutaMapPlugin)
public class RoutaMapPlugin: CAPPlugin, CAPBridgedPlugin, MLNMapViewDelegate, UIGestureRecognizerDelegate, MLNNetworkConfigurationDelegate {
    public let identifier = "RoutaMapPlugin"
    public let jsName = "RoutaMap"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setStyle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setRects", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setGeoJSON", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisibility", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearImages", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "downloadRegion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "regionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteRegion", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "allowSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "duck", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise)
    ]

    private var mapView: MLNMapView?
    private var images: [String: UIImage] = [:]
    private var lastMove: CFTimeInterval = 0
    private var gesture = false
    private let markerLayers: Set<String> = ["routa-mk-v", "routa-mk-m"]
    private let gestureReasons: MLNCameraChangeReason = [.gesturePan, .gesturePinch, .gestureRotate, .gestureZoomIn, .gestureZoomOut, .gestureOneFingerZoom, .gestureTilt]

    private var routaWeb: RoutaWebView? { return webView as? RoutaWebView }

    // MARK: Méthodes appelées depuis la page

    @objc func start(_ call: CAPPluginCall) {
        let styleURL = call.getString("styleURL")
        let lng = call.getDouble("lng") ?? 6.6323
        let lat = call.getDouble("lat") ?? 46.5197
        let zoom = call.getDouble("zoom") ?? 11
        DispatchQueue.main.async {
            guard let web = self.routaWeb else { call.reject("webview"); return }
            if self.mapView == nil {
                // le trafic TomTom n'accepte que les demandes venant de routa.ackfix.com
                let cfg = URLSessionConfiguration.default
                cfg.httpAdditionalHeaders = ["Referer": "https://routa.ackfix.com/", "Origin": "https://routa.ackfix.com"]
                MLNNetworkConfiguration.sharedManager.sessionConfiguration = cfg
                MLNNetworkConfiguration.sharedManager.delegate = self
                let url = styleURL.flatMap { URL(string: $0) }
                let mv = MLNMapView(frame: web.bounds, styleURL: url)
                mv.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                mv.backgroundColor = UIColor(red: 14 / 255, green: 17 / 255, blue: 22 / 255, alpha: 1)
                mv.delegate = self
                mv.automaticallyAdjustsContentInset = false
                mv.contentInset = .zero
                mv.logoView.isHidden = true
                mv.compassView.isHidden = true
                mv.showsScale = false
                mv.allowsTilting = false   // carte toujours à plat (2D)
                mv.attributionButton.isHidden = true   // crédits de la carte : dans le menu (Crédits de la carte)
                mv.preferredFramesPerSecond = .maximum
                mv.maximumPitch = 75
                mv.setCenter(CLLocationCoordinate2D(latitude: lat, longitude: lng), zoomLevel: zoom, animated: false)

                let tap = UITapGestureRecognizer(target: self, action: #selector(self.onTap(_:)))
                tap.delegate = self
                for r in mv.gestureRecognizers ?? [] {
                    if let t = r as? UITapGestureRecognizer, t.numberOfTapsRequired == 2 { tap.require(toFail: t) }
                }
                mv.addGestureRecognizer(tap)
                let lp = UILongPressGestureRecognizer(target: self, action: #selector(self.onLongPress(_:)))
                lp.minimumPressDuration = 0.55
                lp.delegate = self
                mv.addGestureRecognizer(lp)

                web.isOpaque = false
                web.backgroundColor = .clear
                web.scrollView.backgroundColor = .clear
                web.insertSubview(mv, at: 0)
                web.routaMap = mv
                self.mapView = mv
            }
            self.mapView?.isHidden = false
            web.mapActive = true
            call.resolve(["ok": true])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.routaWeb?.mapActive = false
            self.mapView?.isHidden = true
            if let web = self.routaWeb {
                web.isOpaque = true
                web.backgroundColor = UIColor(red: 14 / 255, green: 17 / 255, blue: 22 / 255, alpha: 1)
            }
            call.resolve()
        }
    }

    @objc func setStyle(_ call: CAPPluginCall) {
        guard let json = call.getString("json"), !json.isEmpty else { call.reject("json"); return }
        DispatchQueue.main.async {
            guard let mv = self.mapView else { call.reject("map"); return }
            if let data = json.data(using: .utf8), (try? JSONSerialization.jsonObject(with: data)) != nil {
                mv.styleJSON = json
                call.resolve()
            } else {
                call.reject("invalid json")
            }
        }
    }

    @objc func setCamera(_ call: CAPPluginCall) {
        guard let lng = call.getDouble("lng"), let lat = call.getDouble("lat") else { call.reject("center"); return }
        let zoom = call.getDouble("zoom") ?? 14
        let bearing = call.getDouble("bearing") ?? 0
        let pitch = call.getDouble("pitch") ?? 0
        let duration = (call.getDouble("duration") ?? 0) / 1000.0
        let linear = call.getBool("linear") ?? false
        let fly = call.getBool("fly") ?? false
        DispatchQueue.main.async {
            guard let mv = self.mapView, lat.isFinite, lng.isFinite, zoom.isFinite else { call.resolve(); return }
            let center = CLLocationCoordinate2D(latitude: lat, longitude: lng)
            let size = mv.bounds.size.height > 0 ? mv.bounds.size : UIScreen.main.bounds.size
            let alt = RoutaMapPlugin.altitude(zoom: zoom, pitch: pitch, latitude: lat, size: size)
            let cam = MLNMapCamera(lookingAtCenter: center, altitude: alt, pitch: CGFloat(pitch), heading: bearing)
            if duration <= 0 && !fly {
                mv.setCamera(cam, animated: false)
            } else if fly {
                mv.fly(to: cam, withDuration: duration > 0 ? duration : -1, completionHandler: nil)
            } else {
                mv.setCamera(cam, withDuration: duration, animationTimingFunction: CAMediaTimingFunction(name: linear ? .linear : .easeInEaseOut))
            }
            call.resolve()
        }
    }

    @objc func setRects(_ call: CAPPluginCall) {
        let nums = (call.options["r"] as? [Any] ?? []).compactMap { ($0 as? NSNumber)?.doubleValue }
        var rects: [CGRect] = []
        var i = 0
        while i + 3 < nums.count {
            rects.append(CGRect(x: nums[i], y: nums[i + 1], width: nums[i + 2], height: nums[i + 3]))
            i += 4
        }
        DispatchQueue.main.async {
            self.routaWeb?.webRects = rects
            call.resolve()
        }
    }

    @objc func setGeoJSON(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let str = call.getString("data"), let data = str.data(using: .utf8) else { call.reject("args"); return }
        DispatchQueue.main.async {
            guard let src = self.mapView?.style?.source(withIdentifier: id) as? MLNShapeSource else { call.resolve(["ok": false]); return }
            if let shape = try? MLNShape(data: data, encoding: String.Encoding.utf8.rawValue) {
                src.shape = shape
            }
            call.resolve(["ok": true])
        }
    }

    @objc func setVisibility(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { call.reject("id"); return }
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async {
            self.mapView?.style?.layer(withIdentifier: id)?.isVisible = visible
            call.resolve()
        }
    }

    @objc func setImages(_ call: CAPPluginCall) {
        let list = call.options["images"] as? [[String: Any]] ?? []
        var decoded: [(String, UIImage)] = []
        for item in list {
            guard let name = item["name"] as? String, let b64 = item["data"] as? String,
                  let data = Data(base64Encoded: b64) else { continue }
            let scale = (item["scale"] as? NSNumber)?.doubleValue ?? 3
            if let img = UIImage(data: data, scale: CGFloat(scale)) { decoded.append((name, img)) }
        }
        DispatchQueue.main.async {
            for (name, img) in decoded {
                self.images[name] = img
                self.mapView?.style?.setImage(img, forName: name)
            }
            call.resolve()
        }
    }

    @objc func clearImages(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let style = self.mapView?.style {
                for name in self.images.keys { style.removeImage(forName: name) }
            }
            self.images.removeAll()
            call.resolve()
        }
    }

    // MARK: Carte hors connexion de la région

    @objc func downloadRegion(_ call: CAPPluginCall) {
        guard let lat = call.getDouble("lat"), let lon = call.getDouble("lon") else { call.reject("position manquante"); return }
        let km = call.getDouble("radiusKm") ?? 20
        let name = call.getString("name") ?? "routa-region"
        let maxZ = call.getDouble("maxZoom") ?? 14
        let styleStr = call.getString("styleURL") ?? "https://tiles.openfreemap.org/styles/liberty"
        guard let url = URL(string: styleStr) else { call.reject("style"); return }
        DispatchQueue.main.async {
            let dLat = km / 111.0
            let dLon = km / (111.0 * cos(lat * Double.pi / 180))
            let bounds = MLNCoordinateBounds(sw: CLLocationCoordinate2D(latitude: lat - dLat, longitude: lon - dLon),
                                             ne: CLLocationCoordinate2D(latitude: lat + dLat, longitude: lon + dLon))
            let region = MLNTilePyramidOfflineRegion(styleURL: url, bounds: bounds, fromZoomLevel: 6, toZoomLevel: maxZ)
            let ctx = name.data(using: .utf8) ?? Data()
            let storage = MLNOfflineStorage.shared
            // on remplace seulement la zone du même nom (les autres zones téléchargées restent)
            for old in storage.packs ?? [] where String(data: old.context, encoding: .utf8) == name { storage.removePack(old, withCompletionHandler: nil) }
            storage.addPack(for: region, withContext: ctx) { pack, error in
                if let error = error { call.reject(error.localizedDescription); return }
                pack?.resume()
                call.resolve(["started": true])
            }
        }
    }

    @objc func regionStatus(_ call: CAPPluginCall) {
        let name = call.getString("name")
        DispatchQueue.main.async {
            let packs = MLNOfflineStorage.shared.packs ?? []
            let found = name == nil ? packs.first : packs.first(where: { String(data: $0.context, encoding: .utf8) == name })
            guard let pack = found else { call.resolve(["exists": false]); return }
            pack.requestProgress()
            let p = pack.progress
            call.resolve([
                "exists": true,
                "done": Int(p.countOfResourcesCompleted),
                "total": Int(p.countOfResourcesExpected),
                "bytes": Int(p.countOfBytesCompleted),
                "complete": pack.state == .complete
            ])
        }
    }

    @objc func deleteRegion(_ call: CAPPluginCall) {
        let name = call.getString("name") ?? ""
        DispatchQueue.main.async {
            let storage = MLNOfflineStorage.shared
            for p in storage.packs ?? [] where String(data: p.context, encoding: .utf8) == name { storage.removePack(p, withCompletionHandler: nil) }
            call.resolve()
        }
    }

    // MARK: Écran allumé pendant la navigation (seulement quand ROUTA est à l'écran : iOS le gère)

    @objc func keepAwake(_ call: CAPPluginCall) {
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = true; call.resolve() }
    }

    @objc func allowSleep(_ call: CAPPluginCall) {
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = false; call.resolve() }
    }

    // MARK: Musique : baissée pendant une annonce vocale, puis remise à son volume (jamais coupée)

    @objc func duck(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? false
        let s = AVAudioSession.sharedInstance()
        do {
            if on {
                try s.setCategory(.playback, mode: .voicePrompt, options: [.duckOthers, .mixWithOthers, .interruptSpokenAudioAndMixWithOthers])
                try s.setActive(true)
            } else {
                try s.setActive(false, options: .notifyOthersOnDeactivation)
                try s.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            }
            call.resolve()
        } catch {
            call.reject("audio: \(error.localizedDescription)")
        }
    }

    // MARK: Enregistrer une image (story) dans Photos

    @objc func saveImage(_ call: CAPPluginCall) {
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64), let img = UIImage(data: data) else { call.reject("image"); return }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { st in
            guard st == .authorized || st == .limited else { call.reject("refusé"); return }
            PHPhotoLibrary.shared().performChanges({ PHAssetChangeRequest.creationRequestForAsset(from: img) }) { ok, err in
                if ok { call.resolve() } else { call.reject(err?.localizedDescription ?? "erreur") }
            }
        }
    }

    // MARK: Réseau : chaque demande de la carte se présente comme venant de routa.ackfix.com

    public func willSend(_ request: NSMutableURLRequest) -> NSMutableURLRequest {
        request.setValue("https://routa.ackfix.com/", forHTTPHeaderField: "Referer")
        request.setValue("https://routa.ackfix.com", forHTTPHeaderField: "Origin")
        return request
    }

    // MARK: Gestes

    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        return true
    }

    @objc private func onTap(_ g: UITapGestureRecognizer) {
        guard let mv = mapView, g.state == .ended else { return }
        let p = g.location(in: mv)
        let rect = CGRect(x: p.x - 24, y: p.y - 24, width: 48, height: 48)
        let feats = mv.visibleFeatures(in: rect, styleLayerIdentifiers: markerLayers)
        var best: String?
        var bestD = CGFloat.greatestFiniteMagnitude
        for f in feats {
            guard let id = f.attribute(forKey: "id") as? String else { continue }
            let fp = mv.convert(f.coordinate, toPointTo: mv)
            let d = hypot(fp.x - p.x, fp.y - p.y)
            if d < bestD { bestD = d; best = id }
        }
        if let id = best {
            notifyListeners("marker", data: ["id": id])
        } else {
            notifyListeners("tap", data: ["x": Double(p.x), "y": Double(p.y)])
        }
    }

    @objc private func onLongPress(_ g: UILongPressGestureRecognizer) {
        guard let mv = mapView, g.state == .began else { return }
        let p = g.location(in: mv)
        notifyListeners("longpress", data: ["x": Double(p.x), "y": Double(p.y)])
    }

    // MARK: Caméra -> page

    private func sendCamera(_ phase: String) {
        guard let mv = mapView else { return }
        let c = mv.centerCoordinate
        notifyListeners("camera", data: [
            "lng": c.longitude, "lat": c.latitude, "zoom": mv.zoomLevel,
            "bearing": mv.direction, "pitch": Double(mv.camera.pitch),
            "gesture": gesture, "phase": phase
        ])
    }

    public func mapView(_ mapView: MLNMapView, regionWillChangeWith reason: MLNCameraChangeReason, animated: Bool) {
        gesture = !reason.isDisjoint(with: gestureReasons)
        sendCamera("start")
    }

    public func mapView(_ mapView: MLNMapView, regionIsChangingWith reason: MLNCameraChangeReason) {
        let now = CACurrentMediaTime()
        if now - lastMove < 0.12 { return }
        lastMove = now
        sendCamera("move")
    }

    public func mapView(_ mapView: MLNMapView, regionDidChangeWith reason: MLNCameraChangeReason, animated: Bool) {
        sendCamera("end")
        gesture = false
    }

    public func mapView(_ mapView: MLNMapView, didFinishLoading style: MLNStyle) {
        for (name, img) in images { style.setImage(img, forName: name) }
        notifyListeners("style", data: ["ok": true])
    }

    // MARK: Zoom -> altitude (même calcul que MapLibre)

    static func altitude(zoom: Double, pitch: Double, latitude: Double, size: CGSize) -> CLLocationDistance {
        let earthRadius = 6378137.0
        let tileSize = 512.0
        let metersPerPixel = cos(latitude * .pi / 180) * 2 * .pi * earthRadius / (tileSize * pow(2, zoom))
        let metersTall = metersPerPixel * Double(size.height)
        let alt = metersTall / 2 / tan((30.0 * .pi / 180) / 2)
        return alt * sin(.pi / 2 - pitch * .pi / 180)
    }
}
