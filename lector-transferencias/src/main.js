/**
 * main.js
 * Orquesta el flujo completo de la app (ver diagrama original):
 *
 *   SMS -> parser -> ¿contacto conocido? -> NO: preguntar "¿Quién es?"
 *                                         -> SÍ: guardar directo
 *                   -> insertar en DB -> refrescar resumen del mes
 */
import { initDatabase, findContactByIdentifier, createContact, insertTransaction, getMonthlySummary } from './services/database.js';
import { requestSmsPermissions, checkSmsPermissions, readAllSms, addIncomingSmsListener } from './services/smsReader.js';
import { processSmsBatch, processSms } from './parser/index.js';
import { showScreen, renderMonthLabel, renderSummary, showWhoIsModal } from './ui/render.js';

let currentYear;
let currentMonth; // 1-12
let pendingQueue = []; // operaciones cuyo contacto aún no se ha catalogado

async function bootstrap() {
  await initDatabase();

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;

  const perms = await checkSmsPermissions();
  if (perms.readSms !== 'granted' || perms.receiveSms !== 'granted') {
    showScreen('permission-screen');
    document.getElementById('btn-request-permissions').onclick = handleRequestPermissions;
    return;
  }

  await startApp();
}

async function handleRequestPermissions() {
  const result = await requestSmsPermissions();
  if (result.readSms === 'granted' && result.receiveSms === 'granted') {
    await startApp();
  } else {
    alert('Sin estos permisos la app no puede leer tus transferencias automáticamente.');
  }
}

async function startApp() {
  showScreen('main-screen');
  wireNavigation();

  // Lectura inicial del historial completo de SMS.
  await syncSmsHistory();

  // Escucha de SMS nuevos en tiempo real.
  addIncomingSmsListener(async (sms) => {
    await handleIncomingOperation(processSms(sms));
    await refreshSummary();
  });

  await refreshSummary();
}

async function syncSmsHistory() {
  const allSms = await readAllSms();
  const operations = processSmsBatch(allSms);

  for (const op of operations) {
    await handleIncomingOperation(op);
  }
}

/**
 * Procesa UNA operación normalizada:
 *  - Si el teléfono ya tiene contacto -> inserta directo.
 *  - Si no -> la encola y muestra el modal "¿Quién es?" (una a la vez,
 *    para no saturar al usuario con varios diálogos superpuestos).
 */
async function handleIncomingOperation(op) {
  if (!op) return;

  const contact = await findContactByIdentifier(op.identifier);
  if (contact) {
    await insertTransaction(op, contact.id);
    return;
  }

  pendingQueue.push(op);
  if (pendingQueue.length === 1) {
    processNextPending();
  }
}

function processNextPending() {
  const op = pendingQueue[0];
  if (!op) return;

  showWhoIsModal(op, async (alias, category) => {
    const contact = await createContact(op.identifier, op.identifierType, alias, category);
    await insertTransaction(op, contact.id);

    pendingQueue.shift();
    await refreshSummary();
    processNextPending(); // sigue con la siguiente operación pendiente, si hay
  });
}

async function refreshSummary() {
  renderMonthLabel(currentYear, currentMonth);
  const summary = await getMonthlySummary(currentYear, currentMonth);
  renderSummary(summary);
}

function wireNavigation() {
  document.getElementById('btn-prev-month').onclick = async () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    await refreshSummary();
  };
  document.getElementById('btn-next-month').onclick = async () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    await refreshSummary();
  };
  document.getElementById('btn-refresh').onclick = async () => {
    await syncSmsHistory();
    await refreshSummary();
  };
}

bootstrap();
