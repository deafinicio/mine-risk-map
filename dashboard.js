'use strict';

// The public dashboard reads extracted numeric data only. No source documents are included.
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const format = new Intl.NumberFormat('uk-UA');
const decimal = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });
const percent = value => `${decimal.format(value)}%`;
const number = value => format.format(Math.round(value));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const icons = {
  compass: '<path d="M12 2 21 7v10l-9 5-9-5V7z"/><path d="m15.8 8.2-2.1 5.5-5.5 2.1 2.1-5.5z"/><path d="M12 2v3m9 12-3-1.5M3 17l3-1.5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m1-15a3 3 0 0 1 0 6m5 9v-2a6 6 0 0 0-3-5"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zM2 12l10 5 10-5M2 16l10 5 10-5"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16m6-14v16"/>',
  'arrow-up-right': '<path d="M6 18 18 6M6 6h12v12"/>',
  radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="3"/><path d="M12 12 19 5"/><circle cx="7" cy="15" r=".6" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/>',
  sparkles: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  filter: '<path d="M3 5h18M6 12h12m-8 7h4"/><circle cx="7" cy="5" r="2" fill="#0d1a2b"/><circle cx="16" cy="12" r="2" fill="#0d1a2b"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  person: '<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
  cursor: '<path d="m5 3 4 17 3-7 7-3z"/>',
  home: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-7h6v7"/>',
  accessibility: '<circle cx="12" cy="4" r="2"/><path d="M4 9h16m-8-2v7m0 0-5 7m5-7 5 7"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
function renderIcons(root = document) {
  $$('[data-icon]', root).forEach(el => {
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[el.dataset.icon] || icons.info}</svg>`;
  });
}
renderIcons();

const state = { data: null, period: 'all', location: 'all', chart: 'beneficiaries', view: 'overview' };
const viewNames = { overview: 'Огляд діяльності', audience: 'Аудиторія', sessions: 'Сесії та освіта', team: 'Команда та брифінги', materials: 'Друковані матеріали' };
const viewDescriptions = {
  overview: 'Результати, аудиторія та динаміка нашої роботи.',
  audience: 'Віковий і статевий склад бенефіціарів за вибраний період.',
  sessions: 'Формати інформування та робота із закладами освіти.',
  team: 'Інформування працівників і волонтерів та облік роботи.',
  materials: 'Розповсюдження матеріалів за даними звітності.'
};
const shortMonths = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов'];
const metricLabels = { beneficiaries: 'Унікальні бенефіціари', sessions: 'Проведені сесії', children: 'Діти та підлітки', adults: 'Дорослі' };
const animationFrames = new Map();
const isAnimated = () => !reducedMotion.matches && !document.body.classList.contains('motion-off');

function animateNumber(el, value) {
  cancelAnimationFrame(animationFrames.get(el));
  const old = Number(el.dataset.value || 0);
  el.dataset.value = value;
  if (!isAnimated()) { el.textContent = number(value); return; }
  const started = performance.now();
  const tick = now => {
    const t = Math.min((now - started) / 600, 1);
    el.textContent = number(old + (value - old) * (1 - (1 - t) ** 3));
    if (t < 1) animationFrames.set(el, requestAnimationFrame(tick));
  };
  animationFrames.set(el, requestAnimationFrame(tick));
}

function periodMonths() {
  if (state.period.startsWith('m')) return [Number(state.period.slice(1))];
  if (state.period.startsWith('q')) { const start = (Number(state.period.slice(1)) - 1) * 3 + 1; return [start, start + 1, start + 2]; }
  return state.data.months.map(m => m.index);
}
function scopedRow(month) {
  if (state.location === 'all') return month;
  return { ...month.locations.find(loc => loc.location === state.location), index: month.index, month: month.month };
}
function rowsForSelection() { const selected = periodMonths(); return state.data.months.filter(m => selected.includes(m.index)).map(scopedRow); }
function sum(rows, key) { return rows.reduce((n, row) => n + (Number(row[key]) || 0), 0); }
function aggregate(rows) {
  const keys = Object.keys(state.data.months[0]).filter(key => typeof state.data.months[0][key] === 'number' && key !== 'index');
  const total = Object.fromEntries(keys.map(key => [key, sum(rows, key)]));
  total.age = state.data.ageLabels.map((_, i) => ({ male: rows.reduce((n, row) => n + row.age[i].male, 0), female: rows.reduce((n, row) => n + row.age[i].female, 0) }));
  return total;
}
function periodText() { return $('#period').selectedOptions[0].textContent; }
function syncURL() {
  const url = new URL(location.href);
  for (const [key, value] of [['period', state.period], ['team', state.location], ['view', state.view]]) {
    if (value === 'all' || value === 'overview') url.searchParams.delete(key); else url.searchParams.set(key, value);
  }
  history.replaceState(null, '', url);
}
function changeSelection(period = state.period, location = state.location) {
  state.period = period; state.location = location;
  $('#period').value = period; $('#location').value = location;
  syncURL(); render();
}

function spark(id, rows, key) {
  const values = rows.map(row => row[key]); const max = Math.max(...values, 1); const min = Math.min(...values);
  const points = values.map((value, i) => `${i * 100 / Math.max(values.length - 1, 1)},${30 - (value - min) / Math.max(max - min, 1) * 25}`).join(' ');
  $(id).innerHTML = `<polyline points="${points}" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`;
}
function timeline() {
  const rows = state.data.months.map(scopedRow);
  const selected = periodMonths();
  const values = rows.map(row => row[state.chart]);
  const rawMax = Math.max(...values, 1);
  const step = rawMax <= 60 ? 10 : rawMax <= 300 ? 50 : rawMax <= 600 ? 100 : 200;
  const ceiling = Math.ceil(rawMax / step) * step;
  const x = i => 42 + i * 80;
  const y = value => 208 - value / ceiling * 173;
  const points = values.map((v, i) => [x(i), y(v)]);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1].toFixed(2)}`).join(' ');
  const area = `${path} L${x(9)},218 L42,218 Z`;
  let markup = '<defs><linearGradient id="area-gradient" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#46e3ff" stop-opacity=".23"/><stop offset="1" stop-color="#46e3ff" stop-opacity="0"/></linearGradient></defs>';
  for (let i = 0; i <= 4; i++) { const value = ceiling * i / 4; const py = y(value); markup += `<line class="gridline" x1="42" x2="770" y1="${py}" y2="${py}"/><text class="axis-label" x="30" y="${py + 3}" text-anchor="end">${decimal.format(value)}</text>`; }
  markup += `<path d="${area}" fill="url(#area-gradient)"/><path d="${path}" class="chart-line"/>`;
  points.forEach(([px, py], i) => {
    const chosen = selected.includes(i + 1);
    markup += `<g class="chart-node ${chosen ? 'chart-focus' : ''}" data-month="${i + 1}" tabindex="0" role="button" aria-label="${rows[i].month}: ${number(values[i])}. Переглянути місяць" style="opacity:${chosen ? 1 : .36}"><rect class="chart-hit" x="${px - 24}" y="8" width="48" height="212"/><circle class="chart-point" cx="${px}" cy="${py}" r="3.5"/><text class="point-label" x="${px}" y="${py - 14}" text-anchor="middle">${number(values[i])}</text></g>`;
  });
  $('#timeline').innerHTML = markup;
  $('#timeline').setAttribute('aria-label', state.chart === 'sessions' ? 'Кількість сесій за місяцями' : 'Охоплення бенефіціарів за місяцями');
  $('#month-buttons').innerHTML = shortMonths.map((name, i) => `<button data-month="${i + 1}" class="${selected.includes(i + 1) ? 'active' : ''} ${state.period === `m${i + 1}` ? 'single' : ''}" aria-pressed="${state.period === `m${i + 1}`}" aria-label="${state.data.months[i].month}">${name}</button>`).join('');
  $$('#timeline [data-month]').forEach(node => {
    const i = Number(node.dataset.month) - 1;
    node.addEventListener('pointerenter', () => showChartTooltip(i, points[i], values[i]));
    node.addEventListener('pointerleave', () => { $('#chart-tooltip').hidden = true; });
    node.addEventListener('focus', () => showChartTooltip(i, points[i], values[i]));
    node.addEventListener('blur', () => { $('#chart-tooltip').hidden = true; });
    node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); changeSelection(`m${i + 1}`); } });
  });
}
function showChartTooltip(index, [x, y], value) {
  const tip = $('#chart-tooltip'); const container = $('.timeline-container');
  tip.innerHTML = `${state.data.months[index].month} 2026<strong>${number(value)} ${state.chart === 'sessions' ? 'сесій' : 'бенефіціарів'}</strong>`;
  tip.hidden = false;
  tip.style.left = `${Math.max(0, Math.min(container.clientWidth - tip.offsetWidth, x / 780 * container.clientWidth - tip.offsetWidth / 2))}px`;
  tip.style.top = `${Math.max(0, y / 242 * $('#timeline').clientHeight - 61)}px`;
}
function detailCard(label, value, caption, icon = 'activity') { return `<article class="glass detail-card"><span>${label}</span><strong>${value}</strong><small>${caption}</small></article>`; }
function educationCell(value, text) { return `<div><strong>${number(value)}</strong><span>${text}</span></div>`; }
function renderDetails(total, rows) {
  const ageTotal = total.age.map(a => a.male + a.female);
  $('#audience-table').innerHTML = total.age.map((a, i) => `<tr><td>${state.data.ageLabels[i]} років</td><td>${number(a.male)}</td><td>${number(a.female)}</td><td>${number(ageTotal[i])}</td><td>${percent(ageTotal[i] / Math.max(total.beneficiaries, 1) * 100)}</td></tr>`).join('') + `<tr><td>Разом</td><td>${number(total.male)}</td><td>${number(total.female)}</td><td>${number(total.beneficiaries)}</td><td>${total.beneficiaries ? '100%' : '—'}</td></tr>`;
  $('#audience-details').innerHTML = detailCard('Внутрішньо переміщені особи', number(total.idp_m + total.idp_f), `${number(total.idp_m)} чоловічої · ${number(total.idp_f)} жіночої статі`) + detailCard('Особи з інвалідністю', number(total.disability_m + total.disability_f), `${number(total.disability_m)} чоловічої · ${number(total.disability_f)} жіночої статі`) + detailCard('Середня кількість на сесію', decimal.format(total.beneficiaries / Math.max(total.sessions, 1)), 'Загальне охоплення / кількість сесій');
  $('#session-details').innerHTML = detailCard('Офлайн-сесії', number(total.offline), 'Окремий показник колонки T') + detailCard('Онлайн-сесії', number(total.online), `${percent(total.online / Math.max(total.sessions, 1) * 100)} від загальної кількості сесій`) + detailCard('Усі сесії', number(total.sessions), 'Офлайн та онлайн за вибраний період');
  $('#education-details').innerHTML = educationCell(total.school_sessions, 'Сесії у закладах освіти') + educationCell(total.schoolboys + total.schoolgirls, 'Школярі') + educationCell(total.school_staff_m + total.school_staff_f, 'Персонал закладів освіти');
  const incompleteBriefings = state.location === 'Харків' && rows.some(row => row.index === 6);
  $('#team-details').innerHTML = (incompleteBriefings ? '<div><strong>—</strong><span>Кількість брифінгів: за червень не заповнено первинне поле</span></div>' : educationCell(total.briefings, 'Проведені брифінги')) + educationCell(total.employees, 'Участі працівників у брифінгах') + educationCell(total.volunteers, 'Участі волонтерів у брифінгах');
  $('#material-details').innerHTML = detailCard('Листівки', number(total.leaflets), 'Колонка Q звітної таблиці') + detailCard('Плакати', number(total.posters), 'Внесені показники колонки R') + detailCard('Матеріали «Обстріли»', number(total.shelling), 'Окремий показник колонки S');
}
function render() {
  if (!state.data) return;
  const rows = rowsForSelection(); const total = aggregate(rows); const allRows = state.data.months.map(scopedRow);
  $$('[data-metric]').forEach(el => animateNumber(el, total[el.dataset.metric]));
  $('#selection-summary').textContent = `${periodText()} · ${state.location === 'all' ? 'Усі команди' : state.location}`;
  $('#period-chip').textContent = `${rows.length} ${rows.length === 1 ? 'звітний місяць' : rows.length < 5 ? 'звітні місяці' : 'звітних місяців'}`;
  $('#sessions-caption').textContent = `${number(total.offline)} офлайн · ${number(total.online)} онлайн`;
  $('#children-caption').textContent = `${percent(total.children / Math.max(total.beneficiaries, 1) * 100)} від охоплення`;
  $('#adults-caption').textContent = `${percent(total.adults / Math.max(total.beneficiaries, 1) * 100)} від охоплення`;
  $('#children-track').style.width = `${total.children / Math.max(total.beneficiaries, 1) * 100}%`;
  $('#adults-track').style.width = `${total.adults / Math.max(total.beneficiaries, 1) * 100}%`;
  spark('#spark-beneficiaries', allRows, 'beneficiaries'); spark('#spark-sessions', allRows, 'sessions');
  $('#chart-headline').textContent = number(total[state.chart]);
  $('#chart-unit').textContent = state.chart === 'sessions' ? 'сесій за період' : 'бенефіціарів за період';
  $('#chart-legend').textContent = state.chart === 'sessions' ? 'Сесії' : 'Охоплення';
  $('#chart-tooltip').hidden = true;
  timeline();
  const circumference = 2 * Math.PI * 84; const femaleFraction = total.female / Math.max(total.beneficiaries, 1);
  $('#donut-female').style.strokeDasharray = `${femaleFraction * circumference - (total.female ? 5 : 0)} ${circumference}`;
  $('#donut-male').style.strokeDasharray = `${(1 - femaleFraction) * circumference - (total.male ? 5 : 0)} ${circumference}`;
  $('#donut-male').style.strokeDashoffset = -femaleFraction * circumference;
  $('#donut-total').textContent = number(total.beneficiaries);
  $('#female-total').textContent = number(total.female); $('#male-total').textContent = number(total.male);
  $('#female-share').textContent = percent(femaleFraction * 100); $('#male-share').textContent = percent(total.male / Math.max(total.beneficiaries, 1) * 100);
  const ages = total.age.map(a => a.male + a.female); const ageMax = Math.max(...ages, 1);
  $('#age-bars').innerHTML = ages.map((value, i) => `<div class="age-item" title="${state.data.ageLabels[i]} років: ${number(value)}"><span class="age-value">${number(value)}</span><div class="age-column-wrap"><div class="age-column" style="--height:${value / ageMax * 100}%;--delay:${i * 55}ms"></div></div><span class="age-label">${state.data.ageLabels[i]} років</span></div>`).join('');
  $('#idp-total').textContent = number(total.idp_m + total.idp_f);
  $('#disability-total').textContent = number(total.disability_m + total.disability_f);
  const peak = rows.reduce((best, row) => row.beneficiaries > best.beneficiaries ? row : best, rows[0]);
  $('#insight-text').textContent = rows.length === 1 ? `${peak.month}: ${number(total.sessions)} сесій, у середньому ${decimal.format(total.beneficiaries / Math.max(total.sessions, 1))} бенефіціара на сесію.` : `Найбільше охоплення за вибраний період — ${peak.month.toLowerCase()}: ${number(peak.beneficiaries)} бенефіціарів.`;
  renderDetails(total, rows);
}
function setView(view) {
  if (!Object.hasOwn(viewNames, view)) return;
  const update = () => {
    state.view = view;
    $$('.view-section').forEach(section => { section.hidden = section.id !== `view-${view}`; });
    $$('.nav-item[data-view]').forEach(button => { const current = button.dataset.view === view; button.classList.toggle('active', current); if (current) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    $('#page-title').innerHTML = `${viewNames[view]}<span class="title-dot">.</span>`;
    $('#page-description').textContent = viewDescriptions[view];
    $('#breadcrumb-view').textContent = view === 'overview' ? 'Огляд' : viewNames[view];
    document.title = `${viewNames[view]} — EORE Analytics`;
    syncURL();
  };
  update();
  if (isAnimated()) $(`#view-${view}`).animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 320, easing: 'cubic-bezier(.2,.7,.2,1)' });
}

const info = {
  beneficiaries: ['Унікальні бенефіціари', 'У картці наведено показник охоплення зі звітної таблиці RASB.\n\nВін є сумою місячних записів. Джерело не містить ідентифікаторів людей, тому повторну участь однієї людини в різних сесіях не перевірено.'],
  sessions: ['Проведені сесії', 'Сума офлайн- та онлайн-сесій за вибраний період. Спільна робота двох інструкторів не подвоює кількість сесій.\n\nДжерело: місячні показники вкладок локацій та локального зведення.'],
  source: ['Про ці дані', 'Джерело: загальна статистика RASB Харківської області за 2026 рік. Внесені дані за січень–жовтень.\n\nОгляд використовує витягнуті числові показники. Оригінали DOCX і XLSX у репозиторії не зберігаються.\n\nКоманда означає звітуючу локацію, а не обов’язково місце проведення сесії. Кількість брифінгів за червень у зведенні внесена вручну й потребує звіряння з первинною вкладкою.']
};
function showInfo(key) {
  const entry = info[key]; if (!entry) return;
  $('#dialog-title').textContent = entry[0]; $('#dialog-text').textContent = entry[1];
  $('#info-dialog').showModal();
}
function exportCSV() {
  const rows = rowsForSelection(); const total = aggregate(rows);
  const lines = [['Період', 'Команда', 'Бенефіціари за звітністю', 'Сесії', 'Діти', 'Дорослі', 'Чоловіча стать', 'Жіноча стать']];
  for (const row of rows) lines.push([`${row.month} 2026`, state.location === 'all' ? 'Усі команди' : state.location, row.beneficiaries, row.sessions, row.children, row.adults, row.male, row.female]);
  lines.push(['Разом', state.location === 'all' ? 'Усі команди' : state.location, total.beneficiaries, total.sessions, total.children, total.adults, total.male, total.female]);
  const csv = '\ufeff' + lines.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a'); link.href = url; link.download = `EORE_2026_${state.period}_${state.location}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('#toast').textContent = 'Експортовано показники вибраного періоду'; $('#toast').hidden = false; setTimeout(() => { $('#toast').hidden = true; }, 3500);
}

document.addEventListener('click', event => {
  const month = event.target.closest('[data-month]'); if (month && state.data) changeSelection(`m${month.dataset.month}`);
  const view = event.target.closest('[data-view], [data-open-view]'); if (view && state.data) setView(view.dataset.view || view.dataset.openView);
  const chart = event.target.closest('[data-chart]'); if (chart && state.data) { state.chart = chart.dataset.chart; $$('[data-chart]').forEach(button => { const current = button === chart; button.classList.toggle('selected', current); button.setAttribute('aria-pressed', current); }); render(); }
  const help = event.target.closest('[data-info]'); if (help) showInfo(help.dataset.info);
});
$('#period').addEventListener('change', event => changeSelection(event.target.value));
$('#location').addEventListener('change', event => changeSelection(state.period, event.target.value));
$('#reset-button').addEventListener('click', () => { if (state.data) changeSelection('all', 'all'); });
$('#all-period-button').addEventListener('click', () => changeSelection('all'));
$('#source-button').addEventListener('click', () => showInfo('source'));
$('.dialog-close').addEventListener('click', () => $('#info-dialog').close());
$('.dialog-confirm').addEventListener('click', () => $('#info-dialog').close());
$('#info-dialog').addEventListener('click', event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close(); } });
$('#motion-button').addEventListener('click', event => { const off = document.body.classList.toggle('motion-off'); event.currentTarget.setAttribute('aria-pressed', off); event.currentTarget.setAttribute('aria-label', off ? 'Увімкнути анімації' : 'Вимкнути анімації'); });
$('#export-button').addEventListener('click', () => { if (state.data) exportCSV(); });
document.addEventListener('pointermove', event => { if (event.pointerType === 'touch' || !isAnimated()) return; const panel = event.target.closest('.glass'); if (!panel) return; const rect = panel.getBoundingClientRect(); panel.style.setProperty('--px', `${event.clientX - rect.left}px`); panel.style.setProperty('--py', `${event.clientY - rect.top}px`); }, { passive: true });

async function loadData() {
  $('#loading').hidden = false; $('#error').hidden = true;
  try {
    const response = await fetch('data/dashboard-2026.json');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (data.schemaVersion !== 1 || data.months.length !== 10) throw new Error('Unsupported dashboard data');
    state.data = data;
    $('#month-options').innerHTML = data.months.map(month => `<option value="m${month.index}">${month.month} 2026</option>`).join('');
    const url = new URL(location.href);
    const requestedPeriod = url.searchParams.get('period') || 'all';
    const requestedLocation = url.searchParams.get('team') || 'all';
    state.period = ['all', 'q1', 'q2', 'q3', ...data.months.map(month => `m${month.index}`)].includes(requestedPeriod) ? requestedPeriod : 'all';
    state.location = ['all', ...data.locations].includes(requestedLocation) ? requestedLocation : 'all';
    $('#period').value = state.period; $('#location').value = state.location;
    $('#loading').hidden = true; $('#dashboard-content').hidden = false;
    setView(url.searchParams.get('view') || 'overview'); render();
  } catch (error) {
    console.error('Dashboard data:', error);
    $('#loading').hidden = true; $('#error').hidden = false;
  }
}
$('#retry-button').addEventListener('click', loadData);
loadData();
