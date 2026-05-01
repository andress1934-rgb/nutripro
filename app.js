if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

/* ══ THEME ══ */
let isDark = false;

function applyTheme(dark) {
  isDark = dark;
  const bg = dark ? '#0F0F0F' : '#F7F5ED';
  const phone = document.querySelector('.phone');

  /* 1. Desactivar TODAS las transiciones CSS un frame antes */
  phone.classList.add('no-transition');
  document.documentElement.style.background = bg;
  document.body.style.background = bg;

  /* 2. Aplicar el tema (todo cambia en el mismo frame, sin delay) */
  phone.classList.toggle('dark', dark);

  /* 3. Reactivar transiciones en el siguiente frame de pintura */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => phone.classList.remove('no-transition'));
  });

  /* Icono y meta-color */
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = dark ? '🌙' : '☀️';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', bg);
}

function toggleTheme() {
  applyTheme(!isDark);
  localStorage.setItem('nutripro-theme', isDark ? 'dark' : 'light');
  toast(isDark ? '🌙 Modo oscuro activado' : '☀️ Modo claro activado');
}

/* Restaurar tema guardado y bloquear scroll de página */
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('nutripro-theme');
  if (saved === 'dark') applyTheme(true);
  else applyTheme(false);               /* fuerza body=cream desde el inicio */

  /* Bloquear bounce/scroll global excepto en áreas scrollables */
  document.addEventListener('touchmove', (e) => {
    const ok = e.target.closest(
      '.ob-body, .dash-scroll, .macros-scroll, .chat-msgs-area, .bottom-sheet, .meals-scroll, .flog-tab-pane, #diary-scroll, .recipe-detail-sheet'
    );
    if (!ok) e.preventDefault();
  }, { passive: false });
});

/* ══ STATE ══ */
let S = {
  nombre: 'Atleta',
  peso: 70, talla: 170, edad: 25, sexo: 'm', act: 1.55,
  obj: 0, objLabel: 'Perder Grasa', dietType: 'balanced',
  pesoObj: null,
  waterCount: 6, waterMeta: 12
};
let actVal = 1.55;
let currentTab = 'dash';

/* ══ NAVIGATION ══ */
/* Orden de pantallas para saber si avanzamos o retrocedemos */
const SCREEN_ORDER = [
  's-welcome','s-goal','s-method','s-calorie-intro','s-profile',
  's-activity','s-lifestyle','s-diet','s-personalize','s-results',
  's-progress-preview','s-mealplan-intro','s-meals-count','s-meal-style',
  's-foods','s-planning','s-variety','s-rating','s-notifications',
  's-source','s-register','s-app'
];

/* Pantallas que disparan el flash verde al entrar */
const SUCCESS_SCREENS = new Set(['s-results','s-progress-preview']);

let _currentScreenId = 's-welcome';

function goScreen(id) {
  if (id === _currentScreenId) return;
  closeSheet();

  const prev = document.getElementById(_currentScreenId);
  const next = document.getElementById(id);
  if (!next) return;

  const prevIdx = SCREEN_ORDER.indexOf(_currentScreenId);
  const nextIdx = SCREEN_ORDER.indexOf(id);
  const goingForward = nextIdx >= prevIdx;

  /* Si la pantalla destino usa flash verde, mostrarlo primero */
  if (goingForward && SUCCESS_SCREENS.has(id)) {
    _showGreenFlash(() => _transitionTo(prev, next, true));
  } else {
    _transitionTo(prev, next, goingForward);
  }

  _currentScreenId = id;
}

function _showGreenFlash(callback) {
  const flash = document.getElementById('green-flash');
  flash.classList.remove('run');
  void flash.offsetWidth; /* reflow */
  flash.classList.add('run');
  /* Ejecutar la transición de pantalla a mitad del flash */
  setTimeout(callback, 200);
  /* Limpiar después */
  setTimeout(() => flash.classList.remove('run'), 700);
}

function _transitionTo(prev, next, forward) {
  const enterClass = forward ? 'is-entering' : 'is-entering-back';
  const exitClass  = forward ? 'is-exiting'  : 'is-exiting-back';

  /* Salida de pantalla anterior */
  if (prev) {
    prev.classList.remove('active');
    prev.classList.add(exitClass);
    setTimeout(() => prev.classList.remove(exitClass), 420);
  }

  /* Entrada de pantalla nueva */
  next.classList.add('active', enterClass);
  void next.offsetWidth;

  /* Quitar clase de animación después de que termine */
  setTimeout(() => next.classList.remove(enterClass), 450);

  /* Iniciar animaciones especiales según pantalla */
  if (next.id === 's-results') setTimeout(animateCalorieCount, 350);
}

function goTab(tab) {
  const screens = { dash: 's-dash', macros: 's-macros', diary: 's-diary', settings: 's-settings' };
  const navIds  = { dash: 'nav-dash', macros: 'nav-macros', diary: 'nav-diary', settings: 'nav-settings' };

  Object.keys(screens).forEach(t => {
    const el = document.getElementById(screens[t]);
    if (el) { el.style.opacity = '0'; el.style.pointerEvents = 'none'; el.style.transform = 'translateX(20px)'; }
    const nav = document.getElementById(navIds[t]);
    if (nav) nav.classList.remove('active');
  });

  const target = document.getElementById(screens[tab]);
  if (target) {
    target.style.opacity = '1'; target.style.pointerEvents = 'all';
    target.style.transform = 'translateX(0)';
    target.style.transition = 'opacity .3s ease, transform .3s ease';
  }
  const navEl = document.getElementById(navIds[tab]);
  if (navEl) navEl.classList.add('active');
  currentTab = tab;
  if (tab === 'macros') setTimeout(animateMacroBars, 200);
}

function openFood(emoji, name, type, kcal) {
  document.getElementById('food-emoji').textContent = emoji;
  document.getElementById('food-title').textContent = name;
  document.getElementById('food-type-tag').textContent = type;
  document.getElementById('food-kcal').textContent = kcal + ' kcal';
  const s = document.getElementById('s-food');
  s.style.opacity = '1'; s.style.pointerEvents = 'all'; s.style.zIndex = '20';
  s.style.transition = 'opacity .3s ease';
}

function closeFood() {
  const s = document.getElementById('s-food');
  s.style.opacity = '0'; s.style.pointerEvents = 'none'; s.style.zIndex = '1';
}

/* ══ ONBOARDING — GOAL ══ */
function selGoal(el, goal) {
  document.querySelectorAll('#s-goal .opt-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  const labels = { perder: 'Perder Grasa', musculo: 'Ganar Músculo', mantener: 'Mantener Peso' };
  const objs   = { perder: -1, musculo: 1, mantener: 0 };
  S.obj = objs[goal] || 0;
  S.objLabel = labels[goal] || 'Perder Grasa';
  setTimeout(() => goScreen('s-method'), 280);
}

/* ══ ONBOARDING — METHOD ══ */
function selMethod(el, method) {
  document.querySelectorAll('#s-method .opt-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  const btn = document.getElementById('btn-method-next');
  if (btn) btn.disabled = false;
}

/* ══ ONBOARDING — ACTIVITY ══ */
function selActivity(el, val, label) {
  document.querySelectorAll('#s-activity .opt-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  actVal = val; S.act = val;
  setTimeout(() => goScreen('s-lifestyle'), 280);
}

/* ══ ONBOARDING — GENERIC ROW SELECTION ══ */
function selRow(el) {
  const parent = el.closest('.ob-body') || el.parentElement;
  parent.querySelectorAll('.opt-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
}

/* ══ ONBOARDING — RATING ══ */
function selRating(el) {
  document.querySelectorAll('.rating-num').forEach(n => n.classList.remove('sel'));
  el.classList.add('sel');
}

/* ══ ONBOARDING — CHECK ROWS (meals count) ══ */
function toggleCheck(el) {
  el.classList.toggle('checked');
  const circle = el.querySelector('.check-circle');
  if (circle) circle.textContent = el.classList.contains('checked') ? '✓' : '';
}

/* ══ FOOD CHIPS ══ */
function toggleChip(el) {
  el.classList.toggle('sel');
}

function selectAllChips(btn) {
  const grid = btn.closest('.chips-section-head').nextElementSibling;
  const chips = grid.querySelectorAll('.food-chip');
  const allSel = Array.from(chips).every(c => c.classList.contains('sel'));
  chips.forEach(c => allSel ? c.classList.remove('sel') : c.classList.add('sel'));
  btn.textContent = allSel ? 'Seleccionar todo' : 'Deseleccionar todo';
}

/* ══ BOTTOM SHEET MODALS ══ */
function openSheet(id) {
  const overlay = document.getElementById('sheet-overlay');
  const sheet = document.getElementById(id);
  if (!overlay || !sheet) return;
  overlay.classList.add('open');
  sheet.classList.add('open');
}

function closeSheet() {
  document.getElementById('sheet-overlay')?.classList.remove('open');
  document.querySelectorAll('.bottom-sheet').forEach(s => s.classList.remove('open'));
}

/* Profile row setters */
function setSexo(val, el) {
  S.sexo = val;
  document.querySelectorAll('#sheet-sexo .sheet-option').forEach(o => o.classList.remove('sel'));
  el.classList.add('sel');
  const display = document.getElementById('display-sexo');
  if (display) display.textContent = val === 'm' ? 'Hombre' : 'Mujer';
  setTimeout(closeSheet, 200);
}

function setEdad() {
  const inp = document.getElementById('input-edad');
  if (!inp) return;
  const val = parseInt(inp.value) || 25;
  S.edad = val;
  const display = document.getElementById('display-edad');
  if (display) display.textContent = val + ' años';
  closeSheet();
}

function setAltura() {
  const inp = document.getElementById('input-altura');
  if (!inp) return;
  const val = parseInt(inp.value) || 170;
  S.talla = val;
  const display = document.getElementById('display-altura');
  if (display) display.textContent = val + ' cm';
  closeSheet();
}

function setPeso() {
  const inp = document.getElementById('input-peso');
  if (!inp) return;
  const val = parseFloat(inp.value) || 70;
  S.peso = val;
  const display = document.getElementById('display-peso');
  if (display) display.textContent = val + ' kg';
  // Also sync personalize screen
  const pa = document.getElementById('display-peso-actual');
  if (pa) pa.textContent = val + ' kg';
  const ipa = document.getElementById('input-peso-actual');
  if (ipa) ipa.value = val;
  closeSheet();
}

function setPesoActual() {
  const inp = document.getElementById('input-peso-actual');
  if (!inp) return;
  const val = parseFloat(inp.value) || 70;
  S.peso = val;
  const display = document.getElementById('display-peso-actual');
  if (display) display.textContent = val + ' kg';
  closeSheet();
}

function setPesoObj() {
  const inp = document.getElementById('input-peso-obj');
  if (!inp) return;
  const val = parseFloat(inp.value) || 65;
  S.pesoObj = val;
  const display = document.getElementById('display-peso-obj');
  if (display) {
    display.textContent = val + ' kg';
    display.classList.remove('accent-text');
  }
  // Enable crear plan button
  const btn = document.getElementById('btn-crear-plan');
  if (btn) btn.disabled = false;
  // Update chart
  const sw = document.getElementById('chart-start-weight');
  const ew = document.getElementById('chart-end-weight');
  if (sw) sw.textContent = S.peso + ' kg';
  if (ew) ew.textContent = val + ' kg';
  closeSheet();
}

/* ══ FINISH SETUP ══ */
function finishSetup() {
  calcMetrics();
  goScreen('s-app');
  goTab('dash');
  initWater();
  buildCalendar();
  buildKeyboard();
  setTimeout(animateMacroBars, 600);
  setTimeout(buildDiary, 300);
}

/* Legacy alias */
function finishOnboarding() { finishSetup(); }

/* ══ METRICS ══ */
function calcMetrics() {
  const { peso, talla, edad, sexo, act } = S;
  const bmr  = sexo === 'm' ? 10*peso + 6.25*talla - 5*edad + 5 : 10*peso + 6.25*talla - 5*edad - 161;
  let tdee = Math.round(bmr * act);

  // Adjust for goal
  if (S.obj === -1) tdee = Math.round(tdee * 0.85);
  if (S.obj === 1)  tdee = Math.round(tdee * 1.10);

  const prot = Math.round(peso * 2.2);
  const fat  = Math.round(peso * 1.0);
  const cho  = Math.max(0, Math.round((tdee - prot*4 - fat*9) / 4));
  const agua = +(peso * 0.035 + 0.5).toFixed(1);
  Object.assign(S, { tdee, prot, cho, fat, agua, waterMeta: Math.ceil(agua / 0.25) });

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // Results screen
  set('res-kcal', tdee.toLocaleString('es'));
  set('res-prot', prot + 'g');
  set('res-cho',  cho + 'g');
  set('res-fat',  fat + 'g');
  const low  = Math.round(tdee * 0.85);
  const high = Math.round(tdee * 1.1);
  set('res-range', low.toLocaleString('es') + ' — ' + high.toLocaleString('es'));

  // App state
  set('greet-name', S.nombre);
  set('prof-name',  S.nombre);
  set('prof-sub',   `${peso} kg · ${talla} cm · ${edad} años`);
  set('prof-objetivo', S.objLabel || 'Perder Grasa');
  set('st-tdee',    tdee.toLocaleString());
  set('st-prot',    '2.2g');
  set('ring-kcal',  tdee.toLocaleString());
  set('l-prot',     Math.round(prot * 0.86) + 'g');
  set('l-cho',      Math.round(cho * 0.7) + 'g');
  set('l-fat',      Math.round(fat * 0.87) + 'g');
  set('mn-prot',    Math.round(prot * 0.86));
  set('mn-prot-meta', prot);
  set('mn-cho',     Math.round(cho * 0.7));
  set('mn-cho-meta',  cho);
  set('mn-fat',     Math.round(fat * 0.87));
  set('mn-fat-meta',  fat);
}

function animateMacroBars() {
  const pb = (id, pct) => { const el = document.getElementById(id); if (el) el.style.width = pct + '%'; };
  pb('pb-prot', 86);
  pb('pb-cho',  70);
  pb('pb-fat',  87);
}

/* Contador animado de calorías en la pantalla de resultados */
function animateCalorieCount() {
  const el = document.getElementById('result-kcal-num');
  if (!el) return;
  const target = S.tdee || 1800;
  const duration = 900;
  const start = performance.now();
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    /* easeOut cubic */
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(ease * target).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ══ WATER ══ */
let waterFilled = 6;
function initWater() {
  const meta  = S.waterMeta || 12;
  const track = document.getElementById('water-cups');
  if (!track) return;
  track.innerHTML = '';
  for (let i = 0; i < Math.min(meta, 16); i++) {
    const d = document.createElement('div');
    d.className = 'wcup' + (i < waterFilled ? ' full' : '');
    d.textContent = '💧';
    d.onclick = () => {
      waterFilled = i + 1;
      document.querySelectorAll('.wcup').forEach((c, j) => c.classList.toggle('full', j < waterFilled));
      updateWater();
      toast('💧 ' + (waterFilled * 0.25).toFixed(2) + 'L registrados');
    };
    track.appendChild(d);
  }
  updateWater();
}

function updateWater() {
  const liters = (waterFilled * 0.25).toFixed(1);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('w-liters', liters + 'L');
  set('st-agua',  liters + 'L');
}

/* ══ CALENDAR ══ */
function buildCalendar() {
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month-label');
  if (!grid) return;
  grid.innerHTML = '';
  const today    = new Date();
  const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if (label) label.textContent = monthNames[today.getMonth()] + ' ' + today.getFullYear();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const datadays = [2, 5, 8, 10, 12, 15, 17, 19, 22, 24, 26];
  for (let i = 0; i < firstDay; i++) {
    const d = document.createElement('div'); d.className = 'cal-day other'; grid.appendChild(d);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day' + (d === today.getDate() ? ' today' : '') + (datadays.includes(d) ? ' has-data' : '');
    el.textContent = d;
    el.onclick = () => toast('📅 ' + d + ' seleccionado');
    grid.appendChild(el);
  }
}

/* ══ KEYBOARD ══ */
let kbText = '';
function buildKeyboard() {
  const rows = [['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L']];
  const r1 = document.getElementById('kb-row1');
  const r2 = document.getElementById('kb-row2');
  if (!r1 || !r2) return;
  r1.innerHTML = ''; r2.innerHTML = '';
  rows[0].forEach(k => { const b = document.createElement('button'); b.className = 'key-btn'; b.textContent = k; b.onclick = () => kbType(k); r1.appendChild(b); });
  rows[1].forEach(k => { const b = document.createElement('button'); b.className = 'key-btn'; b.textContent = k; b.onclick = () => kbType(k); r2.appendChild(b); });
}

function kbType(char, action) {
  if (action === 'del') kbText = kbText.slice(0, -1); else kbText += char;
  const d = document.getElementById('kb-display');
  if (d) d.textContent = kbText || 'Buscar alimento...';
}

function kbSearch() {
  toast(kbText.trim() ? '🔍 Buscando "' + kbText.trim() + '"...' : '✍️ Escribe un alimento primero');
}

/* ══ CHAT ══ */
function openChat() {
  document.getElementById('chat-overlay').classList.add('open');
  const n = document.getElementById('nav-ai'); if (n) n.classList.add('active');
}

function closeChat() {
  document.getElementById('chat-overlay').classList.remove('open');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.getElementById('nav-' + currentTab); if (navEl) navEl.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('chat-overlay').addEventListener('click', function(e) { if (e.target === this) closeChat(); });
});

function timeStr() { return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }

function addMsg(text, role) {
  const area = document.getElementById('chat-msgs');
  const w = document.createElement('div'); w.className = 'chat-bubble-wrap ' + role;
  w.innerHTML = `<div class="chat-bub">${text.replace(/\n/g,'<br>')}</div><div class="chat-bub-time">${timeStr()}</div>`;
  area.appendChild(w); area.scrollTop = area.scrollHeight;
}

function addTyping() {
  const area = document.getElementById('chat-msgs');
  const t = document.createElement('div'); t.className = 'chat-bubble-wrap ai'; t.id = 'typing-msg';
  t.innerHTML = '<div class="typing-bub"><div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div></div>';
  area.appendChild(t); area.scrollTop = area.scrollHeight;
}

async function sendMsg() {
  const inp = document.getElementById('chat-inp');
  const text = inp.value.trim(); if (!text) return;
  inp.value = ''; addMsg(text, 'user'); addTyping();
  setTimeout(() => {
    document.getElementById('typing-msg')?.remove();
    const reply = nutriBotReply(text);
    addMsg(reply, 'ai');
  }, 900 + Math.random() * 600);
}

function nutriBotReply(q) {
  const t = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const n = S.nombre || 'atleta';
  const pe = S.peso || 70;
  const td = S.tdee || 1800;
  const pr = S.prot || Math.round(pe * 2.2);
  const ag = S.agua || +(pe * 0.035 + 0.5).toFixed(1);

  if (/tdee|calorias|caloría|kcal|metabolismo|gasto/i.test(t))
    return `🔥 Tu TDEE es ~${td} kcal/día, ${n}. Es la energía total que tu cuerpo quema considerando tu actividad física.\n\nPara perder grasa necesitas ~${td-400} kcal. Para ganar músculo ~${td+300} kcal. Para mantener, quédate en ${td} kcal. ¡La consistencia es clave! 💪`;

  if (/proteina|proteína|protein|aminoacido|whey/i.test(t))
    return `💪 Con tu peso de ${pe}kg necesitas ~${pr}g de proteína al día. Eso equivale a ${Math.round(pr/4)} comidas con ~25g de proteína cada una.\n\nFuentes top: pollo (31g/100g), atún (30g/100g), huevos (13g/100g), whey protein (25g/scoop), legumbres (20g/100g). La proteína preserva músculo y mantiene la saciedad. 🥩`;

  if (/carbo|carbohidrato|glucosa|glucogeno|arroz|avena|pasta/i.test(t))
    return `⚡ Los carbohidratos son tu combustible principal. Para tu nivel de actividad, te sugiero entre ${Math.round(pe*4)}–${Math.round(pe*6)}g/día.\n\nOpciones premium: arroz integral, avena, batata, plátano, quinoa. Úsalos estratégicamente: más carbos pre y post entrenamiento, menos en la noche. 🍚`;

  if (/grasa|lipido|omega|aceite|aguacate|mantequilla/i.test(t))
    return `🥑 Las grasas saludables son esenciales para tus hormonas, absorción de vitaminas y salud cerebral. Meta: ~${Math.round(pe*1)}g/día.\n\nElige: aceite de oliva virgen, aguacate, nueces, salmón, sardinas. Evita grasas trans (comida ultraprocesada). Las grasas no engordan — el exceso calórico sí. 🧠`;

  if (/agua|hidrat|liquido|líquido|beber|sed/i.test(t))
    return `💧 Tu meta diaria es ${ag}L de agua, ${n}. Esto considera tu peso y nivel de actividad.\n\nTip: suma 500ml por cada hora de ejercicio intenso. La orina debe ser amarillo claro. La deshidratación del 2% ya reduce el rendimiento un 20%. ¡Hidratarse antes de tener sed! 🏃`;

  if (/creatina|creatin/i.test(t))
    return `💊 La creatina monohidratada es el suplemento más respaldado por la ciencia. Beneficios: +10–15% en fuerza, mayor volumen de entrenamiento, recuperación más rápida.\n\nProtocolo: 3–5g/día (sin fase de carga necesaria). Tómala con carbohidratos para mejor absorción. Es segura a largo plazo y apta para vegetarianos. 🏋️`;

  if (/post.?entreno|post.?workout|despues.*entrenar|recovery|recuperaci/i.test(t))
    return `🏃 La ventana post-entrenamiento es clave, ${n}. Idealmente en los primeros 30–60 min consume:\n\n• 30–40g de proteína (whey o pollo)\n• 60–80g de carbohidratos rápidos (plátano, arroz, avena)\n• Hidratación: 500ml + electrolitos\n\nEsto maximiza la síntesis proteica y repone glucógeno muscular. ⚡`;

  if (/pre.?entreno|pre.?workout|antes.*entrenar|energia.*entreno/i.test(t))
    return `⚡ El pre-entreno ideal depende de tu objetivo, ${n}. 1–2h antes consume:\n\n• 30–40g carbohidratos complejos (avena, pan integral)\n• 20–25g proteína (huevos, pollo, yogur griego)\n• Cafeína natural (café negro): 3–6mg/kg de peso\n\nEvita grasas en exceso antes de entrenar (retrasan la digestión). 🎯`;

  if (/perder|bajar.*peso|deficit|adelgaz|quemar.*grasa|grasa.*corporal/i.test(t))
    return `🎯 Para perder grasa manteniendo músculo, ${n}: déficit de 300–500 kcal/día (~${td-400} kcal).\n\nRegla de oro: alta proteína (${pr}g), entrenamiento de fuerza 3–4x/semana, cardio moderado. Pierde 0.5–1% de tu peso por semana máximo. Más rápido = pérdida de músculo. La paciencia es tu superpoder. 🔥`;

  if (/ganar.*musculo|músculo|hipertrofia|volumen|masa.*muscular|crecer/i.test(t))
    return `💪 Para ganar músculo de calidad, ${n}: superávit de 200–300 kcal (~${td+250} kcal/día).\n\nProtocolo: ${pr}g proteína, entrenamiento de fuerza progresivo, 7–9h de sueño. El músculo crece fuera del gym — el descanso es donde ocurre la magia. Espera 0.5–1kg de músculo/mes como máximo fisiológico. 🏆`;

  if (/sueno|sueño|dormir|descanso|recover/i.test(t))
    return `😴 El sueño es el suplemento más barato y poderoso, ${n}. Durante las 7–9h de sueño se libera hormona de crecimiento, se repara tejido muscular y se regula cortisol.\n\nFalta de sueño = más hambre (grelina ↑), menos músculo, más grasa. Prioriza el sueño tanto como el entrenamiento. 🌙`;

  if (/vitamina|mineral|micronutri|hierro|calcio|magnesio|zinc|omega/i.test(t))
    return `🌿 Los micronutrientes son los directores de orquesta de tu metabolismo. Prioridades clave:\n\n• Vitamina D: 1000–2000 UI/día\n• Magnesio: 300–400mg (mejora sueño y fuerza)\n• Omega-3: 2–3g EPA+DHA (antiinflamatorio)\n• Zinc: 15–25mg (testosterona y sistema inmune)\n\nUna dieta variada y colorida cubre la mayoría. 🎨`;

  if (/keto|cetosis|low.?carb|cetogenica|ayuno/i.test(t))
    return `🥑 La dieta keto puede ser efectiva para pérdida de grasa e insulina estable. Restricción a <50g de carbos/día.\n\nAdaptación: 2–4 semanas de "keto flu". Requiere alta adherencia. No es superior en grasa perdida vs dietas isocalóricas, pero algunos la prefieren por control del apetito. ¿Tienes contexto específico? 🧠`;

  if (/mediterrane|mediterráneo/i.test(t))
    return `🫒 La dieta mediterránea es una de las más respaldadas científicamente para salud a largo plazo. Base: aceite de oliva, vegetales, legumbres, pescado, frutos secos, cereales integrales.\n\nBeneficios: corazón sano, antiinflamatoria, sostenible culturalmente. Perfecta para rendimiento deportivo + longevidad. Es un estilo de vida, no una dieta. 🌊`;

  if (/ayuno|intermitente|fasting|16.?8|ventana/i.test(t))
    return `⏰ El ayuno intermitente (16:8 más común) puede ayudar a reducir ingesta calórica total sin contar calorías.\n\nNo es mágico: si comes mal en tu ventana, no funciona. Ventajas: mejora sensibilidad insulínica, simplifica la logística. Funciona mejor combinado con entrenamiento vespertino. 🎯`;

  if (/suplemento|supplement|bcaa|glutamina|beta.?alanina|cafeina|l-carnitina/i.test(t))
    return `💊 Jerarquía de suplementos con evidencia sólida para ti, ${n}:\n\n1. Creatina monohidratada (5g/día) — Nivel A\n2. Proteína en polvo (si no llegas a ${pr}g/día) — Nivel A\n3. Cafeína pre-entreno (3–5mg/kg) — Nivel A\n4. Vitamina D + Omega-3 — Nivel B\n5. Beta-alanina (carnosina, aguante) — Nivel B\n\nBCAA y glutamina: innecesarios si consumes proteína suficiente. 🧪`;

  if (/plan|dieta|menu|que.*comer|alimentacion|alimentación/i.test(t))
    return `📋 Tu plan base, ${n} (${td} kcal):\n\n🌅 Desayuno: Avena 60g + 3 huevos + fruta = ~500 kcal\n☀️ Almuerzo: Pollo 200g + arroz 150g + verduras = ~650 kcal\n⚡ Snack: Yogur griego + nueces = ~300 kcal\n🌙 Cena: Salmón 180g + batata 150g + ensalada = ~550 kcal\n\nAjusta porciones según tu objetivo. ¡La consistencia supera la perfección! 💪`;

  if (/imc|peso.*ideal|sobrepeso|obesidad|indice/i.test(t)) {
    const imc = +(pe / Math.pow((S.talla || 175) / 100, 2)).toFixed(1);
    let cat = imc < 18.5 ? 'bajo peso' : imc < 25 ? 'peso normal ✅' : imc < 30 ? 'sobrepeso' : 'obesidad';
    return `📊 Tu IMC es ${imc} (${cat}). Sin embargo, ${n}, el IMC no distingue músculo de grasa — un atleta puede tener IMC alto con muy baja grasa.\n\nMejor indicador: porcentaje de grasa corporal. Para hombres, óptimo deportivo: 10–15%. Para mujeres: 18–25%. La composición corporal > el número en la báscula. 🏋️`;
  }

  if (/salud|bienestar|habito|rutina|estilo.*vida/i.test(t))
    return `🌟 Los pilares de salud óptima, ${n}:\n\n1. 💤 Sueño: 7–9h de calidad\n2. 🥗 Nutrición: alimentos reales, proteína suficiente\n3. 🏋️ Ejercicio: fuerza + cardio + movilidad\n4. 💧 Hidratación: ${ag}L/día\n5. 🧘 Gestión del estrés: cortisol alto destruye músculo\n\nNo hace falta ser perfecto. Un 80% de consistencia da el 95% de los resultados. ¡Tú puedes! 🚀`;

  if (/hola|buenos|buenas|hello|hi|saludos|hey/i.test(t))
    return `¡Hola ${n}! 🌿 Soy NutriBot Pro, tu nutricionista IA.\n\nPuedo ayudarte con tus macros (tienes meta de ${pr}g proteína/día), tu TDEE de ${td} kcal, suplementación, planes de comida, hidratación y más.\n\n¿Qué quieres optimizar hoy? 💪`;

  if (/gracias|thanks|genial|perfecto|excelente|chevere|chévere/i.test(t))
    return `¡De nada, ${n}! 🙌 Para eso estoy aquí. Recuerda: la nutrición es la base de todo rendimiento. Si tienes más dudas, ¡aquí estaré! 🌿 Sigue adelante, ¡lo estás haciendo genial! 🚀`;

  return `🤔 Buena pregunta, ${n}. Tu perfil: ${pe}kg, ${td} kcal/día, meta de ${pr}g proteína.\n\nPuedo ayudarte con: macros, TDEE, proteínas, carbohidratos, grasas, agua, creatina, sueño, pérdida de grasa, ganancia muscular, suplementos, planes de comida y más.\n\n¿Sobre cuál tema quieres profundizar? 🎯`;
}

function quickChat(q) { document.getElementById('chat-inp').value = q; sendMsg(); }

/* ══ UI HELPERS ══ */
function selMgPill(el) {
  document.querySelectorAll('.mg-pill').forEach(p => p.classList.remove('sel'));
  el.classList.add('sel');
  toast('⚖️ Protocolo actualizado: ' + el.textContent);
}

function toast(msg) {
  const host = document.getElementById('toast-host');
  const pill = document.createElement('div'); pill.className = 'toast-pill'; pill.textContent = msg;
  host.appendChild(pill);
  setTimeout(() => { pill.style.animation = 'toastOut .25s ease forwards'; setTimeout(() => pill.remove(), 250); }, 2800);
}

/* ══════════════════════════════════════════════
   FOOD LOGGING SYSTEM
══════════════════════════════════════════════ */

/* ── DATA ── */
const RECIPES = [
  { name:'Bowl de Pollo y Arroz', cat:'Almuerzo', kcal:520, p:42, c:55, g:12, emoji:'🍗', color:'#8B3A3A',
    ingredients:['200g pechuga de pollo','1 taza arroz integral','½ aguacate','1 taza espinacas','2 cdas aceite oliva'] },
  { name:'Avena con Frutas', cat:'Desayuno', kcal:380, p:14, c:62, g:8, emoji:'🥣', color:'#5B8A3A',
    ingredients:['80g avena','200ml leche','1 banano','1 puñado fresas','1 cda miel','1 cdta canela'] },
  { name:'Ensalada de Atún', cat:'Almuerzo', kcal:310, p:36, c:12, g:11, emoji:'🥗', color:'#3A6B8A',
    ingredients:['1 lata atún en agua','2 tazas lechuga','1 tomate','½ pepino','2 cdas aceite oliva','Limón'] },
  { name:'Huevos Revueltos', cat:'Desayuno', kcal:280, p:20, c:4, g:19, emoji:'🍳', color:'#8A7A3A',
    ingredients:['3 huevos','50ml leche','30g queso','1 cda mantequilla','Sal y pimienta'] },
  { name:'Salmón al Horno', cat:'Cena', kcal:420, p:45, c:8, g:22, emoji:'🐟', color:'#6B3A8A',
    ingredients:['200g filete salmón','1 cda aceite oliva','Limón','Ajo','Romero','Sal'] },
  { name:'Batido Proteico', cat:'Snack', kcal:320, p:35, c:28, g:6, emoji:'🥤', color:'#3A8A6B',
    ingredients:['1 scoop proteína whey','200ml leche de almendras','1 banano','1 cda mantequilla maní','Hielo'] },
  { name:'Pasta con Pollo', cat:'Almuerzo', kcal:580, p:40, c:68, g:14, emoji:'🍝', color:'#8A5B3A',
    ingredients:['150g pasta integral','180g pollo','2 tazas espinacas','3 dientes ajo','2 cdas aceite oliva','Parmesano'] },
  { name:'Yogur con Granola', cat:'Desayuno', kcal:290, p:18, c:38, g:7, emoji:'🫙', color:'#3A5B8A',
    ingredients:['200g yogur griego','40g granola','½ taza arándanos','1 cda miel'] },
  { name:'Tacos de Res', cat:'Cena', kcal:490, p:35, c:42, g:18, emoji:'🌮', color:'#8A3A5B',
    ingredients:['150g carne molida','4 tortillas maíz','Queso','Tomate','Cebolla','Cilantro','Limón'] },
  { name:'Mix de Nueces', cat:'Snack', kcal:190, p:5, c:8, g:16, emoji:'🥜', color:'#6B8A3A',
    ingredients:['30g almendras','15g nueces','15g maní','10g arándanos secos'] },
  { name:'Arroz con Legumbres', cat:'Almuerzo', kcal:440, p:22, c:72, g:8, emoji:'🍚', color:'#3A8A8A',
    ingredients:['1 taza arroz','½ taza lentejas','½ taza garbanzos','Cúrcuma','Comino','Aceite oliva'] },
  { name:'Pechuga a la Plancha', cat:'Cena', kcal:360, p:48, c:6, g:14, emoji:'🥩', color:'#8A6B3A',
    ingredients:['250g pechuga pollo','1 limón','Ajo en polvo','Paprika','Aceite oliva','Brócoli al vapor'] },
];

const FOOD_DB = [
  {name:'Pollo (pechuga)',kcal:165,p:31,c:0,g:3.6,unit:'100g'},
  {name:'Arroz blanco cocido',kcal:130,p:2.7,c:28,g:0.3,unit:'100g'},
  {name:'Huevo entero',kcal:155,p:13,c:1.1,g:11,unit:'100g'},
  {name:'Avena',kcal:389,p:17,c:66,g:7,unit:'100g'},
  {name:'Banano',kcal:89,p:1.1,c:23,g:0.3,unit:'100g'},
  {name:'Aguacate',kcal:160,p:2,c:9,g:15,unit:'100g'},
  {name:'Atún en agua',kcal:116,p:26,c:0,g:1,unit:'100g'},
  {name:'Salmón',kcal:208,p:20,c:0,g:13,unit:'100g'},
  {name:'Leche entera',kcal:61,p:3.2,c:4.8,g:3.3,unit:'100ml'},
  {name:'Yogur griego',kcal:100,p:10,c:3.6,g:5,unit:'100g'},
  {name:'Queso blanco',kcal:264,p:17,c:3.4,g:21,unit:'100g'},
  {name:'Pan integral',kcal:247,p:13,c:41,g:4.2,unit:'100g'},
  {name:'Papa cocida',kcal:87,p:1.9,c:20,g:0.1,unit:'100g'},
  {name:'Manzana',kcal:52,p:0.3,c:14,g:0.2,unit:'100g'},
  {name:'Almendras',kcal:579,p:21,c:22,g:50,unit:'100g'},
  {name:'Proteína Whey',kcal:400,p:80,c:8,g:5,unit:'100g'},
  {name:'Brócoli',kcal:34,p:2.8,c:7,g:0.4,unit:'100g'},
  {name:'Espinacas',kcal:23,p:2.9,c:3.6,g:0.4,unit:'100g'},
  {name:'Tomate',kcal:18,p:0.9,c:3.9,g:0.2,unit:'100g'},
  {name:'Carne de res magra',kcal:250,p:26,c:0,g:15,unit:'100g'},
  {name:'Pasta cocida',kcal:158,p:5.8,c:31,g:0.9,unit:'100g'},
  {name:'Lenteja cocida',kcal:116,p:9,c:20,g:0.4,unit:'100g'},
  {name:'Garbanzo cocido',kcal:164,p:8.9,c:27,g:2.6,unit:'100g'},
  {name:'Aceite de oliva',kcal:884,p:0,c:0,g:100,unit:'100ml'},
  {name:'Mantequilla maní',kcal:588,p:25,c:20,g:50,unit:'100g'},
  {name:'Naranja',kcal:47,p:0.9,c:12,g:0.1,unit:'100g'},
  {name:'Fresa',kcal:32,p:0.7,c:7.7,g:0.3,unit:'100g'},
  {name:'Mango',kcal:60,p:0.8,c:15,g:0.4,unit:'100g'},
  {name:'Arroz integral cocido',kcal:123,p:2.6,c:26,g:1,unit:'100g'},
  {name:'Camote cocido',kcal:86,p:1.6,c:20,g:0.1,unit:'100g'},
  {name:'Quinua cocida',kcal:120,p:4.4,c:21,g:1.9,unit:'100g'},
  {name:'Lentejas cocidas',kcal:116,p:9,c:20,g:0.4,unit:'100g'},
  {name:'Pavo (pechuga)',kcal:135,p:30,c:0,g:1,unit:'100g'},
  {name:'Atún natural',kcal:132,p:29,c:0,g:1.3,unit:'100g'},
  {name:'Cerdo magro',kcal:242,p:27,c:0,g:14,unit:'100g'},
];

/* ── STATE ── */
S.diary = {};
S.selectedMeal = 'desayuno';

function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function getDayEntry(key) {
  if (!key) key = todayKey();
  if (!S.diary[key]) S.diary[key] = { desayuno:[], almuerzo:[], cena:[], snacks:[] };
  return S.diary[key];
}

/* ── DIARY BUILD ── */
function buildDiary() {
  buildWeekStrip();
  renderDiaryMeals();
}

function buildWeekStrip() {
  const strip = document.getElementById('week-strip');
  if (!strip) return;
  const days = ['L','M','M','J','V','S','D'];
  const today = new Date();
  const todayDow = today.getDay(); // 0=Sun
  // Start from Monday of this week
  const startOffset = todayDow === 0 ? -6 : 1 - todayDow;
  strip.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + startOffset + i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const isToday = d.toDateString() === today.toDateString();
    const hasLog = S.diary[key] && Object.values(S.diary[key]).some(arr => arr.length > 0);
    const col = document.createElement('div');
    col.className = 'week-day-col' + (isToday ? ' today' : '') + (hasLog ? ' has-log' : '');
    col.innerHTML = `<div class="week-day-lbl">${days[i]}</div><div class="week-day-num">${d.getDate()}</div><div class="week-day-dot"></div>`;
    col.dataset.key = key;
    col.onclick = () => {
      document.querySelectorAll('.week-day-col').forEach(c => c.classList.remove('sel'));
      col.classList.add('sel');
      renderDiaryMeals(key);
    };
    strip.appendChild(col);
    if (isToday) col.classList.add('sel');
  }
}

function renderDiaryMeals(dateKey) {
  if (!dateKey) dateKey = todayKey();
  const entry = getDayEntry(dateKey);
  const container = document.getElementById('diary-meals');
  if (!container) return;

  const mealDefs = [
    { key:'desayuno', label:'Desayuno', icon:'🌅' },
    { key:'almuerzo', label:'Almuerzo', icon:'☀️' },
    { key:'cena',     label:'Cena',     icon:'🌙' },
    { key:'snacks',   label:'Snacks',   icon:'⚡' },
  ];

  container.innerHTML = '';
  let totalKcal=0, totalP=0, totalC=0, totalG=0;

  mealDefs.forEach(def => {
    const items = entry[def.key] || [];
    let mKcal=0, mP=0, mC=0, mG=0;
    items.forEach(it => { mKcal+=it.kcal; mP+=it.p; mC+=it.c; mG+=it.g; });
    totalKcal+=mKcal; totalP+=mP; totalC+=mC; totalG+=mG;

    const sec = document.createElement('div');
    sec.className = 'diary-meal-section';
    const macroStr = mKcal ? `${Math.round(mKcal)}kcal · P${Math.round(mP)}g · C${Math.round(mC)}g · G${Math.round(mG)}g` : '';
    sec.innerHTML = `
      <div class="dms-header">
        <span class="dms-title">${def.icon} ${def.label}</span>
        <span class="dms-macros">${macroStr}</span>
        <button class="dms-add-btn" onclick="openFoodLog('${def.key}')">+</button>
      </div>
      <div class="dms-items" id="dms-items-${def.key}">
        ${items.length === 0 ? '<div class="dms-empty">Sin alimentos registrados</div>' : ''}
        ${items.map((it, idx) => `
          <div class="dms-item">
            <span class="dms-item-name">${it.name}</span>
            <span class="dms-item-kcal">${it.kcal}kcal</span>
            <button class="dms-item-del" onclick="removeDiaryItem('${dateKey}','${def.key}',${idx})">&#x2715;</button>
          </div>
        `).join('')}
      </div>`;
    container.appendChild(sec);
  });

  // Update macro bar
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('dmb-kcal', Math.round(totalKcal));
  set('dmb-prot', Math.round(totalP)+'g');
  set('dmb-carb', Math.round(totalC)+'g');
  set('dmb-fat',  Math.round(totalG)+'g');
}

function removeDiaryItem(dateKey, meal, idx) {
  if (S.diary[dateKey] && S.diary[dateKey][meal]) {
    S.diary[dateKey][meal].splice(idx, 1);
    renderDiaryMeals(dateKey);
    buildWeekStrip();
  }
}

function addToDiary(item, meal) {
  if (!meal) meal = S.selectedMeal || 'desayuno';
  const key = todayKey();
  const entry = getDayEntry(key);
  entry[meal].push({
    name: item.name,
    kcal: Math.round(item.kcal),
    p: Math.round(item.p * 10) / 10,
    c: Math.round(item.c * 10) / 10,
    g: Math.round(item.g * 10) / 10,
  });
  buildWeekStrip();
  renderDiaryMeals(key);
  toast('✅ ' + item.name + ' añadido a ' + meal);
}

/* ── FOOD LOG OVERLAY ── */
function openFoodLog(meal) {
  S.selectedMeal = meal || 'desayuno';
  const labels = { desayuno:'Desayuno', almuerzo:'Almuerzo', cena:'Cena', snacks:'Snacks' };
  const titleEl = document.getElementById('flog-title');
  if (titleEl) titleEl.textContent = 'Agregar a ' + (labels[S.selectedMeal] || 'Diario');
  document.getElementById('flog-overlay').classList.add('open');
  buildRecipeGrid();
}

function closeFoodLog() {
  document.getElementById('flog-overlay').classList.remove('open');
  stopCamera();
  stopVoice();
}

function switchFlogTab(tab) {
  document.querySelectorAll('.flog-tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.flog-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('ftab-' + tab)?.classList.add('active');
  document.getElementById('flt-' + tab)?.classList.add('active');
  if (tab !== 'escaner') stopCamera();
  if (tab !== 'voz') stopVoice();
}

/* ── TAB 1: RECETAS ── */
function buildRecipeGrid() {
  const grid = document.getElementById('recipe-grid');
  if (!grid) return;
  grid.innerHTML = '';
  RECIPES.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <div class="recipe-card-img" style="background:${r.color}">${r.emoji}</div>
      <div class="recipe-card-body" style="background:${r.color}">
        <div class="recipe-card-cat">${r.cat}</div>
        <div class="recipe-card-name">${r.name}</div>
        <div class="recipe-pills">
          <span class="recipe-pill">${r.kcal}kcal</span>
          <span class="recipe-pill">P${r.p}g</span>
          <span class="recipe-pill">C${r.c}g</span>
          <span class="recipe-pill">G${r.g}g</span>
        </div>
      </div>`;
    card.onclick = () => openRecipeDetail(i);
    grid.appendChild(card);
  });
}

let _selectedRecipeIdx = -1;
function openRecipeDetail(idx) {
  _selectedRecipeIdx = idx;
  const r = RECIPES[idx];
  const overlay = document.getElementById('recipe-detail-overlay');
  document.getElementById('rds-header').style.background = r.color;
  document.getElementById('rds-emoji').textContent = r.emoji;
  document.getElementById('rds-name').textContent = r.name;
  document.getElementById('rds-pills').innerHTML = [
    r.kcal+'kcal', 'P '+r.p+'g', 'C '+r.c+'g', 'G '+r.g+'g', r.cat
  ].map(t => `<span class="rds-pill">${t}</span>`).join('');
  const ul = document.getElementById('rds-ingr-list');
  ul.innerHTML = r.ingredients.map(ing => `<li>${ing}</li>`).join('');
  overlay.style.display = 'flex';
}

function closeRecipeDetail() {
  document.getElementById('recipe-detail-overlay').style.display = 'none';
}

function addRecipeToDiary() {
  if (_selectedRecipeIdx < 0) return;
  const r = RECIPES[_selectedRecipeIdx];
  addToDiary({ name: r.name, kcal: r.kcal, p: r.p, c: r.c, g: r.g }, S.selectedMeal);
  closeRecipeDetail();
  closeFoodLog();
}

/* ── TAB 2: BUSCAR ── */
let _selectedFoodItem = null;
let _fqtyGrams = 100;

function searchFoodDB(query) {
  const q = query.trim().toLowerCase();
  const panel = document.getElementById('fqty-panel');
  panel.style.display = 'none';
  _selectedFoodItem = null;
  const results = document.getElementById('fsearch-results');
  if (!q) { results.innerHTML = ''; return; }
  const matches = FOOD_DB.filter(f => f.name.toLowerCase().includes(q)).slice(0, 15);
  results.innerHTML = matches.map((f, i) => `
    <div class="fsearch-row" onclick="selectFoodFromDB(${FOOD_DB.indexOf(f)})">
      <div>
        <div class="fsearch-row-name">${f.name}</div>
        <div class="fsearch-row-macros">P${f.p}g · C${f.c}g · G${f.g}g · ${f.unit}</div>
      </div>
      <div class="fsearch-row-kcal">${f.kcal}kcal</div>
    </div>`).join('');
  if (matches.length === 0) results.innerHTML = '<div class="dms-empty" style="padding:16px 4px">No se encontraron resultados</div>';
}

function selectFoodFromDB(idx) {
  _selectedFoodItem = FOOD_DB[idx];
  _fqtyGrams = 100;
  const panel = document.getElementById('fqty-panel');
  panel.style.display = 'block';
  document.getElementById('fqty-name').textContent = _selectedFoodItem.name;
  document.getElementById('fqty-unit').textContent = _selectedFoodItem.unit.replace(/\d+/,'').trim();
  updateQtyDisplay();
}

function adjustQty(delta) {
  _fqtyGrams = Math.max(25, _fqtyGrams + delta);
  updateQtyDisplay();
}

function updateQtyDisplay() {
  if (!_selectedFoodItem) return;
  const f = _selectedFoodItem;
  const ratio = _fqtyGrams / 100;
  document.getElementById('fqty-val').textContent = _fqtyGrams;
  document.getElementById('fqty-macros').textContent =
    `${Math.round(f.kcal * ratio)}kcal · P${Math.round(f.p * ratio)}g · C${Math.round(f.c * ratio)}g · G${Math.round(f.g * ratio)}g`;
}

function addFoodFromSearch() {
  if (!_selectedFoodItem) return;
  const f = _selectedFoodItem;
  const ratio = _fqtyGrams / 100;
  addToDiary({
    name: f.name + ' (' + _fqtyGrams + f.unit.replace(/\d+/,'').trim() + ')',
    kcal: Math.round(f.kcal * ratio),
    p: Math.round(f.p * ratio * 10) / 10,
    c: Math.round(f.c * ratio * 10) / 10,
    g: Math.round(f.g * ratio * 10) / 10,
  }, S.selectedMeal);
  document.getElementById('fqty-panel').style.display = 'none';
  document.getElementById('fsearch-inp').value = '';
  document.getElementById('fsearch-results').innerHTML = '';
  _selectedFoodItem = null;
  closeFoodLog();
}

/* ── TAB 3: ESCÁNER ── */
let _cameraStream = null;
let _scannerMode = 'food';
let _barcodeLoop = null;
let _scannerResult = null;

function setScannerMode(mode) {
  _scannerMode = mode;
  document.getElementById('sbtn-food').classList.toggle('active', mode === 'food');
  document.getElementById('sbtn-barcode').classList.toggle('active', mode === 'barcode');
  stopCamera();
  startCamera(mode);
}

async function startCamera(mode) {
  const video = document.getElementById('scanner-video');
  const placeholder = document.getElementById('scanner-placeholder');
  const frame = document.getElementById('scanner-frame');
  const resultEl = document.getElementById('scanner-result');
  resultEl.style.display = 'none';
  try {
    _cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } });
    video.srcObject = _cameraStream;
    video.style.display = 'block';
    placeholder.style.display = 'none';
    frame.style.display = 'block';
    if (mode === 'barcode') {
      startBarcodeDetection();
    } else {
      // Food photo mode: add capture button
      addCaptureButton();
    }
  } catch(err) {
    toast('📷 Cámara no disponible: ' + err.message);
  }
}

function stopCamera() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
  if (_barcodeLoop) { clearInterval(_barcodeLoop); _barcodeLoop = null; }
  const video = document.getElementById('scanner-video');
  if (video) { video.style.display = 'none'; video.srcObject = null; }
  const placeholder = document.getElementById('scanner-placeholder');
  if (placeholder) placeholder.style.display = 'flex';
  const frame = document.getElementById('scanner-frame');
  if (frame) frame.style.display = 'none';
  const capBtn = document.getElementById('capture-btn');
  if (capBtn) capBtn.remove();
}

function addCaptureButton() {
  const wrap = document.querySelector('.scanner-wrap');
  if (!wrap || document.getElementById('capture-btn')) return;
  const btn = document.createElement('button');
  btn.id = 'capture-btn';
  btn.textContent = '📸 Capturar';
  btn.style.cssText = 'position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:var(--accent);border:none;border-radius:50px;padding:10px 24px;font-family:Inter,sans-serif;font-size:14px;font-weight:700;color:var(--dark);cursor:pointer;z-index:10';
  btn.onclick = captureAndAnalyze;
  wrap.appendChild(btn);
}

async function captureAndAnalyze() {
  const video = document.getElementById('scanner-video');
  if (!video || !_cameraStream) { toast('📷 Activa la cámara primero'); return; }
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
  toast('🔍 Analizando imagen...');
  await analyzeFood(base64);
}

async function analyzeFood(imageBase64) {
  const key = localStorage.getItem('np-claude-key');
  if (!key) { promptClaudeKey(); return; }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [
            { type:'image', source:{ type:'base64', media_type:'image/jpeg', data: imageBase64 } },
            { type:'text', text: 'Analiza esta comida y devuelve SOLO un JSON válido sin texto adicional: {"food":"nombre del alimento","kcal":numero,"p":proteinas_gramos,"c":carbohidratos_gramos,"g":grasas_gramos}' }
          ]
        }]
      })
    });
    const data = await res.json();
    const txt = data.content?.[0]?.text || '';
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    _scannerResult = { name: parsed.food, kcal: parsed.kcal, p: parsed.p, c: parsed.c, g: parsed.g };
    showScannerResult(_scannerResult);
  } catch(err) {
    toast('⚠️ Error al analizar: ' + err.message);
  }
}

function startBarcodeDetection() {
  if (!('BarcodeDetector' in window)) {
    // Fallback: manual barcode input
    showManualBarcodeInput();
    return;
  }
  const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','upc_a','upc_e','code_128'] });
  const video = document.getElementById('scanner-video');
  let lastCode = '';
  // Add scan line animation
  const frame = document.getElementById('scanner-frame');
  if (frame && !frame.querySelector('.scanner-line')) {
    const line = document.createElement('div'); line.className = 'scanner-line'; frame.appendChild(line);
  }
  _barcodeLoop = setInterval(async () => {
    if (!video || !video.videoWidth) return;
    try {
      const barcodes = await detector.detect(video);
      if (barcodes.length > 0 && barcodes[0].rawValue !== lastCode) {
        lastCode = barcodes[0].rawValue;
        clearInterval(_barcodeLoop);
        toast('📦 Código detectado: ' + lastCode);
        await lookupBarcode(lastCode);
      }
    } catch(_) {}
  }, 400);
}

function showManualBarcodeInput() {
  const wrap = document.querySelector('.scanner-wrap');
  if (!wrap || document.getElementById('barcode-manual')) return;
  const div = document.createElement('div');
  div.id = 'barcode-manual';
  div.style.cssText = 'position:absolute;inset:0;background:rgba(0,0,0,.85);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:20px;z-index:10';
  div.innerHTML = `
    <div style="color:#fff;font-size:13px;text-align:center">BarcodeDetector no disponible.<br>Ingresa el código manualmente:</div>
    <input id="barcode-manual-inp" type="number" placeholder="Ej: 7501234567890" style="width:100%;padding:10px;border-radius:8px;border:none;font-size:16px;text-align:center">
    <button onclick="lookupBarcodeManual()" style="background:var(--accent);border:none;border-radius:50px;padding:10px 24px;font-family:Inter,sans-serif;font-weight:700;font-size:14px;cursor:pointer">Buscar</button>`;
  wrap.appendChild(div);
}

function lookupBarcodeManual() {
  const inp = document.getElementById('barcode-manual-inp');
  if (!inp || !inp.value.trim()) return;
  lookupBarcode(inp.value.trim());
}

async function lookupBarcode(code) {
  toast('🔍 Consultando base de datos...');
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,nutriments`);
    const data = await res.json();
    if (data.status !== 1 || !data.product) { toast('❌ Producto no encontrado'); return; }
    const p = data.product;
    const n = p.nutriments;
    _scannerResult = {
      name: p.product_name || 'Producto desconocido',
      kcal: Math.round(n['energy-kcal_100g'] || n['energy-kcal'] || 0),
      p:    Math.round((n.proteins_100g || 0) * 10) / 10,
      c:    Math.round((n.carbohydrates_100g || 0) * 10) / 10,
      g:    Math.round((n.fat_100g || 0) * 10) / 10,
    };
    showScannerResult(_scannerResult);
  } catch(err) {
    toast('⚠️ Error de red: ' + err.message);
  }
}

function showScannerResult(item) {
  const el = document.getElementById('scanner-result');
  document.getElementById('sres-name').textContent = item.name;
  document.getElementById('sres-macros').textContent =
    `${item.kcal}kcal · P${item.p}g · C${item.c}g · G${item.g}g`;
  el.style.display = 'block';
}

function addFoodFromScanner() {
  if (!_scannerResult) return;
  addToDiary(_scannerResult, S.selectedMeal);
  closeFoodLog();
}

function promptClaudeKey() {
  const existing = localStorage.getItem('np-claude-key') || '';
  const key = window.prompt('Ingresa tu clave de API de Claude (anthropic.com):', existing);
  if (key && key.trim()) {
    localStorage.setItem('np-claude-key', key.trim());
    toast('🔑 API Key guardada');
  }
}

/* ── TAB 4: VOZ ── */
let _recognition = null;
let _voiceTimerInterval = null;
let _voiceSeconds = 0;
let _voiceResult = null;

function toggleVoice() {
  const btn = document.getElementById('voz-mic-btn');
  if (_recognition && btn.classList.contains('listening')) {
    stopVoice();
  } else {
    startVoice();
  }
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { toast('🎤 Reconocimiento de voz no disponible en este navegador'); return; }
  _recognition = new SpeechRecognition();
  _recognition.lang = 'es-ES';
  _recognition.continuous = false;
  _recognition.interimResults = true;

  const btn = document.getElementById('voz-mic-btn');
  const timerEl = document.getElementById('voz-timer');
  const transcript = document.getElementById('voz-transcript');
  const sub = document.getElementById('voz-sub');
  const resultCard = document.getElementById('voz-result');

  btn.classList.add('listening');
  timerEl.style.display = 'block';
  resultCard.style.display = 'none';
  sub.textContent = 'Escuchando...';
  transcript.textContent = '';
  _voiceSeconds = 0;
  timerEl.textContent = '0:00';

  _voiceTimerInterval = setInterval(() => {
    _voiceSeconds++;
    const m = Math.floor(_voiceSeconds/60);
    const s = _voiceSeconds % 60;
    timerEl.textContent = m + ':' + String(s).padStart(2,'0');
  }, 1000);

  _recognition.onresult = (event) => {
    const t = Array.from(event.results).map(r => r[0].transcript).join('');
    transcript.textContent = t;
  };

  _recognition.onend = () => {
    const finalText = transcript.textContent.trim();
    stopVoice(false);
    if (finalText) matchVoiceToFood(finalText);
  };

  _recognition.onerror = (e) => {
    stopVoice(false);
    toast('🎤 Error: ' + e.error);
  };

  _recognition.start();
}

function stopVoice(clearUI) {
  if (_recognition) {
    try { _recognition.stop(); } catch(_) {}
    _recognition = null;
  }
  if (_voiceTimerInterval) { clearInterval(_voiceTimerInterval); _voiceTimerInterval = null; }
  const btn = document.getElementById('voz-mic-btn');
  if (btn) btn.classList.remove('listening');
  const timerEl = document.getElementById('voz-timer');
  if (timerEl && clearUI !== false) timerEl.style.display = 'none';
  const sub = document.getElementById('voz-sub');
  if (sub && clearUI !== false) sub.textContent = 'Toca el micrófono y dilo en voz alta';
}

function matchVoiceToFood(text) {
  const words = text.toLowerCase().split(/\s+/);
  let best = null, bestScore = 0;
  FOOD_DB.forEach(f => {
    const fname = f.name.toLowerCase();
    let score = 0;
    words.forEach(w => { if (w.length > 3 && fname.includes(w)) score++; });
    if (score > bestScore) { bestScore = score; best = f; }
  });

  const transcript = document.getElementById('voz-transcript');
  transcript.textContent = '"' + text + '"';

  if (best && bestScore > 0) {
    _voiceResult = best;
    document.getElementById('voz-res-name').textContent = best.name;
    document.getElementById('voz-res-macros').textContent =
      `${best.kcal}kcal por ${best.unit} · P${best.p}g · C${best.c}g · G${best.g}g`;
    document.getElementById('voz-result').style.display = 'block';
    document.getElementById('voz-sub').textContent = 'Encontrado:';
  } else {
    toast('🔍 No encontré "' + text + '" en la base de datos');
    document.getElementById('voz-sub').textContent = 'Intenta de nuevo';
  }
}

function cancelVoice() {
  _voiceResult = null;
  document.getElementById('voz-result').style.display = 'none';
  document.getElementById('voz-transcript').textContent = '';
  document.getElementById('voz-sub').textContent = 'Toca el micrófono y dilo en voz alta';
  document.getElementById('voz-timer').style.display = 'none';
}

function addFoodFromVoice() {
  if (!_voiceResult) return;
  addToDiary({
    name: _voiceResult.name,
    kcal: _voiceResult.kcal,
    p: _voiceResult.p,
    c: _voiceResult.c,
    g: _voiceResult.g,
  }, S.selectedMeal);
  cancelVoice();
  closeFoodLog();
}

/* ── TAB 5: LISTA ── */
let _listMatches = [];

function parseListInput(text) {
  const lines = text.split('\n').filter(l => l.trim());
  const results = document.getElementById('lista-results');
  _listMatches = [];

  const html = lines.map(line => {
    const lower = line.toLowerCase();
    // Try to extract quantity (number before or after text)
    const qtyMatch = line.match(/(\d+)\s*g?\b/i);
    const qty = qtyMatch ? parseInt(qtyMatch[1]) : 100;

    let best = null, bestScore = 0;
    const words = lower.split(/\s+/).filter(w => w.length > 3 && !/^\d+$/.test(w));
    FOOD_DB.forEach(f => {
      const fname = f.name.toLowerCase();
      let score = 0;
      words.forEach(w => { if (fname.includes(w)) score++; });
      if (score > bestScore) { bestScore = score; best = f; }
    });

    if (best && bestScore > 0) {
      const ratio = qty / 100;
      const item = {
        name: best.name + (qty !== 100 ? ' ('+qty+'g)' : ''),
        kcal: Math.round(best.kcal * ratio),
        p: Math.round(best.p * ratio * 10)/10,
        c: Math.round(best.c * ratio * 10)/10,
        g: Math.round(best.g * ratio * 10)/10,
      };
      _listMatches.push(item);
      return `<div class="lista-match-row">
        <span class="lista-match-name">${item.name}</span>
        <span class="lista-match-kcal">${item.kcal}kcal</span>
      </div>`;
    } else {
      return `<div class="lista-match-row"><span class="lista-no-match">"${line}" — no encontrado</span></div>`;
    }
  }).join('');

  results.innerHTML = html;
}

function addFoodFromList() {
  if (_listMatches.length === 0) { toast('✍️ No hay alimentos reconocidos'); return; }
  _listMatches.forEach(item => addToDiary(item, S.selectedMeal));
  document.getElementById('lista-textarea').value = '';
  document.getElementById('lista-results').innerHTML = '';
  _listMatches = [];
  closeFoodLog();
}

/* ── Init diary on app start ── */
const _origFinishSetup = finishSetup;
// Patch buildDiary into diary tab activation
const _origGoTab = goTab;
goTab = function(tab) {
  _origGoTab(tab);
  if (tab === 'diary') setTimeout(buildDiary, 100);
};
