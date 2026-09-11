package com.lectortransferencias.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/**
 * IncomingSmsReceiver
 *
 * BroadcastReceiver que escucha SMS_RECEIVED_ACTION. Debe registrarse
 * en el AndroidManifest.xml (ver docs/android-manifest-snippet.xml).
 *
 * Cuando llega un SMS, reconstruye el mensaje completo (puede venir en
 * varios "pdus" si es largo) y lo reenvía al plugin activo mediante
 * un registro estático simple.
 */
public class IncomingSmsReceiver extends BroadcastReceiver {

    // Referencia estática al plugin activo, asignada cuando Capacitor
    // carga el plugin (ver SmsReaderPlugin -> load()).
    public static SmsReaderPlugin activePluginInstance;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!Telephony.Sms.Intents.SMS_RECEIVED_ACTION.equals(intent.getAction())) {
            return;
        }

        Bundle bundle = intent.getExtras();
        if (bundle == null) return;

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;

        // Reconstruir el cuerpo completo (SMS multipart) y usar el primer
        // remitente / timestamp como representativos del mensaje.
        StringBuilder fullBody = new StringBuilder();
        String address = messages[0].getOriginatingAddress();
        long timestamp = messages[0].getTimestampMillis();

        for (SmsMessage msg : messages) {
            fullBody.append(msg.getMessageBody());
        }

        if (activePluginInstance != null) {
            activePluginInstance.notifySmsReceived(address, fullBody.toString(), timestamp);
        }
        // Si activePluginInstance es null (app cerrada), el mensaje se
        // procesará igualmente la próxima vez que se llame a readAllSms(),
        // ya que quedó guardado por el sistema en content://sms/inbox.
    }
}
