/**
 * database.js
 * Capa de acceso a datos usando @capacitor-community/sqlite.
 *
 * Tablas:
 *  - contacts(id, identifier UNIQUE, identifier_type, alias, category, created_at)
 *  - transactions(id, sms_hash UNIQUE, identifier, identifier_type, contact_id,
 *                  type, amount, currency, category, date, raw_sms, created_at)
 *
 * Deliberadamente NO se guarda el banco/remitente del SMS: no aporta
 * valor una vez que el identificador (teléfono o tarjeta/cuenta) queda
 * asociado a un contacto — ya sabemos de quién es la operación sin
 * importar qué banco mandó el aviso.
 *
 * `identifier` puede ser un TELÉFONO (5XXXXXXX / 53XXXXXXXX) o una CUENTA
 * bancaria (completa o enmascarada, ej. 9227XXXXXXXX3044), según lo que
 * el SMS haya permitido identificar. `identifier_type` distingue cuál es.
 *
 * sms_hash es UNIQUE para que la deduplicación (requisito 10) se resuelva
 * directamente a nivel de base de datos con "INSERT OR IGNORE".
 */
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';

const DB_NAME = 'lector_transferencias';
let db = null;
const sqlite = new SQLiteConnection(CapacitorSQLite);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT UNIQUE NOT NULL,
  identifier_type TEXT DEFAULT 'phone',
  alias TEXT NOT NULL,
  category TEXT DEFAULT 'Sin categoría',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
`;

export async function initDatabase() {
  const isConn = (await sqlite.isConnection(DB_NAME, false)).result;

  db = isConn
    ? await sqlite.retrieveConnection(DB_NAME, false)
    : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

  await db.open();
  await db.execute(SCHEMA);
  return db;
}

// --- CONTACTOS ---

export async function findContactByIdentifier(identifier) {
  const res = await db.query('SELECT * FROM contacts WHERE identifier = ?', [identifier]);
  return res.values && res.values.length ? res.values[0] : null;
}

export async function createContact(identifier, identifierType, alias, category = 'Sin categoría') {
  await db.run(
    'INSERT INTO contacts (identifier, identifier_type, alias, category) VALUES (?, ?, ?, ?)',
    [identifier, identifierType, alias, category]
  );
  return findContactByIdentifier(identifier);
}

export async function listContacts() {
  const res = await db.query('SELECT * FROM contacts ORDER BY alias ASC');
  return res.values || [];
}

// --- TRANSACCIONES ---

/**
 * Inserta una operación normalizada (salida de parser/index.js).
 * Usa INSERT OR IGNORE sobre sms_hash para evitar duplicados si el SMS
 * ya fue procesado antes (requisito 10 del MVP).
 */
export async function insertTransaction(op, contactId) {
  const stmt = `
    INSERT OR IGNORE INTO transactions
      (sms_hash, identifier, identifier_type, contact_id, type, amount, currency, date, raw_sms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await db.run(stmt, [
    op.smsHash,
    op.identifier,
    op.identifierType,
    contactId || null,
    op.type,
    op.amount,
    op.currency,
    op.date,
    op.rawText
  ]);
}

/**
 * Devuelve el resumen del mes: ingresos, gastos, balance y transacciones
 * agrupadas por alias (contacto), tal como se mostró en el diseño de
 * la pantalla principal.
 *
 * @param {number} year
 * @param {number} month - 1 a 12
 */
export async function getMonthlySummary(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const toDate = new Date(year, month, 1); // primer día del mes siguiente
  const to = toDate.toISOString();

  const totalsRes = await db.query(
    `SELECT type, SUM(amount) as total, currency
     FROM transactions
     WHERE date >= ? AND date < ?
     GROUP BY type, currency`,
    [from, to]
  );

  const byContactRes = await db.query(
    `SELECT
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
    [from, to]
  );

  return {
    totals: totalsRes.values || [],
    byContact: byContactRes.values || []
  };
}

export async function getTransactionsForMonth(year, month) {
  const from = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
  const to = new Date(year, month, 1).toISOString();

  const res = await db.query(
    `SELECT t.*, c.alias FROM transactions t
     LEFT JOIN contacts c ON c.id = t.contact_id
     WHERE t.date >= ? AND t.date < ?
     ORDER BY t.date DESC`,
    [from, to]
  );
  return res.values || [];
}
