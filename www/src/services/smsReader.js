/**
 * smsReader.js
 * Envoltorio JS sobre el plugin nativo personalizado `SmsReader`.
 *
 * Expone permisos, lectura del historial y escucha de SMS entrantes.
 * Los SMS recibidos por Android se persisten nativamente antes de emitir
 * el evento, por lo que no se pierden si el WebView muere entre ambos pasos.
 */
import { registerPlugin } from '../vendor/capacitor-core.js';

const SmsReaderPlugin = registerPlugin('SmsReader');

export async function requestSmsPermissions() {
  const result = await SmsReaderPlugin.requestPermissions();
  return result;
}

export async function checkSmsPermissions() {
  return SmsReaderPlugin.checkPermissions();
}

export async function openAppSettings() {
  return SmsReaderPlugin.openAppSettings();
}

export async function readAllSms() {
  const { messages } = await SmsReaderPlugin.readAllSms();
  return messages;
}

/**
 * Devuelve SMS recibidos mientras el WebView no estaba activo.
 */
export async function readPendingIncomingSms() {
  const { messages } = await SmsReaderPlugin.getPendingIncomingSms();
  return messages;
}

/**
 * Confirma que un SMS ya fue procesado por JS y puede salir de la cola nativa.
 */
export async function ackIncomingSms(sms) {
  return SmsReaderPlugin.ackIncomingSms({
    address: sms?.address ?? '',
    body: sms?.body ?? '',
    date: sms?.date ?? 0
  });
}

/**
 * Se suscribe a SMS entrantes en tiempo real.
 * El receiver nativo persiste primero y despues emite este evento.
 */
export function addIncomingSmsListener(callback) {
  const handle = SmsReaderPlugin.addListener('smsReceived', (data) => {
    callback(data);
  });
  return () => handle.remove();
}
