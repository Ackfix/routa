package com.ackfix.routa;

// ROUTA – mise à jour de l'app web embarquée (sans passer par le Play Store).
// L'app démarre avec ses fichiers embarqués ; quand une nouvelle version est en ligne,
// on télécharge seulement les fichiers changés (contrôle SHA-256), puis elle s'applique au prochain lancement.

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.AssetManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Iterator;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;

@CapacitorPlugin(name = "RoutaUpdate")
public class RoutaUpdatePlugin extends Plugin {
    private static final String SITE = "https://routa.ackfix.com/";
    private static final String CAP_PREFS = "CapWebViewSettings";   // = com.getcapacitor.plugin.WebView.WEBVIEW_PREFS_NAME
    private static final String CAP_PATH = "serverBasePath";
    private static volatile boolean busy = false;

    private SharedPreferences capPrefs() { return getContext().getSharedPreferences(CAP_PREFS, Activity.MODE_PRIVATE); }
    private SharedPreferences myPrefs() { return getContext().getSharedPreferences("RoutaUpdate", Context.MODE_PRIVATE); }

    /** dossier de la version active (null = fichiers embarqués dans l'app) */
    private File activeDir() {
        String p = capPrefs().getString(CAP_PATH, "");
        if (p == null || p.isEmpty()) return null;
        File f = new File(p);
        return f.isDirectory() ? f : null;
    }

    private JSONObject readJson(byte[] b) throws Exception { return new JSONObject(new String(b, "UTF-8")); }

    private byte[] readAll(InputStream in) throws Exception {
        try (InputStream i = in; ByteArrayOutputStream o = new ByteArrayOutputStream()) {
            byte[] buf = new byte[65536]; int n;
            while ((n = i.read(buf)) > 0) o.write(buf, 0, n);
            return o.toByteArray();
        }
    }

    private InputStream openActive(File dir, String path) throws Exception {
        if (dir != null) return new FileInputStream(new File(dir, path));
        return getContext().getAssets().open("public/" + path, AssetManager.ACCESS_STREAMING);
    }

    private JSONObject activeManifest() {
        try { return readJson(readAll(openActive(activeDir(), "bundle.json"))); } catch (Exception e) { return null; }
    }

    private static String sha256(byte[] b) throws Exception {
        MessageDigest md = MessageDigest.getInstance("SHA-256");
        byte[] d = md.digest(b);
        StringBuilder sb = new StringBuilder();
        for (byte x : d) sb.append(String.format("%02x", x));
        return sb.toString();
    }

    private static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] c = f.listFiles();
        if (c != null) for (File x : c) deleteTree(x);
        f.delete();
    }

    // Sécurité : si une version téléchargée n'arrive pas à démarrer 3 fois de suite, on revient aux fichiers embarqués.
    @Override
    public void load() {
        try {
            JSONObject m = activeManifest();
            if (activeDir() == null || m == null) return;
            String v = m.optString("v", "");
            SharedPreferences p = myPrefs();
            if (v.equals(p.getString("okV", ""))) return;
            int tries = p.getInt("tries_" + v, 0) + 1;
            p.edit().putInt("tries_" + v, tries).apply();
            if (tries >= 3) {
                p.edit().putString("badV", v).apply();
                capPrefs().edit().putString(CAP_PATH, "").commit();
            }
        } catch (Exception e) { /* */ }
    }

    /** appelé par l'app quand elle a bien démarré */
    @PluginMethod
    public void ok(PluginCall call) {
        JSONObject m = activeManifest();
        if (m != null) myPrefs().edit().putString("okV", m.optString("v", "")).apply();
        call.resolve();
    }

    @PluginMethod
    public void info(PluginCall call) {
        JSONObject m = activeManifest();
        JSObject r = new JSObject();
        r.put("v", m != null ? m.optString("v", "") : "");
        r.put("embedded", activeDir() == null);
        call.resolve(r);
    }

    @PluginMethod
    public void check(PluginCall call) {
        if (busy) { JSObject r = new JSObject(); r.put("updated", false); r.put("busy", true); call.resolve(r); return; }
        busy = true;
        new Thread(() -> {
            try {
                JSObject r = run();
                call.resolve(r);
            } catch (Exception e) {
                call.reject("update: " + e.getMessage());
            } finally { busy = false; }
        }).start();
    }

    private JSObject run() throws Exception {
        JSObject r = new JSObject();
        OkHttpClient http = new OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).build();
        JSONObject cur = activeManifest();
        String curV = cur != null ? cur.optString("v", "") : "";
        JSONObject next;
        try (Response res = http.newCall(new Request.Builder().url(SITE + "bundle.json?t=" + System.currentTimeMillis()).build()).execute()) {
            if (!res.isSuccessful() || res.body() == null) throw new Exception("manifest " + res.code());
            next = readJson(res.body().bytes());
        }
        String v = next.optString("v", "");
        int minNative = next.optInt("minNative", 0);
        if (v.isEmpty() || v.compareTo(curV) <= 0 || minNative > 1 || v.equals(myPrefs().getString("badV", ""))) { r.put("updated", false); r.put("v", curV); return r; }

        File root = new File(getContext().getFilesDir(), "routa-www");
        File tmp = new File(root, v + ".tmp");
        deleteTree(tmp);
        if (!tmp.mkdirs()) throw new Exception("mkdir");
        File curDir = activeDir();
        JSONObject curFiles = cur != null ? cur.optJSONObject("files") : null;
        JSONObject files = next.getJSONObject("files");
        Iterator<String> it = files.keys();
        int dl = 0;
        while (it.hasNext()) {
            String path = it.next();
            if (path.contains("..")) continue;
            String h = files.getString(path);
            byte[] data = null;
            if (curFiles != null && h.equals(curFiles.optString(path, ""))) {
                try { data = readAll(openActive(curDir, path)); if (!h.equals(sha256(data))) data = null; } catch (Exception e) { data = null; }
            }
            if (data == null) {
                try (Response res = http.newCall(new Request.Builder().url(SITE + path + "?h=" + h.substring(0, 10)).build()).execute()) {
                    if (!res.isSuccessful() || res.body() == null) throw new Exception(path + " " + res.code());
                    data = res.body().bytes();
                }
                if (!h.equals(sha256(data))) throw new Exception("hash " + path);
                dl++;
            }
            File out = new File(tmp, path);
            File par = out.getParentFile();
            if (par != null && !par.exists() && !par.mkdirs()) throw new Exception("mkdir " + path);
            try (FileOutputStream o = new FileOutputStream(out)) { o.write(data); }
        }
        if (!new File(tmp, "index.html").exists()) throw new Exception("index.html manquant");
        try (FileOutputStream o = new FileOutputStream(new File(tmp, "bundle.json"))) { o.write(next.toString().getBytes("UTF-8")); }
        File dest = new File(root, v);
        deleteTree(dest);
        if (!tmp.renameTo(dest)) throw new Exception("rename");
        // s'appliquera au prochain lancement (Capacitor lit ce réglage au démarrage)
        capPrefs().edit().putString(CAP_PATH, dest.getAbsolutePath()).commit();
        // ménage : on garde la nouvelle version et celle en cours
        File[] all = root.listFiles();
        if (all != null) for (File f : all) {
            if (f.equals(dest) || (curDir != null && f.equals(curDir))) continue;
            deleteTree(f);
        }
        r.put("updated", true); r.put("v", v); r.put("downloaded", dl);
        return r;
    }
}
