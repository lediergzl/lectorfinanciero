/**
 * enzona.js
 * Parser específico para SMS de EnZona.
 * Misma filosofía que transfermovil.js: usa las utilidades genéricas
 * y solo aporta la detección de remitente + cualquier particularidad
 * de formato que descubras al probar con SMS reales.
 */
import { extractPhone, extractAccount, extractAmount, extractDate, extractType } from '../patterns.js';

const SENDER_HINTS = /enzona/i;

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
