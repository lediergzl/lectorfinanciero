/**
 * transferencia-recibida.js
 * Cubre el patrón, muy común entre distintos bancos/monederos:
 *
 *   "El titular del telefono 5351476873 le ha realizado una
 *    transferencia al Monedero MiTransfer 59446530 de 1000.00 CUP.
 *    Nro. Transaccion TMW185142982. Fecha: 8/9/2026."
 *
 *   "El titular del telefono 5354199878 le ha realizado una
 *    transferencia a la cuenta 9204069996188454 de 2700.00 CUP.
 *    Nro. Transaccion KW601NQJZV999. Fecha: 31/8/2026."
 *
 * Da igual si el destino es un "Monedero" o una "cuenta": lo importante
 * es que SIEMPRE describe dinero que otra persona (el teléfono mencionado)
 * envía HACIA el usuario que recibe el SMS. Por eso type = 'in' siempre,
 * y el identificador del contacto es el teléfono del remitente (no el
 * monedero/cuenta destino, que es del propio usuario).
 */
import { extractDate } from '../patterns.js';

const TITULAR_REGEX = /el titular del tel[eé]fono\s+(\d+)\s+le ha realizado una transferencia/i;
const AMOUNT_REGEX = /de\s+([\d.,]+)\s*(CUP|MLC|USD)?/i;
const NRO_TRANSACCION_REGEX = /nro\.?\s*transaccion:?\s*([A-Za-z0-9]+)/i;

export function matches(text) {
  return TITULAR_REGEX.test(text);
}

function parseAmount(rawNumber) {
  if (!rawNumber) return null;
  const normalized = rawNumber.replace(/,/g, '');
  const amount = parseFloat(normalized);
  return isNaN(amount) ? null : amount;
}

export function parse(text, smsTimestamp) {
  const titularMatch = text.match(TITULAR_REGEX);
  const amountMatch = text.match(AMOUNT_REGEX);
  const idMatch = text.match(NRO_TRANSACCION_REGEX);
  const date = extractDate(text, smsTimestamp);

  return {
    identifier: titularMatch ? titularMatch[1] : null,
    amount: parseAmount(amountMatch ? amountMatch[1] : null),
    currency: (amountMatch && amountMatch[2]) ? amountMatch[2].toUpperCase() : 'CUP',
    date,
    type: 'in',
    category: 'Sin categoría',
    transactionId: idMatch ? idMatch[1] : null,
    rawText: text
  };
}
