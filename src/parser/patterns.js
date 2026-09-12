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
  const fallback = smsTimestamp ? new Date(smsTimestamp).toISOString() : new Date().toISOString();
  const nowMs = Date.now();
  // Margen de 1 día para no descartar por diferencias de huso horario
  // entre el teléfono y el servidor/dispositivo que corre la app.
  const FUTURE_GRACE_MS = 24 * 60 * 60 * 1000;

  const match = text.match(DATE_REGEX);
  if (!match) {
    // Si el SMS no trae fecha explícita, usamos la fecha de recepción del propio SMS.
    return fallback;
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
    let [d, m, y] = datePart.split(sep).map(Number);
    const time = timePart || '00:00';

    // BUG conocido ("se están indexando transferencias en fechas
    // futuras"): si el mes quedó fuera de rango (>12) por venir en
    // formato M/D en vez de D/M, Date lo "desborda" al año/mes
    // siguiente y produce una fecha futura. Si eso pasa y el día SÍ
    // es un mes válido, se intercambian día/mes como corrección.
    if (m > 12 && d <= 12) {
      const tmp = d;
      d = m;
      m = tmp;
    }

    const dd = String(d).padStart(2, '0');
    const mm = String(m).padStart(2, '0');

    // Si aun así el mes o el día quedaron fuera de rango, la fecha
    // detectada no es de fiar: usamos la fecha de recepción del SMS.
    if (m < 1 || m > 12 || d < 1 || d > 31) {
      return fallback;
    }

    iso = new Date(`${y}-${mm}-${dd}T${time}:00`).toISOString();
  }

  const parsedMs = new Date(iso).getTime();

  // Guardia definitiva contra fechas futuras: una transferencia nunca
  // puede haber ocurrido después de "ahora", así que si el texto del
  // SMS nos hizo calcular una fecha futura (número mal interpretado,
  // año equivocado, etc.), se descarta y se usa la fecha real de
  // recepción del SMS en su lugar.
  if (isNaN(parsedMs) || parsedMs > nowMs + FUTURE_GRACE_MS) {
    return fallback;
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
 *
 * "WALLET_..." es un identificador SINTÉTICO (no viene del SMS) que
 * usamos cuando el SMS notifica que el monedero propio del usuario
 * fue recargado pero NO menciona quién envió el dinero (ver
 * banks/monedero-recargado.js). Estas operaciones siempre quedan
 * pendientes para que el usuario decida a quién/qué asignarlas.
 */
export function identifierType(identifier) {
  if (!identifier) return null;
  if (identifier.startsWith('WALLET_')) return 'wallet';
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
  /transferenc|saldo|transfer[eé]ncia|pago realizado|has recibido|has enviado|operaci[oó]n|transfermovil|enzona|recarga|monedero|titular del tel[eé]fono|compra del plan/i;

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
