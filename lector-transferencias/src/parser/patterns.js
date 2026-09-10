/**
 * patterns.js
 * Expresiones regulares y utilidades genéricas de extracción.
 * Estas funciones son usadas por TODOS los parsers específicos de banco
 * (transfermovil.js, enzona.js, generic.js) para evitar duplicar lógica.
 */

// --- TELÉFONOS ---
// Cuba: móviles empiezan por 5 (8 dígitos) o con prefijo país 53 (10 dígitos).
// Ej: 52345678, 5352345678, +5352345678
const PHONE_REGEX = /(?:\+?53)?(5\d{7})/;

export function extractPhone(text) {
  const match = text.match(PHONE_REGEX);
  if (!match) return null;
  // Normalizamos siempre a 8 dígitos sin prefijo país como identificador interno.
  return match[1];
}

// --- MONTOS ---
// Soporta: "500.00", "1,500.50", "$500", "500 CUP", "500,00 MLC", "1500"
// Captura el número y, si existe, la moneda (CUP, MLC, USD).
const AMOUNT_REGEX = /(?:\$|CUP|MLC|USD)?\s?([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)\s?(CUP|MLC|USD)?/i;

export function extractAmount(text) {
  const match = text.match(AMOUNT_REGEX);
  if (!match) return { amount: null, currency: null };

  let rawNumber = match[1];
  // Normalizar separador decimal: si hay coma Y punto, el último es el decimal.
  // Si solo hay coma, asumimos que es separador de miles (formato cubano común: 1,500).
  if (rawNumber.includes(',') && rawNumber.includes('.')) {
    rawNumber = rawNumber.replace(/,/g, '');
  } else if (rawNumber.includes(',')) {
    // Si la parte tras la coma tiene 2 dígitos, es decimal; si no, es miles.
    const parts = rawNumber.split(',');
    if (parts[parts.length - 1].length === 2) {
      rawNumber = rawNumber.replace(',', '.');
    } else {
      rawNumber = rawNumber.replace(/,/g, '');
    }
  }

  const amount = parseFloat(rawNumber);
  const currency = (match[2] || guessCurrency(text) || 'CUP').toUpperCase();

  return { amount: isNaN(amount) ? null : amount, currency };
}

function guessCurrency(text) {
  if (/mlc/i.test(text)) return 'MLC';
  if (/usd|dólar|dolar/i.test(text)) return 'USD';
  return 'CUP';
}

// --- FECHAS ---
// Formatos comunes en SMS bancarios cubanos:
// "09/09/2026 14:35", "09-09-2026", "2026-09-09 14:35:00"
// y también sin ceros a la izquierda: "8/9/2026", "31/8/2026" (D/M/AAAA)
const DATE_REGEX =
  /(\d{4}-\d{1,2}-\d{1,2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)|(\d{1,2}[/-]\d{1,2}[/-]\d{4}(?:\s\d{2}:\d{2})?)/;

export function extractDate(text, smsTimestamp) {
  const match = text.match(DATE_REGEX);
  if (!match) {
    // Si el SMS no trae fecha explícita, usamos la fecha de recepción del propio SMS.
    return smsTimestamp ? new Date(smsTimestamp).toISOString() : new Date().toISOString();
  }

  const raw = match[0];
  let iso;
  if (raw.includes('-') && raw.indexOf('-') === 4) {
    // Ya viene en formato ISO-like (2026-09-09...)
    iso = new Date(raw.replace(' ', 'T')).toISOString();
  } else {
    // Formato D/M/AAAA, DD/MM/AAAA o con guiones. Se normaliza con padStart
    // porque el formato cubano usa día/mes SIN ceros a la izquierda.
    const [datePart, timePart] = raw.split(' ');
    const sep = datePart.includes('/') ? '/' : '-';
    const [d, m, y] = datePart.split(sep);
    const time = timePart || '00:00';
    const dd = d.padStart(2, '0');
    const mm = m.padStart(2, '0');
    iso = new Date(`${y}-${mm}-${dd}T${time}:00`).toISOString();
  }
  return iso;
}

// --- CUENTAS BANCARIAS ---
// Cubren tanto números completos (9204069996188454, 16 dígitos típico)
// como enmascarados por el banco (9227XXXXXXXX3044).
const ACCOUNT_REGEX = /\b(\d{4}X{4,}\d{2,6}|\d{10,20})\b/i;

export function extractAccount(text) {
  const match = text.match(ACCOUNT_REGEX);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Determina el tipo de identificador (para no confundir cuentas con
 * teléfonos al guardar/mostrar el contacto).
 */
export function identifierType(identifier) {
  if (!identifier) return null;
  // Teléfono cubano: 8 dígitos (52345678) o con prefijo país, 10 dígitos (5352345678).
  return /^5\d{7}$/.test(identifier) || /^53\d{8}$/.test(identifier) ? 'phone' : 'account';
}

// --- TIPO DE OPERACIÓN (entrante / saliente) ---
const INCOMING_KEYWORDS = /recibid|recibió|ha recibido|acreditad|ingres[oó]|abono/i;
const OUTGOING_KEYWORDS = /enviad|envió|ha enviado|realizad|pago realizado|debitad|egreso|transferid[oa] a/i;

export function extractType(text) {
  if (INCOMING_KEYWORDS.test(text)) return 'in';
  if (OUTGOING_KEYWORDS.test(text)) return 'out';
  return 'unknown';
}

// --- ¿PARECE UNA TRANSFERENCIA? ---
// Filtro rápido antes de intentar parsear en profundidad.
const TRANSFER_HINT_REGEX =
  /transferenc|saldo|transfer[eé]ncia|pago realizado|has recibido|has enviado|operaci[oó]n|transfermovil|enzona|recarga|monedero|titular del tel[eé]fono/i;

export function looksLikeTransfer(text) {
  return TRANSFER_HINT_REGEX.test(text);
}

// --- HASH simple para deduplicación (texto + fecha del SMS) ---
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}
