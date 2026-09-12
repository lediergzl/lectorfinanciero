/**
 * main.js
 * Orquesta el flujo completo de la app.
 */
import {
  initDatabase,
  findContactByIdentifier,
  createContact,
  associateIdentifierToContact,
  listContacts,
  insertTransaction,
  insertPendingTransaction,
  deletePendingTransaction,
  listPendingTransactions,
  getCatchAllContact,
  getTransactionsForContact,
  reassignTransaction,
  getMonthlySummary,
  getTransactionsForDay,
  isSmsSkipped,
  markSmsSkipped,
  getCatchAllSettings,
  setCatchAllSettings,
  getIndexSinceDate,
  setIndexSinceDate,
  getOnboardingCompleted,
  setOnboardingCompleted,
  findOrCreateCatchAllContact,
  resetAllData,
  createGroup,
  listGroups,
  deleteGroup,
  assignContactToGroup,
  assignContactsToGroup,
  getGroupSummary
} from './services/database.js';
import {
  requestSmsPermissions,
  checkSmsPermissions,
  readAllSms,
  readPendingIncomingSms,
  ackIncomingSms,
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
  showPendingModal,
  showLoader,
  hideLoader,
  showReclassifyModal
} from './ui/render.js';

const PENDING_PAGE_SIZE = 8;

let currentYear;
let currentMonth;
let pendingQueue = [];
let pendingViewYear;
let pendingViewMonth;
let pendingViewDate = null;
let pendingPage = 0;
let catchAll = { enabled: false, alias: 'Negocio', category: 'Negocio' };
let indexSinceDate = null;
let indexSinceCutoffIso = null;
let onboardingCompleted = false;

async function bootstrap() {
  initThemeToggle();
  await initDatabase();
  pendingQueue = await listPendingTransactions();
  catchAll = await getCatchAllSettings();
  await loadIndexSinceCutoff();
  onboardingCompleted = await getOnboardingCompleted();

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

  if (isFirstLaunch && !permanentlyDenied) await handleRequestPermissions();
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
    await evaluatePermissions(false);
  }
}

async function handleOpenAppSettings() {
  await openAppSettings();
  document.addEventListener('visibilitychange', function onVisible() {
    if (document.visibilityState === 'visible') {
      document.removeEventListener('visibilitychange', onVisible);
      evaluatePermissions(false);
    }
  });
}

async function startApp() {
  showScreen('main-screen');
  wireNavigation();

  addIncomingSmsListener(async (sms) => {
    try {
      await handleIncomingOperation(processSms(sms));
      await refreshSummary();
      renderPendingBadge(pendingQueue.length);
      // El SMS se elimina de la cola nativa solo despues de procesarlo.
      await ackIncomingSms(sms);
    } catch (err) {
      console.error('Error procesando SMS entrante; queda en cola nativa:', err);
    }
  });

  if (!onboardingCompleted) {
    await runFirstLaunchSetup();
  } else {
    await syncSmsHistory();
  }

  // Recupera SMS que llegaron mientras el WebView estaba cerrado o muerto.
  await syncPendingIncomingSms();

  await refreshSummary();
  await refreshGroups();
  renderPendingBadge(pendingQueue.length);
}

function runFirstLaunchSetup() {
  return new Promise((resolve) => {
    showSettingsModal(
      { ...catchAll, indexSinceDate },
      async (newSettings) => {
        catchAll = { enabled: newSettings.enabled, alias: newSettings.alias, category: newSettings.category };
        await setCatchAllSettings(catchAll);

        indexSinceDate = newSettings.indexSinceDate;
        await setIndexSinceDate(indexSinceDate);
        await loadIndexSinceCutoff();

        await setOnboardingCompleted();
        onboardingCompleted = true;

        await syncSmsHistory();
        resolve();
      },
      { forceChoice: true }
    );
  });
}

async function syncSmsHistory() {
  showLoader('Leyendo e indexando SMS…');
  try {
    const allSms = await readAllSms();
    const operations = processSmsBatch(allSms);
    for (const op of operations) await handleIncomingOperation(op);
    renderPendingBadge(pendingQueue.length);
  } finally {
    hideLoader();
  }
}

async function syncPendingIncomingSms() {
  const queuedSms = await readPendingIncomingSms();
  if (!queuedSms.length) return;

  showLoader('Procesando SMS recibidos…');
  try {
    for (const sms of queuedSms) {
      try {
        const op = processSms(sms);
        await handleIncomingOperation(op);
        await ackIncomingSms(sms);
      } catch (err) {
        console.error('No se pudo procesar SMS pendiente; se conserva en cola:', err);
      }
    }
    renderPendingBadge(pendingQueue.length);
  } finally {
    hideLoader();
  }
}

async function handleIncomingOperation(op) {
  if (!op) return;
  if (indexSinceCutoffIso && op.date < indexSinceCutoffIso) return;
  if (await isSmsSkipped(op.smsHash)) return;

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

  if (!pendingQueue.some((o) => o.smsHash === op.smsHash)) {
    await insertPendingTransaction(op);
    pendingQueue.push(op);
  }
}

async function refreshSummary() {
  renderMonthLabel(currentYear, currentMonth);
  const summary = await getMonthlySummary(currentYear, currentMonth);
  renderSummary(summary);
}

async function handleDayFilter(dateStr) {
  if (!dateStr) return;
  const dayTransactions = await getTransactionsForDay(dateStr);
  renderDayTransactions(dateStr, dayTransactions);
}

async function handleReset() {
  const confirmado = confirm(
    '¿Seguro que quieres borrar TODAS las transferencias, contactos y grupos guardados? Esta acción no se puede deshacer.'
  );
  if (!confirmado) return;

  await resetAllData();
  pendingQueue = [];
  await refreshSummary();
  await refreshGroups();
  renderPendingBadge(0);
  alert('Listo, la app quedó en blanco.');
}

function handleOpenSettings() {
  showSettingsModal({ ...catchAll, indexSinceDate }, async (newSettings) => {
    catchAll = { enabled: newSettings.enabled, alias: newSettings.alias, category: newSettings.category };
    await setCatchAllSettings(catchAll);

    indexSinceDate = newSettings.indexSinceDate;
    await setIndexSinceDate(indexSinceDate);
    await loadIndexSinceCutoff();
  });
}

function getPendingDayCountsForMonth(year, month) {
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const counts = {};
  for (const op of pendingQueue) {
    if (op.date.startsWith(prefix)) {
      const day = op.date.slice(0, 10);
      counts[day] = (counts[day] || 0) + 1;
    }
  }
  return counts;
}

function getPendingForDay(dateStr) {
  const from = `${dateStr}T00:00:00.000Z`;
  const to = `${dateStr}T23:59:59.999Z`;
  return pendingQueue
    .filter((op) => op.date >= from && op.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function handleOpenPending() {
  const now = new Date();
  pendingViewYear = now.getFullYear();
  pendingViewMonth = now.getMonth() + 1;
  pendingViewDate = null;
  pendingPage = 0;
  renderPendingScreenView();
}

function renderPendingScreenView() {
  const dayCounts = getPendingDayCountsForMonth(pendingViewYear, pendingViewMonth);
  const days = Object.keys(dayCounts).sort();

  if (!pendingViewDate || !dayCounts[pendingViewDate]) {
    pendingViewDate = days.length ? days[0] : null;
    pendingPage = 0;
  }

  const dayItems = pendingViewDate ? getPendingForDay(pendingViewDate) : [];
  const totalPages = Math.max(1, Math.ceil(dayItems.length / PENDING_PAGE_SIZE));
  if (pendingPage >= totalPages) pendingPage = totalPages - 1;
  if (pendingPage < 0) pendingPage = 0;

  const start = pendingPage * PENDING_PAGE_SIZE;
  const pageItems = dayItems.slice(start, start + PENDING_PAGE_SIZE);

  showPendingModal(
    {
      year: pendingViewYear,
      month: pendingViewMonth,
      dayCounts,
      selectedDate: pendingViewDate,
      items: pageItems,
      page: pendingPage,
      totalPages,
      totalForDay: dayItems.length,
      totalOverall: pendingQueue.length
    },
    {
      onPrevMonth: () => {
        pendingViewMonth--;
        if (pendingViewMonth < 1) { pendingViewMonth = 12; pendingViewYear--; }
        pendingViewDate = null;
        pendingPage = 0;
        renderPendingScreenView();
      },
      onNextMonth: () => {
        pendingViewMonth++;
        if (pendingViewMonth > 12) { pendingViewMonth = 1; pendingViewYear++; }
        pendingViewDate = null;
        pendingPage = 0;
        renderPendingScreenView();
      },
      onSelectDay: (dateStr) => {
        pendingViewDate = dateStr;
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

async function openLabelFlowForOp(op) {
  const [existingContacts, groups] = await Promise.all([listContacts(), listGroups()]);

  showWhoIsModal(
    op,
    existingContacts,
    groups,
    async (alias, category, groupId) => {
      const contact = await createContact(op.identifier, op.identifierType, alias, category);
      if (groupId) await assignContactToGroup(contact.id, groupId);
      await insertTransaction(op, contact.id);
      await removeFromPending(op);
    },
    async (contactId) => {
      const contact = await associateIdentifierToContact(op.identifier, op.identifierType, contactId);
      await insertTransaction(op, contact.id);
      await removeFromPending(op);
    },
    async () => { await removeFromPending(op); },
    async () => {
      await markSmsSkipped(op.smsHash);
      await removeFromPending(op);
    }
  );
}

async function removeFromPending(op) {
  await deletePendingTransaction(op.smsHash);
  pendingQueue = pendingQueue.filter((o) => o.smsHash !== op.smsHash);
  await refreshSummary();
  await refreshGroups();
  renderPendingBadge(pendingQueue.length);
  renderPendingScreenView();
}

async function handleReclassify() {
  const catchAllContact = await getCatchAllContact();
  if (!catchAllContact) {
    alert('Todavía no hay transacciones guardadas en la categoría única.');
    return;
  }

  showLoader('Cargando transacciones…');
  try {
    const [transactions, contacts] = await Promise.all([
      getTransactionsForContact(catchAllContact.id, 100, 0),
      listContacts()
    ]);
    showReclassifyModal(transactions, contacts, {
      onAssign: async (transactionId, contactId) => {
        await reassignTransaction(transactionId, contactId);
        await refreshSummary();
        await handleReclassify();
      },
      onAssignNew: async (transactionId, alias) => {
        const contact = await createContact(`MANUAL_${Date.now()}_${transactionId}`, 'manual', alias, 'Sin categoría');
        await reassignTransaction(transactionId, contact.id);
        await refreshSummary();
        await handleReclassify();
      }
    });
  } finally {
    hideLoader();
  }
}

async function refreshGroups() {
  const groups = await listGroups();
  renderGroupsList(groups, (group) => handleOpenGroup(group), (group) => handleDeleteGroup(group));
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
 * Requisito: "con 100 usuarios necesito marcar varios y asignarlos a
 * un grupo" — el modal ahora devuelve un array de IDs seleccionados
 * en vez de un solo contactId, y se asignan todos de una vez.
 */
async function handleOpenContacts() {
  const [contacts, groups] = await Promise.all([listContacts(), listGroups()]);
  showContactsModal(contacts, groups, async (contactIds, groupId) => {
    await assignContactsToGroup(contactIds, groupId);
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
    await syncPendingIncomingSms();
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
  document.getElementById('btn-reclassify').onclick = handleReclassify;
  document.getElementById('btn-open-pending').onclick = handleOpenPending;
}

bootstrap().catch((err) => {
  console.error('Fallo crítico en bootstrap:', err);
  document.body.innerHTML =
    '<div style="padding:20px;color:#fff;background:#111;font-family:monospace;' +
    'white-space:pre-wrap;min-height:100vh;box-sizing:border-box">' +
    'Error al iniciar la app:\n' +
    (err && err.message ? err.message : String(err)) +
    '\n\n' +
    (err && err.stack ? err.stack : '') +
    '</div>';
});
