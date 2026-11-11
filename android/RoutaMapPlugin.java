package com.ackfix.routa;

// ROUTA – carte native Android (MapLibre) sous l'interface web.
// La page web garde toute la logique et l'interface ; Android dessine la carte.

import android.annotation.SuppressLint;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.graphics.PointF;
import android.graphics.RectF;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;
import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.camera.CameraUpdate;
import org.maplibre.android.camera.CameraUpdateFactory;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.geometry.LatLngBounds;
import org.maplibre.android.maps.MapLibreMap;
import org.maplibre.android.maps.MapLibreMapOptions;
import org.maplibre.android.maps.MapView;
import org.maplibre.android.maps.Style;
import org.maplibre.android.module.http.HttpRequestUtil;
import org.maplibre.android.offline.OfflineManager;
import org.maplibre.android.offline.OfflineRegion;
import org.maplibre.android.offline.OfflineRegionStatus;
import org.maplibre.android.offline.OfflineTilePyramidRegionDefinition;
import org.maplibre.android.style.layers.Layer;
import org.maplibre.android.style.layers.Property;
import org.maplibre.android.style.layers.PropertyFactory;
import org.maplibre.android.style.sources.GeoJsonSource;
import org.maplibre.geojson.Feature;
import org.maplibre.geojson.Point;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import okhttp3.OkHttpClient;
import okhttp3.Request;

@CapacitorPlugin(name = "RoutaMap")
public class RoutaMapPlugin extends Plugin {
    private MapView mapView;
    private MapLibreMap map;
    private final Map<String, Bitmap> images = new HashMap<>();
    private final List<float[]> webRects = new ArrayList<>();
    private boolean active = false;
    private boolean gesture = false;
    private boolean toMap = false;
    private long lastMove = 0;
    private String pendingStyle = null;
    private float density = 1f;
    private final Handler main = new Handler(Looper.getMainLooper());

    private static boolean httpReady = false;

    private void ui(Runnable r) { main.post(r); }

    // ---------- Méthodes appelées depuis la page ----------

    @PluginMethod
    public void start(final PluginCall call) {
        final String styleURL = call.getString("styleURL", "");
        final double lng = call.getDouble("lng", 6.6323);
        final double lat = call.getDouble("lat", 46.5197);
        final double zoom = call.getDouble("zoom", 11.0);
        ui(() -> {
            try {
                final WebView web = getBridge().getWebView();
                density = getContext().getResources().getDisplayMetrics().density;
                if (mapView == null) {
                    MapLibre.getInstance(getContext());
                    if (!httpReady) {
                        httpReady = true;
                        // le trafic TomTom n'accepte que les demandes venant de routa.ackfix.com
                        OkHttpClient client = new OkHttpClient.Builder().addInterceptor(chain -> {
                            Request req = chain.request().newBuilder()
                                .header("Referer", "https://routa.ackfix.com/")
                                .header("Origin", "https://routa.ackfix.com")
                                .build();
                            return chain.proceed(req);
                        }).build();
                        HttpRequestUtil.setOkHttpClient(client);
                    }
                    MapLibreMapOptions opts = MapLibreMapOptions.createFromAttributes(getContext())
                        .textureMode(true)
                        .camera(new CameraPosition.Builder().target(new LatLng(lat, lng)).zoom(zoom).build())
                        .logoEnabled(false)
                        .compassEnabled(false)
                        .attributionEnabled(false);
                    mapView = new MapView(getContext(), opts);
                    mapView.setBackgroundColor(Color.rgb(14, 17, 22));
                    mapView.onCreate(null);
                    mapView.onStart();
                    mapView.onResume();
                    ViewGroup parent = (ViewGroup) web.getParent();
                    parent.addView(mapView, 0, new ViewGroup.MarginLayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                    web.addOnLayoutChangeListener((v, l, t, r, b, ol, ot, or, ob) -> syncBounds(web));
                    syncBounds(web);
                    mapView.getMapAsync(m -> {
                        map = m;
                        m.setMaxPitchPreference(75.0);
                        m.getUiSettings().setLogoEnabled(false);
                        m.getUiSettings().setCompassEnabled(false);
                        m.getUiSettings().setAttributionEnabled(false);
                        m.addOnCameraMoveStartedListener(reason -> {
                            gesture = reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE;
                            sendCamera("start");
                        });
                        m.addOnCameraMoveListener(() -> {
                            long now = SystemClock.uptimeMillis();
                            if (now - lastMove < 120) return;
                            lastMove = now;
                            sendCamera("move");
                        });
                        m.addOnCameraIdleListener(() -> { sendCamera("end"); gesture = false; });
                        m.addOnMapClickListener(p -> { onTap(p); return true; });
                        m.addOnMapLongClickListener(p -> {
                            PointF s = m.getProjection().toScreenLocation(p);
                            JSObject o = new JSObject();
                            o.put("x", cssX(s.x)); o.put("y", cssY(s.y));
                            notifyListeners("longpress", o);
                            return true;
                        });
                        String js = pendingStyle != null ? pendingStyle : null;
                        if (js != null) applyStyle(js);
                        else if (styleURL != null && !styleURL.isEmpty()) m.setStyle(new Style.Builder().fromUri(styleURL), st -> styleLoaded(st));
                    });
                    installTouch(web);
                }
                web.setBackgroundColor(Color.TRANSPARENT);
                mapView.setVisibility(View.VISIBLE);
                active = true;
                JSObject r = new JSObject(); r.put("ok", true);
                call.resolve(r);
            } catch (Throwable e) {
                call.reject("carte native : " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        ui(() -> {
            active = false;
            if (mapView != null) mapView.setVisibility(View.GONE);
            try { getBridge().getWebView().setBackgroundColor(Color.rgb(14, 17, 22)); } catch (Throwable e) { /* */ }
            call.resolve();
        });
    }

    @PluginMethod
    public void setStyle(final PluginCall call) {
        final String json = call.getString("json", "");
        if (json == null || json.isEmpty()) { call.reject("json"); return; }
        try { new JSONObject(json); } catch (Throwable e) { call.reject("invalid json"); return; }
        ui(() -> {
            if (map == null) { pendingStyle = json; call.resolve(); return; }
            applyStyle(json);
            call.resolve();
        });
    }

    private void applyStyle(String json) {
        pendingStyle = null;
        map.setStyle(new Style.Builder().fromJson(json), this::styleLoaded);
    }

    private void styleLoaded(Style st) {
        for (Map.Entry<String, Bitmap> e : images.entrySet()) st.addImage(e.getKey(), e.getValue());
        JSObject o = new JSObject(); o.put("ok", true);
        notifyListeners("style", o);
    }

    @PluginMethod
    public void setCamera(final PluginCall call) {
        final Double lng = call.getDouble("lng"), lat = call.getDouble("lat");
        if (lng == null || lat == null) { call.reject("center"); return; }
        final double zoom = call.getDouble("zoom", 14.0);
        final double bearing = call.getDouble("bearing", 0.0);
        final double pitch = call.getDouble("pitch", 0.0);
        final double duration = call.getDouble("duration", 0.0);
        final boolean linear = Boolean.TRUE.equals(call.getBoolean("linear", false));
        final boolean fly = Boolean.TRUE.equals(call.getBoolean("fly", false));
        ui(() -> {
            if (map == null || Double.isNaN(lat) || Double.isNaN(lng) || Double.isNaN(zoom)) { call.resolve(); return; }
            CameraPosition pos = new CameraPosition.Builder().target(new LatLng(lat, lng)).zoom(zoom)
                .bearing((bearing % 360 + 360) % 360).tilt(Math.max(0, Math.min(75, pitch))).build();
            CameraUpdate up = CameraUpdateFactory.newCameraPosition(pos);
            if (duration <= 0 && !fly) map.moveCamera(up);
            else if (fly) map.animateCamera(up, duration > 0 ? (int) duration : 1200);
            else map.easeCamera(up, (int) duration, !linear);
            call.resolve();
        });
    }

    @PluginMethod
    public void setRects(final PluginCall call) {
        JSArray arr = call.getArray("r", new JSArray());
        final List<float[]> out = new ArrayList<>();
        try {
            for (int i = 0; i + 3 < arr.length(); i += 4) {
                out.add(new float[]{(float) arr.getDouble(i), (float) arr.getDouble(i + 1), (float) arr.getDouble(i + 2), (float) arr.getDouble(i + 3)});
            }
        } catch (Throwable e) { /* */ }
        ui(() -> { webRects.clear(); webRects.addAll(out); call.resolve(); });
    }

    @PluginMethod
    public void setGeoJSON(final PluginCall call) {
        final String id = call.getString("id"), data = call.getString("data");
        if (id == null || data == null) { call.reject("args"); return; }
        ui(() -> {
            JSObject r = new JSObject();
            Style st = map != null ? map.getStyle() : null;
            GeoJsonSource src = st != null && st.isFullyLoaded() ? st.getSourceAs(id) : null;
            if (src == null) { r.put("ok", false); call.resolve(r); return; }
            try { src.setGeoJson(data); } catch (Throwable e) { /* */ }
            r.put("ok", true); call.resolve(r);
        });
    }

    @PluginMethod
    public void setVisibility(final PluginCall call) {
        final String id = call.getString("id");
        if (id == null) { call.reject("id"); return; }
        final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));
        ui(() -> {
            Style st = map != null ? map.getStyle() : null;
            Layer l = st != null && st.isFullyLoaded() ? st.getLayer(id) : null;
            if (l != null) l.setProperties(PropertyFactory.visibility(visible ? Property.VISIBLE : Property.NONE));
            call.resolve();
        });
    }

    @PluginMethod
    public void setImages(final PluginCall call) {
        JSArray list = call.getArray("images", new JSArray());
        final Map<String, Bitmap> dec = new HashMap<>();
        try {
            for (int i = 0; i < list.length(); i++) {
                JSONObject it = list.getJSONObject(i);
                String name = it.optString("name", null), b64 = it.optString("data", null);
                if (name == null || b64 == null) continue;
                double scale = it.optDouble("scale", 3);
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                Bitmap bm = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (bm == null) continue;
                // l'image est dessinée en x3 : on la déclare comme telle pour garder la bonne taille à l'écran
                bm.setDensity((int) Math.round(DisplayMetrics.DENSITY_DEFAULT * scale));
                dec.put(name, bm);
            }
        } catch (Throwable e) { /* */ }
        ui(() -> {
            images.putAll(dec);
            Style st = map != null ? map.getStyle() : null;
            if (st != null && st.isFullyLoaded()) for (Map.Entry<String, Bitmap> e : dec.entrySet()) st.addImage(e.getKey(), e.getValue());
            call.resolve();
        });
    }

    @PluginMethod
    public void clearImages(final PluginCall call) {
        ui(() -> {
            Style st = map != null ? map.getStyle() : null;
            if (st != null && st.isFullyLoaded()) for (String n : images.keySet()) { try { st.removeImage(n); } catch (Throwable e) { /* */ } }
            images.clear();
            call.resolve();
        });
    }

    // ---------- Carte hors connexion de la région ----------

    @PluginMethod
    public void downloadRegion(final PluginCall call) {
        final Double lat = call.getDouble("lat"), lon = call.getDouble("lon");
        if (lat == null || lon == null) { call.reject("position manquante"); return; }
        final double km = call.getDouble("radiusKm", 20.0);
        final String style = call.getString("styleURL", "https://tiles.openfreemap.org/styles/liberty");
        ui(() -> {
            try {
                MapLibre.getInstance(getContext());
                final OfflineManager om = OfflineManager.getInstance(getContext());
                double dLat = km / 111.0, dLon = km / (111.0 * Math.cos(Math.toRadians(lat)));
                final LatLngBounds b = LatLngBounds.from(lat + dLat, lon + dLon, lat - dLat, lon - dLon);
                om.listOfflineRegions(new OfflineManager.ListOfflineRegionsCallback() {
                    @Override public void onList(OfflineRegion[] regions) {
                        if (regions != null) for (OfflineRegion r : regions) r.delete(new OfflineRegion.OfflineRegionDeleteCallback() {
                            @Override public void onDelete() { }
                            @Override public void onError(String error) { }
                        });
                        OfflineTilePyramidRegionDefinition def = new OfflineTilePyramidRegionDefinition(style, b, 6, 14, density);
                        om.createOfflineRegion(def, "routa-region".getBytes(), new OfflineManager.CreateOfflineRegionCallback() {
                            @Override public void onCreate(OfflineRegion region) {
                                region.setDownloadState(OfflineRegion.STATE_ACTIVE);
                                JSObject r = new JSObject(); r.put("started", true); call.resolve(r);
                            }
                            @Override public void onError(String error) { call.reject(error); }
                        });
                    }
                    @Override public void onError(String error) { call.reject(error); }
                });
            } catch (Throwable e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    @PluginMethod
    public void regionStatus(final PluginCall call) {
        ui(() -> {
            try {
                MapLibre.getInstance(getContext());
                OfflineManager.getInstance(getContext()).listOfflineRegions(new OfflineManager.ListOfflineRegionsCallback() {
                    @Override public void onList(OfflineRegion[] regions) {
                        if (regions == null || regions.length == 0) { JSObject r = new JSObject(); r.put("exists", false); call.resolve(r); return; }
                        final OfflineRegion reg = regions[0];
                        reg.setDownloadState(OfflineRegion.STATE_ACTIVE);
                        reg.getStatus(new OfflineRegion.OfflineRegionStatusCallback() {
                            @Override public void onStatus(OfflineRegionStatus s) {
                                if (s.isComplete()) reg.setDownloadState(OfflineRegion.STATE_INACTIVE);
                                JSObject r = new JSObject();
                                r.put("exists", true);
                                r.put("done", s.getCompletedResourceCount());
                                r.put("total", s.getRequiredResourceCount());
                                r.put("bytes", s.getCompletedResourceSize());
                                r.put("complete", s.isComplete());
                                call.resolve(r);
                            }
                            @Override public void onError(String error) { call.reject(error); }
                        });
                    }
                    @Override public void onError(String error) { call.reject(error); }
                });
            } catch (Throwable e) { call.reject(String.valueOf(e.getMessage())); }
        });
    }

    // ---------- Touchers : hors de l'interface, ils vont à la carte ----------

    @SuppressLint("ClickableViewAccessibility")
    private void installTouch(final WebView web) {
        web.setOnTouchListener((v, e) -> {
            if (!active || mapView == null || mapView.getVisibility() != View.VISIBLE) return false;
            if (e.getActionMasked() == MotionEvent.ACTION_DOWN) {
                float x = e.getX() / density, y = e.getY() / density;
                boolean onWeb = false;
                for (float[] r : webRects) { if (x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3]) { onWeb = true; break; } }
                toMap = !onWeb;
            }
            if (!toMap) return false;
            MotionEvent ev = MotionEvent.obtain(e);
            ev.offsetLocation(web.getX() - mapView.getX(), web.getY() - mapView.getY());
            mapView.dispatchTouchEvent(ev);
            ev.recycle();
            if (e.getActionMasked() == MotionEvent.ACTION_UP || e.getActionMasked() == MotionEvent.ACTION_CANCEL) toMap = false;
            return true;
        });
    }

    private void syncBounds(WebView web) {
        if (mapView == null || web.getWidth() == 0) return;
        ViewGroup.LayoutParams lp = mapView.getLayoutParams();
        if (lp.width != web.getWidth() || lp.height != web.getHeight()) { lp.width = web.getWidth(); lp.height = web.getHeight(); mapView.setLayoutParams(lp); }
        mapView.setX(web.getX()); mapView.setY(web.getY());
    }

    private double cssX(float px) {
        WebView web = getBridge().getWebView();
        return (px - (web.getX() - mapView.getX())) / density;
    }

    private double cssY(float py) {
        WebView web = getBridge().getWebView();
        return (py - (web.getY() - mapView.getY())) / density;
    }

    private void onTap(LatLng p) {
        if (map == null) return;
        PointF s = map.getProjection().toScreenLocation(p);
        float r = 24 * density;
        String best = null; double bestD = Double.MAX_VALUE;
        try {
            List<Feature> fs = map.queryRenderedFeatures(new RectF(s.x - r, s.y - r, s.x + r, s.y + r), "routa-mk-v", "routa-mk-m");
            for (Feature f : fs) {
                if (!f.hasProperty("id")) continue;
                String id = f.getStringProperty("id");
                double d = Double.MAX_VALUE;
                if (f.geometry() instanceof Point) {
                    Point pt = (Point) f.geometry();
                    PointF fp = map.getProjection().toScreenLocation(new LatLng(pt.latitude(), pt.longitude()));
                    d = Math.hypot(fp.x - s.x, fp.y - s.y);
                }
                if (best == null || d < bestD) { bestD = d; best = id; }
            }
        } catch (Throwable e) { /* */ }
        JSObject o = new JSObject();
        if (best != null) { o.put("id", best); notifyListeners("marker", o); }
        else { o.put("x", cssX(s.x)); o.put("y", cssY(s.y)); notifyListeners("tap", o); }
    }

    // ---------- Caméra -> page ----------

    private void sendCamera(String phase) {
        if (map == null) return;
        CameraPosition c = map.getCameraPosition();
        if (c == null || c.target == null) return;
        JSObject o = new JSObject();
        o.put("lng", c.target.getLongitude());
        o.put("lat", c.target.getLatitude());
        o.put("zoom", c.zoom);
        o.put("bearing", c.bearing);
        o.put("pitch", c.tilt);
        o.put("gesture", gesture);
        o.put("phase", phase);
        notifyListeners("camera", o);
    }

    // ---------- Cycle de vie ----------

    @Override protected void handleOnStart() { super.handleOnStart(); if (mapView != null) mapView.onStart(); }
    @Override protected void handleOnResume() { super.handleOnResume(); if (mapView != null) mapView.onResume(); }
    @Override protected void handleOnPause() { if (mapView != null) mapView.onPause(); super.handleOnPause(); }
    @Override protected void handleOnStop() { if (mapView != null) mapView.onStop(); super.handleOnStop(); }
    @Override protected void handleOnDestroy() { if (mapView != null) mapView.onDestroy(); super.handleOnDestroy(); }
}
