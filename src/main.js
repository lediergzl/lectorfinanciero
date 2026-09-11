/**
 * main.js
 * Orquesta el flujo completo de la app:
 *
 *   SMS -> parser -> ¿anterior a la fecha de inicio configurada? -> SÍ: ignorar
 *                  -> ¿SMS ya omitido "siempre" antes? -> SÍ: ignorar
 *                  -> ¿modo "una sola categoría" activo? -> SÍ: guardar directo bajo esa categoría
 *                  -> ¿identificador ya asociado a un contacto? -> SÍ: guardar directo
 *                                                                -> NO: se guarda en la cola de
 *                                                                "Pendientes" (NO se interrumpe
 *                                                                al usuario con un modal por
 *                                                                cada una); él las etiqueta
 *                                                                cuando puede, día por día y
 *                                                                paginadas.
 *                  -> insertar en DB -> refrescar resumen del mes
 */
import {
  initDatabase,
  findContactByIdentifier,
  createContact,
  associateIdentifierToContact,
  listContacts,
  insertTransaction,
  getMonthlySummary,
  getTransactionsForDay,
  isSmsSkipped,
  markSmsSkipped,
  getCatchAllSettings,
  setCatchAllSettings,
  getIndexSinceDate,
  setIndexSinceDate,
  findOrCreateCatchAllContact,
  resetAllData,
  createGroup,
  listGroups,
  deleteGroup,
  assignContactToGroup,
  getGroupSummary
} from './services/database.js';
import {
  requestSmsPermissions,
  checkSmsPermissions,
  readAllSms,
  addIncomingSmsListener,
  openAppSettings
} from './services/smsReader.js';
import { processSmsBatch, processSms } from './parser/index.js';
import {
  showScreen,
  renderMonthLabel,
  renderSummary,
  showWhoIsModal,
  renderDayTransactions,
  showSettingsModal,
  initThemeToggle,
  renderGroupsList,
  showNewGroupModal,
  showGroupStatsModal,
  showContactsModal,
  renderPendingBadge,
  showPendingModal
} from './ui/render.js';

const PENDING_PAGE_SIZE = 8;

let currentYear;
let currentMonth; // 1-12
let pendingQueue = []; // operaciones cuyo contacto aún no se ha catalogado (en memoria)
let pendingViewDate = null; // día que se está mostrando en la pantalla "Pendientes"
let pendingPage = 0;
let catchAll = { enabled: false, alias: 'Negocio', category: 'Negocio' };
let indexSinceDate = null; // 'YYYY-MM-DD' o null (sin límite)
let indexSinceCutoffIso = null;

async function bootstrap() {
  initThemeToggle(); // no depende de la BD, se conecta de inmediato
  await initDatabase();
  catchAll = await getCatchAllSettings();
  await loadIndexSinceCutoff();

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;

  await evaluatePermissions(true);
}

async function loadIndexSinceCutoff() {
  indexSinceDate = await getIndexSinceDate();
  indexSinceCutoffIso = indexSinceDate ? `${indexSinceDate}T00:00:00.000Z` : null;
}

function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- */
/* Permisos                                                          */
/* ---------------------------------------------------------------- */

/**
 * Requisito: "cuando abre la apk por primera ves debe mostrar una
 * ventana con los permisos para que el usuario lo permita". Se
 * muestra la pantalla explicativa y, si es la primera vez (Android
 * todavía puede preguntar), se dispara el diálogo del sistema de
 * inmediato, sin esperar a que el usuario toque nada.
 *
 * Requisito: "el permiso de sms esta desabilitado por defecto por
 * tanto debe haber un boton q el usuario toque y lo lleve a donde
 * esta ese permiso y pueda activarlo". Si el permiso quedó denegado
 * de forma permanente, Android deja de mostrar el diálogo nativo: en
 * ese caso se oculta el botón de "Conceder permisos" y se muestra en
 * su lugar uno que abre directamente la pantalla de ajustes de la app.
 */
async function evaluatePermissions(isFirstLaunch) {
  const perms = await checkSmsPermissions();
  const granted = perms.readSms === 'granted' && perms.receiveSms === 'granted';

  if (granted) {
    await startApp();
    return;
  }

  showScreen('permission-screen');
  const permanentlyDenied = perms.readSms === 'denied' || perms.receiveSms === 'denied';
  updatePermissionScreenUI(permanentlyDenied);

  document.getElementById('btn-request-permissions').onclick = handleRequestPermissions;
  document.getElementById('btn-open-settings').onclick = handleOpenAppSettings;

  if (isFirstLaunch && !permanentlyDenied) {
    await handleRequestPermissions();
  }
}

function updatePermissionScreenUI(permanentlyDenied) {
  const requestBtn = document.getElementById('btn-request-permissions');
  const settingsBtn = document.getElementById('btn-open-settings');
  const deniedHint = document.getElementById('permission-denied-hint');

  if (permanentlyDenied) {
    requestBtn.classList.add('hidden');
    settingsBtn.classList.remove('hidden');
    deniedHint.classList.remove('hidden');
  } else {
    requestBtn.classList.remove('hidden');
    settingsBtn.classList.add('hidden');
    deniedHint.classList.add('hidden');
  }
}

async function handleRequestPermissions() {
  const result = await requestSmsPermissions();
  if (result.readSms === 'granted' && result.receiveSms === 'granted') {
    await startApp();
  } else {
    // Puede haber quedado "denegado permanentemente" tras este intento;
    // se re-evalúa para mostrar el botón correcto.
    await evaluatePermissions(false);
  }
}

async function handleOpenAppSettings() {
  await openAppSettings();
  // Al volver de Ajustes (el usuario puede haber activado el permiso a
  // mano), se vuelve a comprobar el estado.
  document.addEventListener('visibilitychange', function onVisible() {
    if (document.visibilityState === 'visible') {
      document.removeEventListener('visibilitychange', onVisible);
      evaluatePermissions(false);
    }
  });
}

/* ---------------------------------------------------------------- */
/* Arranque de la app                                                */
/* ---------------------------------------------------------------- */

async function startApp() {
  showScreen('main-screen');
  wireNavigation();

  // Lectura inicial del historial completo de SMS.
  await syncSmsHistory();

  // Escucha de SMS nuevos en tiempo real.
  addIncomingSmsListener(async (sms) => {
    await handleIncomingOperation(processSms(sms));
    await refreshSummary();
    refreshPendingBadge(pendingQueue.length);
  });

  await refreshSummary();
  await refreshGroups();
  refreshPendingBadge(pendingQueue.length);
}

async function syncSmsHistory() {
  const allSms = await readAllSms();
  const operations = processSmsBatch(allSms);

  for (const op of operations) {
    await handleIncomingOperation(op);
  }
  refreshPendingBadge(pendingQueue.length);
}

/**
 * Procesa UNA operación normalizada:
 *  - Si es anterior a la fecha de inicio configurada -> se ignora.
 *  - Si el SMS ya fue "omitido siempre" antes -> se ignora.
 *  - Si el modo "una sola categoría" está activo -> se guarda directo
 *    bajo el contacto único, sin preguntar nada.
 *  - Si el identificador ya está asociado a un contacto (como
 *    identificador original o como tarjeta adicional) -> inserta directo.
 *  - Si no -> se agrega a la cola de "Pendientes" en memoria. YA NO se
 *    muestra ningún modal automáticamente: si hay 100 transferencias
 *    sin catalogar, el usuario las etiqueta cuando tenga tiempo desde
 *    la sección "Pendientes", día por día.
 */
async function handleIncomingOperation(op) {
  if (!op) return;

  // Requisito: "debe poder definirse la fecha desde la cual quieres
  // iniciar a indexar las transferencias".
  if (indexSinceCutoffIso && op.date < indexSinceCutoffIso) {
    return;
  }

  if (await isSmsSkipped(op.smsHash)) {
    return;
  }

  if (catchAll.enabled) {
    const contact = await findOrCreateCatchAllContact(catchAll.alias, catchAll.category);
    await insertTransaction(op, contact.id);
    return;
  }

  const contact = await findContactByIdentifier(op.identifier);
  if (contact) {
    await insertTransaction(op, contact.id);
    return;
  }

  // Evita duplicados si el mismo SMS pendiente vuelve a aparecer en
  // una sincronización posterior (aún no se guardó ni se omitió).
  if (!pendingQueue.some((o) => o.smsHash === op.smsHash)) {
    pendingQueue.push(op);
  }
}

async function refreshSummary() {
  renderMonthLabel(currentYear, currentMonth);
  const summary = await getMonthlySummary(currentYear, currentMonth);
  renderSummary(summary);
}

/**
 * Requisito: "filtro por dia". Muestra las transacciones individuales
 * de la fecha elegida en el selector de fecha del encabezado.
 */
async function handleDayFilter(dateStr) {
  if (!dateStr) return;
  const dayTransactions = await getTransactionsForDay(dateStr);
  renderDayTransactions(dateStr, dayTransactions);
}

/**
 * Requisito: "debe poder ponerse en blanco". Borra todas las
 * transferencias/contactos/grupos guardados (con confirmación) y refresca.
 */
async function handleReset() {
  const confirmado = confirm(
    '¿Seguro que quieres borrar TODAS las transferencias, contactos y grupos guardados? Esta acción no se puede deshacer.'
  );
  if (!confirmado) return;

  await resetAllData();
  pendingQueue = [];
  await refreshSummary();
  await refreshGroups();
  refreshPendingBadge(0);
  alert('Listo, la app quedó en blanco.');
}

/**
 * Abre el modal de ajustes: modo "una sola categoría", fecha desde la
 * cual indexar, y la aclaración entrantes/salientes.
 */
function handleOpenSettings() {
  showSettingsModal({ ...catchAll, indexSinceDate }, async (newSettings) => {
    catchAll = { enabled: newSettings.enabled, alias: newSettings.alias, category: newSettings.category };
    await setCatchAllSettings(catchAll);

    indexSinceDate = newSettings.indexSinceDate;
    await setIndexSinceDate(indexSinceDate);
    await loadIndexSinceCutoff();
  });
}

/* ---------------------------------------------------------------- */
/* Pendientes por etiquetar (requisito: no interrumpir con 100       */
/* modales; el usuario los cataloga cuando puede, día por día)       */
/* ---------------------------------------------------------------- */

function getPendingForDay(dateStr) {
  const from = `${dateStr}T00:00:00.000Z`;
  const to = `${dateStr}T23:59:59.999Z`;
  return pendingQueue
    .filter((op) => op.date >= from && op.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/**
 * Requisito: "solo debe mostrarse en la pantalla las transferencias
 * del dia y un paginador por si son muchas". Se abre siempre en el
 * día de hoy por defecto; el usuario puede cambiar de día con el
 * selector de fecha del propio modal para etiquetar pendientes de
 * otros días.
 */
function handleOpenPending() {
  pendingViewDate = todayDateStr();
  pendingPage = 0;
  renderPendingScreenView();
}

function renderPendingScreenView() {
  const dayItems = getPendingForDay(pendingViewDate);
  const totalPages = Math.max(1, Math.ceil(dayItems.length / PENDING_PAGE_SIZE));
  if (pendingPage >= totalPages) pendingPage = totalPages - 1;
  if (pendingPage < 0) pendingPage = 0;

  const start = pendingPage * PENDING_PAGE_SIZE;
  const pageItems = dayItems.slice(start, start + PENDING_PAGE_SIZE);

  showPendingModal(
    {
      dateStr: pendingViewDate,
      items: pageItems,
      page: pendingPage,
      totalPages,
      totalForDay: dayItems.length,
      totalOverall: pendingQueue.length
    },
    {
      onChangeDay: (newDate) => {
        pendingViewDate = newDate;
        pendingPage = 0;
        renderPendingScreenView();
      },
      onPrevPage: () => {
        pendingPage = Math.max(0, pendingPage - 1);
        renderPendingScreenView();
      },
      onNextPage: () => {
        pendingPage += 1;
        renderPendingScreenView();
      },
      onLabelItem: (op) => openLabelFlowForOp(op)
    }
  );
}

/**
 * Abre el modal "¿Quién es?" para UNA operación puntual, elegida desde
 * la lista de "Pendientes". Se apila visualmente encima de esa
 * pantalla (que sigue abierta detrás) para que, al terminar, el
 * usuario siga viendo la lista actualizada y pueda etiquetar la
 * siguiente sin tener que reabrir nada.
 */
async function openLabelFlowForOp(op) {
  const existingContacts = await listContacts();

  showWhoIsModal(
    op,
    existingContacts,
    // Guardar como contacto NUEVO.
    async (alias, category) => {
      const contact = await createContact(op.identifier, op.identifierType, alias, category);
      await insertTransaction(op, contact.id);
      await removeFromPending(op);
    },
    // Requisito: "una misma persona puede tener mas de una tarjeta por
    // tanto debe poder asociarse a un contacto existente".
    async (contactId) => {
      const contact = await associateIdentifierToContact(op.identifier, op.identifierType, contactId);
      await insertTransaction(op, contact.id);
      await removeFromPending(op);
    },
    // Omitir "por ahora" (temporal): no se guarda ni se recuerda nada;
    // en la próxima sincronización este SMS se vuelve a detectar.
    async () => {
      await removeFromPending(op);
    },
    // Omitir "siempre" (indefinido): se recuerda el SMS para no volver
    // a preguntar por él nunca más.
    async () => {
      await markSmsSkipped(op.smsHash);
      await removeFromPending(op);
    }
  );
}

async function removeFromPending(op) {
  pendingQueue = pendingQueue.filter((o) => o.smsHash !== op.smsHash);
  await refreshSummary();
  await refreshGroups();
  refreshPendingBadge(pendingQueue.length);
  renderPendingScreenView(); // refresca la lista/paginador del mismo día
}

/* ---------------------------------------------------------------- */
/* Grupos                                                            */
/* ---------------------------------------------------------------- */

async function refreshGroups() {
  const groups = await listGroups();
  renderGroupsList(
    groups,
    (group) => handleOpenGroup(group),
    (group) => handleDeleteGroup(group)
  );
}

async function handleNewGroup() {
  showNewGroupModal(async (name) => {
    await createGroup(name);
    await refreshGroups();
  });
}

async function handleOpenGroup(group) {
  const summary = await getGroupSummary(group.id, currentYear, currentMonth);
  const monthLabel = document.getElementById('current-month-label').textContent;
  showGroupStatsModal(group, summary, monthLabel);
}

async function handleDeleteGroup(group) {
  const confirmado = confirm(`¿Borrar el grupo "${group.name}"? Los contactos no se borran, solo se desvinculan del grupo.`);
  if (!confirmado) return;
  await deleteGroup(group.id);
  await refreshGroups();
}

/**
 * Pantalla de contactos donde se puede ver cuántas tarjetas tiene cada
 * persona y anclarla a un grupo.
 */
async function handleOpenContacts() {
  const [contacts, groups] = await Promise.all([listContacts(), listGroups()]);
  showContactsModal(contacts, groups, async (contactId, groupId) => {
    await assignContactToGroup(contactId, groupId);
    await refreshGroups();
  });
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
    await refreshGroups();
  };
  document.getElementById('btn-day-filter').onclick = () => {
    const dateStr = document.getElementById('day-filter-input').value;
    handleDayFilter(dateStr);
  };
  document.getElementById('btn-reset').onclick = handleReset;
  document.getElementById('btn-settings').onclick = handleOpenSettings;
  document.getElementById('btn-new-group').onclick = handleNewGroup;
  document.getElementById('btn-manage-contacts').onclick = handleOpenContacts;
  document.getElementById('btn-open-pending').onclick = handleOpenPending;
}

bootstrap();
