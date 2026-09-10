/**
 * smsReader.js
 * Envoltorio JS sobre el plugin nativo personalizado `SmsReader`
 * (ver android-plugin/ para el código Kotlin).
 *
 * Expone:
 *  - requestPermissions(): pide RECEIVE_SMS y READ_SMS
 *  - readAllSms(): lee el historial completo de SMS del dispositivo
 *  - addIncomingListener(cb): se suscribe a SMS nuevos en tiempo real
 */
import { registerPlugin } from '@capacitor/core';

const SmsReaderPlugin = registerPlugin('SmsReader');

export async function requestSmsPermissions() {
  const result = await SmsReaderPlugin.requestPermissions();
  // result: { receiveSms: 'granted'|'denied', readSms: 'granted'|'denied' }
  return result;
}

export async function checkSmsPermissions() {
  return SmsReaderPlugin.checkPermissions();
}

/**
 * Lee el historial de SMS ya existentes en el dispositivo (ContentResolver).
 * Devuelve un array de { address, body, date } (date en ms epoch).
 */
export async function readAllSms() {
  const { messages } = await SmsReaderPlugin.readAllSms();
  return messages;
}

/**
 * Se suscribe a SMS entrantes en tiempo real (BroadcastReceiver nativo).
 * `callback` recibe un objeto { address, body, date }.
 * Devuelve una función para cancelar la suscripción.
 */
export function addIncomingSmsListener(callback) {
  const handle = SmsReaderPlugin.addListener('smsReceived', (data) => {
    callback(data);
  });
  return () => handle.remove();
}
