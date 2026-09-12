/**
 * monedero-recargado.js
 * Cubre el patrón:
 *
 *   "Monedero MiTransfer: Su monedero CUP ha sido recargado con:
 *    500 CUP. Id Transaccion: TMW185485000."
 *
 * A diferencia de una transferencia normal, este SMS NO menciona
 * quién envía el dinero (el formato varía según el remitente —
 * algunos operadores/dispositivos lo mandan así, sin teléfono ni
 * cuenta origen — y no hay forma confiable de adivinarlo).
 *
 * Decisión (confirmada por el usuario): en vez de descartar el SMS o
 * intentar adivinar el origen, se genera un identificador SINTÉTICO
 * único (WALLET_<idTransaccion o hash>) para que la operación SIEMPRE
 * caiga en la bandeja de "Pendientes por etiquetar" y sea el usuario
 * quien decida a qué contacto/categoría asignarla.
 */
import { extractDate, extractAmount, simpleHash } from '../patterns.js';

// "monedero" ya está cubierto por looksLikeTransfer(); aquí solo
// necesitamos distinguir esta variante específica de las demás.
const HINT_REGEX = /ha sido recargado con/i;
const ID_TRANSACCION_REGEX = /id transaccion:\s*([A-Za-z0-9]+)/i;

export function matches(text) {
  return HINT_REGEX.test(text);
}

export function parse(text, smsTimestamp) {
  const { amount, currency } = extractAmount(text);
  const date = extractDate(text, smsTimestamp);
  const idMatch = text.match(ID_TRANSACCION_REGEX);
  const transactionId = idMatch ? idMatch[1] : null;

  // Identificador estable: el mismo SMS siempre produce el mismo
  // identificador (para que no se duplique si se re-sincroniza el
  // historial), pero cada transacción distinta produce uno distinto.
  const syntheticId = 'WALLET_' + (transactionId || simpleHash(`${text}|${smsTimestamp}`));

  return {
    identifier: syntheticId,
    amount,
    currency,
    date,
    // "type" se deja como 'in' (el saldo del monedero sube), pero el
    // usuario podrá recategorizar libremente al etiquetarla desde
    // Pendientes, ya que el origen real es desconocido.
    type: 'in',
    category: 'Sin categoría',
    transactionId,
    rawText: text
  };
}
