package io.semiconductortycoon;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.util.Log;

public class WifiUpdateReceiver extends BroadcastReceiver {
    private static final String TAG = "WifiUpdateReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        if (cm == null) return;
        NetworkInfo info = cm.getActiveNetworkInfo();
        if (info != null && info.isConnected() && info.getType() == ConnectivityManager.TYPE_WIFI) {
            Log.d(TAG, "WiFi connected, checking for update");
            // Run download in background thread
            new Thread(() -> {
                UpdateManager um = new UpdateManager(context, null);
                String result = um.checkAndUpdate();
                Log.d(TAG, "Update check result: " + result);
            }).start();
        }
    }
}