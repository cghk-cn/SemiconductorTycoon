package io.semiconductortycoon;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class UpdateManager {
    private static final String TAG = "UpdateManager";
    private static final String GITHUB_REPO = "cghk-cn/SemiconductorTycoon";
    private static final String RELEASES_API = "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest";
    private static final String PREFS = "update_prefs";
    private static final String KEY_DOWNLOADED_APK = "downloaded_apk_path";
    private static final String KEY_DOWNLOADED_VERSION = "downloaded_version";

    private final Context context;
    private final Activity activity;

    public UpdateManager(Context context, Activity activity) {
        this.context = context;
        this.activity = activity;
    }

    public boolean isWifiConnected() {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return false;
        NetworkInfo info = cm.getActiveNetworkInfo();
        return info != null && info.isConnected() && info.getType() == ConnectivityManager.TYPE_WIFI;
    }

    public String getCurrentVersionName() {
        try {
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            return pInfo.versionName;
        } catch (PackageManager.NameNotFoundException e) {
            return "1.0";
        }
    }

    public int getCurrentVersionCode() {
        try {
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                return (int) pInfo.getLongVersionCode();
            } else {
                return pInfo.versionCode;
            }
        } catch (PackageManager.NameNotFoundException e) {
            return 1;
        }
    }

    public String fetchLatestReleaseTag() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(RELEASES_API);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            int code = conn.getResponseCode();
            if (code != 200) return null;
            InputStream is = conn.getInputStream();
            StringBuilder sb = new StringBuilder();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) sb.append(new String(buf, 0, n));
            is.close();
            JSONObject json = new JSONObject(sb.toString());
            return json.optString("tag_name", null);
        } catch (Exception e) {
            Log.e("UpdateManager", "fetchLatestReleaseTag error", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public String fetchLatestApkUrl() {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(RELEASES_API);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Accept", "application/vnd.github+json");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            int code = conn.getResponseCode();
            if (code != 200) return null;
            InputStream is = conn.getInputStream();
            StringBuilder sb = new StringBuilder();
            byte[] buf = new byte[4096];
            int n;
            while ((n = is.read(buf)) > 0) sb.append(new String(buf, 0, n));
            is.close();
            JSONObject json = new JSONObject(sb.toString());
            JSONArray assets = json.optJSONArray("assets");
            if (assets == null) return null;
            for (int i = 0; i < assets.length(); i++) {
                JSONObject a = assets.getJSONObject(i);
                String name = a.optString("name", "");
                if (name.endsWith(".apk")) {
                    return a.optString("browser_download_url", null);
                }
            }
            return null;
        } catch (Exception e) {
            Log.e("UpdateManager", "fetchLatestApkUrl error", e);
            return null;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    public boolean isNewer(String remoteTag) {
        if (remoteTag == null) return false;
        String remote = remoteTag.replaceFirst("^v", "");
        String current = getCurrentVersionName();
        String[] r = remote.split("\\.");
        String[] c = current.split("\\.");
        int len = Math.max(r.length, c.length);
        for (int i = 0; i < len; i++) {
            int rv = i < r.length ? parseIntSafe(r[i]) : 0;
            int cv = i < c.length ? parseIntSafe(c[i]) : 0;
            if (rv > cv) return true;
            if (rv < cv) return false;
        }
        return false;
    }

    private int parseIntSafe(String s) {
        try {
            StringBuilder sb = new StringBuilder();
            for (char ch : s.toCharArray()) {
                if (Character.isDigit(ch)) sb.append(ch);
                else break;
            }
            if (sb.length() == 0) return 0;
            return Integer.parseInt(sb.toString());
        } catch (Exception e) {
            return 0;
        }
    }

    public String downloadApk(String url) {
        if (url == null) return null;
        HttpURLConnection conn = null;
        FileOutputStream fos = null;
        InputStream is = null;
        try {
            File outDir = context.getCacheDir();
            File outFile = new File(outDir, "update.apk");
            if (outFile.exists()) outFile.delete();

            URL u = new URL(url);
            conn = (HttpURLConnection) u.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
            is = conn.getInputStream();
            fos = new FileOutputStream(outFile);
            byte[] buf = new byte[8192];
            int n;
            while ((n = is.read(buf)) > 0) {
                fos.write(buf, 0, n);
            }
            fos.flush();
            return outFile.getAbsolutePath();
        } catch (Exception e) {
            Log.e("UpdateManager", "downloadApk error", e);
            return null;
        } finally {
            try { if (fos != null) fos.close(); } catch (Exception ignored) {}
            try { if (is != null) is.close(); } catch (Exception ignored) {}
            if (conn != null) conn.disconnect();
        }
    }

    public void saveDownloadedApk(String path, String version) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_DOWNLOADED_APK, path)
                .putString(KEY_DOWNLOADED_VERSION, version)
                .apply();
    }

    public String getDownloadedApkPath() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_DOWNLOADED_APK, null);
    }

    public String getDownloadedVersion() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_DOWNLOADED_VERSION, null);
    }

    public void clearDownloaded() {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit()
                .remove(KEY_DOWNLOADED_APK)
                .remove(KEY_DOWNLOADED_VERSION)
                .apply();
    }

    public void installApk(String path) {
        if (path == null) return;
        File file = new File(path);
        if (!file.exists()) return;
        Uri uri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", file);
        } else {
            uri = Uri.fromFile(file);
        }
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        context.startActivity(intent);
    }

    public boolean canInstallPackages() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return context.getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    public void requestInstallPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
            intent.setData(Uri.parse("package:" + context.getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
        }
    }

    public String checkAndUpdate() {
        if (!isWifiConnected()) {
            return "Not on WiFi";
        }
        String tag = fetchLatestReleaseTag();
        if (tag == null) {
            return "No release found";
        }
        if (!isNewer(tag)) {
            return "Up to date";
        }
        String apkUrl = fetchLatestApkUrl();
        if (apkUrl == null) {
            return "No APK asset";
        }
        String path = downloadApk(apkUrl);
        if (path == null) {
            return "Download failed";
        }
        saveDownloadedApk(path, tag);
        return "Downloaded " + tag;
    }
}