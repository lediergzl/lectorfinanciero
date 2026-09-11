/**
 * smsReader.js
 * Envoltorio JS sobre el plugin nativo personalizado `SmsReader`
 * (ver android-plugin/ para el código Java).
 *
 * MIGRACIÓN SIN NODE/TYPESCRIPT: antes se usaba
 * `import { registerPlugin } from '@capacitor/core'`, que requería tener
 * el paquete npm instalado para poder compilar el bundle con Vite.
 *
 * IMPORTANTE: el runtime nativo de Android (native-bridge.js) SOLO
 * inyecta un `window.Capacitor` básico (platform, isNativePlatform,
 * etc.) — la función `registerPlugin` (la que realmente crea el proxy
 * que conecta un método de JS con su método nativo en Java) vive en el
 * paquete `@capacitor/core`, no la pone el bridge nativo por sí solo.
 * Por eso vendorizamos ese archivo (es JS puro, sin dependencias) en
 * `src/vendor/capacitor-core.js` y lo importamos con una ruta relativa,
 * sin necesitar `npm install` ni ningún bundler.
 *
 * Expone:
 *  - requestPermissions(): pide RECEIVE_SMS y READ_SMS
 *  - readAllSms(): lee el historial completo de SMS del dispositivo
 *  - addIncomingListener(cb): se suscribe a SMS nuevos en tiempo real
 */
import { registerPlugin } from '../vendor/capacitor-core.js';

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
 * Abre la pantalla de ajustes de ESTA app en el sistema Android
 * (donde vive el interruptor de permisos), para cuando Android ya no
 * deja mostrar el diálogo nativo de permisos (denegación permanente).
 */
export async function openAppSettings() {
  return SmsReaderPlugin.openAppSettings();
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
