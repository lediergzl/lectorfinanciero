package com.lectortransferencias.sms;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;

@CapacitorPlugin(
    name = "SmsReader",
    permissions = {
        @Permission(alias = "receiveSms", strings = { Manifest.permission.RECEIVE_SMS }),
        @Permission(alias = "readSms", strings = { Manifest.permission.READ_SMS })
    }
)
public class SmsReaderPlugin extends Plugin {

    @Override
    public void load() {
        super.load();
        IncomingSmsReceiver.activePluginInstance = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (IncomingSmsReceiver.activePluginInstance == this) {
            IncomingSmsReceiver.activePluginInstance = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("receiveSms", getPermissionState("receiveSms").toString());
        result.put("readSms", getPermissionState("readSms").toString());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        requestAllPermissions(call, "permissionsCallback");
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        checkPermissions(call);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudieron abrir los ajustes: " + e.getMessage());
        }
    }

    @PluginMethod
    public void readAllSms(PluginCall call) {
        if (getPermissionState("readSms") != com.getcapacitor.PermissionState.GRANTED) {
            call.reject("Permiso READ_SMS no concedido");
            return;
        }

        JSArray messages = new JSArray();
        ContentResolver resolver = getContext().getContentResolver();
        Uri inboxUri = Uri.parse("content://sms/inbox");
        String[] projection = { "address", "body", "date" };

        try (Cursor cursor = resolver.query(inboxUri, projection, null, null, "date DESC")) {
            if (cursor != null) {
                int addressIdx = cursor.getColumnIndexOrThrow("address");
                int bodyIdx = cursor.getColumnIndexOrThrow("body");
                int dateIdx = cursor.getColumnIndexOrThrow("date");

                while (cursor.moveToNext()) {
                    JSObject msg = new JSObject();
                    msg.put("address", cursor.getString(addressIdx));
                    msg.put("body", cursor.getString(bodyIdx));
                    msg.put("date", cursor.getLong(dateIdx));
                    messages.put(msg);
                }
            }
        } catch (Exception e) {
            call.reject("Error leyendo SMS: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("messages", messages);
        call.resolve(result);
    }

    @PluginMethod
    public void getPendingIncomingSms(PluginCall call) {
        try {
            JSONArray stored = PendingSmsStore.getAll(getContext().getApplicationContext());
            JSArray messages = new JSArray();
            for (int i = 0; i < stored.length(); i++) {
                org.json.JSONObject item = stored.optJSONObject(i);
                if (item == null) continue;
                JSObject msg = new JSObject();
                msg.put("address", item.optString("address", ""));
                msg.put("body", item.optString("body", ""));
                msg.put("date", item.optLong("date", 0L));
                messages.put(msg);
            }

            JSObject result = new JSObject();
            result.put("messages", messages);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Error leyendo cola de SMS pendientes: " + e.getMessage());
        }
    }

    @PluginMethod
    public void ackIncomingSms(PluginCall call) {
        String address = call.getString("address", "");
        String body = call.getString("body", "");
        Long date = call.getLong("date");
        if (date == null) {
            call.reject("Falta date para confirmar el SMS");
            return;
        }

        PendingSmsStore.remove(getContext().getApplicationContext(), address, body, date);
        call.resolve();
    }

    public void notifySmsReceived(String address, String body, long date) {
        JSObject data = new JSObject();
        data.put("address", address);
        data.put("body", body);
        data.put("date", date);
        notifyListeners("smsReceived", data);
    }
}
