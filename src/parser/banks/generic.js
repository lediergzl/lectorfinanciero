/**
 * generic.js
 * Parser de respaldo (fallback) para cuando el SMS "parece" una
 * transferencia (según looksLikeTransfer) pero no coincide con ningún
 * banco conocido (BANDEC, BPA, Banco Metropolitano, etc.).
 *
 * Este parser SIEMPRE "matches" — se usa como último recurso, después
 * de intentar todos los parsers específicos.
 */
import { extractPhone, extractAccount, extractAmount, extractDate, extractType } from '../patterns.js';

export function matches() {
  return true; // fallback universal
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
