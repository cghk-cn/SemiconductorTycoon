package io.semiconductortycoon;

import android.os.Bundle;
import android.util.Log;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // If a downloaded update is pending, prompt install
        UpdateManager um = new UpdateManager(this, this);
        String downloadedPath = um.getDownloadedApkPath();
        if (downloadedPath != null && new java.io.File(downloadedPath).exists()) {
            if (um.canInstallPackages()) {
                um.installApk(downloadedPath);
                um.clearDownloaded();
            } else {
                um.requestInstallPermission();
            }
        }

        // Also trigger a background update check when on WiFi
        if (um.isWifiConnected()) {
            new Thread(() -> {
                String result = um.checkAndUpdate();
                Log.d(TAG, "Update check: " + result);
            }).start();
        }
    }
}
