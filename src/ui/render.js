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

export function showLoader(message = 'Indexando transferencias…') {
  let el = document.getElementById('global-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'global-loader';
    el.className = 'loader-overlay hidden';
    el.innerHTML = '<div class="loader-box"><div class="spinner"></div><p class="loader-text"></p></div>';
    document.body.appendChild(el);
  }
  el.querySelector('.loader-text').textContent = message;
  el.classList.remove('hidden');
}

export function hideLoader() {
  const el = document.getElementById('global-loader');
  if (el) el.classList.add('hidden');
}

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

export function showSettingsModal(currentSettings, onSave, options = {}) {
  const { forceChoice = false } = options;
  const modal = document.getElementById('settings-modal');
  const toggle = document.getElementById('settings-catchall-toggle');
  const aliasInput = document.getElementById('settings-catchall-alias');
  const categoryInput = document.getElementById('settings-catchall-category');
  const indexSinceInput = document.getElementById('settings-index-since');
  const saveBtn = document.getElementById('btn-save-settings');
  const closeBtn = document.getElementById('btn-close-settings');
  const onboardingNotice = document.getElementById('settings-onboarding-notice');

  toggle.checked = !!currentSettings.enabled;
  aliasInput.value = currentSettings.alias || 'Negocio';
  categoryInput.value = currentSettings.category || 'Negocio';
  if (indexSinceInput) indexSinceInput.value = currentSettings.indexSinceDate || '';

  if (onboardingNotice) onboardingNotice.classList.toggle('hidden', !forceChoice);
  if (closeBtn) closeBtn.classList.toggle('hidden', forceChoice);
  saveBtn.textContent = forceChoice ? 'Empezar a indexar' : 'Guardar ajustes';

  modal.classList.remove('hidden');

  saveBtn.onclick = () => {
    const enabled = toggle.checked;
    const alias = aliasInput.value.trim() || 'Negocio';
    const category = categoryInput.value.trim() || 'Negocio';
    const indexSinceDate = indexSinceInput ? indexSinceInput.value || null : null;
    modal.classList.add('hidden');
    onSave({ enabled, alias, category, indexSinceDate });
  };

  if (closeBtn) {
    closeBtn.onclick = forceChoice ? null : () => modal.classList.add('hidden');
  }
}

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
 * Requisito: "cuando tengas 100 usuarios no puedes trabajar con un
 * select por fila; mejor marcar todos los que quieres y asignarlos a
 * un grupo". Se reemplaza el select individual por: buscador +
 * checkboxes + "seleccionar todos" + un único botón de asignación
 * masiva que llama a onAssignGroup(contactIds[], groupId) una sola vez.
 */
export function showContactsModal(contacts, groups, onAssignGroup) {
  const modal = document.getElementById('contacts-modal');
  const list = document.getElementById('contacts-list');
  const searchInput = document.getElementById('contacts-search');
  const selectAllBox = document.getElementById('contacts-select-all');
  const selectedCountEl = document.getElementById('contacts-selected-count');
  const bulkGroupSelect = document.getElementById('contacts-bulk-group-select');
  const bulkAssignBtn = document.getElementById('btn-bulk-assign-group');

  const selectedIds = new Set();

  bulkGroupSelect.innerHTML = ['<option value="">Sin grupo</option>']
    .concat(groups.map((g) => `<option value="${g.id}">${g.name}</option>`))
    .join('');

  function currentFiltered() {
    const term = (searchInput.value || '').trim().toLowerCase();
    return term ? contacts.filter((c) => c.alias.toLowerCase().includes(term)) : contacts;
  }

  function updateBulkBar() {
    const count = selectedIds.size;
    selectedCountEl.textContent = count ? `(${count} seleccionados)` : '';
    bulkAssignBtn.disabled = count === 0;
    bulkAssignBtn.textContent = count ? `Asignar a grupo (${count})` : 'Asignar a grupo';
  }

  function renderList() {
    const filtered = currentFiltered();
    list.innerHTML = '';

    if (!contacts.length) {
      list.innerHTML = '<li>Todavía no tienes contactos guardados.</li>';
      selectAllBox.checked = false;
      return;
    }

    if (!filtered.length) {
      list.innerHTML = '<li>No se encontraron contactos.</li>';
      selectAllBox.checked = false;
      return;
    }

    for (const c of filtered) {
      const li = document.createElement('li');
      li.className = 'contact-row';
      li.innerHTML = `
        <label class="contact-checkbox-row">
          <input type="checkbox" class="contact-check" ${selectedIds.has(c.id) ? 'checked' : ''} />
          <div class="contact-row-info">
            <span>${c.alias}</span>
            <small style="color:var(--text-faint)">${c.category} · ${c.card_count} ${c.card_count === 1 ? 'tarjeta' : 'tarjetas'} · ${c.group_name || 'Sin grupo'}</small>
          </div>
        </label>
      `;
      const checkbox = li.querySelector('.contact-check');
      checkbox.onchange = () => {
        if (checkbox.checked) selectedIds.add(c.id);
        else selectedIds.delete(c.id);
        selectAllBox.checked = currentFiltered().every((fc) => selectedIds.has(fc.id));
        updateBulkBar();
      };
      list.appendChild(li);
    }

    selectAllBox.checked = filtered.every((fc) => selectedIds.has(fc.id));
  }

  searchInput.value = '';
  selectedIds.clear();
  renderList();
  updateBulkBar();

  searchInput.oninput = renderList;

  selectAllBox.onchange = () => {
    const filtered = currentFiltered();
    if (selectAllBox.checked) filtered.forEach((c) => selectedIds.add(c.id));
    else filtered.forEach((c) => selectedIds.delete(c.id));
    renderList();
    updateBulkBar();
  };

  bulkAssignBtn.onclick = () => {
    if (!selectedIds.size) return;
    const groupId = bulkGroupSelect.value ? Number(bulkGroupSelect.value) : null;
    const ids = Array.from(selectedIds);
    modal.classList.add('hidden');
    onAssignGroup(ids, groupId);
  };

  modal.classList.remove('hidden');
  document.getElementById('btn-close-contacts').onclick = () => modal.classList.add('hidden');
}

export function renderPendingBadge(count) {
  const badge = document.getElementById('pending-badge');
  if (badge) badge.textContent = String(count);
  const btn = document.getElementById('btn-open-pending');
  if (btn) btn.classList.toggle('has-pending', count > 0);
}

export function showPendingModal({ year, month, dayCounts, selectedDate, items, page, totalPages, totalForDay, totalOverall }, callbacks) {
  const modal = document.getElementById('pending-modal');
  const monthLabel = document.getElementById('pending-month-label');
  const chips = document.getElementById('pending-day-chips');
  const summary = document.getElementById('pending-day-summary');
  const list = document.getElementById('pending-list');
  const pageLabel = document.getElementById('pending-page-label');
  const prevBtn = document.getElementById('btn-pending-prev');
  const nextBtn = document.getElementById('btn-pending-next');

  monthLabel.textContent = `${MONTH_NAMES[month - 1]} ${year}`;
  document.getElementById('pending-prev-month').onclick = () => callbacks.onPrevMonth();
  document.getElementById('pending-next-month').onclick = () => callbacks.onNextMonth();

  chips.innerHTML = '';
  const days = Object.keys(dayCounts).sort();
  if (!days.length) {
    chips.innerHTML = '<p class="hint-text">Sin pendientes este mes.</p>';
  } else {
    for (const d of days) {
      const btn = document.createElement('button');
      btn.textContent = `${d.split('-')[2]} (${dayCounts[d]})`;
      if (d === selectedDate) btn.classList.add('active-chip');
      btn.onclick = () => callbacks.onSelectDay(d);
      chips.appendChild(btn);
    }
  }

  if (selectedDate) {
    const [y, m, d] = selectedDate.split('-');
    summary.textContent = totalForDay
      ? `${totalForDay} transferencia${totalForDay === 1 ? '' : 's'} sin etiquetar el ${d}/${m}/${y}. `
      : `No hay transferencias sin etiquetar el ${d}/${m}/${y}. `;
  } else {
    summary.textContent = 'Selecciona un día con pendientes. ';
  }
  summary.textContent += `(${totalOverall} pendientes en total, todos los meses.)`;

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

export function showReclassifyModal(transactions, contacts, callbacks) {
  const modal = document.getElementById('reclassify-modal');
  const list = document.getElementById('reclassify-list');
  list.innerHTML = '';

  if (!transactions.length) {
    list.innerHTML = '<li>No hay transacciones en la categoría única.</li>';
  } else {
    for (const t of transactions) {
      const li = document.createElement('li');
      li.style.cssText = 'flex-direction:column;align-items:stretch;gap:8px;';
      const amountClass = t.type === 'in' ? 'amount-in' : 'amount-out';
      const sign = t.type === 'in' ? '+' : '−';
      const options = ['<option value="">Elegir contacto…</option>']
        .concat(contacts.map((c) => `<option value="${c.id}">${c.alias}</option>`))
        .join('');
      li.innerHTML = `
        <div style="display:flex;justify-content:space-between;">
          <span>${t.identifier} <small style="color:var(--text-faint)">${new Date(t.date).toLocaleDateString('es-CU')}</small></span>
          <span class="${amountClass}">${sign} ${formatMoney(t.amount, t.currency)}</span>
        </div>
        <div style="display:flex;gap:8px;">
          <select class="reclassify-select" style="flex:1;margin-bottom:0;">${options}</select>
          <button class="tiny-btn" data-action="assign">Asignar</button>
          <button class="tiny-btn" data-action="new">+ Nuevo</button>
        </div>
      `;
      li.querySelector('[data-action="assign"]').onclick = () => {
        const contactId = Number(li.querySelector('.reclassify-select').value);
        if (!contactId) return;
        callbacks.onAssign(t.id, contactId);
      };
      li.querySelector('[data-action="new"]').onclick = () => {
        const alias = prompt('Nombre del nuevo contacto:');
        if (!alias || !alias.trim()) return;
        callbacks.onAssignNew(t.id, alias.trim());
      };
      list.appendChild(li);
    }
  }

  modal.classList.remove('hidden');
  document.getElementById('btn-close-reclassify').onclick = () => modal.classList.add('hidden');
}

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

export function showWhoIsModal({ identifier, identifierType, amount, currency, date, type }, existingContacts, groups, onSaveNew, onAssociateExisting, onSkipOnce, onSkipForever) {
  const modal = document.getElementById('who-is-modal');
  const details = document.getElementById('who-is-details');
  const directionLabel = document.getElementById('who-is-direction');
  const nameInput = document.getElementById('who-is-name');
  const saveBtn = document.getElementById('btn-save-contact');
  const groupSelect = document.getElementById('who-is-group-select');
  const existingSelect = document.getElementById('who-is-existing-select');
  const associateBtn = document.getElementById('btn-associate-existing');
  const associateRow = document.getElementById('who-is-associate-row');
  const skipOnceBtn = document.getElementById('btn-skip-once');
  const skipForeverBtn = document.getElementById('btn-skip-forever');
  const quickButtons = document.querySelectorAll('#quick-options button');

  const label = identifierType === 'account' ? `Cuenta ${identifier}` : identifier;
  details.textContent =
    `${label} · ${formatMoney(amount, currency)} · ${new Date(date).toLocaleDateString('es-CU')}`;

  if (directionLabel) {
    directionLabel.textContent = type === 'in'
      ? '⬇ Entrante (te la hicieron a ti)'
      : type === 'out'
        ? '⬆ Saliente (la hiciste tú)'
        : 'Tipo desconocido';
    directionLabel.className = type === 'in' ? 'direction-badge in' : type === 'out' ? 'direction-badge out' : 'direction-badge';
  }

  nameInput.value = '';
  if (groupSelect) groupSelect.value = '';
  modal.classList.remove('hidden');

  let selectedCategory = null;
  quickButtons.forEach((btn) => {
    btn.onclick = () => {
      selectedCategory = btn.dataset.cat;
      if (!nameInput.value) nameInput.value = btn.dataset.cat;
      quickButtons.forEach((other) => other.classList.toggle('active-chip', other === btn));
    };
  });

  if (groupSelect) {
    groupSelect.innerHTML = ['<option value="">Sin grupo</option>']
      .concat((groups || []).map((g) => `<option value="${g.id}">${g.name}</option>`))
      .join('');
  }

  saveBtn.onclick = () => {
    const alias = nameInput.value.trim();
    if (!alias) return;
    const groupId = groupSelect && groupSelect.value ? Number(groupSelect.value) : null;
    modal.classList.add('hidden');
    onSaveNew(alias, selectedCategory || 'Sin categoría', groupId);
  };

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
