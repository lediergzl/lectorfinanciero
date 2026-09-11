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
  transfermovil,
  enzona,
  generic
];

/**
 * Procesa un SMS crudo y devuelve una "operación normalizada" o null
 * si el SMS no parece una transferencia.
 *
 * @param {Object} sms - { body: string, address: string, date: number (timestamp ms) }
 * @returns {Object|null} operación normalizada lista para guardar en DB
 */
export function processSms(sms) {
  const { body, address, date } = sms;

  if (!body || !looksLikeTransfer(body)) {
    return null; // se ignora, no se guarda nada
  }

  const parserModule = PARSERS.find((p) => p.matches(body, address));
  const result = parserModule.parse(body, date, address);

  // Si no se pudo extraer un monto o un identificador (teléfono/cuenta),
  // no tiene sentido guardar la operación: evita "basura" en la base de
  // datos por falsos positivos del filtro looksLikeTransfer.
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
