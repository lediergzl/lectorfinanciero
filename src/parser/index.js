/**
 * parser/index.js
 * Punto de entrada del sistema de parseo.
 *
 * Flujo (según el diagrama que discutimos):
 *   SMS -> ¿parece transferencia? -> NO: ignorar
 *                                  -> SÍ: elegir parser de banco -> parsear -> normalizar
 */
import { looksLikeTransfer, simpleHash, identifierType } from './patterns.js';
import * as recargaYTransferenciaCompletada from './banks/recarga-y-transferencia-completada.js';
import * as transferenciaRecibida from './banks/transferencia-recibida.js';
import * as transferenciaSalienteCuenta from './banks/transferencia-saliente-cuenta.js';
import * as monederoRecargado from './banks/monedero-recargado.js';
import * as transfermovil from './banks/transfermovil.js';
import * as enzona from './banks/enzona.js';
import * as generic from './banks/generic.js';

// Orden importa: los parsers MÁS ESPECÍFICOS (mayor certeza en la
// extracción del monto correcto) van primero. `generic` va siempre al
// final porque su matches() siempre devuelve true (fallback).
// Ya no importa qué banco mandó el SMS, solo la estructura del texto.
const PARSERS = [
  recargaYTransferenciaCompletada,
  transferenciaRecibida,
  transferenciaSalienteCuenta,
  monederoRecargado,
  transfermovil,
  enzona,
  generic
];

/**
 * Procesa un SMS crudo y devuelve una "operación normalizada" o null
 * si el SMS no parece una transferencia.
 *
 * NOTA sobre fallidos ("Fallo la transferencia...", "Fallo la
 * recarga..."): estos SMS no traen monto ni identificador extraíbles
 * (o si lo traen, no representan dinero movido), así que caen de
 * forma natural en el filtro de abajo y NO se registran como
 * transacción. Esto es intencional: confirmado con el usuario que
 * las operaciones fallidas no deben contabilizarse.
 *
 * @param {Object} sms - { body: string, address: string, date: number (timestamp ms) }
 * @param {Set<string>} [ownIdentifiers] - números/tarjetas propios del
 *   usuario (Ajustes → "Mis números y tarjetas"). Se usa únicamente
 *   para desambiguar la dirección (in/out) en formatos donde el SMS
 *   no lo deja claro por sí solo (ver banks/recarga-y-transferencia-completada.js).
 * @returns {Object|null} operación normalizada lista para guardar en DB
 */
export function processSms(sms, ownIdentifiers) {
  const { body, address, date } = sms;

  if (!body || !looksLikeTransfer(body)) {
    return null; // se ignora, no se guarda nada
  }

  const parserModule = PARSERS.find((p) => p.matches(body, address));
  const result = parserModule.parse(body, date, ownIdentifiers);

  // Si no se pudo extraer un monto o un identificador (teléfono/cuenta/
  // identificador sintético de monedero), no tiene sentido guardar la
  // operación: evita "basura" en la base de datos por falsos positivos
  // del filtro looksLikeTransfer, y descarta de forma natural los SMS
  // de operaciones fallidas (no traen monto real movido).
  if (result.amount === null || !result.identifier) {
    return null;
  }

  return {
    ...result,
    identifierType: identifierType(result.identifier),
    smsHash: simpleHash(`${body}|${date}`), // usado para deduplicar
    smsAddress: address
  };
}

/**
 * Procesa un lote de SMS (por ejemplo, la lectura histórica inicial).
 * Devuelve solo las operaciones válidas (transferencias reconocidas).
 */
export function processSmsBatch(smsList) {
  return smsList
    .map(processSms)
    .filter((r) => r !== null);
}
