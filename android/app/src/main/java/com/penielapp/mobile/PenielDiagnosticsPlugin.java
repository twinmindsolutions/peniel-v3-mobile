package com.penielapp.mobile;

import android.util.Log;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

/** Staging/development QR diagnostics only; values are already sanitized in TypeScript. */
@CapacitorPlugin(name = "PenielDiagnostics")
public class PenielDiagnosticsPlugin extends Plugin {
    private static final String TAG = "PenielQR";

    @PluginMethod
    public void log(PluginCall call) {
        String event = call.getString("event", "unknown");
        String timestamp = call.getString("timestamp", "unknown");
        long sequence = call.getLong("sequence", -1L);
        long attemptId = call.getLong("attempt_id", -1L);
        String summary = call.getString("summary", "");

        // Log only the fixed diagnostic fields. Do not stringify arbitrary JS
        // input or exception objects into Logcat.
        Log.d(TAG, "event=" + safe(event)
            + " sequence=" + sequence
            + " attempt_id=" + attemptId
            + " timestamp=" + safe(timestamp)
            + " summary=" + safe(summary)
            + " queue_count=" + call.getLong("queue_count", -1L)
            + " foreground=" + safe(call.getString("foreground", "unknown"))
            + " component=" + safe(call.getString("component", "unknown"))
            + " generation_match=" + call.getBoolean("generation_match", false)
            + " http_status=" + call.getLong("http_status", -1L)
            + " error_category=" + safe(call.getString("error_category", "none")));
        call.resolve();
    }

    private String safe(String value) {
        if (value == null) {
            return "unknown";
        }
        String sanitized = value.replaceAll("[\\r\\n\\t]", "_");
        return sanitized.substring(0, Math.min(sanitized.length(), 120));
    }
}
