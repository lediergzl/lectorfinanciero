/**
 * transfermovil.js
 * Parser específico para SMS enviados por Transfermóvil.
 *
 * NOTA IMPORTANTE: los formatos exactos de texto pueden variar y cambiar
 * con el tiempo. Este parser está escrito para ser TOLERANTE (usa las
 * utilidades genéricas de patterns.js) en vez de depender de un único
 * formato exacto. Cuando tengas SMS reales de Transfermóvil, se recomienda
 * ajustar `SENDER_HINTS` y añadir casos de prueba en /docs/ejemplos-sms.md.
 */
import { extractPhone, extractAccount, extractAmount, extractDate, extractType } from '../patterns.js';

// Palabras/remitentes que identifican que el SMS viene de Transfermóvil.
const SENDER_HINTS = /transfermovil/i;

export function matches(text, senderAddress) {
  return SENDER_HINTS.test(text) || SENDER_HINTS.test(senderAddress || '');
}

export function parse(text, smsTimestamp) {
  const identifier = extractPhone(text) || extractAccount(text);
  const { amount, currency } = extractAmount(text);
  const date = extractDate(text, smsTimestamp);
  const type = extractType(text);

  return {
    identifier,
    amount,
    currency,
    date,
    type,
    rawText: text
  };
}
