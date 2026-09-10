/**
 * recarga-y-transferencia-completada.js
 *
 * Ya NO importa qué banco mandó el SMS (Bandec, u otro con el mismo
 * formato) — solo la ESTRUCTURA del texto. Cubre dos variantes:
 *
 *  A) Recarga telefónica:
 *     "... La recarga se realizo con exito. Saldo a acreditar: 360 CUP.
 *      Saldo acreditado: 360 CUP. Monto Pagado: 324.0 CUP.
 *      Telefono: 55415602. Id transaccion: KW601PHUR9999. ..."
 *
 *     OJO: el SMS trae TRES montos distintos. El que realmente salió
 *     de la cuenta del usuario es "Monto Pagado", no "Saldo a acreditar"
 *     (eso es lo que recibe el teléfono recargado, puede diferir por
 *     comisión/descuento). Por eso se ancla explícitamente a esa frase
 *     en vez de tomar el primer número del texto.
 *
 *  B) Transferencia completada:
 *     "... La Transferencia fue completada. Fecha: 6/9/2026
 *      Beneficiario: 9227XXXXXXXX3044 Monto: 2800.00 CUP
 *      Nro. Transaccion: KW601OY5DJ999 ..."
 *
 *     Es una notificación al DUEÑO de la cuenta/tarjeta de que SU
 *     transferencia saliente se completó → siempre type = 'out'.
 *     El identificador que nos interesa aquí es el "Beneficiario"
 *     (la tarjeta/cuenta destino), no el banco que envió el SMS.
 */
import { extractDate } from '../patterns.js';

const RECARGA_HINT = /recarga/i;
const MONTO_PAGADO_REGEX = /monto pagado:\s*([\d.,]+)/i;
const TELEFONO_REGEX = /telefono:\s*(\d+)/i;

const TRANSFERENCIA_HINT = /transferencia fue completada/i;
const MONTO_REGEX = /\bmonto:\s*([\d.,]+)/i;
const BENEFICIARIO_REGEX = /beneficiario:\s*([\dX]+)/i;

const NRO_TRANSACCION_REGEX = /nro\.?\s*transaccion:?\s*([A-Za-z0-9]+)/i;
const ID_TRANSACCION_REGEX = /id transaccion:\s*([A-Za-z0-9]+)/i;

export function matches(text) {
  return RECARGA_HINT.test(text) || TRANSFERENCIA_HINT.test(text);
}

function parseAmount(rawNumber) {
  if (!rawNumber) return null;
  // Formato observado: "324.0", "2800.00" (punto decimal simple).
  const normalized = rawNumber.replace(/,/g, '');
  const amount = parseFloat(normalized);
  return isNaN(amount) ? null : amount;
}

export function parse(text, smsTimestamp) {
  const date = extractDate(text, smsTimestamp);

  if (RECARGA_HINT.test(text)) {
    const montoMatch = text.match(MONTO_PAGADO_REGEX);
    const telefonoMatch = text.match(TELEFONO_REGEX);
    const idMatch = text.match(ID_TRANSACCION_REGEX);

    return {
      identifier: telefonoMatch ? telefonoMatch[1] : null,
      amount: parseAmount(montoMatch ? montoMatch[1] : null),
      currency: 'CUP',
      date,
      type: 'out', // el dinero salió de la cuenta del usuario para pagar la recarga
      category: 'Recarga telefónica',
      transactionId: idMatch ? idMatch[1] : null,
      rawText: text
    };
  }

  if (TRANSFERENCIA_HINT.test(text)) {
    const montoMatch = text.match(MONTO_REGEX);
    const beneficiarioMatch = text.match(BENEFICIARIO_REGEX);
    const idMatch = text.match(NRO_TRANSACCION_REGEX);

    return {
      identifier: beneficiarioMatch ? beneficiarioMatch[1].toUpperCase() : null,
      amount: parseAmount(montoMatch ? montoMatch[1] : null),
      currency: 'CUP',
      date,
      type: 'out', // notificación al ordenante de que su transferencia salió
      category: 'Sin categoría',
      transactionId: idMatch ? idMatch[1] : null,
      rawText: text
    };
  }

  // No debería llegar aquí (matches() ya filtró), pero por seguridad:
  return { identifier: null, amount: null, currency: 'CUP', date, type: 'unknown', rawText: text };
}
