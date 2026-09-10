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

export function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

export function showWhoIsModal({ identifier, identifierType, amount, currency, date }, onSave) {
  const modal = document.getElementById('who-is-modal');
  const details = document.getElementById('who-is-details');
  const nameInput = document.getElementById('who-is-name');
  const saveBtn = document.getElementById('btn-save-contact');
  const quickButtons = document.querySelectorAll('#quick-options button');

  const label = identifierType === 'account' ? `Cuenta ${identifier}` : identifier;
  details.textContent =
    `${label} · ${formatMoney(amount, currency)} · ${new Date(date).toLocaleDateString('es-CU')}`;
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
    onSave(alias, selectedCategory || 'Sin categoría');
  };
}
