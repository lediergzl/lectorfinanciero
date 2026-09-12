/**
 * recarga-y-transferencia-completada.js
 *
 * Ya NO importa qué banco mandó el SMS (Bandec, u otro con el mismo
 * formato) — solo la ESTRUCTURA del texto. Cubre TRES variantes:
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
 *
 *  C) Compra de Plan (confirmado por el usuario: es una recarga
 *     telefónica, aunque el SMS no usa la palabra "recarga"):
 *     "Monedero Mi Transfer:  La compra del Plan fue completado.
 *      Ha comprado Plan de Voz de 10 minutos x 72.5 CUP
 *      Telefono: 5350207972.
 *      Importe: 72.50
 *      Importe Pagado: 65.25 CUP
 *      Nro. Transaccion: TMW184829008 ..."
 *
 *     Igual que en la recarga clásica, el SMS trae DOS montos
 *     ("Importe" e "Importe Pagado") y el que realmente salió de la
 *     cuenta del usuario es "Importe Pagado" (confirmado por el
 *     usuario), no "Importe".
 *
 * DESAMBIGUACIÓN DE DIRECCIÓN (variante B):
 * Algunos SMS de este tipo traen "Beneficiario" Y "Ordenante" como
 * NÚMEROS (no siempre "Ordenante" es la moneda "CUP"). Ej:
 *   "Beneficiario: 53038958  Ordenante: 5359447976"
 * Sin más información, no se puede saber con certeza cuál de los dos
 * es el usuario dueño del teléfono. Por eso `parse()` recibe
 * `ownIdentifiers` (un Set con los números/tarjetas propios que el
 * usuario configuró en Ajustes → "Mis números y tarjetas"): si
 * alguno de los dos campos coincide con un identificador propio, se
 * usa eso para decidir la dirección real (in/out) y cuál es el
 * identificador del CONTACTO (la otra parte). Si no hay coincidencia
 * o el usuario no configuró nada, se mantiene el comportamiento por
 * defecto de siempre (type='out', identifier=Beneficiario).
 */
import { extractDate } from '../patterns.js';

const RECARGA_HINT = /recarga/i;
const MONTO_PAGADO_REGEX = /monto pagado:\s*([\d.,]+)/i;
const TELEFONO_REGEX = /telefono:\s*(\d+)/i;

const TRANSFERENCIA_HINT = /transferencia fue completada/i;
const MONTO_REGEX = /\bmonto:\s*([\d.,]+)/i;
const BENEFICIARIO_REGEX = /beneficiario:\s*([\dX]+)/i;
// Solo captura si Ordenante es un número (a veces es la moneda "CUP", eso no interesa aquí).
const ORDENANTE_REGEX = /ordenante:\s*(\d+)/i;

const COMPRA_PLAN_HINT = /la compra del plan fue completado/i;
const IMPORTE_PAGADO_REGEX = /importe pagado:\s*([\d.,]+)/i;

const NRO_TRANSACCION_REGEX = /nro\.?\s*transaccion:?\s*([A-Za-z0-9]+)/i;
const ID_TRANSACCION_REGEX = /id transaccion:\s*([A-Za-z0-9]+)/i;

export function matches(text) {
  return RECARGA_HINT.test(text) || TRANSFERENCIA_HINT.test(text) || COMPRA_PLAN_HINT.test(text);
}

function parseAmount(rawNumber) {
  if (!rawNumber) return null;
  // Formato observado: "324.0", "2800.00" (punto decimal simple).
  const normalized = rawNumber.replace(/,/g, '');
  const amount = parseFloat(normalized);
  return isNaN(amount) ? null : amount;
}

export function parse(text, smsTimestamp, ownIdentifiers) {
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
    const ordenanteMatch = text.match(ORDENANTE_REGEX);
    const idMatch = text.match(NRO_TRANSACCION_REGEX);

    const beneficiario = beneficiarioMatch ? beneficiarioMatch[1].toUpperCase() : null;
    const ordenante = ordenanteMatch ? ordenanteMatch[1] : null;

    // Comportamiento por defecto (sin datos propios configurados):
    // se asume que el usuario es el ordenante -> transferencia saliente,
    // identificador de contacto = beneficiario.
    let identifier = beneficiario;
    let type = 'out';

    if (ownIdentifiers && ownIdentifiers.size > 0) {
      const beneficiarioEsMio = beneficiario && ownIdentifiers.has(beneficiario);
      const ordenanteEsMio = ordenante && ownIdentifiers.has(ordenante);

      if (beneficiarioEsMio && !ordenanteEsMio) {
        // El que recibe soy yo -> es una transferencia ENTRANTE, y el
        // contacto es quien la envió (el ordenante).
        identifier = ordenante;
        type = 'in';
      } else if (ordenanteEsMio && !beneficiarioEsMio) {
        // El que envía soy yo -> comportamiento por defecto (saliente).
        identifier = beneficiario;
        type = 'out';
      }
      // Si coinciden ambos, ninguno, o no hay suficiente información,
      // se mantiene el comportamiento por defecto de arriba.
    }

    return {
      identifier,
      amount: parseAmount(montoMatch ? montoMatch[1] : null),
      currency: 'CUP',
      date,
      type,
      category: 'Sin categoría',
      transactionId: idMatch ? idMatch[1] : null,
      rawText: text
    };
  }

  if (COMPRA_PLAN_HINT.test(text)) {
    // Confirmado por el usuario: se trata como una recarga telefónica.
    const montoMatch = text.match(IMPORTE_PAGADO_REGEX);
    const telefonoMatch = text.match(TELEFONO_REGEX);
    const idMatch = text.match(NRO_TRANSACCION_REGEX);

    return {
      identifier: telefonoMatch ? telefonoMatch[1] : null,
      amount: parseAmount(montoMatch ? montoMatch[1] : null),
      currency: 'CUP',
      date,
      type: 'out',
      category: 'Recarga telefónica',
      transactionId: idMatch ? idMatch[1] : null,
      rawText: text
    };
  }

  // No debería llegar aquí (matches() ya filtró), pero por seguridad:
  return { identifier: null, amount: null, currency: 'CUP', date, type: 'unknown', rawText: text };
}
