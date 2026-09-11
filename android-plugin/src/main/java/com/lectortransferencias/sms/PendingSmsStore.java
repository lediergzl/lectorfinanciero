package com.lectortransferencias.sms;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Cola persistente mínima para SMS recibidos mientras el WebView/plugin JS
 * no está vivo. El BroadcastReceiver solo escribe y sale rápidamente.
 */
public final class PendingSmsStore {
    private static final String PREFS = "lector_transferencias_sms";
    private static final String KEY_QUEUE = "pending_sms_queue";
    private static final int MAX_ITEMS = 500;

    private PendingSmsStore() {}

    public static synchronized void enqueue(Context context, String address, String body, long date) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray oldQueue = readQueue(prefs);

        for (int i = 0; i < oldQueue.length(); i++) {
            JSONObject item = oldQueue.optJSONObject(i);
            if (same(item, address, body, date)) return;
        }

        JSONArray queue = new JSONArray();
        int start = Math.max(0, oldQueue.length() - (MAX_ITEMS - 1));
        for (int i = start; i < oldQueue.length(); i++) {
            queue.put(oldQueue.opt(i));
        }

        JSONObject item = new JSONObject();
        try {
            item.put("address", address == null ? "" : address);
            item.put("body", body == null ? "" : body);
            item.put("date", date);
            queue.put(item);
            prefs.edit().putString(KEY_QUEUE, queue.toString()).apply();
        } catch (Exception ignored) {
            // No se debe bloquear onReceive por un fallo de persistencia.
        }
    }

    public static synchronized JSONArray getAll(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        return readQueue(prefs);
    }

    public static synchronized void remove(Context context, String address, String body, long date) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray oldQueue = readQueue(prefs);
        JSONArray queue = new JSONArray();

        for (int i = 0; i < oldQueue.length(); i++) {
            JSONObject item = oldQueue.optJSONObject(i);
            if (!same(item, address, body, date)) queue.put(item);
        }

        prefs.edit().putString(KEY_QUEUE, queue.toString()).apply();
    }

    private static JSONArray readQueue(SharedPreferences prefs) {
        try {
            String raw = prefs.getString(KEY_QUEUE, "[]");
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    private static boolean same(JSONObject item, String address, String body, long date) {
        if (item == null) return false;
        return date == item.optLong("date", -1L)
                && safeEquals(address, item.optString("address", ""))
                && safeEquals(body, item.optString("body", ""));
    }

    private static boolean safeEquals(String a, String b) {
        return (a == null ? "" : a).equals(b == null ? "" : b);
    }
}
