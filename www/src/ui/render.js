/**
 * render.js
 * Funciones puras de renderizado: reciben datos y actualizan el DOM.
 * No contienen lógica de negocio (eso vive en main.js y services/).
 */

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export function formatMoney(amount, currency) {
  return `${amount.toLocaleString('es-CU', { minimumFractionDigits: 2 })} ${currency}`;
}

export function renderMonthLabel(year, month) {
  document.getElementById('current-month-label').textContent =
    `${MONTH_NAMES[month - 1]} ${year}`;
}

/**
 * summary = { totals: [{type, total, currency}], byContact: [...] }
 * Simplificamos asumiendo una moneda principal (CUP) para los totales
 * del encabezado; el desglose por persona sí respeta cada moneda.
 */
export function renderSummary(summary) {
  const totalIn = summary.totals
    .filter((t) => t.type === 'in' && t.currency === 'CUP')
    .reduce((acc, t) => acc + t.total, 0);
  const totalOut = summary.totals
    .filter((t) => t.type === 'out' && t.currency === 'CUP')
    .reduce((acc, t) => acc + t.total, 0);

  document.getElementById('sum-in').textContent = formatMoney(totalIn, 'CUP');
  document.getElementById('sum-out').textContent = formatMoney(totalOut, 'CUP');
  document.getElementById('sum-balance').textContent = formatMoney(totalIn - totalOut, 'CUP');

  const list = document.getElementById('contact-list');
  list.innerHTML = '';

  if (summary.byContact.length === 0) {
    list.innerHTML = '<li>No hay transferencias este mes.</li>';
    return;
  }

  for (const row of summary.byContact) {
    const li = document.createElement('li');
    const amountClass = row.type === 'in' ? 'amount-in' : 'amount-out';
    const sign = row.type === 'in' ? '+' : '−';
    li.innerHTML = `
      <span>${row.alias} <small style="color:#9aa1ac">(${row.count})</small></span>
      <span class="${amountClass}">${sign} ${formatMoney(row.total, row.currency)}</span>
    `;
    list.appendChild(li);
  }
}

/**
 * Requisito: "permite cambiar de dark a claro". El tema ya se aplicó
 * de forma síncrona en index.html (antes de pintar, vía localStorage)
 * para evitar parpadeos; aquí solo conectamos el botón para alternarlo
 * y persistir la elección.
 */
export function initThemeToggle() {
  const btn = document.getElementById('btn-theme-toggle');
  if (!btn) return;

  const applyIcon = (theme) => {
    btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    btn.title = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
  };

  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyIcon(current);

  btn.onclick = () => {
    const now = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = now === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    applyIcon(next);
  };
}

/**
 * Requisito: "ajustes con fecha de inicio de indexado". Se reutiliza el
 * mismo modal de ajustes existente, añadiendo el campo de fecha.
 */
export function showSettingsModal(currentSettings, onSave) {
  const modal = document.getElementById('settings-modal');
  const toggle = document.getElementById('settings-catchall-toggle');
  const aliasInput = document.getElementById('settings-catchall-alias');
  const categoryInput = document.getElementById('settings-catchall-category');
  const indexSinceInput = document.getElementById('settings-index-since');
  const saveBtn = document.getElementById('btn-save-settings');

  toggle.checked = !!currentSettings.enabled;
  aliasInput.value = currentSettings.alias || 'Negocio';
  categoryInput.value = currentSettings.category || 'Negocio';
  if (indexSinceInput) indexSinceInput.value = currentSettings.indexSinceDate || '';

  modal.classList.remove('hidden');

  saveBtn.onclick = () => {
    const enabled = toggle.checked;
    const alias = aliasInput.value.trim() || 'Negocio';
    const category = categoryInput.value.trim() || 'Negocio';
    const indexSinceDate = indexSinceInput ? indexSinceInput.value || null : null;
    modal.classList.add('hidden');
    onSave({ enabled, alias, category, indexSinceDate });
  };

  document.getElementById('btn-close-settings').onclick = () => modal.classList.add('hidden');
}

/**
 * Requisito: "se necesita poder crear un grupo y anclar usuarios a el
 * y que te de las estadisticas de ese grupo". Pinta la lista de grupos
 * en la pantalla principal; cada fila se puede tocar para ver sus
 * estadísticas o borrar el grupo.
 */
export function renderGroupsList(groups, onOpenGroup, onDeleteGroup) {
  const list = document.getElementById('groups-list');
  list.innerHTML = '';

  if (!groups.length) {
    list.innerHTML = '<li>Aún no tienes grupos. Crea uno con "+ Nuevo grupo".</li>';
    return;
  }

  for (const g of groups) {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="group-row-name">🗂 ${g.name} <small style="color:var(--text-faint)">(${g.member_count} ${g.member_count === 1 ? 'persona' : 'personas'})</small></span>
      <span class="group-row-actions">
        <button class="tiny-btn" data-action="open">Ver</button>
        <button class="tiny-btn danger" data-action="delete">✕</button>
      </span>
    `;
    li.querySelector('[data-action="open"]').onclick = () => onOpenGroup(g);
    li.querySelector('[data-action="delete"]').onclick = () => onDeleteGroup(g);
    list.appendChild(li);
  }
}

/** Modal simple para pedir el nombre de un grupo nuevo. */
export function showNewGroupModal(onCreate) {
  const modal = document.getElementById('new-group-modal');
  const input = document.getElementById('new-group-name');
  const createBtn = document.getElementById('btn-create-group');

  input.value = '';
  modal.classList.remove('hidden');

  createBtn.onclick = () => {
    const name = input.value.trim();
    if (!name) return;
    modal.classList.add('hidden');
    onCreate(name);
  };
  document.getElementById('btn-close-new-group').onclick = () => modal.classList.add('hidden');
}

/**
 * Muestra las estadísticas de un grupo (mismo formato que el resumen
 * principal, pero solo con los miembros de ese grupo).
 */
export function showGroupStatsModal(group, summary, monthLabel) {
  const modal = document.getElementById('group-stats-modal');
  document.getElementById('group-stats-title').textContent = `${group.name} · ${monthLabel}`;

  const totalIn = summary.totals
    .filter((t) => t.type === 'in' && t.currency === 'CUP')
    .reduce((acc, t) => acc + t.total, 0);
  const totalOut = summary.totals
    .filter((t) => t.type === 'out' && t.currency === 'CUP')
    .reduce((acc, t) => acc + t.total, 0);

  document.getElementById('group-stats-in').textContent = formatMoney(totalIn, 'CUP');
  document.getElementById('group-stats-out').textContent = formatMoney(totalOut, 'CUP');
  document.getElementById('group-stats-balance').textContent = formatMoney(totalIn - totalOut, 'CUP');

  const list = document.getElementById('group-stats-list');
  list.innerHTML = '';
  if (!summary.byContact.length) {
    list.innerHTML = '<li>Nadie de este grupo tiene transferencias este mes.</li>';
  } else {
    for (const row of summary.byContact) {
      const li = document.createElement('li');
      const amountClass = row.type === 'in' ? 'amount-in' : 'amount-out';
      const sign = row.type === 'in' ? '+' : '−';
      li.innerHTML = `
        <span>${row.alias} <small style="color:var(--text-faint)">(${row.count})</small></span>
        <span class="${amountClass}">${sign} ${formatMoney(row.total, row.currency)}</span>
      `;
      list.appendChild(li);
    }
  }

  modal.classList.remove('hidden');
  document.getElementById('btn-close-group-stats').onclick = () => modal.classList.add('hidden');
}

/**
 * Pantalla de gestión de contactos: lista cada persona con cuántas
 * tarjetas tiene y a qué grupo pertenece, con un selector para
 * cambiarlo de grupo.
 */
export function showContactsModal(contacts, groups, onAssignGroup) {
  const modal = document.getElementById('contacts-modal');
  const list = document.getElementById('contacts-list');
  list.innerHTML = '';

  if (!contacts.length) {
    list.innerHTML = '<li>Todavía no tienes contactos guardados.</li>';
  } else {
    for (const c of contacts) {
      const li = document.createElement('li');
      li.className = 'contact-row';
      const groupOptions = ['<option value="">Sin grupo</option>']
        .concat(groups.map((g) => `<option value="${g.id}" ${g.id === c.group_id ? 'selected' : ''}>${g.name}</option>`))
        .join('');
      li.innerHTML = `
        <div class="contact-row-info">
          <span>${c.alias}</span>
          <small style="color:var(--text-faint)">${c.category} · ${c.card_count} ${c.card_count === 1 ? 'tarjeta' : 'tarjetas'}</small>
        </div>
        <select class="contact-group-select">${groupOptions}</select>
      `;
      li.querySelector('.contact-group-select').onchange = (e) => {
        const groupId = e.target.value ? Number(e.target.value) : null;
        onAssignGroup(c.id, groupId);
      };
      list.appendChild(li);
    }
  }

  modal.classList.remove('hidden');
  document.getElementById('btn-close-contacts').onclick = () => modal.classList.add('hidden');
}

/**
 * Actualiza el contador visible en el botón "Pendientes" de la
 * pantalla principal (total de transferencias sin etiquetar, de
 * cualquier día — la pantalla detallada sí se limita a un día a la vez).
 */
export function renderPendingBadge(count) {
  const badge = document.getElementById('pending-badge');
  if (badge) badge.textContent = String(count);
  const btn = document.getElementById('btn-open-pending');
  if (btn) btn.classList.toggle('has-pending', count > 0);
}

/**
 * Requisito: "puede darse el caso q el usuario no tenga tiempo para
 * etiquetarlas todas asi q debe podese mostrar en un apartado y valla
 * etiquetandola segun pueda" + "solo debe mostrarse en la pantalla las
 * transferencias del dia y un paginador por si son muchas".
 *
 * Muestra, para UN día concreto (elegible con el selector de fecha),
 * una página a la vez de las transferencias sin etiquetar de ese día.
 * Cada fila tiene un botón "Etiquetar" que abre el modal "¿Quién es?"
 * solo para esa transferencia — el usuario puede cerrar esta pantalla
 * en cualquier momento y volver luego a seguir etiquetando.
 */
export function showPendingModal({ dateStr, items, page, totalPages, totalForDay, totalOverall }, callbacks) {
  const modal = document.getElementById('pending-modal');
  const dayInput = document.getElementById('pending-day-input');
  const summary = document.getElementById('pending-day-summary');
  const list = document.getElementById('pending-list');
  const pageLabel = document.getElementById('pending-page-label');
  const prevBtn = document.getElementById('btn-pending-prev');
  const nextBtn = document.getElementById('btn-pending-next');

  dayInput.value = dateStr;
  dayInput.onchange = () => callbacks.onChangeDay(dayInput.value);

  const [y, m, d] = dateStr.split('-');
  summary.textContent = totalForDay
    ? `${totalForDay} transferencia${totalForDay === 1 ? '' : 's'} sin etiquetar el ${d}/${m}/${y} (${totalOverall} en total, todos los días).`
    : `No hay transferencias sin etiquetar el ${d}/${m}/${y}. Pendientes en total: ${totalOverall}.`;

  list.innerHTML = '';
  if (!items.length) {
    list.innerHTML = '<li>Nada que etiquetar en esta página.</li>';
  } else {
    for (const op of items) {
      const li = document.createElement('li');
      const label = op.identifierType === 'account' ? `Cuenta ${op.identifier}` : op.identifier;
      const dirIcon = op.type === 'in' ? '⬇' : op.type === 'out' ? '⬆' : '•';
      const time = new Date(op.date).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `
        <span>${dirIcon} ${label} <small style="color:var(--text-faint)">${time} · ${formatMoney(op.amount, op.currency)}</small></span>
        <button class="tiny-btn" data-action="label">Etiquetar</button>
      `;
      li.querySelector('[data-action="label"]').onclick = () => callbacks.onLabelItem(op);
      list.appendChild(li);
    }
  }

  pageLabel.textContent = `Página ${totalPages ? page + 1 : 0} de ${totalPages}`;
  prevBtn.disabled = page <= 0;
  nextBtn.disabled = page >= totalPages - 1;
  prevBtn.onclick = () => callbacks.onPrevPage();
  nextBtn.onclick = () => callbacks.onNextPage();

  modal.classList.remove('hidden');
  document.getElementById('btn-close-pending').onclick = () => modal.classList.add('hidden');
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

export function showWhoIsModal({ identifier, identifierType, amount, currency, date, type }, existingContacts, onSaveNew, onAssociateExisting, onSkipOnce, onSkipForever) {
  const modal = document.getElementById('who-is-modal');
  const details = document.getElementById('who-is-details');
  const directionLabel = document.getElementById('who-is-direction');
  const nameInput = document.getElementById('who-is-name');
  const saveBtn = document.getElementById('btn-save-contact');
  const existingSelect = document.getElementById('who-is-existing-select');
  const associateBtn = document.getElementById('btn-associate-existing');
  const associateRow = document.getElementById('who-is-associate-row');
  const skipOnceBtn = document.getElementById('btn-skip-once');
  const skipForeverBtn = document.getElementById('btn-skip-forever');
  const quickButtons = document.querySelectorAll('#quick-options button');

  const label = identifierType === 'account' ? `Cuenta ${identifier}` : identifier;
  details.textContent =
    `${label} · ${formatMoney(amount, currency)} · ${new Date(date).toLocaleDateString('es-CU')}`;

  // Aclara si es una transferencia ENTRANTE (te la hacen a ti) o
  // SALIENTE (la haces tú), para que quede claro qué se está guardando.
  if (directionLabel) {
    directionLabel.textContent = type === 'in'
      ? '⬇ Entrante (te la hicieron a ti)'
      : type === 'out'
        ? '⬆ Saliente (la hiciste tú)'
        : 'Tipo desconocido';
    directionLabel.className = type === 'in' ? 'direction-badge in' : type === 'out' ? 'direction-badge out' : 'direction-badge';
  }

  nameInput.value = '';
  modal.classList.remove('hidden');

  let selectedCategory = null;
  quickButtons.forEach((btn) => {
    btn.onclick = () => {
      selectedCategory = btn.dataset.cat;
      if (!nameInput.value) nameInput.value = btn.dataset.cat;
    };
  });

  saveBtn.onclick = () => {
    const alias = nameInput.value.trim();
    if (!alias) return;
    modal.classList.add('hidden');
    onSaveNew(alias, selectedCategory || 'Sin categoría');
  };

  // Requisito: "una misma persona puede tener mas de una tarjeta por
  // tanto debe poder asociarse a un contacto existente" — si ya hay
  // contactos creados, se ofrece la opción de vincular esta tarjeta
  // nueva a uno de ellos en vez de crear un contacto duplicado.
  if (existingSelect && associateRow) {
    if (existingContacts && existingContacts.length) {
      associateRow.classList.remove('hidden');
      existingSelect.innerHTML = existingContacts
        .map((c) => `<option value="${c.id}">${c.alias}${c.card_count > 1 ? ` (${c.card_count} tarjetas)` : ''}</option>`)
        .join('');
    } else {
      associateRow.classList.add('hidden');
    }
  }
  if (associateBtn) {
    associateBtn.onclick = () => {
      const contactId = Number(existingSelect.value);
      if (!contactId) return;
      modal.classList.add('hidden');
      onAssociateExisting(contactId);
    };
  }

  // Requisito: "omitir puede ser temporal o indefinido".
  if (skipOnceBtn) {
    skipOnceBtn.onclick = () => {
      modal.classList.add('hidden');
      if (onSkipOnce) onSkipOnce();
    };
  }
  if (skipForeverBtn) {
    skipForeverBtn.onclick = () => {
      modal.classList.add('hidden');
      if (onSkipForever) onSkipForever();
    };
  }
}

/**
 * Requisito: "filtro por dia". Muestra la lista de transacciones
 * individuales (no agrupadas) de un día concreto, en un modal simple.
 */
export function renderDayTransactions(dateStr, transactions) {
  const modal = document.getElementById('day-modal');
  const title = document.getElementById('day-modal-title');
  const list = document.getElementById('day-transactions-list');

  const [y, m, d] = dateStr.split('-');
  title.textContent = `Transferencias del ${d}/${m}/${y}`;
  list.innerHTML = '';

  if (!transactions.length) {
    list.innerHTML = '<li>No hay transferencias ese día.</li>';
  } else {
    for (const t of transactions) {
      const li = document.createElement('li');
      const amountClass = t.type === 'in' ? 'amount-in' : 'amount-out';
      const sign = t.type === 'in' ? '+' : '−';
      const who = t.alias || t.identifier || 'Desconocido';
      li.innerHTML = `
        <span>${who} <small style="color:#9aa1ac">${new Date(t.date).toLocaleTimeString('es-CU', { hour: '2-digit', minute: '2-digit' })}</small></span>
        <span class="${amountClass}">${sign} ${formatMoney(t.amount, t.currency)}</span>
      `;
      list.appendChild(li);
    }
  }

  modal.classList.remove('hidden');
  document.getElementById('btn-close-day-modal').onclick = () => modal.classList.add('hidden');
}
}
