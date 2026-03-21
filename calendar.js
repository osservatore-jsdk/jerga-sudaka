/* ── CALENDAR.JS — JERGA SUDAKA ──────────────────────────────────────────────
   Calendario de eventos de hip hop
   Vistas: Mes / Semana / Día
   Filtros: tags, barrio, navegación de fecha
   CRUD completo con permisos del sistema auth
   ─────────────────────────────────────────────────────────────────────────── */

// ── Helpers compartidos (también usados por app.js) ───────────────────────────

if (!window.previewPortadaUrl) {
  window.previewPortadaUrl = function(containerId, url) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (url && url.startsWith('http')) {
      el.innerHTML = '<img src="'+url+'" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML=\'\';">';
    } else {
      el.innerHTML = '';
    }
  };
}

// ── Constantes ────────────────────────────────────────────────────────────────

const CAL_TAGS = [
  { id: 'show',      label: 'Show / Concierto',    cls: 'tag-show'      },
  { id: 'freestyle', label: 'Freestyle / Batalla', cls: 'tag-freestyle' },
  { id: 'feria',     label: 'Feria / Mercado',     cls: 'tag-feria'     },
  { id: 'disco',     label: 'Lanzamiento de disco',cls: 'tag-disco'     },
];

const TAG_COLORS = {
  show:       '#DC3137',
  freestyle:  '#31AEDC',
  feria:      '#DCA331',
  disco:      '#3431DC',
};

const DIAS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// ── Estado ────────────────────────────────────────────────────────────────────

let calView     = 'month';     // 'month' | 'week' | 'day'
let calDate     = new Date();  // fecha de referencia actual
let calEvents   = [];          // todos los eventos cargados
let calFilters  = {
  tags:   new Set(['show','freestyle','feria','disco']),
  barrio: '',
};
let calSelEvent = null;        // evento abierto en el panel
let calEditingId = null;       // id del evento que se está editando
let calEvArtists = [];         // artistas del form de evento

// ── Inicialización ────────────────────────────────────────────────────────────

async function initCalendar() {
  injectCalendarHTML();
  await loadCalendarEvents();
  renderCalendar();
  renderMiniCal();
  wireCalendarEvents();
}

// ── DB ────────────────────────────────────────────────────────────────────────

async function loadCalendarEvents() {
  const rows = await turso('SELECT * FROM events ORDER BY date_start ASC');
  if (!rows) return;
  calEvents = rows.map(rowToEvent);
}

function rowToEvent(r) {
  return {
    id:          r.id,
    title:       r.title,
    description: r.description || '',
    venue:       r.venue || '',
    barrio:      r.barrio || '',
    direccion:   r.direccion || '',
    date_start:  r.date_start,
    date_end:    r.date_end || null,
    flyer_url:   r.flyer_url || null,
    ticket_url:  r.ticket_url || null,
    artists:     typeof r.artists === 'string' ? JSON.parse(r.artists || '[]') : r.artists || [],
    tags:        typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : r.tags || [],
    created_by:  r.created_by,
    created_at:  r.created_at,
  };
}

// ── HTML Injection ────────────────────────────────────────────────────────────

function injectCalendarHTML() {
  // 1. Tab CALENDARIO en #tabs
  const tabMap = document.getElementById('tab-map');
  if (tabMap && !document.getElementById('tab-cal')) {
    const tabCal = document.createElement('div');
    tabCal.className = 'tab';
    tabCal.id = 'tab-cal';
    tabCal.textContent = 'CALENDARIO';
    tabCal.onclick = () => switchToCalendar();
    tabMap.parentNode.appendChild(tabCal);
  }

  // 2. Vista principal
  if (!document.getElementById('cal-view')) {
    const calView = document.createElement('div');
    calView.id = 'cal-view';
    calView.innerHTML = `
      <!-- Sidebar -->
      <div id="cal-sidebar">
        <div id="cal-sidebar-hdr">
          <div class="cal-mini-nav">
            <button class="cal-mini-nav-btn" onclick="calMiniNav(-1)">‹</button>
            <div class="cal-mini-title" id="cal-mini-title"></div>
            <button class="cal-mini-nav-btn" onclick="calMiniNav(1)">›</button>
          </div>
          <table class="cal-mini"><thead><tr>${DIAS.map(d=>`<th>${d[0]}</th>`).join('')}</tr></thead><tbody id="cal-mini-body"></tbody></table>
        </div>

        <div class="cal-filter-section">
          <div class="cal-filter-title">Tipo de evento</div>
          <div class="cal-filter-tags">
            ${CAL_TAGS.map(t => `
              <label class="cal-tag-filter">
                <input type="checkbox" checked value="${t.id}" onchange="calFilterChange()" class="cal-tag-cb">
                <span class="cal-tag-dot" style="background:${TAG_COLORS[t.id]}"></span>
                ${t.label}
              </label>`).join('')}
          </div>
        </div>

        <div class="cal-filter-section">
          <div class="cal-filter-title">Barrio / Localidad</div>
          <div id="cal-barrio-wrap">
            <input id="cal-barrio-inp" type="text" placeholder="Filtrar por zona..." autocomplete="off">
            <div id="cal-barrio-list"></div>
          </div>
        </div>

        <button id="cal-add-btn" onclick="openEventModal()">+ AGREGAR EVENTO</button>
      </div>

      <!-- Main -->
      <div id="cal-main">
        <div id="cal-toolbar">
          <div class="cal-view-btns">
            <button class="cal-view-btn active" data-view="month" onclick="switchCalView('month')">Mes</button>
            <button class="cal-view-btn" data-view="week" onclick="switchCalView('week')">Semana</button>
            <button class="cal-view-btn" data-view="day" onclick="switchCalView('day')">Día</button>
          </div>
          <div id="cal-range-label"></div>
          <div class="cal-nav">
            <button class="cal-nav-btn cal-today-btn" onclick="calGoToday()">HOY</button>
            <button class="cal-nav-btn" onclick="calNav(-1)">‹</button>
            <button class="cal-nav-btn" onclick="calNav(1)">›</button>
          </div>
        </div>

        <div id="cal-body">
          <!-- Vista Mes -->
          <div id="cal-month" class="active">
            <div class="cal-month-header">
              ${DIAS.map(d=>`<div>${d}</div>`).join('')}
            </div>
            <div class="cal-month-grid" id="cal-month-grid"></div>
          </div>

          <!-- Vista Semana -->
          <div id="cal-week">
            <div class="cal-week-header" id="cal-week-header"></div>
            <div class="cal-week-scroll" id="cal-week-scroll">
              <div class="cal-week-body" id="cal-week-body"></div>
            </div>
          </div>

          <!-- Vista Día -->
          <div id="cal-day">
            <div class="cal-day-header">
              <div class="cal-day-title" id="cal-day-title"></div>
              <div class="cal-day-subtitle" id="cal-day-subtitle"></div>
            </div>
            <div class="cal-allday-bar" id="cal-allday-bar"></div>
            <div class="cal-day-scroll" id="cal-day-scroll">
              <div class="cal-day-time-col" id="cal-day-time-col"></div>
              <div class="cal-day-events-col" id="cal-day-events-col"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertBefore(calView, document.getElementById('ap'));
  }

  // 3. Panel de detalle de evento
  if (!document.getElementById('cal-event-panel')) {
    const panel = document.createElement('div');
    panel.id = 'cal-event-panel';
    panel.innerHTML = `
      <div id="cal-ep-content"></div>
      <div class="cal-ep-actions">
        <button class="cal-ep-edit-btn" id="cal-ep-edit-btn" style="display:none" onclick="openEventModal(calSelEvent)">✎ EDITAR</button>
        <button class="cal-ep-edit-btn" id="cal-ep-del-btn" style="display:none" onclick="deleteEventConfirm()">🗑 ELIMINAR</button>
        <button class="cal-ep-close-btn" onclick="closeEventPanel()">✕ CERRAR</button>
      </div>
    `;
    document.body.appendChild(panel);
  }

  // 4. Modal de evento
  if (!document.getElementById('ev-mov')) {
    const mov = document.createElement('div');
    mov.id = 'ev-mov';
    mov.onclick = e => { if (e.target === mov) closeEventModal(); };
    mov.innerHTML = `
      <div id="ev-modal">
        <div id="ev-hdr">
          <div id="ev-title">AGREGAR EVENTO</div>
          <button id="ev-cls" onclick="closeEventModal()">✕</button>
        </div>
        <div id="ev-body">
          <div class="frow"><label class="flbl">Título *</label><input class="finp" id="ev-titulo" type="text" placeholder="Nombre del evento"></div>
          <div class="frow2">
            <div class="frow"><label class="flbl">Fecha *</label><input class="finp" id="ev-fecha" type="date"></div>
            <div class="frow"><label class="flbl">Hora</label><input class="finp" id="ev-hora" type="time" placeholder="21:00"></div>
          </div>
          <div class="frow2">
            <div class="frow2">
            <div class="frow"><label class="flbl">Hora de fin</label><input class="finp" id="ev-hora-fin" type="time" placeholder="00:00"></div>
            <div class="frow"><label class="flbl">Venue / Lugar</label><input class="finp" id="ev-venue" type="text" placeholder="Nombre del lugar"></div>
          </div>
          <div class="frow"><label class="flbl">Barrio / Localidad *</label>
            <div class="cbw"><input class="cbinp" id="ev-barrio" type="text" placeholder="Escribí para buscar..." autocomplete="off"><div class="cbl" id="ev-barrio-l"></div></div>
            <input type="hidden" id="ev-barrio-v">
          </div>
          <div class="frow"><label class="flbl" style="display:flex;align-items:center;justify-content:space-between">
            <span>Dirección exacta</span>
            <a id="ev-maps-btn" href="#" target="_blank" rel="noopener" onclick="return updateMapsLink()" style="display:none;font-size:9px;letter-spacing:1px;color:var(--red);text-decoration:none;border:1px solid var(--red);padding:2px 8px;transition:background .15s" onmouseover="this.style.background='rgba(220,49,55,.1)'" onmouseout="this.style.background=''">↗ MAPS</a>
          </label>
          <input class="finp" id="ev-direccion" type="text" placeholder="Ej: Av. Corrientes 1234, CABA" oninput="refreshMapsLink()"></div>
          <div class="frow"><label class="flbl">Tags <span style="font-size:9px;color:#999">(seleccioná todos los que apliquen)</span></label>
            <div class="ev-tags-wrap" id="ev-tags-wrap">
              ${CAL_TAGS.map(t => `<div class="ev-tag-opt" data-tag="${t.id}" onclick="toggleEvTag(this)">${t.label}</div>`).join('')}
              <div class="ev-tag-opt ev-tag-opt-add" onclick="addCustomTag()">+ Otro</div>
            </div>
          </div>
          <div class="frow"><label class="flbl">Artistas del lineup <span style="font-size:9px;color:#999">(opcional)</span></label>
            <div class="cbw">
              <input class="cbinp" id="ev-artist-inp" type="text" placeholder="Buscá artistas del mapa..." autocomplete="off">
              <div class="cbl" id="ev-artist-l"></div>
            </div>
            <div class="ev-artists-tags" id="ev-artist-tags"></div>
          </div>
          <div class="frow"><label class="flbl">Descripción</label><textarea class="finp" id="ev-desc" rows="2" placeholder="Descripción del evento..." style="resize:vertical"></textarea></div>
          <div class="frow"><label class="flbl" style="display:flex;align-items:center;gap:5px">Flyer
            <span class="info-tip" data-tip="Pegá la URL de la imagen del flyer. Podés usar Instagram, Google Imágenes o cualquier link directo a una imagen.">ⓘ</span>
          </label>
          <div style="display:flex;gap:10px;align-items:flex-start">
            <div id="ev-flyer-preview" style="width:52px;height:52px;background:var(--pb);flex-shrink:0;overflow:hidden;border:1px solid var(--pb)"></div>
            <input class="finp" id="ev-flyer" type="url" placeholder="https://..." oninput="previewPortadaUrl('ev-flyer-preview', this.value)" style="flex:1">
          </div></div>
          <div class="frow"><label class="flbl">Link de entradas / RSVP</label><input class="finp" id="ev-ticket" type="url" placeholder="https://..."></div>
        </div>
        <div id="ev-ft">
          <button class="mcan" onclick="closeEventModal()">CANCELAR</button>
          <button class="mdel" id="ev-del-btn" style="display:none" onclick="deleteEventConfirm()">🗑 ELIMINAR</button>
          <button class="madd" id="ev-submit" onclick="submitEvent()">GUARDAR</button>
        </div>
      </div>
    `;
    document.body.appendChild(mov);
  }
}

// ── Wiring ────────────────────────────────────────────────────────────────────

function wireCalendarEvents() {
  // Barrio filter en sidebar
  const bInp = document.getElementById('cal-barrio-inp');
  const bList = document.getElementById('cal-barrio-list');
  if (bInp) {
    bInp.addEventListener('input', () => {
      const q = bInp.value.trim().toLowerCase();
      if (!q) { bList.classList.remove('on'); calFilters.barrio = ''; renderCalendar(); return; }
      const opts = (window.ALL_LOC_DATA || []).filter(o => o.nombre.toLowerCase().includes(q)).slice(0, 8);
      bList.innerHTML = opts.map(o =>
        `<div class="cbo" onclick="setCalBarrio('${escapeAttr(o.key||o.nombre)}','${escapeAttr(o.nombre)}')">${o.nombre}<span style="font-size:9px;color:var(--tm);margin-left:6px">${o.hint}</span></div>`
      ).join('') + `<div class="cbo" onclick="setCalBarrio('','')">✕ Sin filtro</div>`;
      bList.classList.add('on');
    });
    bInp.addEventListener('blur', () => setTimeout(() => bList.classList.remove('on'), 150));
  }

  // Artistas en form de evento
  const aInp = document.getElementById('ev-artist-inp');
  const aList = document.getElementById('ev-artist-l');
  if (aInp) {
    aInp.addEventListener('input', () => {
      const q = aInp.value.trim().toLowerCase();
      if (!q) { aList.classList.remove('on'); return; }
      const artists = (window.ARTISTS_REF || []).filter(a => a.nombre.toLowerCase().includes(q) && !calEvArtists.some(x => x.id === a.id)).slice(0, 8);
      if (!artists.length) { aList.classList.remove('on'); return; }
      aList.innerHTML = artists.map(a =>
        `<div class="cbo" onmousedown="addEvArtist('${a.id}','${escapeAttr(a.nombre)}')">${a.nombre} <span style="font-size:9px;color:var(--tm)">· ${a.barrio||''}</span></div>`
      ).join('');
      aList.classList.add('on');
    });
    aInp.addEventListener('blur', () => setTimeout(() => aList.classList.remove('on'), 150));
  }

  // Barrio en form de evento (reutiliza el mismo patrón)
  wireEvBarrioCombo();

  // Actualizar addBtn según auth
  updateCalAddBtn();
}

function escapeAttr(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function updateCalAddBtn() {
  const btn = document.getElementById('cal-add-btn');
  if (!btn) return;
  const role = window.AUTH?.user?.role;
  const canAdd = !!role && role !== 'pending_manager';
  btn.disabled = !canAdd;
  btn.title = canAdd ? '' : 'Necesitás estar logueado para agregar eventos';
}

function wireEvBarrioCombo() {
  const inp = document.getElementById('ev-barrio');
  const lst = document.getElementById('ev-barrio-l');
  if (!inp) return;
  inp.addEventListener('input', () => {
    const q = inp.value.trim().toLowerCase();
    if (!q) { lst.classList.remove('on'); return; }
    const opts = (window.ALL_LOC_DATA || []).filter(o => o.nombre.toLowerCase().includes(q)).slice(0, 8);
    lst.innerHTML = opts.map(o =>
      `<div class="cbo" onmousedown="selectEvBarrio('${escapeAttr(o.key||o.nombre)}','${escapeAttr(o.nombre)}')">${o.nombre}<span style="font-size:9px;color:var(--tm);margin-left:6px">${o.hint}</span></div>`
    ).join('');
    lst.classList.add('on');
  });
  inp.addEventListener('blur', () => setTimeout(() => lst.classList.remove('on'), 150));
}

function selectEvBarrio(key, nombre) {
  document.getElementById('ev-barrio').value = nombre;
  document.getElementById('ev-barrio-v').value = key;
  document.getElementById('ev-barrio-l').classList.remove('on');
}
window.selectEvBarrio = selectEvBarrio;

// ── Navegación ────────────────────────────────────────────────────────────────

function switchToCalendar() {
  document.getElementById('tab-map').classList.remove('active');
  document.getElementById('tab-cal').classList.add('active');
  document.getElementById('map-view').style.display = 'none';
  document.getElementById('cal-view').classList.add('active');
  const flt = document.getElementById('flt');
  if (flt) flt.style.display = 'none';
  const fltcx = document.getElementById('flt-cx');
  if (fltcx) fltcx.style.display = 'none';
  updateCalAddBtn();
  renderCalendar();
}
window.switchToCalendar = switchToCalendar;

function switchToMap() {
  const tabCal = document.getElementById('tab-cal');
  const tabMap = document.getElementById('tab-map');
  if (tabCal) tabCal.classList.remove('active');
  if (tabMap) tabMap.classList.add('active');
  document.getElementById('map-view').style.display = 'block';
  document.getElementById('cal-view').classList.remove('active');
  const flt = document.getElementById('flt');
  if (flt) flt.style.display = '';
  const fltcx = document.getElementById('flt-cx');
  if (fltcx) fltcx.style.display = '';
  closeEventPanel();
}

// Hookear tab-map
document.addEventListener('DOMContentLoaded', () => {
  const tabMap = document.getElementById('tab-map');
  if (tabMap) {
    const orig = tabMap.onclick;
    tabMap.onclick = () => { switchToMap(); if (orig) orig(); };
  }
});

function switchCalView(v) {
  calView = v;
  document.querySelectorAll('.cal-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  document.getElementById('cal-month').classList.toggle('active', v === 'month');
  document.getElementById('cal-week').classList.toggle('active', v === 'week');
  document.getElementById('cal-day').classList.toggle('active', v === 'day');
  renderCalendar();
}
window.switchCalView = switchCalView;

function calNav(dir) {
  if (calView === 'month') {
    calDate = new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1);
  } else if (calView === 'week') {
    calDate = new Date(calDate.getTime() + dir * 7 * 86400000);
  } else {
    calDate = new Date(calDate.getTime() + dir * 86400000);
  }
  renderCalendar();
  renderMiniCal();
}
window.calNav = calNav;

function calMiniNav(dir) {
  calDate = new Date(calDate.getFullYear(), calDate.getMonth() + dir, 1);
  renderCalendar();
  renderMiniCal();
}
window.calMiniNav = calMiniNav;

function calGoToday() {
  calDate = new Date();
  renderCalendar();
  renderMiniCal();
}
window.calGoToday = calGoToday;

// ── Filtros ────────────────────────────────────────────────────────────────────

function calFilterChange() {
  const checked = Array.from(document.querySelectorAll('.cal-tag-cb:checked')).map(cb => cb.value);
  calFilters.tags = new Set(checked);
  renderCalendar();
}
window.calFilterChange = calFilterChange;

function setCalBarrio(key, label) {
  calFilters.barrio = key;
  const inp = document.getElementById('cal-barrio-inp');
  if (inp) inp.value = label;
  document.getElementById('cal-barrio-list').classList.remove('on');
  renderCalendar();
}
window.setCalBarrio = setCalBarrio;

function getFilteredEvents() {
  return calEvents.filter(ev => {
    // Filtro tags: si el evento tiene tags, al menos uno debe estar en el filtro
    if (calFilters.tags.size > 0 && ev.tags.length > 0) {
      if (!ev.tags.some(t => calFilters.tags.has(t))) return false;
    }
    // Filtro barrio
    if (calFilters.barrio && ev.barrio !== calFilters.barrio) return false;
    return true;
  });
}

// ── Render principal ──────────────────────────────────────────────────────────

function renderCalendar() {
  updateRangeLabel();
  if (calView === 'month') renderMonthView();
  else if (calView === 'week') renderWeekView();
  else renderDayView();
}

function updateRangeLabel() {
  const el = document.getElementById('cal-range-label');
  if (!el) return;
  if (calView === 'month') {
    el.textContent = `${MESES[calDate.getMonth()].toUpperCase()} ${calDate.getFullYear()}`;
  } else if (calView === 'week') {
    const start = getWeekStart(calDate);
    const end = new Date(start.getTime() + 6 * 86400000);
    el.textContent = `${start.getDate()} ${MESES[start.getMonth()].slice(0,3).toUpperCase()} — ${end.getDate()} ${MESES[end.getMonth()].slice(0,3).toUpperCase()} ${end.getFullYear()}`;
  } else {
    el.textContent = `${calDate.getDate()} ${MESES[calDate.getMonth()].toUpperCase()} ${calDate.getFullYear()}`;
  }
}

// ── VISTA MES ─────────────────────────────────────────────────────────────────

function renderMonthView() {
  const grid = document.getElementById('cal-month-grid');
  if (!grid) return;
  const today = new Date();
  const year = calDate.getFullYear(), month = calDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const filtered = getFilteredEvents();

  // Agrupar eventos por fecha
  const byDate = {};
  filtered.forEach(ev => {
    const d = ev.date_start.slice(0, 10);
    (byDate[d] = byDate[d] || []).push(ev);
  });

  grid.innerHTML = '';
  let cells = [];
  // Días del mes anterior
  for (let i = firstDay - 1; i >= 0; i--) {
    cells.push({ day: daysInPrev - i, current: false, date: new Date(year, month - 1, daysInPrev - i) });
  }
  // Días del mes actual
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, current: true, date: new Date(year, month, d) });
  }
  // Completar con días del mes siguiente
  while (cells.length < 42) {
    cells.push({ day: cells.length - firstDay - daysInMonth + 1, current: false, date: new Date(year, month + 1, cells.length - firstDay - daysInMonth + 1) });
  }

  cells.forEach(cell => {
    const div = document.createElement('div');
    div.className = 'cal-day-cell' + (!cell.current ? ' other-month' : '');
    const dateStr = fmtDate(cell.date);
    const isToday = dateStr === fmtDate(today);
    const isSelected = dateStr === fmtDate(calDate) && cell.current;
    if (isToday) div.classList.add('today');
    if (isSelected) div.classList.add('selected');

    const numDiv = document.createElement('div');
    numDiv.className = 'cal-day-num';
    numDiv.textContent = cell.day;
    div.appendChild(numDiv);

    const dayEvs = byDate[dateStr] || [];
    const maxShow = 3;
    dayEvs.slice(0, maxShow).forEach(ev => {
      const chip = document.createElement('div');
      chip.className = 'cal-event-chip';
      chip.style.background = getEventColor(ev);
      chip.textContent = ev.title;
      chip.onclick = e => { e.stopPropagation(); openEventPanel(ev); };
      div.appendChild(chip);
    });
    if (dayEvs.length > maxShow) {
      const more = document.createElement('div');
      more.className = 'cal-more-chip';
      more.textContent = `+${dayEvs.length - maxShow} más`;
      more.onclick = e => { e.stopPropagation(); calDate = cell.date; switchCalView('day'); };
      div.appendChild(more);
    }

    div.addEventListener('click', () => {
      if (cell.current) {
        calDate = cell.date;
        document.querySelectorAll('.cal-day-cell.selected').forEach(c => c.classList.remove('selected'));
        div.classList.add('selected');
        renderMiniCal();
      }
    });
    div.addEventListener('dblclick', () => {
      if (cell.current) { calDate = cell.date; switchCalView('day'); }
    });
    grid.appendChild(div);
  });
}

// ── VISTA SEMANA ──────────────────────────────────────────────────────────────

function renderWeekView() {
  const headerEl = document.getElementById('cal-week-header');
  const bodyEl = document.getElementById('cal-week-body');
  if (!headerEl || !bodyEl) return;

  const today = new Date();
  const weekStart = getWeekStart(calDate);
  const filtered = getFilteredEvents();

  // Header
  headerEl.innerHTML = '<div class="cal-week-header-gutter"></div>';
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 86400000);
    const isToday = fmtDate(d) === fmtDate(today);
    const div = document.createElement('div');
    div.className = 'cal-week-header-day' + (isToday ? ' today' : '');
    div.innerHTML = `<div class="cal-week-day-name">${DIAS[d.getDay()]}</div><div class="cal-week-day-num">${d.getDate()}</div>`;
    div.onclick = () => { calDate = d; switchCalView('day'); };
    headerEl.appendChild(div);
  }

  // Body
  bodyEl.innerHTML = '';
  // Columna de horas
  const timeCol = document.createElement('div');
  timeCol.className = 'cal-week-time-col';
  for (let h = 0; h < 24; h++) {
    const slot = document.createElement('div');
    slot.className = 'cal-hour-label';
    slot.textContent = h === 0 ? '' : `${String(h).padStart(2,'0')}:00`;
    timeCol.appendChild(slot);
  }
  bodyEl.appendChild(timeCol);

  // Columnas de días
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart.getTime() + i * 86400000);
    const dateStr = fmtDate(d);
    const isToday = dateStr === fmtDate(today);
    const col = document.createElement('div');
    col.className = 'cal-week-day-col' + (isToday ? ' today' : '');

    // Slots de hora (fondo)
    for (let h = 0; h < 24; h++) {
      const slot = document.createElement('div');
      slot.className = 'cal-hour-slot';
      col.appendChild(slot);
    }

    // Eventos del día
    const dayEvs = filtered.filter(ev => ev.date_start.slice(0, 10) === dateStr);
    dayEvs.forEach(ev => {
      const evDiv = placeWeekEvent(ev, col);
      if (evDiv) col.appendChild(evDiv);
    });

    // Línea de hora actual
    if (isToday) {
      const now = new Date();
      const pct = (now.getHours() * 60 + now.getMinutes()) / (24 * 60);
      const line = document.createElement('div');
      line.className = 'cal-now-line';
      line.style.top = (pct * 1200) + 'px';
      col.appendChild(line);
    }

    bodyEl.appendChild(col);
  }

  // Scroll a hora actual o 8am
  setTimeout(() => {
    const scroll = document.getElementById('cal-week-scroll');
    if (scroll) scroll.scrollTop = 8 * 50;
  }, 50);
}

function placeWeekEvent(ev, col) {
  const time = ev.date_start.slice(11, 16);
  if (!time) return null;
  const [h, m] = time.split(':').map(Number);
  if (isNaN(h)) return null;

  let endH = h + 1, endM = m;
  if (ev.date_end) {
    const et = ev.date_end.slice(11, 16);
    if (et) { [endH, endM] = et.split(':').map(Number); }
  }

  const topPx = (h * 60 + m) / (24 * 60) * 1200;
  const heightPx = Math.max(20, ((endH * 60 + endM) - (h * 60 + m)) / (24 * 60) * 1200);

  const div = document.createElement('div');
  div.className = 'cal-week-event';
  div.style.cssText = `top:${topPx}px;height:${heightPx}px;background:${getEventColor(ev)}`;
  div.innerHTML = `<div class="cal-week-event-title">${ev.title}</div><div class="cal-week-event-time">${time}</div>`;
  div.onclick = e => { e.stopPropagation(); openEventPanel(ev); };
  return div;
}

// ── VISTA DÍA ─────────────────────────────────────────────────────────────────

function renderDayView() {
  const dateStr = fmtDate(calDate);
  const today = fmtDate(new Date());
  const filtered = getFilteredEvents().filter(ev => ev.date_start.slice(0, 10) === dateStr);

  // Header
  const titleEl = document.getElementById('cal-day-title');
  const subEl = document.getElementById('cal-day-subtitle');
  if (titleEl) titleEl.textContent = `${calDate.getDate()} de ${MESES[calDate.getMonth()]}`;
  if (subEl) subEl.textContent = `${DIAS[calDate.getDay()].toUpperCase()} ${calDate.getFullYear()}${dateStr === today ? ' · HOY' : ''}`;

  // All-day events (sin hora)
  const allDayBar = document.getElementById('cal-allday-bar');
  if (allDayBar) {
    const allDay = filtered.filter(ev => !ev.date_start.slice(11, 16));
    allDayBar.innerHTML = allDay.map(ev =>
      `<div class="cal-event-chip" style="background:${getEventColor(ev)};cursor:pointer" onclick="openEventPanel(calEvents.find(e=>e.id==${ev.id}))">${ev.title}</div>`
    ).join('') || '';
    allDayBar.style.display = allDay.length ? '' : 'none';
  }

  // Time grid
  const timeCol = document.getElementById('cal-day-time-col');
  const evCol = document.getElementById('cal-day-events-col');
  if (!timeCol || !evCol) return;

  timeCol.innerHTML = '';
  evCol.innerHTML = '';

  for (let h = 0; h < 24; h++) {
    const slot = document.createElement('div');
    slot.className = 'cal-hour-label';
    slot.textContent = h === 0 ? '' : `${String(h).padStart(2,'0')}:00`;
    timeCol.appendChild(slot);

    const evSlot = document.createElement('div');
    evSlot.className = 'cal-day-hour-slot';
    evCol.appendChild(evSlot);
  }

  // Eventos con hora
  const timed = filtered.filter(ev => ev.date_start.slice(11, 16));
  timed.forEach(ev => {
    const time = ev.date_start.slice(11, 16);
    const [h, m] = time.split(':').map(Number);
    let endH = h + 1, endM = m;
    if (ev.date_end) {
      const et = ev.date_end.slice(11, 16);
      if (et) { [endH, endM] = et.split(':').map(Number); }
    }
    const topPx = (h * 60 + m) * (60 / 60);
    const heightPx = Math.max(40, ((endH * 60 + endM) - (h * 60 + m)));
    const div = document.createElement('div');
    div.className = 'cal-day-event';
    div.style.cssText = `top:${topPx}px;height:${heightPx}px;background:${getEventColor(ev)}`;
    div.innerHTML = `
      <div class="cal-day-event-title">${ev.title}</div>
      <div class="cal-day-event-meta">${time}${ev.venue ? ' · ' + ev.venue : ''}</div>`;
    div.onclick = () => openEventPanel(ev);
    evCol.appendChild(div);
  });

  // Línea de hora actual
  if (dateStr === today) {
    const now = new Date();
    const topPx = now.getHours() * 60 + now.getMinutes();
    const line = document.createElement('div');
    line.className = 'cal-now-line';
    line.style.top = topPx + 'px';
    evCol.appendChild(line);
    setTimeout(() => { const s = document.getElementById('cal-day-scroll'); if (s) s.scrollTop = Math.max(0, topPx - 120); }, 50);
  }

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--tm);letter-spacing:1px;pointer-events:none;flex-direction:column;gap:8px';
    empty.innerHTML = '<div style="font-size:28px">🎤</div>Sin eventos este día';
    evCol.appendChild(empty);
  }
}

// ── Mini calendario (sidebar) ─────────────────────────────────────────────────

function renderMiniCal() {
  const tbody = document.getElementById('cal-mini-body');
  const title = document.getElementById('cal-mini-title');
  if (!tbody || !title) return;

  const today = new Date();
  const year = calDate.getFullYear(), month = calDate.getMonth();
  title.textContent = `${MESES[month].slice(0,3).toUpperCase()} ${year}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrev = new Date(year, month, 0).getDate();
  const filtered = getFilteredEvents();
  const eventDates = new Set(filtered.map(ev => ev.date_start.slice(0, 10)));

  tbody.innerHTML = '';
  let cells = [];
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ d: daysInPrev - i, curr: false, dt: new Date(year, month - 1, daysInPrev - i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, curr: true, dt: new Date(year, month, d) });
  while (cells.length % 7 !== 0) cells.push({ d: cells.length - firstDay - daysInMonth + 1, curr: false, dt: new Date(year, month + 1, cells.length - firstDay - daysInMonth + 1) });

  for (let w = 0; w < cells.length / 7; w++) {
    const tr = document.createElement('tr');
    for (let d = 0; d < 7; d++) {
      const cell = cells[w * 7 + d];
      const td = document.createElement('td');
      td.textContent = cell.d;
      const ds = fmtDate(cell.dt);
      if (!cell.curr) td.classList.add('other-month');
      if (ds === fmtDate(today)) td.classList.add('today');
      if (ds === fmtDate(calDate)) td.classList.add('selected');
      if (eventDates.has(ds)) td.classList.add('has-events');
      td.onclick = () => { calDate = cell.dt; renderMiniCal(); renderCalendar(); };
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

// ── Panel de detalle ──────────────────────────────────────────────────────────

function openEventPanel(ev) {
  calSelEvent = ev;
  const content = document.getElementById('cal-ep-content');
  if (!content) return;

  const tagsHtml = (ev.tags || []).map(t => {
    const tag = CAL_TAGS.find(x => x.id === t) || { label: t, cls: 'tag-other' };
    return `<span class="cal-ep-tag ${tag.cls}">${tag.label}</span>`;
  }).join('');

  const dateObj = new Date(ev.date_start);
  const dateStr = `${DIAS[dateObj.getDay()]} ${dateObj.getDate()} de ${MESES[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const timeStr = ev.date_start.slice(11, 16) || '';
  const timeEndStr = ev.date_end ? ev.date_end.slice(11, 16) : '';

  const artistsHtml = (ev.artists || []).map(name => {
    const a = (window.ARTISTS_REF || []).find(x => x.nombre === name);
    return `<div class="cal-ep-artist-row" onclick="${a ? `calGoToArtist('${a.id}')` : ''}">
      <div class="cal-ep-artist-av" style="${a ? 'border:1.5px solid '+(TC||{})[a.tipo]||'var(--pb)':''}">${a?.avatarSrc ? `<img src="${a.avatarSrc}" alt="">` : (name[0]||'?').toUpperCase()}</div>
      <div><div class="cal-ep-artist-name">${name}</div>${a ? `<div class="cal-ep-artist-sub">${a.barrio||''}</div>` : ''}</div>
    </div>`;
  }).join('');

  content.innerHTML = `
    ${ev.flyer_url
      ? `<img class="cal-ep-flyer" src="${ev.flyer_url}" alt="" onerror="this.style.display='none'">`
      : `<div class="cal-ep-flyer-placeholder">🎤</div>`}
    <div class="cal-ep-body">
      ${tagsHtml ? `<div class="cal-ep-tags">${tagsHtml}</div>` : ''}
      <div class="cal-ep-title">${ev.title}</div>
      <div class="cal-ep-datetime">
        <span>📅 ${dateStr}</span>
        ${timeStr ? `<span>🕐 ${timeStr}${timeEndStr ? ' — ' + timeEndStr : ''}</span>` : ''}
      </div>
      ${ev.venue || ev.barrio || ev.direccion ? `<div class="cal-ep-venue">📍 ${[ev.venue, ev.barrio].filter(Boolean).join(' · ')}${ev.direccion ? `<div style="font-size:10px;color:var(--tm);margin-top:3px;display:flex;align-items:center;gap:8px"><span>${ev.direccion}</span><a href="https://www.google.com/maps/search/${encodeURIComponent(ev.direccion)}" target="_blank" rel="noopener" style="font-size:8px;letter-spacing:1px;color:var(--red);text-decoration:none;border:1px solid var(--red);padding:2px 7px;white-space:nowrap;flex-shrink:0" onmouseover="this.style.background='rgba(220,49,55,.1)'" onmouseout="this.style.background=''">↗ MAPS</a></div>` : ''}</div>` : ''}
      ${ev.description ? `<div class="cal-ep-desc">${ev.description}</div>` : ''}
      ${artistsHtml ? `<div><div class="plbl" style="margin-bottom:6px">Lineup</div><div class="cal-ep-artists">${artistsHtml}</div></div>` : ''}
      ${ev.ticket_url ? `<a class="cal-ep-ticket" href="${ev.ticket_url}" target="_blank" rel="noopener">🎟 VER ENTRADAS</a>` : ''}
    </div>
  `;

  // Botones de editar/eliminar según permisos
  const editBtn = document.getElementById('cal-ep-edit-btn');
  const delBtn = document.getElementById('cal-ep-del-btn');
  const canEdit = window.authCan?.editEvent(ev.created_by);
  if (editBtn) editBtn.style.display = canEdit ? '' : 'none';
  if (delBtn) delBtn.style.display = canEdit ? '' : 'none';

  document.getElementById('cal-event-panel').classList.add('open');
}
window.openEventPanel = openEventPanel;

function closeEventPanel() {
  document.getElementById('cal-event-panel')?.classList.remove('open');
  calSelEvent = null;
}
window.closeEventPanel = closeEventPanel;

function calGoToArtist(id) {
  closeEventPanel();
  switchToMap();
  setTimeout(() => {
    if (window.selectArtist) window.selectArtist(id);
  }, 300);
}
window.calGoToArtist = calGoToArtist;

// ── Modal de evento ────────────────────────────────────────────────────────────

function openEventModal(ev = null) {
  if (!window.AUTH?.user) { window.openAuthModal?.('login'); return; }
  // Cualquier usuario logueado puede agregar eventos
  const role = window.AUTH.user.role;
  if (!role || role === 'pending_manager') {
    alert('Necesitás tener una cuenta activa para agregar eventos.'); return;
  }

  calEditingId = ev ? ev.id : null;
  calEvArtists = [];

  document.getElementById('ev-title').textContent = ev ? 'EDITAR EVENTO' : 'AGREGAR EVENTO';
  document.getElementById('ev-del-btn').style.display = (ev && window.authCan?.deleteEvent(ev.created_by)) ? '' : 'none';

  // Resetear / llenar
  document.getElementById('ev-titulo').value = ev?.title || '';
  document.getElementById('ev-fecha').value = ev?.date_start?.slice(0,10) || fmtDate(calDate);
  document.getElementById('ev-hora').value = ev?.date_start?.slice(11,16) || '';
  document.getElementById('ev-hora-fin').value = ev?.date_end?.slice(11,16) || '';
  document.getElementById('ev-venue').value = ev?.venue || '';
  document.getElementById('ev-barrio').value = ev?.barrio || '';
  document.getElementById('ev-barrio-v').value = ev?.barrio || '';
  document.getElementById('ev-direccion').value = ev?.direccion || '';
  refreshMapsLink();
  document.getElementById('ev-desc').value = ev?.description || '';
  document.getElementById('ev-flyer').value = ev?.flyer_url || '';
  document.getElementById('ev-ticket').value = ev?.ticket_url || '';
  previewPortadaUrl('ev-flyer-preview', ev?.flyer_url || '');

  // Tags
  document.querySelectorAll('.ev-tag-opt[data-tag]').forEach(opt => {
    const sel = ev?.tags?.includes(opt.dataset.tag);
    opt.classList.toggle('selected', !!sel);
    const tag = CAL_TAGS.find(t => t.id === opt.dataset.tag);
    if (sel && tag) opt.style.background = TAG_COLORS[opt.dataset.tag];
    else opt.style.background = '';
  });

  // Artistas
  calEvArtists = (ev?.artists || []).map(name => {
    const a = (window.ARTISTS_REF || []).find(x => x.nombre === name);
    return { id: a?.id || name, nombre: name };
  });
  renderEvArtistTags();

  document.getElementById('ev-mov').classList.add('open');
  wireEvBarrioCombo();
}
window.openEventModal = openEventModal;

function closeEventModal() {
  document.getElementById('ev-mov').classList.remove('open');
  calEditingId = null;
  calEvArtists = [];
}
window.closeEventModal = closeEventModal;

function toggleEvTag(el) {
  const tag = el.dataset.tag;
  const isNow = el.classList.toggle('selected');
  el.style.background = isNow ? (TAG_COLORS[tag] || '#888') : '';
  if (isNow) el.style.color = '#fff';
  else el.style.color = '';
}
window.toggleEvTag = toggleEvTag;

function addCustomTag() {
  const val = prompt('Nuevo tag:');
  if (!val || !val.trim()) return;
  const tag = val.trim().toLowerCase().replace(/\s+/g, '_');
  const label = val.trim();
  const wrap = document.getElementById('ev-tags-wrap');
  const addBtn = wrap.querySelector('.ev-tag-opt-add');
  const div = document.createElement('div');
  div.className = 'ev-tag-opt selected';
  div.dataset.tag = tag;
  div.style.background = '#888';
  div.style.color = '#fff';
  div.textContent = label;
  div.onclick = () => toggleEvTag(div);
  wrap.insertBefore(div, addBtn);
}
window.addCustomTag = addCustomTag;

function addEvArtist(id, nombre) {
  if (calEvArtists.some(a => a.id === id)) return;
  calEvArtists.push({ id, nombre });
  renderEvArtistTags();
  document.getElementById('ev-artist-inp').value = '';
  document.getElementById('ev-artist-l').classList.remove('on');
}
window.addEvArtist = addEvArtist;

function removeEvArtist(id) {
  calEvArtists = calEvArtists.filter(a => a.id !== id);
  renderEvArtistTags();
}
window.removeEvArtist = removeEvArtist;

function renderEvArtistTags() {
  const wrap = document.getElementById('ev-artist-tags');
  if (!wrap) return;
  wrap.innerHTML = calEvArtists.map(a =>
    `<span class="ctag">${a.nombre}<span class="ctag-x" onclick="removeEvArtist('${a.id}')">×</span></span>`
  ).join('');
}

async function submitEvent() {
  const title = document.getElementById('ev-titulo').value.trim();
  const fecha = document.getElementById('ev-fecha').value;
  if (!title || !fecha) { alert('El título y la fecha son obligatorios.'); return; }

  const hora = document.getElementById('ev-hora').value;
  const horaFin = document.getElementById('ev-hora-fin').value;
  const date_start = fecha + (hora ? 'T' + hora : '');
  const date_end = fecha + (horaFin ? 'T' + horaFin : '') || null;

  const tags = Array.from(document.querySelectorAll('.ev-tag-opt.selected[data-tag]')).map(el => el.dataset.tag);
  const artists = calEvArtists.map(a => a.nombre);

  const row = {
    title,
    description: document.getElementById('ev-desc').value.trim() || null,
    venue:       document.getElementById('ev-venue').value.trim() || null,
    barrio:      document.getElementById('ev-barrio-v').value || document.getElementById('ev-barrio').value.trim() || null,
    direccion:   document.getElementById('ev-direccion').value.trim() || null,
    date_start,
    date_end:    date_end || null,
    flyer_url:   document.getElementById('ev-flyer').value.trim() || null,
    ticket_url:  document.getElementById('ev-ticket').value.trim() || null,
    artists:     JSON.stringify(artists),
    tags:        JSON.stringify(tags),
    created_by:  window.AUTH.user.id,
  };

  const btn = document.getElementById('ev-submit');
  btn.textContent = 'GUARDANDO...'; btn.disabled = true;

  if (calEditingId) {
    await turso(
      'UPDATE events SET title=?,description=?,venue=?,barrio=?,direccion=?,date_start=?,date_end=?,flyer_url=?,ticket_url=?,artists=?,tags=? WHERE id=?',
      [row.title,row.description,row.venue,row.barrio,row.direccion,row.date_start,row.date_end,row.flyer_url,row.ticket_url,row.artists,row.tags,Number(calEditingId)]
    );
    const idx = calEvents.findIndex(e => e.id === calEditingId);
    if (idx !== -1) calEvents[idx] = { ...calEvents[idx], ...row, tags, artists, id: calEditingId };
  } else {
    const newId = await tursoRun(
      'INSERT INTO events (title,description,venue,barrio,direccion,date_start,date_end,flyer_url,ticket_url,artists,tags,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [row.title,row.description,row.venue,row.barrio,row.direccion,row.date_start,row.date_end,row.flyer_url,row.ticket_url,row.artists,row.tags,row.created_by]
    );
    if (newId != null) {
      calEvents.push({ ...row, id: String(newId), tags, artists });
    }
  }

  btn.textContent = 'GUARDAR'; btn.disabled = false;
  closeEventModal();
  renderCalendar();
  renderMiniCal();
}
window.submitEvent = submitEvent;

async function deleteEventConfirm() {
  if (!calSelEvent && !calEditingId) return;
  const ev = calSelEvent || calEvents.find(e => e.id == calEditingId);
  if (!ev) return;
  if (!confirm(`¿Eliminar "${ev.title}"?`)) return;
  await turso('DELETE FROM events WHERE id=?', [Number(ev.id)]);
  calEvents = calEvents.filter(e => e.id !== ev.id);
  closeEventModal();
  closeEventPanel();
  renderCalendar();
  renderMiniCal();
}
window.deleteEventConfirm = deleteEventConfirm;

// ── Helpers ───────────────────────────────────────────────────────────────────

function getEventColor(ev) {
  if (!ev.tags || !ev.tags.length) return TAG_COLORS.show;
  return TAG_COLORS[ev.tags[0]] || '#888';
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── Maps link helpers ─────────────────────────────────────────────────────────

function refreshMapsLink() {
  const inp = document.getElementById('ev-direccion');
  const btn = document.getElementById('ev-maps-btn');
  if (!inp || !btn) return;
  const val = inp.value.trim();
  if (val) {
    btn.href = `https://www.google.com/maps/search/${encodeURIComponent(val)}`;
    btn.style.display = '';
  } else {
    btn.style.display = 'none';
  }
}

function updateMapsLink() {
  refreshMapsLink();
  return true; // permitir que el link se abra
}
window.refreshMapsLink = refreshMapsLink;
window.updateMapsLink = updateMapsLink;

// ── Exponer globals ────────────────────────────────────────────────────────────

window.initCalendar  = initCalendar;
window.switchToCalendar = switchToCalendar;

// ── Auto-init cuando app.js termina ──────────────────────────────────────────

// Esperar a que ARTISTS esté disponible (lo expone app.js como window.ARTISTS_REF)
// app.js necesita: window.ARTISTS_REF = ARTISTS; al final de init()
// Si no está disponible, polleamos
let _calInitInterval = setInterval(() => {
  if (window.ARTISTS_REF !== undefined && document.getElementById('tabs')) {
    clearInterval(_calInitInterval);
    initCalendar();
  }
}, 200);
