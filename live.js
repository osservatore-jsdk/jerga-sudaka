/* ── LIVE.JS — JERGA SUDAKA ──────────────────────────────────────────────────
   Widget flotante de stream en vivo de YouTube
   Aparece automáticamente los miércoles 17:45–21:10 (hora Argentina)
   Draggable, minimizable, posición persistida en localStorage
   ─────────────────────────────────────────────────────────────────────────── */

const LIVE_CHANNEL_ID = 'UC2UyWEmoqYmhjvCYl91cu1Q';
const LIVE_DAY        = 3;        // miércoles (0=dom ... 6=sáb)
const LIVE_START_H    = 17;
const LIVE_START_M    = 45;
const LIVE_END_H      = 21;
const LIVE_END_M      = 10;
const LIVE_TZ         = 'America/Argentina/Buenos_Aires';
const WIDGET_W        = 320;
const WIDGET_H        = 180;
const WIDGET_HEADER_H = 36;

// ── Estado ────────────────────────────────────────────────────────────────────

let _liveVisible  = false;
let _liveMinimized = false;
let _liveDragging  = false;
let _liveDragOffX  = 0;
let _liveDragOffY  = 0;
let _liveCheckInterval = null;

// ── Utilidades de tiempo ──────────────────────────────────────────────────────

function getNowInArgentina() {
  // Usamos Intl para obtener la hora exacta en Buenos Aires
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: LIVE_TZ,
    hour: 'numeric', minute: 'numeric',
    weekday: 'short', hour12: false
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type)?.value;
  const weekdays = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  const day  = weekdays[get('weekday')] ?? -1;
  const hour = parseInt(get('hour'), 10);
  const min  = parseInt(get('minute'), 10);
  return { day, hour, min };
}

function isLiveNow() {
  const { day, hour, min } = getNowInArgentina();
  if (day !== LIVE_DAY) return false;
  const nowMins   = hour * 60 + min;
  const startMins = LIVE_START_H * 60 + LIVE_START_M;
  const endMins   = LIVE_END_H * 60 + LIVE_END_M;
  return nowMins >= startMins && nowMins < endMins;
}

function minutesUntilLive() {
  const { day, hour, min } = getNowInArgentina();
  const nowMins   = hour * 60 + min;
  const startMins = LIVE_START_H * 60 + LIVE_START_M;
  // Si es miércoles antes del inicio
  if (day === LIVE_DAY && nowMins < startMins) return startMins - nowMins;
  return null;
}

// ── Posición persistida ───────────────────────────────────────────────────────

function loadPos() {
  try {
    const s = localStorage.getItem('live_pos');
    if (s) return JSON.parse(s);
  } catch(e) {}
  // Default: esquina inferior derecha
  return {
    x: window.innerWidth  - WIDGET_W  - 20,
    y: window.innerHeight - WIDGET_H  - 54
  };
}

function savePos(x, y) {
  try { localStorage.setItem('live_pos', JSON.stringify({x, y})); } catch(e) {}
}

function clampPos(x, y) {
  const h = _liveMinimized ? WIDGET_HEADER_H : WIDGET_H + WIDGET_HEADER_H;
  return {
    x: Math.max(0, Math.min(window.innerWidth  - WIDGET_W, x)),
    y: Math.max(0, Math.min(window.innerHeight - h - 34, y))
  };
}

// ── Construcción del widget ───────────────────────────────────────────────────

function buildWidget() {
  if (document.getElementById('live-widget')) return;

  const pos = loadPos();
  const clamped = clampPos(pos.x, pos.y);

  const w = document.createElement('div');
  w.id = 'live-widget';
  w.style.cssText = `
    position:fixed;
    left:${clamped.x}px;
    top:${clamped.y}px;
    width:${WIDGET_W}px;
    z-index:80;
    background:#000;
    border:2px solid var(--red);
    box-shadow:0 4px 24px rgba(0,0,0,.5);
    display:none;
    flex-direction:column;
    user-select:none;
    transition:box-shadow .2s;
  `;

  w.innerHTML = `
    <div id="live-hdr" style="
      height:${WIDGET_HEADER_H}px;
      background:var(--ch);
      border-bottom:1px solid var(--red);
      display:flex;
      align-items:center;
      padding:0 10px;
      gap:8px;
      cursor:grab;
      flex-shrink:0;
    ">
      <div id="live-dot" style="
        width:7px;height:7px;border-radius:50%;
        background:var(--red);
        animation:pulse 1.5s ease-in-out infinite;
        flex-shrink:0;
      "></div>
      <span style="font-family:var(--mono);font-size:9px;letter-spacing:2px;color:var(--t1);flex:1;text-transform:uppercase">EN VIVO</span>
      <button id="live-min-btn" onclick="toggleLiveMin()" style="
        background:none;border:none;cursor:pointer;
        color:var(--tm);font-size:12px;padding:2px 5px;
        line-height:1;transition:color .15s;
      " title="Minimizar">—</button>
      <button id="live-close-btn" onclick="hideLiveWidget()" style="
        background:none;border:none;cursor:pointer;
        color:var(--tm);font-size:14px;padding:2px 5px;
        line-height:1;transition:color .15s;
      " title="Cerrar">✕</button>
    </div>
    <div id="live-body" style="width:${WIDGET_W}px;height:${WIDGET_H}px;flex-shrink:0;position:relative;">
      <iframe
        id="live-iframe"
        src=""
        width="${WIDGET_W}"
        height="${WIDGET_H}"
        frameborder="0"
        allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture"
        allowfullscreen
        style="display:block;border:none;"
      ></iframe>
    </div>
  `;

  document.body.appendChild(w);

  // Hover effects en botones
  ['live-min-btn','live-close-btn'].forEach(id => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('mouseenter', () => btn.style.color = 'var(--red)');
      btn.addEventListener('mouseleave', () => btn.style.color = 'var(--tm)');
    }
  });

  // Drag
  const hdr = document.getElementById('live-hdr');
  hdr.addEventListener('mousedown', onDragStart);
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragEnd);

  // Touch drag
  hdr.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd);
}

// ── Drag ──────────────────────────────────────────────────────────────────────

function onDragStart(e) {
  if (e.target.tagName === 'BUTTON') return;
  _liveDragging = true;
  const w = document.getElementById('live-widget');
  const rect = w.getBoundingClientRect();
  _liveDragOffX = e.clientX - rect.left;
  _liveDragOffY = e.clientY - rect.top;
  document.getElementById('live-hdr').style.cursor = 'grabbing';
  e.preventDefault();
}

function onDragMove(e) {
  if (!_liveDragging) return;
  const w = document.getElementById('live-widget');
  if (!w) return;
  const {x, y} = clampPos(e.clientX - _liveDragOffX, e.clientY - _liveDragOffY);
  w.style.left = x + 'px';
  w.style.top  = y + 'px';
}

function onDragEnd() {
  if (!_liveDragging) return;
  _liveDragging = false;
  const hdr = document.getElementById('live-hdr');
  if (hdr) hdr.style.cursor = 'grab';
  const w = document.getElementById('live-widget');
  if (w) savePos(parseInt(w.style.left), parseInt(w.style.top));
}

function onTouchStart(e) {
  if (e.target.tagName === 'BUTTON') return;
  const t = e.touches[0];
  _liveDragging = true;
  const w = document.getElementById('live-widget');
  const rect = w.getBoundingClientRect();
  _liveDragOffX = t.clientX - rect.left;
  _liveDragOffY = t.clientY - rect.top;
}

function onTouchMove(e) {
  if (!_liveDragging) return;
  e.preventDefault();
  const t = e.touches[0];
  const w = document.getElementById('live-widget');
  if (!w) return;
  const {x, y} = clampPos(t.clientX - _liveDragOffX, t.clientY - _liveDragOffY);
  w.style.left = x + 'px';
  w.style.top  = y + 'px';
}

function onTouchEnd() {
  if (!_liveDragging) return;
  _liveDragging = false;
  const w = document.getElementById('live-widget');
  if (w) savePos(parseInt(w.style.left), parseInt(w.style.top));
}

// ── Control del widget ────────────────────────────────────────────────────────

function showLiveWidget() {
  buildWidget();
  const w = document.getElementById('live-widget');
  if (!w) return;

  // Cargar iframe solo cuando se muestra (evita cargar en background)
  const iframe = document.getElementById('live-iframe');
  if (iframe && !iframe.src.includes('youtube')) {
    iframe.src = `https://www.youtube.com/embed/live_stream?channel=${LIVE_CHANNEL_ID}&autoplay=1&modestbranding=1&rel=0`;
  }

  w.style.display = 'flex';
  _liveVisible = true;
  updateSbButton();

  // Animación de entrada
  w.style.opacity = '0';
  w.style.transform = 'scale(0.92)';
  w.style.transition = 'opacity .2s, transform .2s';
  requestAnimationFrame(() => {
    w.style.opacity = '1';
    w.style.transform = 'scale(1)';
  });
}

function hideLiveWidget() {
  const w = document.getElementById('live-widget');
  if (!w) return;
  w.style.transition = 'opacity .15s, transform .15s';
  w.style.opacity = '0';
  w.style.transform = 'scale(0.92)';
  setTimeout(() => {
    w.style.display = 'none';
    // Parar el video desconectando el src
    const iframe = document.getElementById('live-iframe');
    if (iframe) iframe.src = '';
  }, 150);
  _liveVisible = false;
  updateSbButton();
}

function toggleLiveWidget() {
  if (_liveVisible) hideLiveWidget();
  else showLiveWidget();
}
window.toggleLiveWidget = toggleLiveWidget;

function toggleLiveMin() {
  _liveMinimized = !_liveMinimized;
  const body = document.getElementById('live-body');
  const btn  = document.getElementById('live-min-btn');
  const w    = document.getElementById('live-widget');
  if (!body || !btn || !w) return;

  if (_liveMinimized) {
    body.style.display = 'none';
    btn.textContent = '□';
    btn.title = 'Restaurar';
    // Reubicar si queda fuera de pantalla al minimizar
    const {x, y} = clampPos(parseInt(w.style.left), parseInt(w.style.top));
    w.style.left = x + 'px'; w.style.top = y + 'px';
  } else {
    body.style.display = '';
    btn.textContent = '—';
    btn.title = 'Minimizar';
  }
}
window.toggleLiveMin = toggleLiveMin;
window.hideLiveWidget = hideLiveWidget;

// ── Botón en el status bar ────────────────────────────────────────────────────

function injectSbButton() {
  const sb = document.getElementById('sb');
  if (!sb || document.getElementById('live-sb-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'live-sb-btn';
  btn.style.cssText = `
    margin-left:auto;
    background:none;
    border:1px solid var(--red);
    color:var(--red);
    font-family:var(--mono);
    font-size:9px;
    letter-spacing:1.5px;
    padding:3px 10px;
    cursor:pointer;
    text-transform:uppercase;
    display:flex;
    align-items:center;
    gap:6px;
    transition:background .15s, color .15s;
    flex-shrink:0;
  `;
  btn.addEventListener('mouseenter', () => { btn.style.background = 'var(--red)'; btn.style.color = '#fff'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; btn.style.color = 'var(--red)'; });
  btn.onclick = toggleLiveWidget;

  // Dot animado
  const dot = document.createElement('span');
  dot.id = 'live-sb-dot';
  dot.style.cssText = 'width:6px;height:6px;border-radius:50%;background:var(--red);animation:pulse 1.5s ease-in-out infinite;display:inline-block;';

  const label = document.createElement('span');
  label.id = 'live-sb-label';
  label.textContent = 'EN VIVO';

  btn.appendChild(dot);
  btn.appendChild(label);
  sb.appendChild(btn);
}

function updateSbButton() {
  const btn   = document.getElementById('live-sb-btn');
  const label = document.getElementById('live-sb-label');
  if (!btn || !label) return;
  label.textContent = _liveVisible ? 'OCULTAR STREAM' : 'EN VIVO';
}

// ── Auto-show logic ───────────────────────────────────────────────────────────

function checkLiveStatus() {
  const btn = document.getElementById('live-sb-btn');

  if (isLiveNow()) {
    // Mostrar botón en sb
    if (btn) btn.style.display = '';
    // Auto-mostrar widget si no fue cerrado manualmente esta sesión
    const dismissed = sessionStorage.getItem('live_dismissed');
    if (!_liveVisible && !dismissed) {
      setTimeout(showLiveWidget, 800); // pequeño delay para no interrumpir carga
    }
  } else {
    // Fuera del horario: ocultar todo
    if (btn) btn.style.display = 'none';
    if (_liveVisible) hideLiveWidget();
  }
}

// Cuando el usuario cierra el widget manualmente, marcar como "dismissed" en la sesión
const _origHide = window.hideLiveWidget;
window.hideLiveWidget = function() {
  sessionStorage.setItem('live_dismissed', '1');
  _origHide();
};

// ── Init ──────────────────────────────────────────────────────────────────────

function initLive() {
  injectSbButton();

  // Ocultar botón por defecto hasta confirmar si es horario
  const btn = document.getElementById('live-sb-btn');
  if (btn) btn.style.display = 'none';

  // Check inmediato
  checkLiveStatus();

  // Re-check cada 60 segundos
  _liveCheckInterval = setInterval(checkLiveStatus, 60_000);
}

// Esperar a que el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLive);
} else {
  initLive();
}
