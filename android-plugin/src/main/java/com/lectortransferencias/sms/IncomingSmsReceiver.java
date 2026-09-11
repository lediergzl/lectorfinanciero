package com.lectortransferencias.sms;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Telephony;
import android.telephony.SmsMessage;

/**
 * Recibe SMS nuevos desde Android incluso cuando la Activity/WebView no esta
 * abierta. El SMS se persiste primero y luego, si el plugin esta vivo, se
 * notifica inmediatamente al JavaScript.
 */
public class IncomingSmsReceiver extends BroadcastReceiver {

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

        StringBuilder fullBody = new StringBuilder();
        String address = messages[0].getOriginatingAddress();
        long timestamp = messages[0].getTimestampMillis();

        for (SmsMessage msg : messages) {
            if (msg != null) fullBody.append(msg.getMessageBody());
        }

        String body = fullBody.toString();

        // Persistir ANTES de notificar al WebView. Si Android mata el proceso
        // inmediatamente despues de onReceive(), el SMS no se pierde.
        PendingSmsStore.enqueue(context.getApplicationContext(), address, body, timestamp);

        SmsReaderPlugin plugin = activePluginInstance;
        if (plugin != null) {
            plugin.notifySmsReceived(address, body, timestamp);
        }
    }
}
