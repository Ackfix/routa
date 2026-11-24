// ROUTA – mise à jour de l'app web embarquée (sans passer par l'App Store).
// L'app démarre avec ses fichiers embarqués ; quand une nouvelle version est en ligne,
// on télécharge seulement les fichiers changés (contrôle SHA-256), puis elle s'applique au prochain lancement.
import Foundation
import Capacitor
import CryptoKit

@objc(RoutaUpdatePlugin)
public class RoutaUpdatePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RoutaUpdatePlugin"
    public let jsName = "RoutaUpdate"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "info", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ok", returnType: CAPPluginReturnPromise)
    ]
    static let site = URL(string: "https://routa.ackfix.com/")!
    static var busy = false
    let defaults = UserDefaults.standard

    // Capacitor lit KeyValueStore.standard["serverBasePath"] et cherche le dossier dans Library/NoCloud/ionic_built_snapshots/<nom>
    var snapshots: URL {
        let lib = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        return lib.appendingPathComponent("NoCloud").appendingPathComponent("ionic_built_snapshots")
    }
    var activeDir: URL? {
        guard let name = KeyValueStore.standard["serverBasePath", as: String.self], !name.isEmpty else { return nil }
        let d = snapshots.appendingPathComponent(URL(fileURLWithPath: name).lastPathComponent)
        var isDir: ObjCBool = false
        return FileManager.default.fileExists(atPath: d.path, isDirectory: &isDir) && isDir.boolValue ? d : nil
    }
    var embeddedDir: URL? { Bundle.main.url(forResource: "public", withExtension: nil) }
    var currentDir: URL? { activeDir ?? embeddedDir }

    func manifest(at dir: URL?) -> [String: Any]? {
        guard let d = dir, let data = try? Data(contentsOf: d.appendingPathComponent("bundle.json")) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    static func sha256(_ d: Data) -> String { SHA256.hash(data: d).map { String(format: "%02x", $0) }.joined() }

    // Sécurité : si une version téléchargée n'arrive pas à démarrer 3 fois de suite, on revient aux fichiers embarqués.
    public override func load() {
        guard activeDir != nil, let v = manifest(at: activeDir)?["v"] as? String else { return }
        if defaults.string(forKey: "routaOkV") == v { return }
        let k = "routaTries_" + v
        let tries = defaults.integer(forKey: k) + 1
        defaults.set(tries, forKey: k)
        if tries >= 3 {
            defaults.set(v, forKey: "routaBadV")
            KeyValueStore.standard["serverBasePath"] = nil as String?
        }
    }

    @objc func ok(_ call: CAPPluginCall) {
        if let v = manifest(at: currentDir)?["v"] as? String { defaults.set(v, forKey: "routaOkV") }
        call.resolve()
    }

    @objc func info(_ call: CAPPluginCall) {
        call.resolve(["v": (manifest(at: currentDir)?["v"] as? String) ?? "", "embedded": activeDir == nil])
    }

    @objc func check(_ call: CAPPluginCall) {
        if RoutaUpdatePlugin.busy { call.resolve(["updated": false, "busy": true]); return }
        RoutaUpdatePlugin.busy = true
        Task.detached { [weak self] in
            defer { RoutaUpdatePlugin.busy = false }
            guard let self = self else { return }
            do { call.resolve(try await self.run()) } catch { call.reject("update: \(error.localizedDescription)") }
        }
    }

    struct Fail: LocalizedError { let m: String; var errorDescription: String? { m } }

    func fetch(_ url: URL) async throws -> Data {
        var req = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData, timeoutInterval: 60)
        req.httpMethod = "GET"
        let (data, res) = try await URLSession.shared.data(for: req)
        guard let h = res as? HTTPURLResponse, h.statusCode == 200 else { throw Fail(m: "http \(url.lastPathComponent)") }
        return data
    }

    func run() async throws -> [String: Any] {
        let cur = manifest(at: currentDir)
        let curV = (cur?["v"] as? String) ?? ""
        let mdata = try await fetch(URL(string: "bundle.json?t=\(Int(Date().timeIntervalSince1970))", relativeTo: RoutaUpdatePlugin.site)!)
        guard let next = (try JSONSerialization.jsonObject(with: mdata)) as? [String: Any],
              let v = next["v"] as? String, let files = next["files"] as? [String: String] else { throw Fail(m: "manifest") }
        let minNative = (next["minNative"] as? Int) ?? 0
        if v.isEmpty || v <= curV || minNative > 1 || v == defaults.string(forKey: "routaBadV") { return ["updated": false, "v": curV] }

        let fm = FileManager.default
        try fm.createDirectory(at: snapshots, withIntermediateDirectories: true)
        let tmp = snapshots.appendingPathComponent(v + ".tmp")
        try? fm.removeItem(at: tmp)
        try fm.createDirectory(at: tmp, withIntermediateDirectories: true)
        let curFiles = (cur?["files"] as? [String: String]) ?? [:]
        let curDir = currentDir
        var dl = 0
        for (path, h) in files {
            if path.contains("..") { continue }
            var data: Data? = nil
            if curFiles[path] == h, let d = curDir, let local = try? Data(contentsOf: d.appendingPathComponent(path)), RoutaUpdatePlugin.sha256(local) == h { data = local }
            if data == nil {
                let enc = path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? path
                let d = try await fetch(URL(string: enc + "?h=" + String(h.prefix(10)), relativeTo: RoutaUpdatePlugin.site)!)
                guard RoutaUpdatePlugin.sha256(d) == h else { throw Fail(m: "hash \(path)") }
                data = d; dl += 1
            }
            let out = tmp.appendingPathComponent(path)
            try fm.createDirectory(at: out.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data!.write(to: out)
        }
        guard fm.fileExists(atPath: tmp.appendingPathComponent("index.html").path) else { throw Fail(m: "index.html manquant") }
        try mdata.write(to: tmp.appendingPathComponent("bundle.json"))
        let dest = snapshots.appendingPathComponent(v)
        try? fm.removeItem(at: dest)
        try fm.moveItem(at: tmp, to: dest)
        // pas de sauvegarde iCloud pour ces fichiers
        var rv = URLResourceValues(); rv.isExcludedFromBackup = true
        var d2 = dest; try? d2.setResourceValues(rv)
        // s'appliquera au prochain lancement
        KeyValueStore.standard["serverBasePath"] = v
        // ménage : on garde la nouvelle version et celle en cours
        if let all = try? fm.contentsOfDirectory(at: snapshots, includingPropertiesForKeys: nil) {
            for f in all where f.lastPathComponent != v && f.lastPathComponent != activeDirName(curDir) { try? fm.removeItem(at: f) }
        }
        return ["updated": true, "v": v, "downloaded": dl]
    }
    func activeDirName(_ u: URL?) -> String { u?.lastPathComponent ?? "" }
}
