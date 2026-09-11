package com.lectortransferencias.sms;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.PackageManager;
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

/**
 * SmsReaderPlugin
 *
 * Plugin nativo Capacitor que expone a JavaScript:
 *  - requestPermissions()
 *  - checkPermissions()
 *  - readAllSms(): lee el historial completo vía ContentResolver
 *  - openAppSettings(): abre la pantalla de "Info de la app" del
 *    sistema, para cuando Android ya no deja pedir el permiso de SMS
 *    de nuevo (el usuario marcó "no volver a preguntar" o lo desactivó
 *    manualmente) y hay que dejarlo entrar a activarlo a mano.
 *
 * El listener de SMS entrantes en tiempo real se implementa por separado
 * en IncomingSmsReceiver.java (BroadcastReceiver), que emite el evento
 * "smsReceived" a través de este plugin.
 *
 * IMPORTANTE: READ_SMS y RECEIVE_SMS son permisos "peligrosos" restringidos
 * por Google Play para la mayoría de apps. Este plugin está pensado para
 * distribución como APK directa (fuera de Play Store), como se acordó
 * para el ecosistema cubano.
 */
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
        // Registra esta instancia como la activa para que
        // IncomingSmsReceiver pueda reenviarle los SMS nuevos.
        IncomingSmsReceiver.activePluginInstance = this;
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

    /**
     * Abre directamente la pantalla de ajustes de ESTA app dentro de
     * "Aplicaciones" del sistema (donde vive el interruptor de permisos
     * de SMS). Se usa como respaldo cuando Android ya no muestra el
     * diálogo nativo de permisos (denegación permanente).
     */
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

    /**
     * Lee el historial completo de SMS de la bandeja de entrada usando
     * el ContentResolver estándar de Android (content://sms/inbox).
     * No filtra por contenido aquí: ese trabajo lo hace el parser en JS
     * (src/parser/index.js), este método solo entrega los datos crudos.
     */
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

    /**
     * Llamado por IncomingSmsReceiver cuando llega un SMS nuevo.
     * Emite el evento "smsReceived" hacia JavaScript.
     */
    public void notifySmsReceived(String address, String body, long date) {
        JSObject data = new JSObject();
        data.put("address", address);
        data.put("body", body);
        data.put("date", date);
        notifyListeners("smsReceived", data);
    }
}
