/**
 * transferencia-saliente-cuenta.js
 * Cubre el patrón:
 *
 *   "Se ha realizado una transferencia a la cuenta 9205959877401647
 *    de 30000.00 CUP. Nro. Transaccion MM6050B8B0987. Fecha: 24/8/2026."
 *
 *   "Se ha realizado una transferencia a la cuenta: 9238XXXXXXXX5351
 *    de 63000.00 CUP. Nro. Transaccion TMW183912329"
 *
 * A diferencia de transferencia-recibida.js, aquí NO se menciona un
 * teléfono remitente: es el propio usuario quien envió el dinero a esa
 * cuenta. Por eso type = 'out' y el identificador de contacto es la
 * cuenta/tarjeta destino. No importa qué banco mandó el SMS (BPA,
 * Metropolitano u otro): solo nos interesa la tarjeta/cuenta y el monto.
 */
import { extractDate } from '../patterns.js';

const PATTERN_REGEX = /se ha realizado una transferencia a la cuenta:?\s*([\dX]+)\s+de\s+([\d.,]+)\s*(CUP|MLC|USD)?/i;
const NRO_TRANSACCION_REGEX = /nro\.?\s*transaccion:?\s*([A-Za-z0-9]+)/i;

export function matches(text) {
  return PATTERN_REGEX.test(text);
}

function parseAmount(rawNumber) {
  if (!rawNumber) return null;
  const normalized = rawNumber.replace(/,/g, '');
  const amount = parseFloat(normalized);
  return isNaN(amount) ? null : amount;
}

export function parse(text, smsTimestamp) {
  const match = text.match(PATTERN_REGEX);
  const idMatch = text.match(NRO_TRANSACCION_REGEX);
  const date = extractDate(text, smsTimestamp);

  return {
    identifier: match ? match[1].toUpperCase() : null,
    amount: parseAmount(match ? match[2] : null),
    currency: (match && match[3]) ? match[3].toUpperCase() : 'CUP',
    date,
    type: 'out',
    category: 'Sin categoría',
    transactionId: idMatch ? idMatch[1] : null,
    rawText: text
  };
}
