/**
 * database.js
 * Capa de acceso a datos usando el plugin nativo CapacitorSQLite
 * directamente, sin la clase de conveniencia `SQLiteConnection` del
 * paquete npm `@capacitor-community/sqlite` (esa clase es solo una
 * envoltura en JS que internamente llama a los mismos métodos nativos
 * que usamos aquí: createConnection, open, execute, query, run, close;
 * añade soporte multiplataforma web/Electron que esta app no necesita
 * porque es 100% Android).
 *
 * IMPORTANTE (migración sin Node/TypeScript): el bridge nativo de
 * Android (native-bridge.js) NO pone automáticamente los plugins en
 * `window.Capacitor.Plugins` — eso lo hace la función `registerPlugin`
 * de `@capacitor/core`, que crea el proxy JS↔nativo. Por eso, igual que
 * en smsReader.js, llamamos `registerPlugin('CapacitorSQLite')` usando
 * el archivo vendorizado `src/vendor/capacitor-core.js` (JS puro, sin
 * dependencias, sin npm ni bundler).
 *
 * Tablas:
 *  - groups(id, name UNIQUE, created_at)
 *  - contacts(id, identifier UNIQUE, identifier_type, alias, category,
 *             group_id, created_at)
 *      `identifier` aquí es el identificador ORIGINAL con el que se
 *      creó el contacto (la primera tarjeta/teléfono). Se conserva por
 *      compatibilidad con instalaciones previas.
 *  - contact_identifiers(identifier UNIQUE, identifier_type, contact_id)
 *      Identificadores ADICIONALES asociados a un contacto ya existente
 *      (requisito: "una misma persona puede tener mas de una tarjeta").
 *  - transactions(id, sms_hash UNIQUE, identifier, identifier_type,
 *                 contact_id, type, amount, currency, category, date,
 *                 raw_sms, created_at)
 *  - skipped_sms(sms_hash) — SMS que el usuario decidió omitir "siempre".
 *  - settings(key, value) — preferencias clave/valor.
 *
 * Deliberadamente NO se guarda el banco/remitente del SMS: no aporta
 * valor una vez que el identificador (teléfono o tarjeta/cuenta) queda
 * asociado a un contacto — ya sabemos de quién es la operación sin
 * importar qué banco mandó el aviso.
 */

import { registerPlugin } from '../vendor/capacitor-core.js';

const DB_NAME = 'lector_transferencias';
let opened = false;

const CapacitorSQLitePlugin = registerPlugin('CapacitorSQLite');

function sqlite() {
  return CapacitorSQLitePlugin;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT UNIQUE NOT NULL,
  identifier_type TEXT DEFAULT 'phone',
  alias TEXT NOT NULL,
  category TEXT DEFAULT 'Sin categoría',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Identificadores ADICIONALES (más tarjetas/teléfonos) de un contacto
-- que ya existe. Ver requisito: "una misma persona puede tener mas de
-- una tarjeta por tanto debe poder asociarse a un contacto existente".
CREATE TABLE IF NOT EXISTS contact_identifiers (
  identifier TEXT PRIMARY KEY,
  identifier_type TEXT DEFAULT 'phone',
  contact_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_hash TEXT UNIQUE NOT NULL,
  identifier TEXT,
  identifier_type TEXT,
  contact_id INTEGER,
  type TEXT CHECK(type IN ('in','out','unknown')) NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  category TEXT DEFAULT 'Sin categoría',
  date TEXT NOT NULL,
  raw_sms TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_identifier ON transactions(identifier);

-- SMS que el usuario decidió NO registrar "siempre" (botón "Omitir
-- siempre" en el modal "¿Quién es?"). Se recuerdan para no volver a
-- preguntar por el mismo SMS en futuras sincronizaciones. El botón
-- "Omitir por ahora" NO pasa por aquí (es temporal, ver main.js).
CREATE TABLE IF NOT EXISTS skipped_sms (
  sms_hash TEXT PRIMARY KEY,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Preferencias simples clave/valor (modo "una sola categoría", fecha
-- desde la cual indexar, etc.).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Transferencias detectadas cuyo identificador aún no está asociado a
-- ningún contacto. En vez de forzar un modal por cada una (bloqueante
-- si hay muchas, ej. 100 SMS de golpe), se guardan aquí para que el
-- usuario las etiquete cuando tenga tiempo, desde la bandeja
-- "Pendientes" (filtrada por día, con paginador).
CREATE TABLE IF NOT EXISTS pending_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_hash TEXT UNIQUE NOT NULL,
  identifier TEXT,
  identifier_type TEXT,
  type TEXT,
  amount REAL,
  currency TEXT,
  date TEXT,
  raw_sms TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pending_date ON pending_transactions(date);
`;

// Identificador fijo (no es un teléfono/cuenta real) que se usa para
// agrupar TODAS las transferencias bajo un único contacto cuando el
// usuario activa el "modo una sola categoría".
const CATCHALL_IDENTIFIER = '__CATCHALL__';

export async function initDatabase() {
  if (opened) return;

  await sqlite().createConnection({
    database: DB_NAME,
    version: 1,
    encrypted: false,
    mode: 'no-encryption',
    readonly: false
  });
  await sqlite().open({ database: DB_NAME });
  await sqlite().execute({ database: DB_NAME, statements: SCHEMA, transaction: true, readonly: false });
  await ensureContactsGroupColumn();
  opened = true;
}

async function ensureContactsGroupColumn() {
  const res = await sqlite().query({
    database: DB_NAME,
    statement: 'PRAGMA table_info(contacts)',
    values: []
  });
  const columns = (res.values || []).map((c) => c.name);
  if (!columns.includes('group_id')) {
    await sqlite().execute({
      database: DB_NAME,
      statements: 'ALTER TABLE contacts ADD COLUMN group_id INTEGER REFERENCES groups(id);',
      transaction: true,
      readonly: false
    });
  }
}

// --- CONTACTOS ---

export async function findContactByIdentifier(identifier) {
  let res = await sqlite().query({
    database: DB_NAME,
    statement: 'SELECT * FROM contacts WHERE identifier = ?',
    values: [identifier]
  });
  if (res.values && res.values.length) return res.values[0];

  res = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT c.* FROM contact_identifiers ci
                JOIN contacts c ON c.id = ci.contact_id
                WHERE ci.identifier = ?`,
    values: [identifier]
  });
  return res.values && res.values.length ? res.values[0] : null;
}

export async function createContact(identifier, identifierType, alias, category = 'Sin categoría') {
  await sqlite().run({
    database: DB_NAME,
    statement: 'INSERT INTO contacts (identifier, identifier_type, alias, category) VALUES (?, ?, ?, ?)',
    values: [identifier, identifierType, alias, category],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
  return findContactByIdentifier(identifier);
}

export async function associateIdentifierToContact(identifier, identifierType, contactId) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'INSERT OR REPLACE INTO contact_identifiers (identifier, identifier_type, contact_id) VALUES (?, ?, ?)',
    values: [identifier, identifierType, contactId],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
  return findContactByIdentifier(identifier);
}

export async function listContacts() {
  const res = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT c.*, g.name AS group_name,
                  1 + (SELECT COUNT(*) FROM contact_identifiers ci WHERE ci.contact_id = c.id) AS card_count
                FROM contacts c
                LEFT JOIN groups g ON g.id = c.group_id
                WHERE c.identifier != ?
                ORDER BY c.alias ASC`,
    values: [CATCHALL_IDENTIFIER]
  });
  return res.values || [];
}

// --- GRUPOS ---

export async function createGroup(name) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'INSERT INTO groups (name) VALUES (?)',
    values: [name],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
  const res = await sqlite().query({
    database: DB_NAME,
    statement: 'SELECT * FROM groups WHERE name = ?',
    values: [name]
  });
  return res.values && res.values.length ? res.values[0] : null;
}

export async function listGroups() {
  const res = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT g.*, COUNT(c.id) AS member_count
                FROM groups g
                LEFT JOIN contacts c ON c.group_id = g.id
                GROUP BY g.id
                ORDER BY g.name ASC`,
    values: []
  });
  return res.values || [];
}

export async function deleteGroup(groupId) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'UPDATE contacts SET group_id = NULL WHERE group_id = ?',
    values: [groupId],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
  await sqlite().run({
    database: DB_NAME,
    statement: 'DELETE FROM groups WHERE id = ?',
    values: [groupId],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

export async function assignContactToGroup(contactId, groupId) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'UPDATE contacts SET group_id = ? WHERE id = ?',
    values: [groupId || null, contactId],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

export async function getGroupSummary(groupId, year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const to = new Date(year, month, 1).toISOString();

  const totalsRes = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT t.type, SUM(t.amount) as total, t.currency
     FROM transactions t
     JOIN contacts c ON c.id = t.contact_id
     WHERE c.group_id = ? AND t.date >= ? AND t.date < ?
     GROUP BY t.type, t.currency`,
    values: [groupId, from, to]
  });

  const byContactRes = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT c.alias AS alias, t.type, t.currency, SUM(t.amount) as total, COUNT(*) as count
     FROM transactions t
     JOIN contacts c ON c.id = t.contact_id
     WHERE c.group_id = ? AND t.date >= ? AND t.date < ?
     GROUP BY c.id, t.type, t.currency
     ORDER BY total DESC`,
    values: [groupId, from, to]
  });

  return {
    totals: totalsRes.values || [],
    byContact: byContactRes.values || []
  };
}

// --- TRANSACCIONES ---

export async function insertTransaction(op, contactId) {
  const stmt = `
    INSERT OR IGNORE INTO transactions
      (sms_hash, identifier, identifier_type, contact_id, type, amount, currency, date, raw_sms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await sqlite().run({
    database: DB_NAME,
    statement: stmt,
    values: [
      op.smsHash,
      op.identifier,
      op.identifierType,
      contactId || null,
      op.type,
      op.amount,
      op.currency,
      op.date,
      op.rawText
    ],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

/** Persistencia de la cola de pendientes para sobrevivir a reinicios. */
export async function insertPendingTransaction(op) {
  await sqlite().run({
    database: DB_NAME,
    statement: `INSERT OR IGNORE INTO pending_transactions
      (sms_hash, identifier, identifier_type, type, amount, currency, date, raw_sms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    values: [op.smsHash, op.identifier, op.identifierType, op.type, op.amount, op.currency, op.date, op.rawText],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

export async function deletePendingTransaction(smsHash) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'DELETE FROM pending_transactions WHERE sms_hash = ?',
    values: [smsHash],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

export async function listPendingTransactions() {
  const res = await sqlite().query({
    database: DB_NAME,
    statement: 'SELECT * FROM pending_transactions ORDER BY date DESC',
    values: []
  });
  return (res.values || []).map((row) => ({
    identifier: row.identifier,
    identifierType: row.identifier_type,
    type: row.type,
    amount: row.amount,
    currency: row.currency,
    date: row.date,
    rawText: row.raw_sms,
    smsHash: row.sms_hash
  }));
}

export async function getTransactionsForContact(contactId, limit = 100, offset = 0) {
  const res = await sqlite().query({
    database: DB_NAME,
    statement: 'SELECT * FROM transactions WHERE contact_id = ? ORDER BY date DESC LIMIT ? OFFSET ?',
    values: [contactId, limit, offset]
  });
  return res.values || [];
}

export async function reassignTransaction(transactionId, contactId) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'UPDATE transactions SET contact_id = ? WHERE id = ?',
    values: [contactId, transactionId],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

export async function getMonthlySummary(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const toDate = new Date(year, month, 1);
  const to = toDate.toISOString();

  const totalsRes = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT type, SUM(amount) as total, currency
     FROM transactions
     WHERE date >= ? AND date < ?
     GROUP BY type, currency`,
    values: [from, to]
  });

  const byContactRes = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT
        COALESCE(c.alias, t.identifier, 'Desconocido') AS alias,
        t.type,
        t.currency,
        SUM(t.amount) as total,
        COUNT(*) as count
     FROM transactions t
     LEFT JOIN contacts c ON c.id = t.contact_id
     WHERE t.date >= ? AND t.date < ?
     GROUP BY alias, t.type, t.currency
     ORDER BY total DESC`,
    values: [from, to]
  });

  return {
    totals: totalsRes.values || [],
    byContact: byContactRes.values || []
  };
}

export async function getTransactionsForMonth(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const to = new Date(year, month, 1).toISOString();

  const res = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT t.*, c.alias FROM transactions t
     LEFT JOIN contacts c ON c.id = t.contact_id
     WHERE t.date >= ? AND t.date < ?
     ORDER BY t.date DESC`,
    values: [from, to]
  });
  return res.values || [];
}

export async function getTransactionsForDay(dateStr) {
  const from = `${dateStr}T00:00:00.000Z`;
  const to = `${dateStr}T23:59:59.999Z`;

  const res = await sqlite().query({
    database: DB_NAME,
    statement: `SELECT t.*, c.alias FROM transactions t
     LEFT JOIN contacts c ON c.id = t.contact_id
     WHERE t.date >= ? AND t.date <= ?
     ORDER BY t.date DESC`,
    values: [from, to]
  });
  return res.values || [];
}

// --- SMS OMITIDOS ---

export async function isSmsSkipped(smsHash) {
  const res = await sqlite().query({
    database: DB_NAME,
    statement: 'SELECT 1 FROM skipped_sms WHERE sms_hash = ?',
    values: [smsHash]
  });
  return !!(res.values && res.values.length);
}

export async function markSmsSkipped(smsHash) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'INSERT OR IGNORE INTO skipped_sms (sms_hash) VALUES (?)',
    values: [smsHash],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

// --- AJUSTES ---

export async function getSetting(key, defaultValue = null) {
  const res = await sqlite().query({
    database: DB_NAME,
    statement: 'SELECT value FROM settings WHERE key = ?',
    values: [key]
  });
  return res.values && res.values.length ? res.values[0].value : defaultValue;
}

export async function setSetting(key, value) {
  await sqlite().run({
    database: DB_NAME,
    statement: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    values: [key, value],
    transaction: true,
    readonly: false,
    returnMode: 'no'
  });
}

export async function getCatchAllSettings() {
  const enabled = await getSetting('catchall_enabled', '0');
  const alias = await getSetting('catchall_alias', 'Negocio');
  const category = await getSetting('catchall_category', 'Negocio');
  return { enabled: enabled === '1', alias, category };
}

export async function setCatchAllSettings({ enabled, alias, category }) {
  await setSetting('catchall_enabled', enabled ? '1' : '0');
  await setSetting('catchall_alias', alias || 'Negocio');
  await setSetting('catchall_category', category || 'Negocio');
}

export async function getIndexSinceDate() {
  const value = await getSetting('index_since_date', '');
  return value ? value : null;
}

export async function setIndexSinceDate(dateStr) {
  await setSetting('index_since_date', dateStr || '');
}

export async function getOnboardingCompleted() {
  const value = await getSetting('onboarding_completed', '0');
  return value === '1';
}

export async function setOnboardingCompleted() {
  await setSetting('onboarding_completed', '1');
}

export async function findOrCreateCatchAllContact(alias, category) {
  let contact = await findContactByIdentifier(CATCHALL_IDENTIFIER);
  if (contact) {
    if (contact.alias !== alias || contact.category !== category) {
      await sqlite().run({
        database: DB_NAME,
        statement: 'UPDATE contacts SET alias = ?, category = ? WHERE identifier = ?',
        values: [alias, category, CATCHALL_IDENTIFIER],
        transaction: true,
        readonly: false,
        returnMode: 'no'
      });
      contact = await findContactByIdentifier(CATCHALL_IDENTIFIER);
    }
    return contact;
  }
  return createContact(CATCHALL_IDENTIFIER, 'catchall', alias, category);
}

export async function resetAllData() {
  await sqlite().execute({
    database: DB_NAME,
    statements: `
      DELETE FROM transactions;
      DELETE FROM pending_transactions;
      DELETE FROM contact_identifiers;
      DELETE FROM contacts;
      DELETE FROM groups;
      DELETE FROM skipped_sms;
    `,
    transaction: true,
    readonly: false
  });
}
