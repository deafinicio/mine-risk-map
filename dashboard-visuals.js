'use strict';

// Graphical views share the same selected rows and totals as the overview.
// Only additive series are stacked. Materials use grouped bars and no grand total.
const VisualCharts = (() => {
  const nf = new Intl.NumberFormat('uk-UA');
  const pf = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 });
  const n = value => nf.format(value);
  const colors = { cyan: '#65dff5', violet: '#a38bff', mint: '#63ebbd', blue: '#6cafff', amber: '#f0c674' };
  const labels = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов'];
  const set = (id, html) => { document.getElementById(id).innerHTML = html; };
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const legend = series => `<div class="visual-legend">${series.map(s => `<span><i style="--series:${s.color}"></i>${escape(s.label)}</span>`).join('')}</div>`;
  const empty = text => `<div class="visual-empty"><span>∅</span><p>${text}</p></div>`;
  function niceMax(value) {
    const roughStep = Math.max(value, 1) / 4;
    const power = 10 ** Math.floor(Math.log10(roughStep));
    const multiple = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(v => v >= roughStep / power) || 10;
    return Math.max(1, Math.ceil(multiple * power)) * 4;
  }

  function monthly(rows, series, selected, { grouped = false, unit = 'людей', title = '', warning = '' } = {}) {
    const W = 760, H = 285, left = 42, bottom = 235, top = 35, plotH = bottom - top;
    const totals = rows.map(row => grouped ? Math.max(...series.map(s => Number(s.value(row)) || 0)) : series.reduce((v, s) => v + (Number(s.value(row)) || 0), 0));
    const max = niceMax(Math.max(...totals, 1));
    const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, max / 4, max / 2, max * .75, max];
    const slot = (W - left - 12) / rows.length;
    let svg = ticks.map(value => { const y = bottom - value / max * plotH; return `<line x1="${left}" x2="${W - 8}" y1="${y}" y2="${y}" class="v-grid"/><text x="${left - 9}" y="${y + 4}" text-anchor="end" class="v-axis">${pf.format(value)}</text>`; }).join('');
    rows.forEach((row, index) => {
      const x = left + index * slot + slot / 2;
      const active = selected.includes(row.index);
      const values = series.map(s => s.value(row));
      const missing = values.some(value => value === null);
      const total = values.reduce((v, value) => v + (Number(value) || 0), 0);
      const caption = `${row.month}: ${series.map((s, i) => `${s.label} — ${values[i] === null ? 'немає даних' : n(values[i])}`).join('; ')}`;
      let bars = '';
      let stacked = 0;
      const barWidth = Math.min(grouped ? 13 : 33, slot * (grouped ? .2 : .54));
      series.forEach((s, i) => {
        const value = values[i];
        if (value === null) {
          bars += `<text x="${x}" y="${bottom - 9}" text-anchor="middle" class="v-missing">?</text>`;
          return;
        }
        const height = value / max * plotH;
        const bx = grouped ? x + (i - (series.length - 1) / 2) * (barWidth + 3) - barWidth / 2 : x - barWidth / 2;
        const y = bottom - (grouped ? value : stacked + value) / max * plotH;
        if (value > 0) bars += `<rect class="v-bar" x="${bx}" y="${y}" width="${barWidth}" height="${height}" rx="2" fill="${s.color}" fill-opacity=".75" stroke="${s.color}" stroke-opacity=".7" style="--delay:${index * 35}ms" data-value="${value}" data-series="${escape(s.label)}"/>`;
        if (grouped && value > 0) bars += `<text class="v-value" x="${bx + barWidth / 2}" y="${y - 9}" text-anchor="middle">${n(value)}</text>`;
        stacked += value;
      });
      if (!grouped && !missing) bars += `<text class="v-value" x="${x}" y="${bottom - total / max * plotH - 11}" text-anchor="middle">${n(total)}</text>`;
      svg += `<g class="v-month ${active ? 'chosen' : ''}" style="opacity:${active ? 1 : .25}" data-month="${row.index}" tabindex="0" role="button" aria-label="${escape(caption)}. Вибрати місяць"><title>${escape(caption)}</title><rect x="${x - slot / 2 + 2}" y="14" width="${slot - 4}" height="${H - 24}" rx="7" class="v-hit"/>${bars}<text class="v-month-label" x="${x}" y="${bottom + 25}" text-anchor="middle">${labels[row.index - 1]}</text></g>`;
    });
    return `${legend(series)}<div class="visual-chart-scroll"><svg class="monthly-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${escape(title)}">${svg}</svg></div><div class="visual-caption">${warning || `Вертикальна шкала: ${unit}. Натисни на місяць для деталізації.`}</div>`;
  }

  function ring(segments, caption) {
    const total = segments.reduce((a, b) => a + b.value, 0);
    if (!total) return empty('За вибраний період немає внесених значень');
    const C = 2 * Math.PI * 82;
    let offset = 0;
    const circles = segments.map(segment => {
      const length = segment.value / total * C;
      const result = segment.value > 0 ? `<circle cx="110" cy="110" r="82" fill="none" stroke="${segment.color}" stroke-width="17" stroke-dasharray="${Math.max(length - Math.min(4, length * .1), 0)} ${C}" stroke-dashoffset="${-offset}" class="v-ring-segment"><title>${escape(segment.label)}: ${n(segment.value)} (${pf.format(segment.value / total * 100)}%)</title></circle>` : '';
      offset += length;
      return result;
    }).join('');
    return `<div class="visual-ring-wrap"><svg viewBox="0 0 220 220" role="img" aria-label="${escape(segments.map(s => `${s.label}: ${n(s.value)}`).join(', '))}"><circle cx="110" cy="110" r="82" fill="none" stroke="#243447" stroke-width="17"/><g transform="rotate(-90 110 110)">${circles}</g><circle cx="110" cy="110" r="62" fill="#0a1522" stroke="#273a5044"/></svg><div class="visual-ring-label"><strong>${n(total)}</strong><span>${caption}</span></div></div><div class="visual-ring-legend">${segments.map(s => `<div><span><i style="--series:${s.color}"></i>${escape(s.label)}</span><strong>${n(s.value)}</strong><small>${pf.format(s.value / total * 100)}%</small></div>`).join('')}</div>`;
  }

  function ageGender(total, ageLabels) {
    const max = Math.max(...total.age.map(a => a.male + a.female), 1);
    const series = [{ label: 'Жінки та дівчата', color: colors.cyan }, { label: 'Чоловіки та хлопці', color: colors.violet }];
    return `${legend(series)}<div class="horizontal-chart">${total.age.map((a, i) => `<div class="h-row"><span class="h-label">${ageLabels[i]} років</span><div class="h-track"><div class="h-stack" style="width:${(a.male + a.female) / max * 100}%"><span style="width:${a.female / Math.max(a.male + a.female, 1) * 100}%;--series:${colors.cyan}" title="Жіноча стать: ${n(a.female)}"></span><span style="width:${a.male / Math.max(a.male + a.female, 1) * 100}%;--series:${colors.violet}" title="Чоловіча стать: ${n(a.male)}"></span></div></div><strong>${n(a.male + a.female)}</strong></div>`).join('')}</div><p class="visual-caption">Довжина смуги — кількість людей. Кольори показують статевий склад.</p>`;
  }
  function splitBar(male, female) {
    const total = male + female;
    if (!total) return empty('За вибраний період немає внесених значень');
    return `<div class="split-total"><strong>${n(total)}</strong><span>бенефіціарів</span></div><div class="split-bar" role="img" aria-label="Жіноча стать ${n(female)}, чоловіча стать ${n(male)}"><span style="width:${female / total * 100}%;--series:${colors.cyan}"></span><span style="width:${male / total * 100}%;--series:${colors.violet}"></span></div>${legend([{ label: `Жіноча стать · ${n(female)} · ${pf.format(female / total * 100)}%`, color: colors.cyan }, { label: `Чоловіча стать · ${n(male)} · ${pf.format(male / total * 100)}%`, color: colors.violet }])}`;
  }
  function materialTypes(total) {
    const items = [{ label: 'Листівки', value: total.leaflets, color: colors.cyan }, { label: 'Плакати', value: total.posters, color: colors.violet }, { label: '«Обстріли»', value: total.shelling, color: colors.mint }];
    const max = Math.max(...items.map(item => item.value), 1);
    return `<div class="material-hbars">${items.map(item => `<div><div class="material-hlabel"><span>${item.label}</span><strong>${n(item.value)}</strong></div><div class="material-track"><span style="--series:${item.color};width:${item.value / max * 100}%"></span></div></div>`).join('')}</div><p class="visual-caption">Кожен вид показано окремо. Загальний тираж не обчислюється через можливе перетинання колонок.</p>`;
  }
  function heatmap(rows, selected) {
    const series = [{ key: 'leaflets', label: 'Листівки', color: colors.cyan }, { key: 'posters', label: 'Плакати', color: colors.violet }, { key: 'shelling', label: '«Обстріли»', color: colors.mint }];
    const max = Math.max(...rows.flatMap(r => series.map(s => r[s.key])), 1);
    return `<div class="heatmap-scroll"><div class="material-heatmap"><div></div>${labels.map(m => `<span class="heat-month">${m}</span>`).join('')}${series.map(s => `<span class="heat-row-label">${s.label}</span>${rows.map(r => `<button class="heat-cell ${selected.includes(r.index) ? '' : 'outside-period'}" style="--series:${s.color};--intensity:${r[s.key] / max}" data-month="${r.index}" aria-label="${r.month}, ${s.label}: ${n(r[s.key])}. Вибрати місяць" title="${r.month} · ${s.label}: ${n(r[s.key])}">${r[s.key] ? n(r[s.key]) : '·'}</button>`).join('')}`).join('')}</div></div><div class="visual-caption">Кожна клітинка — один вид матеріалів за місяць. Натисни, щоб вибрати місяць.</div>`;
  }

  function render({ total, allRows, selectedMonths, location, ageLabels }) {
    set('age-gender-chart', ageGender(total, ageLabels));
    set('age-share-chart', ring([{ label: 'Діти та підлітки', value: total.children, color: colors.mint }, { label: 'Дорослі', value: total.adults, color: colors.violet }], 'бенефіціарів'));
    set('audience-monthly-chart', monthly(allRows, [{ label: 'Діти та підлітки', color: colors.mint, value: r => r.children }, { label: 'Дорослі', color: colors.violet, value: r => r.adults }], selectedMonths, { title: 'Діти та дорослі за місяцями' }));
    set('idp-gender-chart', splitBar(total.idp_m, total.idp_f));
    set('disability-gender-chart', splitBar(total.disability_m, total.disability_f));
    set('session-monthly-chart', monthly(allRows, [{ label: 'Офлайн', color: colors.cyan, value: r => r.offline }, { label: 'Онлайн', color: colors.violet, value: r => r.online }], selectedMonths, { title: 'Формати сесій за місяцями', unit: 'сесії' }));
    set('format-share-chart', ring([{ label: 'Офлайн', value: total.offline, color: colors.cyan }, { label: 'Онлайн', value: total.online, color: colors.violet }], 'сесій'));
    set('school-monthly-chart', monthly(allRows, [{ label: 'Шкільні сесії', color: colors.mint, value: r => r.school_sessions }], selectedMonths, { title: 'Шкільні сесії за місяцями', unit: 'сесії' }));
    set('school-share-chart', ring([{ label: 'Школярі', value: total.schoolboys + total.schoolgirls, color: colors.mint }, { label: 'Персонал', value: total.school_staff_m + total.school_staff_f, color: colors.blue }], 'участей'));
    set('briefing-monthly-chart', monthly(allRows, [{ label: 'Брифінги', color: colors.violet, value: r => location === 'Харків' && r.index === 6 ? null : r.briefings }], selectedMonths, { title: 'Брифінги за місяцями', unit: 'брифінги', warning: location === 'Харків' ? '? — за червень не заповнене первинне поле кількості брифінгів.' : location === 'all' ? 'За червень використано вручну внесений показник обласного зведення.' : '' }));
    set('team-share-chart', ring([{ label: 'Працівники', value: total.employees, color: colors.cyan }, { label: 'Волонтери', value: total.volunteers, color: colors.violet }], 'участей'));
    set('team-monthly-chart', monthly(allRows, [{ label: 'Працівники', color: colors.cyan, value: r => r.employees }, { label: 'Волонтери', color: colors.violet, value: r => r.volunteers }], selectedMonths, { title: 'Учасники брифінгів за місяцями', unit: 'участі' }));
    set('material-monthly-chart', monthly(allRows, [{ label: 'Листівки', color: colors.cyan, value: r => r.leaflets }, { label: 'Плакати', color: colors.violet, value: r => r.posters }, { label: '«Обстріли»', color: colors.mint, value: r => r.shelling }], selectedMonths, { grouped: true, title: 'Матеріали за місяцями', unit: 'примірники' }));
    set('material-types-chart', materialTypes(total));
    set('material-heatmap', heatmap(allRows, selectedMonths));
  }
  return { render };
})();
