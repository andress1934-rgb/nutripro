if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

/* ponytail: número de WhatsApp del coach sin configurar (formato 593XXXXXXXXX, sin '+').
   Completar esta línea activa el botón "Escríbele a tu coach". */
const COACH_WHATSAPP = '';

function contactCoach() {
  if (!COACH_WHATSAPP) { toast('⚠️ Falta configurar el WhatsApp del coach'); return; }
  const msg = encodeURIComponent(`Hola, soy ${S.nombre || 'un cliente'} de Imperium 👋`);
  window.open(`https://wa.me/${COACH_WHATSAPP}?text=${msg}`, '_blank');
}

/* ── Helper: escape HTML para prevenir XSS ── */
function esc(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Persistencia de estado en localStorage ── */
const STATE_KEY = 'nutripro-state';
function saveState() {
  try {
    const snap = {
      nombre: S.nombre, peso: S.peso, talla: S.talla, edad: S.edad, sexo: S.sexo,
      act: S.act, obj: S.obj, objLabel: S.objLabel, dietType: S.dietType,
      pesoObj: S.pesoObj, waterCount: S.waterCount, waterMeta: S.waterMeta,
      waterDate: S.waterDate || null,
      diary: S.diary, plan: S.plan, training: S.training || null,
      miEntreno: S.miEntreno || null, pesoLog: S.pesoLog || [],
      waterFilled: (typeof waterFilled !== 'undefined' ? waterFilled : 0),
      onboarded: !!S.onboarded,
      /* Dueño del snapshot: evita hidratar datos de otra cuenta en un
         dispositivo compartido si la sesión expiró sin logout */
      uid: (typeof fbCurrentUser !== 'undefined' && fbCurrentUser) ? fbCurrentUser.uid : null,
      remMeals: !!S.remMeals, remWater: !!S.remWater,
      trainDone: S.trainDone || {},
      photo: S.photo || null
    };
    localStorage.setItem(STATE_KEY, JSON.stringify(snap));
  } catch(_) {}
  /* Marca que hubo una edición local: evita que un fbAutoSync en vuelo
     pise este cambio con datos más viejos de la nube */
  if (typeof _localWrites !== 'undefined') _localWrites++;
  /* Sync a Firebase con DEBOUNCE: localStorage ya guardó al instante (arriba);
     la nube se agrupa. Antes cada toque (agua, check, comida) disparaba 3
     escrituras al momento → 10 vasos = 30 writes. Ahora una ráfaga = 1 tanda.
     Reduce ~3× las escrituras (coste Firebase) sin perder datos: se hace flush
     al ocultar/cerrar la app. */
  if (typeof fbCurrentUser !== 'undefined' && fbCurrentUser) {
    if (_cloudSyncTimer) clearTimeout(_cloudSyncTimer);
    _cloudSyncTimer = setTimeout(_flushCloudSync, 1500);
  }
}
let _cloudSyncTimer = null;
function _flushCloudSync() {
  if (_cloudSyncTimer) { clearTimeout(_cloudSyncTimer); _cloudSyncTimer = null; }
  if (typeof fbCurrentUser !== 'undefined' && fbCurrentUser) {
    fbSaveUserProfile().catch(() => {});
    fbSaveDiary().catch(() => {});
  }
}
/* No perder el último cambio si el usuario cierra/oculta la app antes del debounce */
window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') _flushCloudSync(); });
window.addEventListener('pagehide', _flushCloudSync);
function loadState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch(_) { return null; }
}

/* ══ THEME ══ */
let isDark = false;

function applyTheme(dark) {
  isDark = dark;
  const bg = dark ? '#0A0B0D' : '#F7F5ED';
  const phone = document.querySelector('.phone');

  /* 1. Desactivar TODAS las transiciones CSS un frame antes */
  phone.classList.add('no-transition');
  document.documentElement.style.background = bg;
  document.body.style.background = bg;

  /* 2. Aplicar el tema (todo cambia en el mismo frame, sin delay).
        Obsidiana es el tema por defecto; .light es la opción cálida. */
  phone.classList.toggle('dark', dark);
  phone.classList.toggle('light', !dark);

  /* 3. Reactivar transiciones en el siguiente frame de pintura */
  requestAnimationFrame(() => {
    requestAnimationFrame(() => phone.classList.remove('no-transition'));
  });

  /* Icono, toggle de Ajustes y meta-color */
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = dark ? '🌙' : '☀️';
  const tc = document.getElementById('theme-check');
  if (tc) tc.checked = dark;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', bg);
}

function toggleTheme() {
  applyTheme(!isDark);
  localStorage.setItem('nutripro-theme2', isDark ? 'dark' : 'light');
}

/* Restaurar tema guardado y bloquear scroll de página */
document.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('nutripro-theme2');
  /* Obsidiana por defecto; solo el tema claro requiere opt-in explícito */
  if (saved === 'light') applyTheme(false);
  else applyTheme(true);

  /* Bloquear el bounce de la página, pero permitir el scroll donde REALMENTE hay
     un contenedor desplazable bajo el dedo. Antes era una lista blanca de clases:
     cada vista nueva que faltara (ejercicios, rutina, crear…) quedaba sin scroll.
     Ahora se detecta cualquier ancestro con overflow scroll y contenido que sobra. */
  document.addEventListener('touchmove', (e) => {
    let el = e.target;
    while (el && el.nodeType === 1 && el !== document.body) {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return;
      /* También ejes horizontales (chips de filtros, sugerencias del chat) */
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return;
      el = el.parentElement;
    }
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('gesturestart',  e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturechange', e => e.preventDefault(), { passive: false });
  document.addEventListener('gestureend',    e => e.preventDefault(), { passive: false });

  document.addEventListener('touchstart', e => {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  const TAP_OK = 'button,a,input,textarea,select,label,[onclick],[role="button"],' +
    '.wcup,.week-day-col,.recipe-card,.cal-day,.opt-card,.food-chip,.check-row,' +
    '.row-sel,.nav-item,.flog-tab,.fsearch-row,.dot-ind,.sheet-option,.mg-pill,' +
    '.rating-num,.chat-chip,.toggle';
  let _lastTap = 0;
  document.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - _lastTap < 320 && !e.target.closest(TAP_OK)) e.preventDefault();
    _lastTap = now;
  }, { passive: false });

  /* ── Inicializar Firebase y escuchar estado de autenticación ──
     La app arranca en el splash (#s-boot); aquí se decide la ruta:
     · sesión guardada + datos locales → directo a la app (sync en 2º plano)
     · sesión guardada sin datos locales (dispositivo nuevo) → esperar la nube
     · sin sesión → login (u offline si no hay red) */
  const enterApp = () => {
    calcMetrics();
    goScreen('s-app');
    setSection('train');
    initWater();
    renderPlanMeals();
    setTimeout(animateMacroBars, 400);
    setTimeout(buildDiary, 200);
    setTimeout(initReminderToggles, 600);
  };
  /* Solo renders de datos: el sync en 2º plano nunca re-navega */
  const rerenderData = () => {
    calcMetrics(); initWater(); renderPlanMeals();
    updateConsumedUI(); buildDiary();
  };
  let _booted = false;
  try {
    fbInit();
    firebase.auth().onAuthStateChanged(async (user) => {
      if (user) {
        fbCurrentUser = user;
        _checkCoachAccess(user);
        if (_booted) return;
        _booted = true;
        const prev = loadState();
        /* uid EXACTO: un snapshot sin uid (legacy o corrupto) ya no entra por
           la ruta rápida — va por la nube y no puede hidratar datos ajenos */
        if (prev && prev.onboarded && prev.uid === user.uid) {
          /* Ruta rápida: pintar YA con los datos locales, sincronizar detrás */
          Object.assign(S, prev);
          if (typeof prev.waterFilled === 'number') waterFilled = prev.waterFilled;
          enterApp();
          fbAutoSync().then(rerenderData).catch(() => {});
        } else {
          /* Dispositivo nuevo (o snapshot de otra cuenta): esperar la nube */
          try {
            await fbAutoSync();
          } catch(e) {
            if (prev && prev.uid === user.uid) { Object.assign(S, prev); if (typeof prev.waterFilled === 'number') waterFilled = prev.waterFilled; }
          }
          if (S.onboarded || hasPlan()) enterApp();
          else goScreen('s-welcome');
        }
      } else {
        /* No logueado: login (el logout navega explícito en doLogout).
           Se rearma _booted: sin esto, un re-login en la misma sesión
           (logout → login sin recargar) se quedaba colgado en "Ingresando..." */
        fbCurrentUser = null;
        _booted = false;
        const coachSec = document.getElementById('drawer-coach-sec');
        if (coachSec) coachSec.style.display = 'none';
        if (_currentScreenId === 's-boot') {
          _resumeOnboardingOrLogin();
        } else if (_currentScreenId === 's-app') {
          /* Sesión revocada remotamente (token, cambio de contraseña, cuenta
             deshabilitada). Limpiar estado + localStorage antes de ir a login:
             sin esto, otro cliente que entre en el mismo teléfono sin recargar
             heredaba diario/plan del anterior (fuga en dispositivo compartido). */
          resetSessionState();
          try { localStorage.removeItem(STATE_KEY); } catch(_) {}
          goScreen('s-login');
        }
      }
    });
  } catch(e) {
    console.error('Firebase init error:', e);
    /* Fallback: modo local sin Firebase */
    const prev = loadState();
    if (prev && prev.onboarded) {
      Object.assign(S, prev);
      if (typeof prev.waterFilled === 'number') waterFilled = prev.waterFilled;
      enterApp();
    } else {
      _resumeOnboardingOrLogin();
    }
  }
  /* Red de seguridad: si Firebase nunca responde (CDN caído, red muerta),
     no dejar al usuario colgado en el splash */
  setTimeout(() => {
    if (_currentScreenId !== 's-boot' || _booted) return;
    const prev = loadState();
    if (prev && prev.onboarded) {
      Object.assign(S, prev);
      if (typeof prev.waterFilled === 'number') waterFilled = prev.waterFilled;
      enterApp();
    } else {
      _resumeOnboardingOrLogin();
    }
  }, 7000);

  /* ── Estado de red: píldora informativa + auto-reintento desde s-offline ── */
  const netPill = document.getElementById('net-pill');
  const showNet = (on) => { if (netPill) netPill.hidden = on; };
  window.addEventListener('offline', () => showNet(false));
  window.addEventListener('online', () => {
    showNet(true);
    /* Solo recarga si estabas en la pantalla de sin-conexión. En login/app:
       silencio, sin toast ruidoso que roba foco del input. fbAutoSync en
       background sincroniza sin navegar (guard _booted lo previene). */
    if (_currentScreenId === 's-offline') { location.reload(); }
  });
  if (!navigator.onLine) showNet(false);

  /* Barra reactiva al scroll: se contrae al bajar, se expande al subir (como
     Instagram). Un solo listener en captura atrapa el scroll de cualquier vista. */
  let _navLastScroll = 0;
  const appEl = document.getElementById('s-app');
  if (appEl) appEl.addEventListener('scroll', (e) => {
    const st = e.target && e.target.scrollTop;
    if (typeof st !== 'number') return;
    const navs = [document.getElementById('navbar-train'), document.getElementById('navbar-nutri')];
    if (st <= 8) navs.forEach(n => n && n.classList.remove('nav-shrunk'));
    else if (st > _navLastScroll + 5) navs.forEach(n => n && n.classList.add('nav-shrunk'));
    else if (st < _navLastScroll - 5) navs.forEach(n => n && n.classList.remove('nav-shrunk'));
    _navLastScroll = st;
  }, true);
  /* Palpitación al tocar un ítem de la barra */
  document.querySelectorAll('.nav-item').forEach(it => it.addEventListener('click', () => {
    it.classList.remove('nav-pulse'); void it.offsetWidth; it.classList.add('nav-pulse');
  }));

  /* Deslizar entre Resultados ↔ "así será tu progreso" (los 2 puntitos son
     páginas): swipe izquierda = siguiente, derecha = anterior. Sin tocar Continuar. */
  _enableSwipeNav('s-results', 's-progress-preview', null);
  _enableSwipeNav('s-progress-preview', 's-notifications', 's-results');

  /* Pre-construir el mapa corporal: los PNG se decodifican mientras el
     usuario sigue en el splash/dashboard y el tab Entreno abre instantáneo */
  initBodyMap();

  /* Chat overlay click-outside */
  const ov = document.getElementById('chat-overlay');
  if (ov) ov.addEventListener('click', function(e) { if (e.target === this) closeChat(); });
});

/* Botón "Reintentar" de la pantalla sin conexión */
function retryBoot() {
  if (navigator.onLine) location.reload();
  else toast('📡 Aún sin conexión');
}

/* Muestra el acceso al panel de coach en el menú si la cuenta logueada
   está en la colección `admins` (misma verificación que hace admin.html).
   La sesión de Firebase se comparte entre index.html y admin.html, así
   que el coach entra al panel sin volver a escribir su clave. */
async function _checkCoachAccess(user) {
  const sec = document.getElementById('drawer-coach-sec');
  if (!sec || !fbDb) return;
  try {
    const doc = await fbDb.collection('admins').doc(user.uid).get();
    sec.style.display = doc.exists ? '' : 'none';
  } catch (_) {
    sec.style.display = 'none';
  }
}

/* ══ STATE ══ */
function freshState() {
  return {
    nombre: 'Atleta',
    peso: 70, talla: 170, edad: 25, sexo: 'm', act: 1.55,
    obj: 0, objLabel: 'Perder Grasa', dietType: 'balanced',
    pesoObj: null,
    waterCount: 0, waterMeta: 12,
    diary: {},
    training: null
  };
}
let S = freshState();

/* Limpia TODO el estado en memoria (logout / cambio de cuenta).
   Evita que el plan/macros/nombre del usuario anterior se filtren al siguiente
   en un dispositivo compartido. Se llama desde fbSignOut (firebase.js). */
function resetSessionState() {
  S = freshState();
  waterFilled = 0;
  _diaryViewKey = null;
  _rtInit = false;
  /* Filtros y selecciones de UI del usuario anterior (auditoría v58):
     sin esto, el siguiente usuario veía chips/filtros pre-seleccionados */
  _exFilter = 'all'; _exSearch = ''; _exPage = 0; _bmSel = null;
  if (typeof _crZona !== 'undefined') _crZona = null;
  if (typeof _crEnfoque !== 'undefined') _crEnfoque = null;
  if (typeof _crDif !== 'undefined') _crDif = null;
  S.logDate = null;
  /* Entreno propio: en memoria y claves legacy locales — sin esto se filtraba
     la rutina del usuario anterior en un dispositivo compartido */
  _crWorkout = null;
  try { localStorage.removeItem('np-mi-entreno'); localStorage.removeItem('np-train-done'); } catch(_) {}
  /* Detener timers de recordatorios del usuario anterior */
  if (typeof _mealTimer  !== 'undefined' && _mealTimer)  { clearInterval(_mealTimer);  _mealTimer  = null; }
  if (typeof _waterTimer !== 'undefined' && _waterTimer) { clearInterval(_waterTimer); _waterTimer = null; }
}
let actVal = 1.55;
let currentTab = 'dash';

/* ══ NAVIGATION ══ */
/* Orden de pantallas para saber si avanzamos o retrocedemos */
const SCREEN_ORDER = [
  's-boot','s-offline','s-login',
  's-welcome','s-goal','s-calorie-intro','s-profile',
  's-activity','s-diet','s-personalize','s-results',
  's-progress-preview','s-notifications',
  's-register','s-app'
];

/* Pantallas que disparan el flash verde al entrar */
const SUCCESS_SCREENS = new Set(['s-results','s-progress-preview']);

/* ── Borrador del onboarding (autoguardado, v87) ──
   Antes de crear la cuenta no hay sesión Firebase, así que saveState() no
   corre (solo se activa con S.onboarded=true) → recargar a mitad de registro
   perdía todo sin aviso. Este borrador SOLO vive en localStorage de este
   dispositivo (nunca sale a la nube, misma privacidad de siempre) y permite
   retomar donde quedó. */
const DRAFT_KEY = 'nutripro-onboarding-draft';
const DRAFT_SCREENS = new Set(['s-goal','s-calorie-intro','s-profile','s-activity','s-diet','s-personalize','s-results','s-progress-preview','s-notifications','s-register']);
const DRAFT_FIELDS = ['nombre','peso','talla','edad','sexo','act','obj','objLabel','dietType','pesoObj'];
function _saveOnboardingDraft(screenId) {
  if (typeof fbCurrentUser !== 'undefined' && fbCurrentUser) return; /* ya tiene cuenta: flujo normal */
  try {
    const snap = { screen: screenId };
    DRAFT_FIELDS.forEach(k => { snap[k] = S[k]; });
    localStorage.setItem(DRAFT_KEY, JSON.stringify(snap));
  } catch(_) {}
}
function _loadOnboardingDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return (d && d.screen && DRAFT_SCREENS.has(d.screen)) ? d : null;
  } catch(_) { return null; }
}
function _clearOnboardingDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch(_) {} }

/* Sin sesión: retoma el registro donde quedó si hay un borrador guardado en
   este dispositivo; si no, login (u offline sin red). */
function _resumeOnboardingOrLogin() {
  const draft = _loadOnboardingDraft();
  if (draft) {
    DRAFT_FIELDS.forEach(k => { if (draft[k] !== undefined) S[k] = draft[k]; });
    goScreen(draft.screen);
  } else {
    goScreen(navigator.onLine ? 's-login' : 's-offline');
  }
}

let _currentScreenId = 's-boot';

function startOnboarding() {
  const inp = document.getElementById('ob-nombre');
  const val = inp ? inp.value.trim().slice(0, 40) : '';
  if (val) S.nombre = val;
  goScreen('s-goal');
}

function goScreen(id) {
  if (id === _currentScreenId) return;
  closeSheet();

  /* Al llegar a "Personaliza tu objetivo": si no eligió peso objetivo, se usa
     un valor sugerido y se habilita el botón — antes quedaba gris sin aviso y
     el usuario no sabía por qué no podía continuar (auditoría v58) */
  if (id === 's-results') animateResultsChart();
  if (id === 's-progress-preview') renderProgressChart();
  if (id === 's-personalize' && (S.pesoObj == null)) {
    S.pesoObj = Math.round(+S.peso || 65);
    const dpo = document.getElementById('display-peso-obj');
    if (dpo) { dpo.textContent = S.pesoObj + ' kg'; dpo.classList.remove('accent-text'); }
    const bcp = document.getElementById('btn-crear-plan');
    if (bcp) bcp.disabled = false;
  }

  const prev = document.getElementById(_currentScreenId);
  const next = document.getElementById(id);
  if (!next) return;

  const prevIdx = SCREEN_ORDER.indexOf(_currentScreenId);
  const nextIdx = SCREEN_ORDER.indexOf(id);
  /* Si alguna pantalla no está en el orden, asumir avance (evita dirección errónea con -1) */
  const goingForward = (prevIdx === -1 || nextIdx === -1) ? true : nextIdx >= prevIdx;

  /* Si la pantalla destino usa flash verde, mostrarlo primero */
  if (goingForward && SUCCESS_SCREENS.has(id)) {
    _showGreenFlash(() => _transitionTo(prev, next, true));
  } else {
    _transitionTo(prev, next, goingForward);
  }

  _currentScreenId = id;
  if (DRAFT_SCREENS.has(id)) _saveOnboardingDraft(id);
}

function _showGreenFlash(callback) {
  const flash = document.getElementById('green-flash');
  flash.classList.remove('run');
  void flash.offsetWidth; /* reflow */
  flash.classList.add('run');
  /* Ejecutar la transición de pantalla a mitad del flash */
  setTimeout(callback, 310);
  /* Limpiar después */
  setTimeout(() => flash.classList.remove('run'), 1050);
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

  /* Stagger por índice: independiente de cuántos elementos preceden a las
     tarjetas (icono/título/subtítulo). Funciona en ambas direcciones. */
  next.querySelectorAll('.opt-card, .row-sel, .chips-grid .food-chip')
      .forEach((el, i) => el.style.setProperty('--si', i));

  void next.offsetWidth;

  /* Quitar clase de animación después de que termine */
  setTimeout(() => next.classList.remove(enterClass), 450);

  /* Iniciar animaciones especiales según pantalla */
  if (next.id === 's-results') {
    /* Arrancar el contador en 0 ya: evita el flash del número final
       durante los 350ms previos a la animación */
    const k = document.getElementById('result-kcal-num');
    if (k) k.textContent = '0';
    setTimeout(animateCalorieCount, 350);
    setTimeout(() => showMacroDetail('prot'), 700);
  }
}

function goTab(tab) {
  /* Si hay escáner abierto, cerrarlo del todo (cámara + pantalla) */
  const scanScreen = document.getElementById('s-scanner');
  if (scanScreen && scanScreen.style.opacity === '1') closeScanner();
  /* La ficha de comida es un overlay: si quedó abierta, cerrarla al cambiar de tab */
  closeFood();

  const screens = { dash: 's-dash', macros: 's-macros', diary: 's-diary', settings: 's-settings', ejercicios: 's-ejercicios' };
  const navIds  = { dash: 'nav-dash', macros: 'nav-macros', diary: 'nav-diary', settings: 'nav-settings', ejercicios: 'nav-ejercicios' };

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
  /* En Perfil la barra flotante no lleva a ningún lado (se llega por el
     menú ☰): se oculta para despejar la vista */
  const navT = document.getElementById('navbar-train');
  const navN = document.getElementById('navbar-nutri');
  if (tab === 'settings') {
    if (navT) navT.style.display = 'none';
    if (navN) navN.style.display = 'none';
  } else {
    if (navT) navT.style.display = currentSection === 'train' ? 'flex' : 'none';
    if (navN) navN.style.display = currentSection === 'nutri' ? 'flex' : 'none';
  }
  currentTab = tab;
  if (tab === 'dash')       updateConsumedUI();
  if (tab === 'macros')     setTimeout(animateMacroBars, 200);
  if (tab === 'diary')      setTimeout(buildDiary, 100);
  /* Sin delay: el mapa ya está pre-construido desde el boot */
  if (tab === 'ejercicios') openExTab();
}

function openFood(emoji, name, type, kcal) {
  setHeroEmoji(emoji);
  document.getElementById('food-title').textContent = name;
  document.getElementById('food-type-tag').textContent = type;
  document.getElementById('food-kcal').textContent = kcal + ' kcal';
  /* Restaurar lo que el detalle de plan oculta (por si se reusa el mismo panel) */
  ['food-fav-tag','food-macro-tags','food-method'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.display = '';
  });
  const t = document.getElementById('food-ingr-title'); if (t) t.textContent = 'Ingredientes';
  const addBtn = document.getElementById('food-add-btn');
  if (addBtn) addBtn.onclick = () => { S.logDate = todayKey(); addToDiary({ name: name, kcal: kcal, p: 0, c: 0, g: 0 }, planTipoToMeal(type)); closeFood(); };
  showFood();
}

function closeFood() {
  const s = document.getElementById('s-food');
  s.style.opacity = '0'; s.style.pointerEvents = 'none'; s.style.zIndex = '1';
}

/* ══ FOTO DE PERFIL ══
   Se guarda comprimida como dataURL dentro del perfil (sin costo de servidor:
   ~15KB, muy por debajo del límite de 1MB de Firestore). Si no hay foto, se
   muestra un ícono de persona como en redes sociales. */
function renderAvatar() {
  const img = document.getElementById('prof-photo');
  const fb  = document.getElementById('prof-photo-fallback');
  if (!img || !fb) return;
  if (S.photo) { img.src = S.photo; img.style.display = 'block'; fb.style.display = 'none'; }
  else { img.style.display = 'none'; fb.style.display = 'block'; }
}
function pickAvatar() { document.getElementById('avatar-input')?.click(); }
function openAvatarSheet() {
  const removeOpt = document.getElementById('sheet-avatar-remove');
  if (removeOpt) removeOpt.style.display = S.photo ? '' : 'none';
  openSheet('sheet-avatar');
}
function removeAvatar() {
  S.photo = null;
  renderAvatar();
  saveState();
  closeSheet();
  toast('✓ Foto eliminada');
}
function onAvatarFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('Elige una imagen'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const im = new Image();
    im.onload = () => {
      const D = 220, cv = document.createElement('canvas');
      cv.width = D; cv.height = D;
      const ctx = cv.getContext('2d');
      const side = Math.min(im.width, im.height);           /* recorte cuadrado centrado */
      const sx = (im.width - side) / 2, sy = (im.height - side) / 2;
      ctx.drawImage(im, sx, sy, side, side, 0, 0, D, D);
      S.photo = cv.toDataURL('image/jpeg', 0.72);
      renderAvatar();
      saveState();
      toast('✓ Foto actualizada');
    };
    im.onerror = () => toast('No se pudo leer la imagen');
    im.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ══ PLAN ASIGNADO POR EL NUTRICIONISTA ══ */
function hasPlan() {
  const p = S.plan;
  return !!(p && typeof p === 'object' &&
    ((Array.isArray(p.meals) && p.meals.length) || p.kcal != null));
}

function labelObjetivo(o) {
  return ({ perder:'Perder Grasa', musculo:'Ganar Músculo',
            mantener:'Mantener Peso', recomp:'Recomposición' })[o] || '';
}

function mealEmoji(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('desayuno')) return '🍳';
  if (t.includes('almuerzo')) return '🍽️';
  if (t.includes('pre'))      return '🍎';
  if (t.includes('post'))     return '🥤';
  if (t.includes('merienda') || t.includes('cena')) return '🍗';
  if (t.includes('media') || t.includes('snack') || t.includes('colac')) return '🥪';
  return '🍽️';
}

function mealImgClass(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('desayuno'))  return 'meal-tipo-desayuno';
  if (t.includes('almuerzo'))  return 'meal-tipo-almuerzo';
  if (t.includes('cena'))      return 'meal-tipo-cena';
  if (t.includes('pre') || t.includes('post')) return 'meal-tipo-entreno';
  if (t.includes('merienda') || t.includes('snack') || t.includes('media') || t.includes('colac')) return 'meal-tipo-merienda';
  return 'meal-tipo-default';
}

function setHeroEmoji(emoji) {
  const el = document.getElementById('food-emoji');
  if (el) el.innerHTML = esc(emoji) + '<button class="food-back" onclick="closeFood()">←</button>';
}

function showFood() {
  const s = document.getElementById('s-food');
  if (!s) return;
  /* z 45: por encima del botón ☰ (z40) para que la ficha lo tape y no
     choquen; por debajo de la barra inferior (z50) que sí sigue visible */
  s.style.opacity = '1'; s.style.pointerEvents = 'all'; s.style.zIndex = '45';
  s.style.transition = 'opacity .3s ease';
}

/* Pinta "Mi Plan de Comidas" con el plan real; sin plan conserva los platos de ejemplo */
function renderPlanMeals() {
  /* Indicaciones del coach: ANTES del early-return para que también se
     oculten cuando el plan se quita */
  const nbox = document.getElementById('coach-notes');
  if (nbox) {
    const notas = (S.plan && S.plan.notas) ? String(S.plan.notas).trim() : '';
    nbox.style.display = notas ? '' : 'none';
    nbox.innerHTML = notas
      ? `<div class="coach-notes-card"><div class="coach-notes-title">📝 Indicaciones de tu coach</div><div class="coach-notes-text">${esc(notas)}</div></div>`
      : '';
  }
  const box = document.getElementById('dash-meals');
  if (!box) return;
  const meals = (S.plan && Array.isArray(S.plan.meals)) ? S.plan.meals : null;
  if (!meals || !meals.length) return;
  box.innerHTML = meals.map((m, i) =>
    `<div class="meal-card" onclick="openPlanMeal(${i})">
      <div class="meal-img-bg ${mealImgClass(m.tipo)}">${mealEmoji(m.tipo)}</div>
      <div class="meal-body">
        <div class="meal-type">${esc(m.tipo || 'Comida')}</div>
        <div class="meal-name">${esc(m.nombre || '')}</div>
        <div class="meal-kcal">${Math.round(+m.kcal || 0)} kcal</div>
      </div>
    </div>`
  ).join('');
}

/* Detalle honesto de una comida del plan (sin ingredientes/recetas inventadas) */
function openPlanMeal(i) {
  const meals = (S.plan && Array.isArray(S.plan.meals)) ? S.plan.meals : [];
  const m = meals[i];
  if (!m) return;
  const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const hide = (id) => { const el = document.getElementById(id); if (el) el.style.display = 'none'; };

  setHeroEmoji(mealEmoji(m.tipo));
  set('food-type-tag', m.tipo || 'Comida');
  set('food-title',    m.tipo || 'Comida');
  set('food-kcal',     Math.round(+m.kcal || 0) + ' kcal');
  hide('food-fav-tag');
  hide('food-macro-tags');
  hide('food-method');

  const title = document.getElementById('food-ingr-title');
  if (title) title.textContent = 'Tu plan indica';
  const grid = document.getElementById('food-ingr-grid');
  if (grid) {
    const items = String(m.nombre || '').split(/[,•]/).map(s => s.trim()).filter(Boolean);
    grid.innerHTML = (items.length ? items : ['—']).map(it =>
      `<div class="ingr-item"><div class="ingr-emoji">🍽️</div><div><div class="ingr-name">${esc(it)}</div></div></div>`
    ).join('');
  }
  /* El botón registra ESTA comida del plan en el diario real */
  const addBtn = document.getElementById('food-add-btn');
  if (addBtn) addBtn.onclick = () => addPlanMealToDiary(i);
  showFood();
}

/* Mapea el tipo de comida del plan a una sección del diario */
function planTipoToMeal(tipo) {
  const t = (tipo || '').toLowerCase();
  if (t.includes('desayuno')) return 'desayuno';
  if (t.includes('almuerzo')) return 'almuerzo';
  if (t.includes('cena') || t.includes('merienda')) return 'cena';
  return 'snacks'; /* media mañana, pre/post-entreno, colación, snack */
}

/* Registra una comida del plan en el diario (cuenta calorías + sincroniza con Firebase) */
function addPlanMealToDiary(i) {
  const plan  = S.plan || {};
  const meals = Array.isArray(plan.meals) ? plan.meals : [];
  const m = meals[i];
  if (!m) return;
  const kcal = +m.kcal || 0;

  /* Si la comida ya trae sus macros, se usan; si no, se reparten los del plan
     en proporción a las calorías de esta comida (aprox. honesta para el seguimiento) */
  const sumKcal  = meals.reduce((s, x) => s + (+x.kcal || 0), 0);
  const planKcal = +plan.kcal || sumKcal || 0;
  const share = planKcal > 0 ? (kcal / planKcal) : 0;
  const p = m.prot != null ? +m.prot : Math.round((+plan.prot || 0) * share);
  const c = m.cho  != null ? +m.cho  : Math.round((+plan.cho  || 0) * share);
  const g = m.fat  != null ? +m.fat  : Math.round((+plan.fat  || 0) * share);

  /* Las tarjetas del dashboard representan el plan de HOY: registrar siempre en hoy */
  S.logDate = todayKey();
  addToDiary({ name: m.tipo || 'Comida', kcal, p, c, g }, planTipoToMeal(m.tipo));
  closeFood();
}

/* ══ ONBOARDING — GOAL ══ */
function selGoal(el, goal) {
  document.querySelectorAll('#s-goal .opt-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  const labels = { perder: 'Perder Grasa', musculo: 'Ganar Músculo', mantener: 'Mantener Peso' };
  const objs   = { perder: -1, musculo: 1, mantener: 0 };
  S.obj = objs[goal] || 0;
  S.objLabel = labels[goal] || 'Perder Grasa';
  setTimeout(() => goScreen('s-calorie-intro'), 450);
}

/* Marca visual de tarjeta seleccionada (estilo de vida, dieta) */
function selRow(el) {
  el.parentElement.querySelectorAll('.opt-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
}

/* Selector de nivel de actividad (onboarding) */
function selActivity(el, val, label) {
  document.querySelectorAll('#s-activity .opt-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
  actVal = val; S.act = val;
  setTimeout(() => goScreen('s-diet'), 450);
}

/* ══ BOTTOM SHEET MODALS ══ */
function openSheet(id) {
  const overlay = document.getElementById('sheet-overlay');
  const sheet = document.getElementById(id);
  if (!overlay || !sheet) return;
  /* Prellenar el input con el valor actual del perfil */
  const prefill = {
    'sheet-edad':        ['input-edad',        S.edad],
    'sheet-altura':      ['input-altura',      S.talla],
    'sheet-peso':        ['input-peso',        S.peso],
    'sheet-peso-actual': ['input-peso-actual', S.peso],
    'sheet-peso-obj':    ['input-peso-obj',    S.pesoObj],
  }[id];
  if (prefill && prefill[1] != null) {
    const inp = document.getElementById(prefill[0]);
    if (inp) inp.value = prefill[1];
  }
  overlay.classList.add('open');
  sheet.classList.add('open');
  if (id === 'sheet-weight-history') renderWeightHistory();
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
  if (S.onboarded) { calcMetrics(); saveState(); }
}

function setEdad() {
  const inp = document.getElementById('input-edad');
  if (!inp) return;
  const val = Math.max(10, Math.min(120, parseInt(inp.value) || 25));
  S.edad = val;
  const display = document.getElementById('display-edad');
  if (display) display.textContent = val + ' años';
  closeSheet();
  if (S.onboarded) { calcMetrics(); saveState(); }
}

function setNombre() {
  const inp = document.getElementById('input-nombre');
  if (!inp) return;
  const val = inp.value.trim().slice(0, 40);
  if (!val) { closeSheet(); return; }
  S.nombre = val;
  closeSheet();
  calcMetrics();   /* repinta greet-name y prof-name */
  saveState();
  toast('✓ Nombre actualizado');
}

function setAltura() {
  const inp = document.getElementById('input-altura');
  if (!inp) return;
  const val = Math.max(80, Math.min(250, parseInt(inp.value) || 170));
  S.talla = val;
  const display = document.getElementById('display-altura');
  if (display) display.textContent = val + ' cm';
  closeSheet();
  if (S.onboarded) { calcMetrics(); saveState(); }
}

function setPeso() {
  const inp = document.getElementById('input-peso');
  if (!inp) return;
  const val = Math.max(30, Math.min(300, parseFloat(inp.value) || 70));
  S.peso = val;
  const display = document.getElementById('display-peso');
  if (display) display.textContent = val + ' kg';
  // Also sync personalize screen
  const pa = document.getElementById('display-peso-actual');
  if (pa) pa.textContent = val + ' kg';
  const ipa = document.getElementById('input-peso-actual');
  if (ipa) ipa.value = val;
  logWeight(val);
  closeSheet();
  if (S.onboarded) { calcMetrics(); saveState(); }
}

function setPesoActual() {
  const inp = document.getElementById('input-peso-actual');
  if (!inp) return;
  const val = Math.max(30, Math.min(300, parseFloat(inp.value) || 70));
  S.peso = val;
  const display = document.getElementById('display-peso-actual');
  if (display) display.textContent = val + ' kg';
  logWeight(val);
  closeSheet();
  if (S.onboarded) { calcMetrics(); saveState(); }
}

/* Historial de peso: un punto por día (si se pesa 2 veces el mismo día, actualiza el punto) */
function logWeight(kg) {
  const day = todayKey();
  S.pesoLog = S.pesoLog || [];
  const i = S.pesoLog.findIndex(e => e.d === day);
  if (i >= 0) S.pesoLog[i].kg = kg;
  else S.pesoLog.push({ d: day, kg });
  S.pesoLog.sort((a, b) => a.d < b.d ? -1 : 1);
  if (S.pesoLog.length > 60) S.pesoLog = S.pesoLog.slice(-60);
}

function renderWeightHistory() {
  const box = document.getElementById('wh-body');
  if (!box) return;
  const log = S.pesoLog || [];
  if (log.length < 2) {
    box.innerHTML = `<div class="rt-empty" style="padding:20px 0">
      <div style="font-size:36px">📈</div>
      <div class="rt-name" style="margin-top:8px">Aún no hay suficiente historial</div>
      <div class="rt-meta" style="margin-top:4px">Registra tu peso en Ajustes y aquí verás tu progreso.</div>
    </div>`;
    return;
  }
  const W = 300, H = 120, PAD = 10;
  const kgs = log.map(e => e.kg);
  const min = Math.min(...kgs), max = Math.max(...kgs);
  const range = Math.max(max - min, 1);
  const x = i => PAD + (i / (log.length - 1)) * (W - PAD*2);
  const y = kg => H - PAD - ((kg - min) / range) * (H - PAD*2);
  const pts = log.map((e, i) => `${x(i)},${y(e.kg)}`).join(' ');
  const first = log[0].kg, last = log[log.length - 1].kg;
  const delta = +(last - first).toFixed(1);
  const deltaTxt = (delta > 0 ? '+' : '') + delta + ' kg desde el ' + log[0].d;
  box.innerHTML = `
    <div style="text-align:center;margin-bottom:14px">
      <div style="font-size:28px;font-weight:800;color:var(--dark)">${last} kg</div>
      <div style="font-size:13px;color:${delta <= 0 ? 'var(--green)' : 'var(--mid)'};font-weight:600">${deltaTxt}</div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:${H}px">
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${log.map((e,i) => `<circle cx="${x(i)}" cy="${y(e.kg)}" r="${i===log.length-1?3.5:2}" fill="var(--accent)"/>`).join('')}
    </svg>
    <div style="display:flex;flex-direction:column;gap:6px;margin-top:14px;max-height:180px;overflow-y:auto">
      ${log.slice().reverse().map(e => `<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--mid);padding:6px 0;border-bottom:1px solid var(--border)"><span>${e.d}</span><b style="color:var(--dark)">${e.kg} kg</b></div>`).join('')}
    </div>`;
}

function setPesoObj() {
  const inp = document.getElementById('input-peso-obj');
  if (!inp) return;
  const val = Math.max(30, Math.min(300, parseFloat(inp.value) || 65));
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
  renderProgressChart();
  closeSheet();
  saveState();
}

/* Deslizar horizontal entre dos pantallas del onboarding sin tocar botones.
   leftTarget = a dónde ir al deslizar a la IZQUIERDA (siguiente);
   rightTarget = al deslizar a la DERECHA (anterior). */
function _enableSwipeNav(screenId, leftTarget, rightTarget) {
  const el = document.getElementById(screenId);
  if (!el) return;
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 === null) return;
    const t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    /* Solo swipe claramente horizontal (no interferir con el scroll vertical) */
    if (Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (dx < 0 && leftTarget) goScreen(leftTarget);
    else if (dx > 0 && rightTarget) goScreen(rightTarget);
  }, { passive: true });
}

/* Anima el gráfico de resultados: la línea se dibuja desde 0 (izquierda)
   subiendo, en vez de aparecer estática. */
function animateResultsChart() {
  const line = document.getElementById('res-chart-line');
  const area = document.getElementById('res-chart-area');
  if (!line) return;
  const len = line.getTotalLength ? line.getTotalLength() : 300;
  line.style.transition = 'none';
  line.style.strokeDasharray = len;
  line.style.strokeDashoffset = len;
  if (area) { area.style.transition = 'none'; area.style.opacity = '0'; }
  /* reflow para reiniciar la animación */
  void line.getBoundingClientRect();
  /* setTimeout (no requestAnimationFrame): rAF se pausa en tabs en segundo
     plano; setTimeout dispara igual y la animación arranca siempre. */
  setTimeout(() => {
    line.style.transition = 'stroke-dashoffset 1.9s cubic-bezier(.16,1,.3,1)';
    line.style.strokeDashoffset = '0';
    if (area) { area.style.transition = 'opacity 1.5s ease .4s'; area.style.opacity = '1'; }
  }, 40);
}

/* Gráfico "así será tu progreso": la curva refleja la dirección real de la
   meta (bajar/subir/mantener) usando el peso actual y el objetivo del usuario
   — datos propios, sin cifras inventadas. */
function renderProgressChart() {
  const line = document.getElementById('prog-line');
  const area = document.getElementById('prog-area');
  const cs = document.getElementById('prog-start');
  const ce = document.getElementById('prog-end');
  const tro = document.getElementById('prog-trophy');
  if (!line) return;
  const start = +S.peso || 70, goal = +S.pesoObj || start;
  const xs = [0, 60, 120, 180, 240, 300];
  let y0, y1, ys;
  if (goal === start) {
    /* mantener: onda suave que vuelve al mismo nivel (estable, no línea muerta) */
    y0 = 58; y1 = 58;
    ys = [58, 50, 62, 52, 60, 58];
  } else {
    if (goal < start) { y0 = 28; y1 = 96; }       /* perder: baja */
    else              { y0 = 96; y1 = 28; }       /* ganar: sube */
    ys = xs.map((x, i) => { const t = i / 5, e = t * t * (3 - 2 * t); return y0 + (y1 - y0) * e; });
  }
  const pts = xs.map((x, i) => x + ',' + ys[i].toFixed(1));
  line.setAttribute('points', pts.join(' '));
  area.setAttribute('points', pts.join(' ') + ' 300,132 0,132');
  cs.setAttribute('cy', y0);
  ce.setAttribute('cy', y1);
  if (tro) tro.setAttribute('y', (y1 - 14).toFixed(1));
  const sw = document.getElementById('chart-start-weight');
  const ew = document.getElementById('chart-end-weight');
  if (sw) sw.textContent = start + ' kg';
  if (ew) ew.textContent = goal + ' kg';
}

/* ══ RESET PROFILE ══ */
function resetProfile() {
  /* Acción irreversible: borra el diario también en la nube. Confirmar
     (el botón está pegado a 'Cerrar sesión', fácil de tocar por error). */
  if (!confirm('Esto borrará tu plan y todo tu diario de comidas, y no se puede deshacer. ¿Seguro que quieres reiniciar tu perfil?')) return;
  try { localStorage.removeItem(STATE_KEY); } catch(_) {}
  /* Borrar también la nube: sin esto, al recargar fbAutoSync re-hidrataba el
     perfil viejo (onboarded:true) y el reinicio se deshacía solo */
  if (typeof fbCurrentUser !== 'undefined' && fbCurrentUser && fbDb) {
    const uid = fbCurrentUser.uid;
    fbDb.collection('users').doc(uid).set({ onboarded: false }, { merge: true }).catch(() => {});
    fbDb.collection('users').doc(uid).collection('diary').doc('entries').delete().catch(() => {});
  }
  S.onboarded = false;
  S.diary = {};
  S.pesoObj = null;
  S.logDate = null;
  _diaryViewKey = null;
  waterFilled = 0;
  S.waterCount = 0;
  /* Devolver el onboarding a su estado inicial */
  const bp = document.getElementById('btn-crear-plan');
  if (bp) bp.disabled = true;
  const dpo = document.getElementById('display-peso-obj');
  if (dpo) { dpo.textContent = 'Seleccionar'; dpo.classList.add('accent-text'); }
  document.querySelectorAll('.opt-card.sel').forEach(c => c.classList.remove('sel'));
  goScreen('s-welcome');
  toast('🔄 Perfil reiniciado');
}

/* ══ LOGIN / REGISTRO ══ */
async function doLogin() {
  const email = document.getElementById('login-email')?.value?.trim();
  const pass  = document.getElementById('login-pass')?.value?.trim();
  const errEl = document.getElementById('login-error');
  const btn   = document.getElementById('login-btn');
  if (!email || !pass) { if (errEl) errEl.textContent = 'Ingresa tu correo y contraseña'; return; }
  if (btn) { btn.textContent = 'Ingresando...'; btn.disabled = true; }
  if (errEl) errEl.textContent = '';
  try {
    await fbSignIn(email, pass);
    /* onAuthStateChanged se encargará del resto */
  } catch(e) {
    const msgs = {
      'auth/user-not-found': 'Correo no registrado',
      'auth/wrong-password': 'Contraseña incorrecta',
      'auth/invalid-email': 'Correo inválido',
      'auth/invalid-credential': 'Correo o contraseña incorrectos',
      'auth/too-many-requests': 'Demasiados intentos. Espera un momento'
    };
    const m = String(e).match(/\(([^)]+)\)/);
    const code = m ? m[1] : '';
    if (errEl) errEl.textContent = msgs[code] || 'Error al iniciar sesión';
    if (btn) { btn.textContent = 'Ingresar'; btn.disabled = false; }
  }
}

/* Pantalla de notificaciones del onboarding: pedir el permiso REAL */
async function enableReminders() {
  const ok = await requestNotifPermission();
  if (ok) { S.remMeals = true; S.remWater = true; saveState(); toast('🔔 Recordatorios activados'); }
  goScreen('s-register');
}

/* ══ RESET DE CONTRASEÑA ══ */
async function doResetPass() {
  const email = document.getElementById('login-email')?.value?.trim();
  const errEl = document.getElementById('login-error');
  if (!email) { if (errEl) errEl.textContent = 'Escribe tu correo arriba y vuelve a tocar aquí'; return; }
  try {
    await fbResetPass(email);
    if (errEl) errEl.textContent = '';
    toast('📬 Te enviamos un correo para restablecer tu contraseña');
  } catch(e) {
    const m = String(e).match(/\(([^)]+)\)/);
    const code = m ? m[1] : '';
    const msgs = {
      'auth/user-not-found': 'Ese correo no está registrado',
      'auth/invalid-email': 'Correo inválido',
      'auth/too-many-requests': 'Demasiados intentos. Espera un momento'
    };
    if (errEl) errEl.textContent = msgs[code] || 'No se pudo enviar el correo';
  }
}

/* ══ LOGOUT ══ */
async function doLogout() {
  try { await fbSignOut(); } catch(_) {}
  /* fbSignOut dispara onAuthStateChanged → navega a login; reforzamos por si acaso */
  goScreen('s-login');
  const e = document.getElementById('login-email'); if (e) e.value = '';
  const p = document.getElementById('login-pass'); if (p) p.value = '';
  const err = document.getElementById('login-error'); if (err) err.textContent = '';
  toast('👋 Sesión cerrada');
}

/* ══ FINISH SETUP ══ */
async function finishSetup() {
  /* Sin sesión Firebase: crear la cuenta ANTES de avanzar. Si falla, no se
     avanza — sin cuenta, los datos viven solo en este teléfono y se pierden. */
  if (!fbCurrentUser) {
    const email = document.getElementById('reg-email')?.value?.trim() || '';
    const pass  = document.getElementById('reg-pass')?.value?.trim() || '';
    const errEl = document.getElementById('reg-error');
    const btn   = document.getElementById('reg-btn');
    if (!email || !pass) { if (errEl) errEl.textContent = 'Ingresa tu correo y una contraseña'; return; }
    const terms = document.getElementById('reg-terms');
    if (terms && !terms.checked) { if (errEl) errEl.textContent = 'Debes aceptar los Términos y la Política de Privacidad'; return; }
    if (btn) { btn.textContent = 'Creando cuenta...'; btn.disabled = true; }
    if (errEl) errEl.textContent = '';
    try {
      await fbSignUp(email, pass);
    } catch(e) {
      const msgs = {
        'auth/email-already-in-use': 'Ese correo ya tiene cuenta. Vuelve atrás e inicia sesión',
        'auth/invalid-email': 'Correo inválido',
        'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres',
        'auth/network-request-failed': 'Sin conexión. Revisa tu internet'
      };
      const m = String(e).match(/\(([^)]+)\)/);
      if (errEl) errEl.textContent = msgs[m ? m[1] : ''] || 'No se pudo crear la cuenta';
      if (btn) { btn.textContent = 'Crear mi cuenta'; btn.disabled = false; }
      return;
    }
  }
  _clearOnboardingDraft();
  S.onboarded = true;
  calcMetrics();
  goScreen('s-app');
  setSection('train');
  initWater();
  setTimeout(animateMacroBars, 600);
  setTimeout(buildDiary, 300);
  setTimeout(initReminderToggles, 600);
  saveState();
}


/* ══ METRICS ══ */
function calcMetrics() {
  /* Coerción defensiva: Firestore puede devolver strings o campos ausentes */
  const peso  = +S.peso  || 70;
  const talla = +S.talla || 170;
  const edad  = +S.edad  || 25;
  const act   = +S.act   || 1.55;
  const sexo  = S.sexo   || 'm';
  const bmr  = sexo === 'm' ? 10*peso + 6.25*talla - 5*edad + 5 : 10*peso + 6.25*talla - 5*edad - 161;
  let tdee = Math.round(bmr * act);

  // Adjust for goal
  if (S.obj === -1) tdee = Math.round(tdee * 0.85);
  if (S.obj === 1)  tdee = Math.round(tdee * 1.10);

  let prot = Math.round(peso * 2.2);
  let fat  = Math.round(peso * 1.0);
  let agua = +(peso * 0.035 + 0.5).toFixed(1);

  /* Reparto según el tipo de dieta elegido en el onboarding (S.dietType).
     Antes se ignoraba: un cliente "keto" recibía ~300g de carbos igual que todos. */
  if (S.dietType === 'keto') {
    cho  = Math.min(40, Math.max(0, Math.round((tdee - prot*4) / 4 * 0.15)));
    fat  = Math.max(0, Math.round((tdee - prot*4 - cho*4) / 9));
  } else if (S.dietType === 'lowcarb') {
    cho  = Math.max(0, Math.round(tdee * 0.20 / 4));
    fat  = Math.max(0, Math.round((tdee - prot*4 - cho*4) / 9));
  } else if (S.dietType === 'highprot') {
    prot = Math.round(peso * 2.6);
    cho  = Math.max(0, Math.round((tdee - prot*4 - fat*9) / 4));
  } else if (S.dietType === 'lowfat') {
    fat  = Math.max(20, Math.round(peso * 0.6));
    cho  = Math.max(0, Math.round((tdee - prot*4 - fat*9) / 4));
  } else {
    cho  = Math.max(0, Math.round((tdee - prot*4 - fat*9) / 4));
  }

  /* Si un nutricionista asignó un plan, sus metas mandan sobre el cálculo automático */
  const plan = S.plan || {};
  if (plan.kcal  != null && plan.kcal  !== '') tdee = Math.round(+plan.kcal) || tdee;
  if (plan.prot  != null && plan.prot  !== '') prot = Math.round(+plan.prot);
  if (plan.cho   != null && plan.cho   !== '') cho  = Math.round(+plan.cho);
  if (plan.fat   != null && plan.fat   !== '') fat  = Math.round(+plan.fat);
  if (plan.aguaL != null && plan.aguaL !== '') agua = +(+plan.aguaL).toFixed(1) || agua;

  /* Tope de 16 vasos: initWater solo renderiza 16; sin el tope la meta era inalcanzable */
  Object.assign(S, { tdee, prot, cho, fat, agua, waterMeta: Math.min(16, Math.max(1, Math.ceil(agua / 0.25))) });

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  // Results screen — preservar el <span id="result-kcal-num"> interno para que
  // animateCalorieCount() pueda animar el conteo (textContent lo destruiría)
  const resKcalEl = document.getElementById('res-kcal');
  if (resKcalEl) resKcalEl.innerHTML = '<span id="result-kcal-num">' + tdee.toLocaleString('es') + '</span>';
  set('res-prot', prot + 'g');
  set('res-cho',  cho + 'g');
  set('res-fat',  fat + 'g');
  const low  = Math.round(tdee * 0.85);
  const high = Math.round(tdee * 1.1);
  set('res-range', low.toLocaleString('es') + ' — ' + high.toLocaleString('es'));

  // App state
  const h = new Date().getHours();
  set('greet-time', h < 6 ? 'Buenas noches 🌙' : h < 12 ? 'Buenos días ☀️' : h < 19 ? 'Buenas tardes 🌤️' : 'Buenas noches 🌙');
  set('greet-name', S.nombre);
  set('prof-name',  S.nombre);
  set('prof-sub',   `${peso} kg · ${talla} cm · ${edad} años`);
  renderAvatar();
  set('prof-objetivo', S.pesoObj ? S.pesoObj + ' kg' : 'Definir');
  set('st-tdee',    tdee.toLocaleString('es'));
  set('st-prot',    (peso ? (prot / peso) : 2.2).toFixed(1) + 'g');
  set('mn-prot-meta', prot);
  set('mn-cho-meta',  cho);
  set('mn-fat-meta',  fat);

  /* Lo consumido (anillo, mini-barras y tarjetas de macros) sale del diario real */
  updateConsumedUI();
}

/* ── Totales reales consumidos en un día del diario ── */
function getTotalsFor(key) {
  const t = { kcal: 0, p: 0, c: 0, g: 0 };
  const entry = S.diary && S.diary[key];
  if (!entry) return t;
  Object.values(entry).forEach(arr => {
    if (!Array.isArray(arr)) return;
    arr.forEach(it => { t.kcal += it.kcal || 0; t.p += it.p || 0; t.c += it.c || 0; t.g += it.g || 0; });
  });
  return t;
}

/* ── Sincroniza dashboard (anillo + mini-barras) y tab Macros con lo consumido HOY ── */
function updateConsumedUI() {
  const t = getTotalsFor(todayKey());
  const pct = (v, m) => !m ? 0 : Math.max(0, Math.min(100, Math.round(v / m * 100)));
  const pp = pct(t.p, S.prot), pc = pct(t.c, S.cho), pf = pct(t.g, S.fat);
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

  /* Dashboard: medidor de calorías con rango meta (±10% del objetivo) */
  const target = S.tdee || 0;
  set('ring-kcal', Math.round(t.kcal).toLocaleString('es'));
  set('ring-kcal-sub', '/ ' + (target ? target.toLocaleString('es') : '—') + ' kcal');
  set('gauge-lo', target ? Math.round(target * 0.9).toLocaleString('es') : '');
  set('gauge-hi', target ? Math.round(target * 1.1).toLocaleString('es') : '');
  const remainEl = document.getElementById('ring-kcal-remain');
  if (remainEl) {
    if (!target) { remainEl.textContent = ''; }
    else {
      const remain = Math.round(target - t.kcal);
      remainEl.classList.toggle('over', remain < 0);
      remainEl.textContent = remain >= 0 ? `Te quedan ${remain.toLocaleString('es')} kcal` : `${Math.abs(remain).toLocaleString('es')} kcal de más`;
    }
  }
  const ARC = 251.3;
  const kcalPct = pct(t.kcal, target);
  const gf = document.getElementById('gauge-fill');
  if (gf) gf.style.strokeDashoffset = (ARC * (1 - kcalPct / 100)).toFixed(1);

  /* Dashboard: macros como barras "consumido / objetivo" */
  set('l-prot', Math.round(t.p) + ' / ' + Math.round(S.prot || 0) + ' g');
  set('l-cho',  Math.round(t.c) + ' / ' + Math.round(S.cho  || 0) + ' g');
  set('l-fat',  Math.round(t.g) + ' / ' + Math.round(S.fat  || 0) + ' g');
  const dpb = (id, p) => { const el = document.getElementById(id); if (el) el.style.width = p + '%'; };
  dpb('mb-prot', pp); dpb('mb-cho', pc); dpb('mb-fat', pf);

  /* Tab Macros: consumidos + barras de progreso */
  set('mn-prot', Math.round(t.p));
  set('mn-cho',  Math.round(t.c));
  set('mn-fat',  Math.round(t.g));
  const pb = (id, p) => { const el = document.getElementById(id); if (el) el.style.width = p + '%'; };
  pb('pb-prot', pp); pb('pb-cho', pc); pb('pb-fat', pf);
}

function animateMacroBars() { updateConsumedUI(); }

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

/* ══ MACROS INTERACTIVOS (pantalla de resultados) ══ */
const MACRO_INFO = {
  prot: { key:'prot', label:'Proteínas',     kcalPerG:4, color:'#E9806E',
          desc:'Construye y repara músculo. Te mantiene saciado por más tiempo.' },
  cho:  { key:'cho',  label:'Carbohidratos', kcalPerG:4, color:'#F5C518',
          desc:'Tu fuente principal de energía para entrenar con intensidad.' },
  fat:  { key:'fat',  label:'Grasas',        kcalPerG:9, color:'#7FB069',
          desc:'Esenciales para tus hormonas y la absorción de vitaminas.' },
};

function showMacroDetail(macro) {
  const info = MACRO_INFO[macro];
  if (!info) return;
  const grams = macro === 'prot' ? (S.prot || 0) : macro === 'cho' ? (S.cho || 0) : (S.fat || 0);
  const tdee  = S.tdee || 1;
  const kcal  = Math.round(grams * info.kcalPerG);
  const pct   = Math.max(0, Math.min(100, Math.round((kcal / tdee) * 100)));

  /* Resaltar la columna activa */
  ['prot','cho','fat'].forEach(m => {
    const col = document.getElementById('rmac-' + m);
    if (col) {
      col.classList.toggle('active', m === macro);
      if (m === macro) col.style.setProperty('--macro-color', info.color);
    }
  });

  /* Actualizar el panel de detalle */
  const fill  = document.getElementById('macro-detail-fill');
  const text  = document.getElementById('macro-detail-text');
  const panel = document.getElementById('macro-detail');
  if (fill) { fill.style.width = pct + '%'; fill.style.background = info.color; }
  if (text) {
    text.innerHTML =
      `<b style="color:${info.color}">${grams}g</b> · ${kcal} kcal · <b>${pct}%</b> de tus calorías` +
      `<span class="macro-detail-desc">${info.desc}</span>`;
  }
  if (panel) {
    panel.classList.remove('show');
    void panel.offsetWidth;   /* reinicia la animación de entrada */
    panel.classList.add('show');
  }
}

/* ══ RECORDATORIOS / NOTIFICACIONES ══ */
async function requestNotifPermission() {
  if (!('Notification' in window)) { toast('Tu navegador no soporta notificaciones'); return false; }
  if (Notification.permission === 'granted') return true;
  const p = await Notification.requestPermission();
  return p === 'granted';
}

async function showNotif(title, body) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    /* getRegistration() resuelve de inmediato (undefined si no hay SW), a diferencia
       de serviceWorker.ready, que en file:// queda colgado para siempre porque nunca
       se registra un SW. Así en pruebas locales cae al fallback new Notification(). */
    const reg = (location.protocol !== 'file:' && 'serviceWorker' in navigator)
      ? await navigator.serviceWorker.getRegistration()
      : null;
    if (reg) {
      reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png', vibrate: [200, 100, 200] });
    } else {
      new Notification(title, { body });
    }
  } catch(_) {
    try { new Notification(title, { body }); } catch(_) {}
  }
}

let _mealTimer = null, _waterTimer = null;

async function toggleMealReminder(on, silent) {
  S.remMeals = on;
  saveState();
  if (_mealTimer) { clearInterval(_mealTimer); _mealTimer = null; }
  if (!on) return;
  if (!await requestNotifPermission()) {
    const cb = document.getElementById('rem-meals');
    if (cb) cb.checked = false;
    S.remMeals = false;
    saveState();
    return;
  }
  const times = [
    {h:7,m:30,name:'Desayuno'},{h:12,m:30,name:'Almuerzo'},
    {h:15,m:30,name:'Merienda'},{h:19,m:0,name:'Cena'}
  ];
  /* Antes solo avisaba en el minuto EXACTO (12:30:00) con la app abierta: en la
     práctica nunca llegaba nada. Ahora hay una ventana de 45 min y un registro
     persistente de "ya avisé", así el aviso llega al abrir la app aunque sea tarde. */
  const WINDOW_MIN = 45;
  function checkMeals() {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    times.forEach(t => {
      const start = t.h * 60 + t.m;
      if (mins < start || mins > start + WINDOW_MIN) return;
      let seen = {};
      try { seen = JSON.parse(localStorage.getItem('np-notified') || '{}'); } catch(_) {}
      const key = todayKey() + '-' + t.h + ':' + t.m;
      if (seen[key]) return;
      Object.keys(seen).forEach(k => { if (!k.startsWith(todayKey())) delete seen[k]; });
      seen[key] = 1;
      try { localStorage.setItem('np-notified', JSON.stringify(seen)); } catch(_) {}
      showNotif('🍽️ Hora de comer', `¡Es tiempo de tu ${t.name}! Recuerda registrarlo en tu diario.`);
    });
  }
  _mealTimer = setInterval(checkMeals, 60000);
  checkMeals();
  if (!silent) toast('🔔 Recordatorio de comidas activado');
}

async function toggleWaterReminder(on, silent) {
  S.remWater = on;
  saveState();
  if (_waterTimer) { clearInterval(_waterTimer); _waterTimer = null; }
  if (!on) return;
  if (!await requestNotifPermission()) {
    const cb = document.getElementById('rem-water');
    if (cb) cb.checked = false;
    S.remWater = false;
    saveState();
    return;
  }
  /* Antes el contador de 90 min arrancaba de cero en cada apertura de la app
     y nunca se cumplía. Ahora la marca del último aviso persiste, se revisa
     cada 10 min y también al abrir la app. Sin avisos de 22:00 a 8:00. */
  function checkWater() {
    const h = new Date().getHours();
    if (h < 8 || h >= 22) return;
    const liters = parseFloat((waterFilled * 0.25).toFixed(2));
    const meta = S.agua || 2;
    if (liters >= meta) return;
    const last = +(localStorage.getItem('np-water-notif') || 0);
    if (Date.now() - last < 90 * 60 * 1000) return;
    try { localStorage.setItem('np-water-notif', String(Date.now())); } catch(_) {}
    showNotif('💧 ¡Toma agua!', `Llevas ${liters}L de ${meta}L. ¡Toma un vaso ahora!`);
  }
  _waterTimer = setInterval(checkWater, 10 * 60 * 1000);
  checkWater();
  if (!silent) toast('💧 Recordatorio de agua activado');
}

function initReminderToggles() {
  const cbMeals = document.getElementById('rem-meals');
  const cbWater = document.getElementById('rem-water');
  if (cbMeals) cbMeals.checked = !!S.remMeals;
  if (cbWater) cbWater.checked = !!S.remWater;
  /* Reactivar timers si estaban encendidos antes (en silencio: sin toast).
     Guard 'Notification' in window: en WebView/Android puede no existir la API. */
  const canNotify = ('Notification' in window) && Notification.permission === 'granted';
  if (S.remMeals && canNotify) toggleMealReminder(true, true);
  if (S.remWater && canNotify) toggleWaterReminder(true, true);
}

/* ══ WATER ══ */
let waterFilled = 0;
function initWater() {
  /* Nuevo día → el agua arranca en 0 (antes el conteo de ayer se arrastraba
     para siempre porque se persistía sin fecha) */
  if (S.waterDate !== todayKey()) { waterFilled = 0; S.waterCount = 0; S.waterDate = todayKey(); }
  const meta  = S.waterMeta || 12;
  const track = document.getElementById('water-cups');
  if (!track) return;
  track.innerHTML = '';
  for (let i = 0; i < Math.min(meta, 16); i++) {
    const d = document.createElement('div');
    d.className = 'wcup' + (i < waterFilled ? ' full' : '');
    d.textContent = '💧';
    d.onclick = () => {
      /* Tocar el primer vaso estando en 1 lo regresa a 0 */
      waterFilled = (i === 0 && waterFilled === 1) ? 0 : i + 1;
      S.waterDate = todayKey();
      document.querySelectorAll('.wcup').forEach((c, j) => c.classList.toggle('full', j < waterFilled));
      updateWater();
      saveState();
    };
    track.appendChild(d);
  }
  updateWater();
}

function updateWater() {
  S.waterCount = waterFilled;
  /* parseFloat recorta ceros: 1.5L, 1.75L, 2L (antes 1.75 se mostraba como 1.8) */
  const liters = parseFloat((waterFilled * 0.25).toFixed(2));
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('w-liters', liters + 'L');
  set('st-agua',  liters + 'L');
}

function openChat() {
  const ov = document.getElementById('chat-overlay'); if (ov) ov.classList.add('open');
}

function closeChat() {
  const ov = document.getElementById('chat-overlay'); if (ov) ov.classList.remove('open');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navEl = document.getElementById('nav-' + currentTab); if (navEl) navEl.classList.add('active');
}

/* chat-overlay click-outside ya está en DOMContentLoaded principal */

function timeStr() { return new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }

function addMsg(text, role) {
  const area = document.getElementById('chat-msgs');
  if (!area) return;
  const w = document.createElement('div'); w.className = 'chat-bubble-wrap ' + role;
  w.innerHTML = `<div class="chat-bub">${esc(text).replace(/\n/g,'<br>')}</div><div class="chat-bub-time">${timeStr()}</div>`;
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

  if (/keto|cetosis|low.?carb|cetogenica/i.test(t))
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
    return `¡Hola ${n}! 🌿 Soy el Asistente automático de Imperium.\n\nPuedo ayudarte con tus macros (tienes meta de ${pr}g proteína/día), tu TDEE de ${td} kcal, suplementación, planes de comida, hidratación y más. Para algo de tu plan específico, escríbele a tu coach.\n\n¿Qué quieres optimizar hoy? 💪`;

  if (/gracias|thanks|genial|perfecto|excelente|chevere|chévere/i.test(t))
    return `¡De nada, ${n}! 🙌 Para eso estoy aquí. Recuerda: la nutrición es la base de todo rendimiento. Si tienes más dudas, ¡aquí estaré! 🌿 Sigue adelante, ¡lo estás haciendo genial! 🚀`;

  return `🤔 Buena pregunta, ${n}. Tu perfil: ${pe}kg, ${td} kcal/día, meta de ${pr}g proteína.\n\nPuedo ayudarte con: macros, TDEE, proteínas, carbohidratos, grasas, agua, creatina, sueño, pérdida de grasa, ganancia muscular, suplementos, planes de comida y más.\n\n¿Sobre cuál tema quieres profundizar? 🎯`;
}

function quickChat(q) { document.getElementById('chat-inp').value = q; sendMsg(); }

/* ══ UI HELPERS ══ */
function toast(msg) {
  const host = document.getElementById('toast-host');
  if (!host) return;
  /* Reemplaza el aviso anterior en vez de apilarlos (ej. al tocar varios vasos) */
  host.innerHTML = '';
  clearTimeout(toast._t);
  const pill = document.createElement('div'); pill.className = 'toast-pill'; pill.textContent = msg;
  host.appendChild(pill);
  toast._t = setTimeout(() => {
    pill.style.animation = 'toastOut .25s ease forwards';
    setTimeout(() => pill.remove(), 250);
  }, 2200);
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
  {name:'Lentejas cocidas',kcal:116,p:9,c:20,g:0.4,unit:'100g'},
  {name:'Garbanzo cocido',kcal:164,p:8.9,c:27,g:2.6,unit:'100g'},
  {name:'Aceite de oliva',kcal:884,p:0,c:0,g:100,unit:'100ml'},
  {name:'Mantequilla maní',kcal:588,p:25,c:20,g:50,unit:'100g'},
  {name:'Naranja',kcal:47,p:0.9,c:12,g:0.1,unit:'100g'},
  {name:'Fresa',kcal:32,p:0.7,c:7.7,g:0.3,unit:'100g'},
  {name:'Mango',kcal:60,p:0.8,c:15,g:0.4,unit:'100g'},
  {name:'Arroz integral cocido',kcal:123,p:2.6,c:26,g:1,unit:'100g'},
  {name:'Camote cocido',kcal:86,p:1.6,c:20,g:0.1,unit:'100g'},
  {name:'Quinua cocida',kcal:120,p:4.4,c:21,g:1.9,unit:'100g'},
  {name:'Pavo (pechuga)',kcal:135,p:30,c:0,g:1,unit:'100g'},
  {name:'Cerdo magro',kcal:242,p:27,c:0,g:14,unit:'100g'},
];

/* ── STATE ── */
S.diary = {};
S.selectedMeal = 'desayuno';
/* Día que el usuario está viendo en el diario (los "+" agregan a ESTE día) */
let _diaryViewKey = null;

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
  try {
    if (!S.diary) S.diary = {};
    buildWeekStrip();
    renderDiaryMeals();
  } catch(e) {
    console.error('buildDiary error:', e);
  }
}

function buildWeekStrip() {
  const strip = document.getElementById('week-strip');
  if (!strip) return;
  const days = ['L','M','X','J','V','S','D'];
  const today = new Date();
  const todayDow = today.getDay(); // 0=Sun
  // Start from Monday of this week
  const startOffset = todayDow === 0 ? -6 : 1 - todayDow;
  const selKey = _diaryViewKey || todayKey();
  strip.innerHTML = '';
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + startOffset + i);
    const key = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    const isToday = d.toDateString() === today.toDateString();
    const hasLog = S.diary[key] && Object.values(S.diary[key]).some(arr => Array.isArray(arr) && arr.length > 0);
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
    /* Mantener seleccionado el día que se estaba viendo (no resetear a hoy) */
    if (key === selKey) col.classList.add('sel');
  }
}

function renderDiaryMeals(dateKey) {
  if (!dateKey) dateKey = _diaryViewKey || todayKey();
  _diaryViewKey = dateKey;
  /* Sincronizar la tira semanal (al venir del calendario quedaba marcado otro día) */
  document.querySelectorAll('.week-day-col').forEach(c => c.classList.toggle('sel', c.dataset.key === dateKey));
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
    items.forEach(it => { mKcal+=it.kcal||0; mP+=it.p||0; mC+=it.c||0; mG+=it.g||0; });
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
            <span class="dms-item-name">${esc(it.name)}</span>
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
    updateConsumedUI();
    saveState();
  }
}

function addToDiary(item, meal, silent) {
  if (!meal) meal = S.selectedMeal || 'desayuno';
  /* Agrega al día que se estaba viendo cuando se abrió el registro */
  const key = S.logDate || todayKey();
  const entry = getDayEntry(key);
  entry[meal].push({
    name: item.name,
    kcal: Math.round(item.kcal),
    p: Math.round(item.p * 10) / 10,
    c: Math.round(item.c * 10) / 10,
    g: Math.round(item.g * 10) / 10,
  });
  renderDiaryMeals(key);
  buildWeekStrip();
  updateConsumedUI();
  if (!silent) toast('✅ ' + item.name + ' añadido a ' + meal);
  saveState();
}

/* ── FOOD LOG OVERLAY ── */
function openFoodLog(meal) {
  try {
    if (!S.diary) S.diary = {};
    S.selectedMeal = meal || 'desayuno';
    S.logDate = _diaryViewKey || todayKey();
    const labels = { desayuno:'Desayuno', almuerzo:'Almuerzo', cena:'Cena', snacks:'Snacks' };
    const titleEl = document.getElementById('flog-title');
    if (titleEl) titleEl.textContent = 'Agregar a ' + (labels[S.selectedMeal] || 'Diario');
    const overlay = document.getElementById('flog-overlay');
    if (overlay) overlay.classList.add('open');
    switchFlogTab('buscar');   /* Buscar es más rápido para registrar que Recetas */
    buildRecipeGrid();
  } catch(e) {
    console.error('openFoodLog error:', e);
  }
}

function closeFoodLog() {
  try {
    const overlay = document.getElementById('flog-overlay');
    if (overlay) overlay.classList.remove('open');
    stopCamera();
    /* Olvidar el día apuntado: si no, una comida añadida luego desde el
       dashboard se registraría en el día pasado que se estaba viendo. */
    S.logDate = null;
  } catch(e) { /* ignore */ }
}

function switchFlogTab(tab) {
  document.querySelectorAll('.flog-tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.flog-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('ftab-' + tab)?.classList.add('active');
  document.getElementById('flt-' + tab)?.classList.add('active');
  try { if (tab !== 'escaner') stopCamera(); } catch(_) {}
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
  clearTimeout(_offTimer);
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
  /* OpenFoodFacts: miles de productos reales (la misma API del código de barras) */
  const willSearchOff = q.length >= 3;
  if (matches.length === 0) results.innerHTML =
    `<div class="dms-empty" id="fsearch-empty" style="padding:16px 4px">${willSearchOff ? 'Buscando en la base de datos…' : 'No se encontraron resultados'}</div>`;
  if (willSearchOff) _offTimer = setTimeout(() => searchOpenFoodFacts(q), 450);
}

/* ── Búsqueda en OpenFoodFacts (gratis, sin key) ── */
let _offResults = [], _offTimer = null, _offSeq = 0;

async function searchOpenFoodFacts(q) {
  const seq = ++_offSeq;
  try {
    const url = 'https://world.openfoodfacts.org/cgi/search.pl?action=process&json=1&page_size=8&search_simple=1' +
      '&fields=product_name,brands,nutriments&search_terms=' + encodeURIComponent(q);
    const res = await fetch(url);
    const data = await res.json();
    /* Ignorar respuestas tardías de búsquedas viejas */
    if (seq !== _offSeq) return;
    const inp = document.getElementById('fsearch-inp');
    if (!inp || inp.value.trim().toLowerCase() !== q) return;
    const results = document.getElementById('fsearch-results');
    if (!results) return;
    _offResults = (data.products || [])
      .filter(p => p.product_name && p.nutriments && (p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal']))
      .slice(0, 8)
      .map(p => ({
        name: p.product_name.slice(0, 60) + (p.brands ? ' · ' + String(p.brands).split(',')[0].slice(0, 20) : ''),
        kcal: Math.round(p.nutriments['energy-kcal_100g'] || p.nutriments['energy-kcal'] || 0),
        p: Math.round((p.nutriments.proteins_100g || 0) * 10) / 10,
        c: Math.round((p.nutriments.carbohydrates_100g || 0) * 10) / 10,
        g: Math.round((p.nutriments.fat_100g || 0) * 10) / 10,
        unit: '100g'
      }));
    const empty = document.getElementById('fsearch-empty');
    if (!_offResults.length) {
      if (empty) empty.textContent = 'No se encontraron resultados';
      return;
    }
    if (empty) empty.remove();
    results.insertAdjacentHTML('beforeend',
      '<div class="fsearch-src">🌐 Base de datos mundial · por 100g</div>' +
      _offResults.map((f, i) => `
    <div class="fsearch-row" onclick="selectFoodOFF(${i})">
      <div>
        <div class="fsearch-row-name">${esc(f.name)}</div>
        <div class="fsearch-row-macros">P${f.p}g · C${f.c}g · G${f.g}g · 100g</div>
      </div>
      <div class="fsearch-row-kcal">${f.kcal}kcal</div>
    </div>`).join(''));
  } catch(_) {
    const empty = document.getElementById('fsearch-empty');
    if (empty) empty.textContent = 'No se encontraron resultados';
  }
}

function selectFoodOFF(i) {
  const f = _offResults[i];
  if (!f) return;
  _selectedFoodItem = f;
  _fqtyGrams = 100;
  const panel = document.getElementById('fqty-panel');
  panel.style.display = 'block';
  document.getElementById('fqty-name').textContent = f.name;
  document.getElementById('fqty-unit').textContent = 'g';
  updateQtyDisplay();
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
let _barcodeLoop = null;
let _scannerResult = null;

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
    startBarcodeDetection();
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
    if (data.status !== 1 || !data.product) {
      toast('❌ Producto no encontrado');
      startBarcodeDetection();   /* reanudar el escaneo en vez de quedarse congelado */
      return;
    }
    const p = data.product;
    const n = p.nutriments || {};
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
        <span class="lista-match-name">${esc(item.name)}</span>
        <span class="lista-match-kcal">${item.kcal}kcal</span>
      </div>`;
    } else {
      /* esc(): el texto viene del usuario, sin escapar permitía inyectar HTML */
      return `<div class="lista-match-row"><span class="lista-no-match">"${esc(line)}" — no encontrado</span></div>`;
    }
  }).join('');

  results.innerHTML = html;
}

function addFoodFromList() {
  if (_listMatches.length === 0) { toast('✍️ No hay alimentos reconocidos'); return; }
  /* silent: evita un toast por cada alimento; se muestra uno solo con el total */
  _listMatches.forEach(item => addToDiary(item, S.selectedMeal, true));
  toast('✅ ' + _listMatches.length + (_listMatches.length === 1 ? ' alimento agregado' : ' alimentos agregados'));
  document.getElementById('lista-textarea').value = '';
  document.getElementById('lista-results').innerHTML = '';
  _listMatches = [];
  closeFoodLog();
}

/* ══════════════════════════════════════════
   MAIN SCANNER (pantalla completa, acceso directo desde nav)
══════════════════════════════════════════ */
let _mainScanStream = null;
let _flashTrack = null;

/* ── Estimador por porciones (método de la mano) ──
   Sin IA ni costo de servidor: el usuario usa su propia mano como medida
   (palma=proteína, puño=carbos, pulgar=grasas, cuenco=verduras) y toca lo
   que hay en su plato mirando la cámara. Valores estimados estándar. */
const PORTIONS = [
  { key:'prot',  hand:'🖐', label:'Proteína', ref:'1 palma',  kcal:120, p:22, c:0,  g:3 },
  { key:'carb',  hand:'✊', label:'Carbos',   ref:'1 puño',   kcal:150, p:4,  c:30, g:1 },
  { key:'veg',   hand:'🤲', label:'Verduras', ref:'1 cuenco', kcal:30,  p:2,  c:6,  g:0 },
  { key:'fruit', hand:'🍎', label:'Fruta',    ref:'1 puño',   kcal:70,  p:1,  c:17, g:0 },
  { key:'fat',   hand:'👍', label:'Grasas',   ref:'1 pulgar', kcal:100, p:0,  c:0,  g:11 },
  { key:'dairy', hand:'🥛', label:'Lácteos',  ref:'1 vaso',   kcal:110, p:8,  c:9,  g:5 },
];
/* Cantidad por porción (key -> nº de unidades), no una lista de toques:
   así "colocas" cuántas palmas/puños hay en el plato, con el valor en vivo,
   en vez de tocar a ciegas y perder la cuenta. */
let _portionCounts = {};

function openScanner() {
  const screen = document.getElementById('s-scanner');
  if (!screen) return;
  S.logDate = todayKey();
  _portionCounts = {};
  screen.style.opacity = '1';
  screen.style.pointerEvents = 'all';
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-scanner')?.classList.add('active');
  renderPortionGrid();
  renderPortionTally();
  startMainCamera();
}

function closeScanner() {
  stopMainScan();
  const screen = document.getElementById('s-scanner');
  if (screen) { screen.style.opacity = '0'; screen.style.pointerEvents = 'none'; }
  /* Restaurar tab anterior */
  const navEl = document.getElementById('nav-' + currentTab);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
}

async function startMainCamera() {
  const video = document.getElementById('main-scanner-video');
  if (!video) return;
  try {
    _mainScanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = _mainScanStream;
    _flashTrack = _mainScanStream.getVideoTracks()[0] || null;
  } catch(err) {
    /* Sin cámara el estimador igual sirve: la cámara es solo referencia visual */
    const g = document.getElementById('pz-guide');
    if (g) g.textContent = 'Estima con tu mano las porciones de tu plato';
  }
}

function stopMainScan() {
  if (_mainScanStream) {
    _mainScanStream.getTracks().forEach(t => t.stop());
    _mainScanStream = null;
  }
  _flashTrack = null;
}

function renderPortionGrid() {
  const g = document.getElementById('pz-grid');
  if (!g) return;
  g.innerHTML = PORTIONS.map(p => {
    const n = _portionCounts[p.key] || 0;
    return `<div class="pz-row${n ? ' pz-row-active' : ''}" id="pz-row-${p.key}">
       <span class="pz-hand">${p.hand}</span>
       <div class="pz-row-info">
         <span class="pz-lbl">${p.label}</span>
         <span class="pz-ref">${p.ref} · <b id="pz-kcal-${p.key}">${n * p.kcal}</b> kcal</span>
       </div>
       <div class="pz-stepper">
         <button class="pz-step" onclick="changePortion('${p.key}',-1)" aria-label="Quitar una porción de ${p.label}">−</button>
         <span class="pz-count" id="pz-count-${p.key}">${n}</span>
         <button class="pz-step" onclick="changePortion('${p.key}',1)" aria-label="Añadir una porción de ${p.label}">+</button>
       </div>
     </div>`;
  }).join('');
}

function _portionTotals() {
  return PORTIONS.reduce((a, p) => {
    const n = _portionCounts[p.key] || 0;
    return { kcal: a.kcal + n * p.kcal, p: a.p + n * p.p, c: a.c + n * p.c, g: a.g + n * p.g };
  }, { kcal: 0, p: 0, c: 0, g: 0 });
}

function _portionCount() { return Object.values(_portionCounts).reduce((a, n) => a + n, 0); }

function renderPortionTally() {
  const el = document.getElementById('pz-tally');
  if (!el) return;
  const total = _portionCount();
  if (!total) { el.innerHTML = '<span class="pz-empty">Ajusta cuántas porciones hay en tu plato</span>'; return; }
  const t = _portionTotals();
  el.innerHTML = `<div class="pz-total">${Math.round(t.kcal)} <span>kcal</span></div>
    <div class="pz-macros">${Math.round(t.p)}g P · ${Math.round(t.c)}g C · ${Math.round(t.g)}g G · ${total} ${total===1?'porción':'porciones'}</div>`;
}

function changePortion(key, delta) {
  const p = PORTIONS.find(x => x.key === key);
  if (!p) return;
  const n = Math.max(0, (_portionCounts[key] || 0) + delta);
  _portionCounts[key] = n;
  const countEl = document.getElementById('pz-count-' + key);
  const kcalEl  = document.getElementById('pz-kcal-' + key);
  const rowEl   = document.getElementById('pz-row-' + key);
  if (countEl) countEl.textContent = n;
  if (kcalEl)  kcalEl.textContent  = n * p.kcal;
  if (rowEl)   rowEl.classList.toggle('pz-row-active', n > 0);
  if (delta > 0 && navigator.vibrate) navigator.vibrate(8);
  renderPortionTally();
}

function resetPortions() {
  _portionCounts = {};
  renderPortionGrid();
  renderPortionTally();
}

function _currentMealSlot() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 16) return 'almuerzo';
  if (h < 21) return 'cena';
  return 'snacks';
}

function savePortionsToDiary() {
  if (!_portionCount()) { toast('Ajusta al menos una porción de tu plato'); return; }
  const t = _portionTotals();
  const name = PORTIONS.filter(p => _portionCounts[p.key] > 0)
    .map(p => { const n = _portionCounts[p.key]; return n > 1 ? `${n}× ${p.label}` : p.label; })
    .join(', ');
  addToDiary({
    name: 'Plato: ' + name,
    kcal: Math.round(t.kcal), p: Math.round(t.p), c: Math.round(t.c), g: Math.round(t.g)
  }, S.selectedMeal || _currentMealSlot());
  _portionCounts = {};
  toast('✅ Plato agregado al diario');
  closeScanner();
  goTab('diary');
}

function toggleFlash() {
  if (!_flashTrack) return;
  const capabilities = _flashTrack.getCapabilities();
  if (!capabilities.torch) { toast('⚡ Flash no disponible'); return; }
  const current = _flashTrack.getSettings().torch || false;
  _flashTrack.applyConstraints({ advanced: [{ torch: !current }] });
  document.getElementById('msc-flash').textContent = current ? '⚡' : '💡';
}

/* ── Init diary on app start (buildDiary ya integrado en goTab) ── */

/* ════════════════════════════════════════════════════════════
   EJERCICIOS — powered by exercises-gifs (omercotkd/exercises-gifs)
   ════════════════════════════════════════════════════════════ */

const EX_GIF_BASE = 'https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/assets/';
const EX_CSV_URL  = 'https://raw.githubusercontent.com/omercotkd/exercises-gifs/main/exercises.csv';

const EX_BODY_PARTS = [
  { key: 'all',        label: 'Todos' },
  { key: 'waist',      label: 'Abdomen' },
  { key: 'back',       label: 'Espalda' },
  { key: 'chest',      label: 'Pecho' },
  { key: 'upper legs', label: 'Piernas' },
  { key: 'shoulders',  label: 'Hombros' },
  { key: 'upper arms', label: 'Brazos' },
  { key: 'cardio',     label: 'Cardio' },
  { key: 'lower legs', label: 'Gemelos' },
  { key: 'lower arms', label: 'Antebrazos' },
];

let _exData    = null;
let _exLoading = false;
let _exFilter  = 'all';
let _exSearch  = '';
let _exPage    = 0;
const EX_PAGE  = 40;

/* Biblioteca curada por el dueño (admin.html → config/library).
   Si existe y tiene IDs, el cliente solo ve esos ejercicios; si no, ve todos. */
let _exCurated = null;
let _exCuratedLoaded = false;

async function _loadCuratedLibrary() {
  try {
    if (typeof fbDb === 'undefined' || !fbDb) return;
    const doc = await fbDb.collection('config').doc('library').get();
    if (doc.exists) {
      const ids = doc.data().exerciseIds || [];
      _exCurated = ids.length ? new Set(ids) : null;
    }
  } catch(e) {
    /* Sin curaduría disponible → mostrar todo */
  }
}


function _parseCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

/* ════════════════════════════════════════════════════════════
   TRADUCCIÓN ES — la librería viene en inglés.
   Músculo/equipo = vocabulario fijo (exacto). Nombres/instrucciones = glosario
   de frases (longest-match). Auto-traducción: buena, no perfecta.
   ════════════════════════════════════════════════════════════ */
const T_MUSCLE = {
  'abductors':'abductores','abs':'abdominales','adductors':'aductores','biceps':'bíceps',
  'calves':'gemelos','cardiovascular system':'sistema cardiovascular','delts':'deltoides',
  'forearms':'antebrazos','glutes':'glúteos','hamstrings':'isquiotibiales','lats':'dorsales',
  'levator scapulae':'elevador de la escápula','pectorals':'pectorales','quads':'cuádriceps',
  'serratus anterior':'serrato anterior','spine':'zona lumbar','traps':'trapecios',
  'triceps':'tríceps','upper back':'espalda alta'
};
const T_EQUIP = {
  'body weight':'peso corporal','barbell':'barra','dumbbell':'mancuerna','cable':'polea',
  'leverage machine':'máquina','smith machine':'multipower','kettlebell':'kettlebell',
  'band':'banda','resistance band':'banda elástica','stability ball':'pelota de estabilidad',
  'medicine ball':'balón medicinal','bosu ball':'bosu','ez barbell':'barra ez','olympic barbell':'barra olímpica',
  'weighted':'con peso','assisted':'asistido','sled machine':'máquina de trineo','hammer':'hammer',
  'rope':'cuerda','roller':'rodillo','wheel roller':'rueda abdominal','trap bar':'barra trap',
  'skierg machine':'skierg','stationary bike':'bicicleta estática','elliptical machine':'elíptica',
  'stepmill machine':'escaladora','upper body ergometer':'ergómetro de brazos','tire':'neumático'
};
/* Glosario para nombres e instrucciones (frase → es). Se ordena por longitud al usar. */
const T_GLOSSARY = [
  ['repeat for the desired number of repetitions','repite las repeticiones deseadas'],
  ['for the desired number of repetitions','las repeticiones que quieras'],
  ['return to the starting position','vuelve a la posición inicial'],
  ['to the starting position','a la posición inicial'],['starting position','posición inicial'],
  ['stand with your feet shoulder-width apart','ponte de pie con los pies al ancho de los hombros'],
  ['shoulder-width apart','al ancho de los hombros'],['shoulder-width','al ancho de los hombros'],
  ['lie flat on your back','túmbate boca arriba'],['lie on your back','túmbate boca arriba'],
  ['lie flat on a','túmbate en un'],['lie flat on','túmbate en'],['lie face down on a','túmbate boca abajo en un'],
  ['lie on a','túmbate en un'],['lie face down','túmbate boca abajo'],['plank position','posición de plancha'],
  ['pressed against','apoyada contra'],['slightly wider than','un poco más anchas que'],['wider than','más anchas que'],
  ['hang from a','cuélgate de una'],['hang from','cuélgate de'],['palms facing away from you','palmas hacia afuera'],
  ['facing away from you','mirando hacia afuera'],['facing forward','mirando al frente'],['facing','mirando'],
  ['off the ground','del suelo'],['off the floor','del suelo'],['off the','de la'],['together','juntos'],
  ['engaging','activando'],['slightly','ligeramente'],['high plank','plancha alta'],['for a moment','un momento'],
  ['feet flat on the ground','pies apoyados en el suelo'],['feet flat on the floor','pies apoyados en el suelo'],
  ['with your knees bent','con las rodillas flexionadas'],['place your hands behind your head','coloca las manos detrás de la cabeza'],
  ['keeping your back straight','manteniendo la espalda recta'],['keep your back straight','mantén la espalda recta'],
  ['engage your core','activa el core'],['pause for a moment','haz una pausa'],
  ['slowly lower','baja lentamente'],['slowly return','vuelve lentamente'],['slowly raise','eleva lentamente'],
  ['hold this position for','mantén esta posición durante'],['hold for','mantén durante'],['hold the','sujeta la'],
  ['repeat on the other side','repite del otro lado'],['repeat with the other','repite con el otro'],['on the other side','del otro lado'],
  ['with an overhand grip','con agarre prono'],['with an underhand grip','con agarre supino'],
  ['overhand grip','agarre prono'],['underhand grip','agarre supino'],['close grip','agarre cerrado'],['wide grip','agarre abierto'],
  ['until your arms are fully extended','hasta extender los brazos por completo'],['fully extended','del todo extendido'],
  ['extend your arms','extiende los brazos'],['bend your elbows','flexiona los codos'],
  ['push yourself back up','empújate de nuevo hacia arriba'],['push your body','empuja el cuerpo'],
  ['in front of you','frente a ti'],['parallel to the','paralelo al'],['perpendicular to','perpendicular a'],
  ['on the ground','en el suelo'],['on the floor','en el suelo'],['to the ground','al suelo'],['to the floor','al suelo'],
  ['bench press','press de banca'],['shoulder press','press de hombro'],['leg press','prensa'],['chest press','press de pecho'],
  ['lat pulldown','jalón al pecho'],['pulldown','jalón'],['pull-up','dominada'],['pull up','dominada'],['chin-up','dominada supina'],
  ['push-up','flexión'],['push up','flexión'],['calf raise','elevación de talones'],['lateral raise','elevación lateral'],
  ['front raise','elevación frontal'],['leg raise','elevación de piernas'],['leg extension','extensión de pierna'],
  ['leg curl','curl femoral'],['biceps curl','curl de bíceps'],['hammer curl','curl martillo'],['hip thrust','empuje de cadera'],
  ['romanian deadlift','peso muerto rumano'],['deadlift','peso muerto'],['good morning','buenos días'],
  ['your starting position','tu posición inicial'],['your chest','el pecho'],['your shoulders','los hombros'],
  ['your arms','los brazos'],['your legs','las piernas'],['your knees','las rodillas'],['your elbows','los codos'],
  ['your hips back','las caderas hacia atrás'],['your hips','las caderas'],['your core','el core'],['your back','la espalda'],['your head','la cabeza'],
  ['your hands','las manos'],['your feet','los pies'],['your body','el cuerpo'],['your glutes','los glúteos'],['your abs','los abdominales'],
  ['your thighs','los muslos'],['your thigh','el muslo'],['your heels','los talones'],['your toes','las puntas de los pies'],
  ['your wrists','las muñecas'],['your ankles','los tobillos'],['your waist','la cintura'],['your neck','el cuello'],['your palms','las palmas'],['your spine','la columna'],
  ['to return to','para volver a'],['to return','para volver'],['or','o'],
  ['start by','empieza'],['start in a','colócate en'],['stand with your feet','ponte de pie con los pies'],
  ['stand up','ponte de pie'],['sit on','siéntate en'],['lie on','túmbate en'],['grab the','agarra la'],['grasp the','agarra la'],
  ['barbell','barra'],['dumbbells','mancuernas'],['dumbbell','mancuerna'],['kettlebell','kettlebell'],
  ['cable','polea'],['machine','máquina'],['lever','máquina'],['smith','multipower'],['resistance band','banda elástica'],['band','banda'],
  /* frases de movimiento (mejor orden en nombres) */
  ['goblet squat','sentadilla goblet'],['front squat','sentadilla frontal'],['back squat','sentadilla trasera'],
  ['overhead press','press militar'],['military press','press militar'],['preacher curl','curl predicador'],
  ['concentration curl','curl concentrado'],['triceps extension','extensión de tríceps'],['tricep extension','extensión de tríceps'],
  ['seated row','remo sentado'],['upright row','remo al mentón'],['glute bridge','puente de glúteos'],['sit-up','abdominal'],['sit up','abdominal'],
  /* verbos comunes en instrucciones */
  ['holding a','sujetando una'],['holding','sujetando'],['keeping','manteniendo'],['lowering','bajando'],['raising','elevando'],
  ['lifting','levantando'],['bending','flexionando'],['pushing','empujando'],['pulling','tirando de'],['pressing','presionando'],
  ['squeezing','apretando'],['rotating','rotando'],['twisting','girando'],['reaching','alcanzando'],['contracting','contrayendo'],
  ['returning','volviendo'],['maintaining','manteniendo'],['stepping','dando un paso'],['sitting','sentándote'],['driving','impulsando'],
  ['swinging','balanceando'],['breathing','respirando'],['exhaling','exhalando'],['inhaling','inhalando'],['focusing on','enfocándote en'],
  /* sustantivos del cuerpo */
  ['thighs','muslos'],['thigh','muslo'],['heels','talones'],['heel','talón'],['toes','puntas de los pies'],['ankles','tobillos'],['ankle','tobillo'],
  ['wrists','muñecas'],['wrist','muñeca'],['waist','cintura'],['buttocks','glúteos'],['palms','palmas'],['palm','palma'],['fingers','dedos'],['neck','cuello'],['spine','columna'],
  /* conectores / adverbios */
  ['with both hands','con ambas manos'],['both hands','ambas manos'],['both','ambos'],['each side','cada lado'],['each','cada'],['opposite','opuesto'],
  ['vertically','verticalmente'],['horizontally','horizontalmente'],['comfortably go','cómodamente'],['comfortably','cómodamente'],
  ['controlled','controlado'],['upright','erguido'],['as low as you can','tan abajo como puedas'],['as high as you can','tan alto como puedas'],
  ['down into a','hasta una'],['into a','en una'],['into','en'],['onto','sobre'],['against your','contra tu'],['against','contra'],
  ['through your heels','con los talones'],['through your','con tu'],['through','a través de'],['away from','lejos de'],['away','lejos'],
  ['hips back','caderas hacia atrás'],['chest up','el pecho arriba'],['core engaged','el core activado'],['engaged','activado'],
  ['squat position','posición de sentadilla'],['down','abajo'],['up','arriba'],['over','sobre'],['during','durante'],['as you','mientras'],['as','como'],
  ['incline','inclinado'],['decline','declinado'],['seated','sentado'],['standing','de pie'],['lying','tumbado'],['kneeling','de rodillas'],
  ['single arm','a un brazo'],['one arm','a un brazo'],['single leg','a una pierna'],['one leg','a una pierna'],
  ['alternate','alterno'],['alternating','alternando'],['reverse','inverso'],['bent over','inclinado'],['bent-over','inclinado'],
  ['overhead','sobre la cabeza'],['behind the neck','tras la nuca'],['cross body','cruzado'],['close-grip','agarre cerrado'],['wide-grip','agarre abierto'],
  ['shoulders','hombros'],['shoulder','hombro'],['elbows','codos'],['elbow','codo'],['knees','rodillas'],['knee','rodilla'],
  ['hips','caderas'],['hip','cadera'],['chest','pecho'],['arms','brazos'],['legs','piernas'],['glutes','glúteos'],
  ['abs','abdominales'],['core','core'],['back straight','espalda recta'],['back','espalda'],['head','cabeza'],
  ['hands','manos'],['feet','pies'],['body','cuerpo'],['floor','suelo'],['ground','suelo'],['bench','banco'],['the bar','la barra'],
  ['extend','extiende'],['bend','flexiona'],['lower','baja'],['raise','eleva'],['lift','levanta'],['pull','tira de'],
  ['push','empuja'],['press','presiona'],['squeeze','aprieta'],['rotate','rota'],['twist','gira'],['reach','alcanza'],
  ['repeat','repite'],['return','vuelve'],['continue','continúa'],['maintain','mantén'],['keep','mantén'],['hold','mantén'],
  ['bring','lleva'],['move','mueve'],['place','coloca'],['position','posición'],['engage','activa'],['perform','realiza'],
  ['slowly','lentamente'],['straight','recto'],['forward','hacia adelante'],['backward','hacia atrás'],['upward','hacia arriba'],['downward','hacia abajo'],
  ['with your hands on the','con las manos en la'],['with your hands','con las manos'],
  ['assisted','asistida'],['set up','colócate'],['adjust','ajusta'],['settings','ajustes'],['desired','deseado'],
  ['a 45-degree angle','un ángulo de 45 grados'],['45-degree angle','ángulo de 45 grados'],['degree angle','grados'],['degrees','grados'],['degree','grados'],
  ['pressed firmly','apoyada firmemente'],['pressed against','apoyada contra'],['pressed','apoyada'],['firmly','firmemente'],
  ['in each hand','en cada mano'],['each hand','cada mano'],['one hand','una mano'],['hand','mano'],['height','altura'],['weight','peso'],
  ['at a','a un'],['at the','en el'],['an','un'],['in','en'],
  ['hold a dumbbell','sostén una mancuerna'],['hold a barbell','sostén una barra'],['holding a dumbbell','sujetando una mancuerna'],
  ['a dumbbell','una mancuerna'],['a barbell','una barra'],['a kettlebell','una kettlebell'],['a bench','un banco'],
  ['feet flat','pies apoyados'],['flat on','apoyados en'],['flat','apoyados'],['settings','ajustes'],['to','a'],
  ['back towards','de vuelta hacia'],['towards','hacia'],['using your','usando tu'],['onto the','sobre la'],['on the','en la'],
  ['by extending','extendiendo'],['by bending','flexionando'],['by pulling','tirando'],['by pushing','empujando'],['by rolling','rodando'],
  ['start','empieza'],['rolling','rodando'],
  ['reverse the movement','invierte el movimiento'],['the movement','el movimiento'],['movement','movimiento'],
  ['until','hasta que'],['while','mientras'],['then','luego'],['and','y'],['with','con'],['your','tu'],['the',''],
  ['are','están'],['is','está'],['be','estar'],['as you','mientras'],['a moment','un momento'],['for a','durante un'],
  ['seconds','segundos'],['repetitions','repeticiones'],['reps','repeticiones'],['the desired number of','el número deseado de'],
  ['at the top','arriba'],['at the bottom','abajo'],['top','arriba'],['bottom','abajo'],['squat','sentadilla'],['lunge','zancada'],
  ['row','remo'],['curl','curl'],['fly','aperturas'],['flyes','aperturas'],['crunch','crunch'],['plank','plancha'],
  ['dip','fondo'],['shrug','encogimiento'],['kickback','patada'],['pullover','pullover'],['stretch','estiramiento'],
  ['run','carrera'],['walk','caminata'],['jump','salto'],
  ['full range of motion','rango completo'],['range of motion','rango de movimiento'],
  ['wheel','rueda'],['exercise ball','pelota'],['v. 2','v.2'],['v. 3','v.3']
];
/* Una sola pasada con regex combinado (longest-match) → evita la cascada
   donde una traducción ("press de banca") vuelve a matchear otra regla ("press"). */
let _trBig = null, _trMap = null;
function _trCompile() {
  if (_trBig) return;
  const sorted = T_GLOSSARY.slice().sort((a, b) => b[0].length - a[0].length);
  _trMap = {};
  sorted.forEach(([en, es]) => { const k = en.toLowerCase(); if (!(k in _trMap)) _trMap[k] = es; });
  const alt = sorted.map(([en]) => en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  _trBig = new RegExp('\\b(' + alt + ')\\b', 'gi');
}
function esText(s) {
  if (!s) return s || '';
  _trCompile();
  let t = s.replace(_trBig, m => (m.toLowerCase() in _trMap) ? _trMap[m.toLowerCase()] : m);
  t = t.replace(/\s{2,}/g, ' ').replace(/\s+([.,;:])/g, '$1').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
/* equipo → preposición; orden largo→corto para no romper "barra olímpica"/"banda elástica" */
const T_EQ_PREP = [
  ['barra olímpica','con'],['barra ez','con'],['banda elástica','con'],['mancuernas','con'],['mancuerna','con'],
  ['kettlebell','con'],['banda','con'],['barra','con'],['multipower','en'],['máquina','en'],['polea','en']
];
function esName(s) {
  let t = esText(s).replace(/\s*\((male|female)\)\s*/gi, '').replace(/\s{2,}/g, ' ').trim();
  /* mueve el equipo al final con su preposición: "mancuerna sentadilla goblet" → "Sentadilla goblet con mancuerna" */
  for (const [eq, prep] of T_EQ_PREP) {
    const re = new RegExp('\\b' + eq + '\\b', 'i');
    if (re.test(t)) {
      t = t.replace(re, '').replace(/\s{2,}/g, ' ').trim();
      t = t + ' ' + prep + ' ' + eq;
      break;
    }
  }
  return t.charAt(0).toUpperCase() + t.slice(1).trim();
}

function _parseExerciseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = _parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = _parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => { row[h] = (vals[j] || '').trim(); });
    const steps = [];
    for (let k = 0; k <= 10; k++) {
      const s = row[`instructions/${k}`];
      if (s && s.trim()) steps.push(esText(s.trim()));
    }
    if (row['id'] && row['name']) {
      /* El id viene de un CSV de un TERCERO y se interpola en onclick/src.
         Saneado a [\w-] aquí (una vez) neutraliza inyección para todos los
         consumidores; los ids reales de la biblioteca son alfanuméricos. */
      rows.push({ id: String(row['id']).replace(/[^\w-]/g, ''), name: esName(row['name']),
                  bodyPart: row['bodyPart'],
                  target: T_MUSCLE[row['target'].toLowerCase()] || esText(row['target']),
                  equipment: T_EQUIP[row['equipment'].toLowerCase()] || esText(row['equipment']),
                  steps });
    }
  }
  return rows;
}

async function _loadExData() {
  if (_exData) return _exData;
  if (_exLoading) return null;
  _exLoading = true;
  try {
    const resp = await fetch(EX_CSV_URL);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const text = await resp.text();
    _exData = _parseExerciseCsv(text);
    return _exData;
  } catch(e) {
    console.error('exercises load error', e);
    return null;
  } finally {
    _exLoading = false;
  }
}

function _exFiltered() {
  if (!_exData) return [];
  let rows = _exData;
  if (_exCurated && _exCurated.size) rows = rows.filter(e => _exCurated.has(e.id));
  if (_exFilter !== 'all') rows = rows.filter(e => e.bodyPart === _exFilter);
  if (_exSearch.trim()) {
    const q = _exSearch.trim().toLowerCase();
    rows = rows.filter(e => e.name.toLowerCase().includes(q) || e.target.toLowerCase().includes(q));
  }
  return rows;
}

async function openExTab() {
  const grid = document.getElementById('ex-grid');
  const empty = document.getElementById('ex-empty');
  if (!grid) return;
  initBodyMap();
  /* Si el coach le asignó rutina, aterriza directo en "Mi rutina"; si no, en el mapa muscular */
  const hasAssigned = !!(S.training && Array.isArray(S.training.dias) && S.training.dias.length);
  exSetView(hasAssigned ? 'routines' : 'body');
  _buildExFilterChips();
  if (!_exData) {
    /* Skeletons con brillo en vez de spinner: la cuadrícula ya se ve "viva" */
    grid.innerHTML = Array.from({ length: 6 }, () =>
      '<div class="sk-ex-card"><div class="skeleton sk-gif"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line short"></div></div>'
    ).join('');
    if (empty) empty.style.display = 'none';
    await _loadExData();
  }
  if (!_exCuratedLoaded) { _exCuratedLoaded = true; await _loadCuratedLibrary(); }
  _exPage = 0;
  renderExercises();
}

/* ════════════════════════════════════════════════════════════
   MAPA MUSCULAR INTERACTIVO (body-front.png / body-back.png)
   Zonas en coordenadas naturales de cada imagen (front 616×1000, back 459×1000)
   ════════════════════════════════════════════════════════════ */
const BM_VIEWS = {
  front: { img: 'body-front.png?v=24', vb: '112 35 456 930', w: 456, h: 930, zones: [
    { bp:'shoulders',  label:'Hombros',    cx:235, cy:222, rx:32,  ry:28 },
    { bp:'shoulders',  label:'Hombros',    cx:445, cy:222, rx:32,  ry:28 },
    { bp:'chest',      label:'Pecho',      cx:340, cy:280, rx:76,  ry:46 },
    { bp:'upper arms', label:'Brazos',     cx:205, cy:368, rx:32,  ry:70 },
    { bp:'upper arms', label:'Brazos',     cx:475, cy:368, rx:32,  ry:70 },
    { bp:'lower arms', label:'Antebrazos', cx:162, cy:478, rx:30,  ry:70 },
    { bp:'lower arms', label:'Antebrazos', cx:518, cy:478, rx:30,  ry:70 },
    { bp:'waist',      label:'Abdomen',    cx:340, cy:380, rx:60,  ry:80 },
    { bp:'upper legs', label:'Piernas',    cx:288, cy:645, rx:42,  ry:110 },
    { bp:'upper legs', label:'Piernas',    cx:392, cy:645, rx:42,  ry:110 },
    { bp:'lower legs', label:'Gemelos',    cx:290, cy:855, rx:35,  ry:90 },
    { bp:'lower legs', label:'Gemelos',    cx:390, cy:855, rx:35,  ry:90 },
  ]},
  back: { img: 'body-back.png?v=20', vb: '112 35 456 930', w:456, h:930, zones: [
    { bp:'shoulders',  label:'Hombros',    cx:232, cy:220, rx:34,  ry:28 },
    { bp:'shoulders',  label:'Hombros',    cx:450, cy:220, rx:34,  ry:28 },
    { bp:'back',       label:'Espalda',    cx:340, cy:305, rx:82,  ry:80 },
    { bp:'upper arms', label:'Brazos',     cx:198, cy:368, rx:32,  ry:70 },
    { bp:'upper arms', label:'Brazos',     cx:482, cy:368, rx:32,  ry:70 },
    { bp:'lower arms', label:'Antebrazos', cx:160, cy:478, rx:29,  ry:70 },
    { bp:'lower arms', label:'Antebrazos', cx:520, cy:478, rx:29,  ry:70 },
    { bp:'upper legs', label:'Glúteos',    cx:340, cy:490, rx:78,  ry:50 },
    { bp:'upper legs', label:'Piernas',    cx:285, cy:650, rx:45,  ry:108 },
    { bp:'upper legs', label:'Piernas',    cx:392, cy:650, rx:45,  ry:108 },
    { bp:'lower legs', label:'Gemelos',    cx:287, cy:855, rx:35,  ry:88 },
    { bp:'lower legs', label:'Gemelos',    cx:394, cy:855, rx:35,  ry:88 },
  ]},
};
let _bmView = 'front';
let _bmSel = null;
let _bmBuilt = false;

function initBodyMap() { bmView(_bmView); }

/* Construye AMBAS vistas una sola vez (grupos <g>); el flip Frente/Espalda
   solo alterna visibilidad. Antes se reconstruía el SVG entero con innerHTML
   en cada flip y el PNG se re-decodificaba = corte visible. */
function _bmBuild(svg, stage) {
  if (_bmBuilt) return;
  _bmBuilt = true;
  stage.classList.add('skeleton');
  /* La imagen va DENTRO del SVG (coords naturales 0-680/0-1000) para que el
     viewBox recorte imagen y zonas juntas y queden siempre alineadas. */
  svg.innerHTML = Object.keys(BM_VIEWS).map(v => {
    const cfg = BM_VIEWS[v];
    return `<g id="bm-g-${v}" style="display:none">` +
      `<image href="${cfg.img}" x="0" y="0" width="680" height="1000"></image>` +
      cfg.zones.map(z =>
        `<ellipse class="bm-zone" cx="${z.cx}" cy="${z.cy}" rx="${z.rx}" ry="${z.ry}" data-bp="${z.bp}" onclick="selectMuscle('${z.bp}','${z.label}')"></ellipse>`
      ).join('') +
    '</g>';
  }).join('');
  /* Quitar el shimmer del stage cuando la imagen ya pintó (los PNG tienen
     fondo transparente: dejar el shimmer detrás se vería a través del cuerpo) */
  const img = svg.querySelector('#bm-g-front image');
  if (img) img.addEventListener('load', () => stage.classList.remove('skeleton'), { once: true });
  setTimeout(() => stage.classList.remove('skeleton'), 4000);
}

function bmView(view) {
  _bmView = view;
  const cfg = BM_VIEWS[view];
  const svg = document.getElementById('bm-svg');
  const stage = document.getElementById('bm-stage');
  if (!svg || !stage) return;
  _bmBuild(svg, stage);
  svg.setAttribute('viewBox', cfg.vb);
  stage.style.width = '';
  stage.style.aspectRatio = cfg.w + ' / ' + cfg.h;
  Object.keys(BM_VIEWS).forEach(v => {
    const g = document.getElementById('bm-g-' + v);
    if (g) g.style.display = (v === view) ? '' : 'none';
  });
  const bf = document.getElementById('bm-front'), bb = document.getElementById('bm-back');
  if (bf) bf.classList.toggle('active', view === 'front');
  if (bb) bb.classList.toggle('active', view === 'back');
  _bmSel = null;
  /* Con build-once los nodos sobreviven al flip: limpiar la selección previa */
  document.querySelectorAll('.bm-zone.active').forEach(z => z.classList.remove('active'));
  const hint = document.getElementById('bm-hint');
  if (hint) hint.innerHTML = 'Toca un músculo para ver sus ejercicios';
}

async function selectMuscle(bp, label) {
  _bmSel = { bp, label };
  document.querySelectorAll('.bm-zone').forEach(z => z.classList.toggle('active', z.dataset.bp === bp));
  if (!_exData) await _loadExData();
  if (!_exCuratedLoaded) { _exCuratedLoaded = true; await _loadCuratedLibrary(); }
  let pool = _exData || [];
  if (_exCurated && _exCurated.size) pool = pool.filter(e => _exCurated.has(e.id));
  const n = pool.filter(e => e.bodyPart === bp).length;
  const hint = document.getElementById('bm-hint');
  if (hint) hint.innerHTML =
    `<button onclick="goMuscleList()" style="background:var(--accent);color:#17130A;border:none;font-family:inherit;font-size:13px;font-weight:700;padding:10px 22px;border-radius:30px;cursor:pointer">Ver ${n} ejercicio${n===1?'':'s'} de ${label} →</button>`;
}

function goMuscleList() {
  if (!_bmSel) return;
  _exFilter = _bmSel.bp; _exSearch = ''; _exPage = 0;
  const inp = document.querySelector('.ex-search-inp'); if (inp) inp.value = '';
  exSetView('list');
  _buildExFilterChips();
  document.querySelectorAll('.ex-chip').forEach(c => c.classList.toggle('active', c.dataset.key === _bmSel.bp));
  renderExercises();
}

/* ── Drawer de secciones (menú hamburguesa) ── */
function openDrawer()  { const d = document.getElementById('drawer'); if (d) d.classList.add('open'); }
function closeDrawer() { const d = document.getElementById('drawer'); if (d) d.classList.remove('open'); }
function drawerGo(tab) { closeDrawer(); goTab(tab); }

/* ── Secciones: Entrenamiento (cuerpo) ↔ Nutrición ──
   La barra inferior es contextual; el menú ☰ cambia de sección. */
let currentSection = 'train';

function setSection(sec, tab) {
  currentSection = sec;
  const navTrain = document.getElementById('navbar-train');
  const navNutri = document.getElementById('navbar-nutri');
  if (navTrain) navTrain.style.display = sec === 'train' ? 'flex' : 'none';
  if (navNutri) navNutri.style.display = sec === 'nutri' ? 'flex' : 'none';
  if (tab) goTab(tab);
  else goTab(sec === 'train' ? 'ejercicios' : 'dash');
}
function drawerSection(sec) { closeDrawer(); setSection(sec); }
function drawerNutri(tab)   { closeDrawer(); setSection('nutri', tab); }

function exSetView(view) {
  const bv = document.getElementById('ex-bodyview');
  const lv = document.getElementById('ex-listview');
  const rv = document.getElementById('ex-routinesview');
  const cv = document.getElementById('ex-createview');
  if (bv) bv.style.display = view === 'body' ? 'flex' : 'none';
  if (lv) lv.style.display = view === 'list' ? 'flex' : 'none';
  if (rv) rv.style.display = view === 'routines' ? 'flex' : 'none';
  if (cv) cv.style.display = view === 'create' ? 'block' : 'none';
  const nb = document.getElementById('navt-body'),
        nr = document.getElementById('navt-routines'),
        nc = document.getElementById('navt-create');
  if (nb) nb.classList.toggle('active', view === 'body');
  if (nr) nr.classList.toggle('active', view === 'routines');
  if (nc) nc.classList.toggle('active', view === 'create');
  if (view === 'routines') openRoutines();
  if (view === 'create')   openCreate();
}

/* ════════════════════════════════════════════════════════════
   GENERADOR DE ENTRENAMIENTO (el cliente arma el suyo)
   ════════════════════════════════════════════════════════════ */
const ZONE_LABELS = [
  ['brazos','Brazos'], ['pecho','Pecho'], ['espalda','Espalda'], ['hombros','Hombros'],
  ['piernas','Piernas'], ['abdomen','Abdomen'], ['cardio','Cardio'], ['funcional','Funcional'], ['fullbody','Full body']
];
const ZONE_PARTS = {
  brazos:['upper arms','lower arms'], pecho:['chest'], espalda:['back'], hombros:['shoulders'],
  piernas:['upper legs','lower legs'], abdomen:['waist'], cardio:['cardio'],
  fullbody:['chest','back','upper legs','shoulders','upper arms','waist']
};
const FOCUS = {
  fuerza:      { label:'Fuerza',      sets:5, reps:'4-6'   },
  hipertrofia: { label:'Hipertrofia', sets:4, reps:'8-12'  },
  resistencia: { label:'Resistencia', sets:3, reps:'15-20' }
};
const DIF_COUNT = { principiante:4, intermedio:5, avanzado:6 };
let _crZona = null, _crEnfoque = 'hipertrofia', _crDif = 'intermedio', _crWorkout = null;

function openCreate() {
  const zw = document.getElementById('cr-zona');
  if (zw && !zw.dataset.built) {
    zw.dataset.built = '1';
    zw.innerHTML = ZONE_LABELS.map(([v,l]) => `<button class="rt-chip" data-v="${v}" onclick="setCrChip('zona','${v}',this)">${l}</button>`).join('');
    document.getElementById('cr-enfoque').innerHTML = Object.keys(FOCUS).map(k => `<button class="rt-chip${k===_crEnfoque?' active':''}" data-v="${k}" onclick="setCrChip('enfoque','${k}',this)">${FOCUS[k].label}</button>`).join('');
    document.getElementById('cr-dif').innerHTML = ['principiante','intermedio','avanzado'].map(k => `<button class="rt-chip${k===_crDif?' active':''}" data-v="${k}" onclick="setCrChip('dif','${k}',this)">${k[0].toUpperCase()+k.slice(1)}</button>`).join('');
  }
  /* Preferir la cuenta (sincronizado); localStorage solo como legacy */
  if (!_crWorkout) _crWorkout = S.miEntreno || null;
  if (!_crWorkout) { try { _crWorkout = JSON.parse(localStorage.getItem('np-mi-entreno') || 'null'); } catch(_) {} }
  if (_crWorkout) renderGenerated();
  _crUpdateZoneAvail();
}

/* Cuántos ejercicios hay para una zona (respeta la biblioteca curada) */
function _zoneCount(zone) {
  if (!_exData) return -1;
  let pool = (zone === 'funcional')
    ? _exData.filter(e => e.equipment === 'peso corporal')
    : _exData.filter(e => ZONE_PARTS[zone].includes(e.bodyPart));
  if (_exCurated && _exCurated.size) pool = pool.filter(e => _exCurated.has(e.id));
  return pool.length;
}
/* Deshabilita las zonas sin ejercicios disponibles */
async function _crUpdateZoneAvail() {
  if (!_exData) await _loadExData();
  if (!_exCuratedLoaded) { _exCuratedLoaded = true; await _loadCuratedLibrary(); }
  document.querySelectorAll('#cr-zona .rt-chip').forEach(c => {
    const dis = _zoneCount(c.dataset.v) === 0;
    c.disabled = dis;
    c.classList.toggle('cr-dis', dis);
    c.title = dis ? 'Sin ejercicios en tu biblioteca' : '';
    if (dis) { c.classList.remove('active'); if (_crZona === c.dataset.v) _crZona = null; }
  });
}

function setCrChip(group, val, el) {
  if (group === 'zona') _crZona = val;
  if (group === 'enfoque') _crEnfoque = val;
  if (group === 'dif') _crDif = val;
  el.parentElement.querySelectorAll('.rt-chip').forEach(c => c.classList.toggle('active', c === el));
}

async function generateWorkout() {
  if (!_crZona) { toast('Elige qué quieres entrenar'); return; }
  if (!_exData) await _loadExData();
  if (!_exCuratedLoaded) { _exCuratedLoaded = true; await _loadCuratedLibrary(); }
  let pool = (_crZona === 'funcional')
    ? _exData.filter(e => e.equipment === 'peso corporal')
    : _exData.filter(e => ZONE_PARTS[_crZona].includes(e.bodyPart));
  if (_exCurated && _exCurated.size) pool = pool.filter(e => _exCurated.has(e.id));
  const box = document.getElementById('cr-result');
  if (!pool.length) { box.innerHTML = '<div class="rt-note" style="margin-top:14px">No hay ejercicios para esa selección. Pídele a tu coach que amplíe la biblioteca.</div>'; return; }
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const cardio = _crZona === 'cardio';
  const f = FOCUS[_crEnfoque] || FOCUS.hipertrofia;
  const count = Math.min(DIF_COUNT[_crDif] || 5, pool.length);
  const ex = pool.slice(0, count).map(e => ({
    exId: e.id, nombre: e.name,
    sets: cardio ? 4 : f.sets,
    reps: cardio ? '40 seg' : f.reps
  }));
  const zlabel = ZONE_LABELS.find(z => z[0] === _crZona)[1];
  const dif = _crDif[0].toUpperCase() + _crDif.slice(1);
  _crWorkout = { titulo: cardio ? `${zlabel} · ${dif}` : `${zlabel} · ${f.label} · ${dif}`, ex };
  renderGenerated();
}

function renderGenerated() {
  const box = document.getElementById('cr-result');
  if (!box || !_crWorkout) return;
  box.innerHTML =
    `<div class="rt-day" style="margin-top:18px"><div class="rt-day-title">${_crWorkout.titulo}</div>` +
    _crWorkout.ex.map(n =>
      `<div class="rt-ex" onclick="openExDetail('${n.exId}')">
         <img class="rt-ex-gif" src="${EX_GIF_BASE}${n.exId}.gif" loading="lazy" alt="" onerror="this.outerHTML=&quot;<div class='rt-ex-gif rt-gif-fail'>🏋️</div>&quot;">
         <div class="rt-ex-info"><div class="rt-ex-name">${esc(n.nombre)}</div><div class="rt-ex-sets">${esc(String(n.sets))} series × ${esc(String(n.reps))}</div></div>
         <span class="rt-ex-arrow">›</span>
       </div>`).join('') + `</div>` +
    `<div style="display:flex;gap:8px;margin-top:14px">
       <button class="cr-gen" style="flex:1;margin:0" onclick="generateWorkout()">🔄 Otra variación</button>
       <button class="cr-gen cr-save" style="flex:1;margin:0" onclick="saveMyWorkout()">💾 Guardar</button>
     </div>`;
}

function saveMyWorkout() {
  if (!_crWorkout) return;
  /* A la cuenta (Firestore vía saveState), no solo a este teléfono */
  S.miEntreno = _crWorkout;
  saveState();
  try { localStorage.setItem('np-mi-entreno', JSON.stringify(_crWorkout)); } catch(_) {}
  toast('💾 Entrenamiento guardado en tu cuenta');
}

let _rtLevel = 'inicial';
let _rtInit = false;

function openRoutines() {
  const hasCustom = !!(S.training && Array.isArray(S.training.dias) && S.training.dias.length);
  _rtLevel = hasCustom ? '__mine__' : '__none__';
  if (hasCustom && !_exData) _loadExData().then(() => renderRoutine());
  renderRoutine();
}

/* Los textos del coach (nota, nombres de ejercicios) SÍ se escapan: viajan
   por Firestore y se renderizan en el cliente — nunca inyectar HTML ajeno */
function renderRoutine() {
  const box = document.getElementById('rt-body');
  if (!box) return;
  let title, meta, nota, dias;
  if (_rtLevel === '__mine__' && S.training && S.training.dias) {
    title = S.training.nombre || 'Mi rutina';
    meta = 'Asignada por tu coach';
    nota = S.training.nota; dias = S.training.dias;
  } else {
    /* Sin rutina asignada por el entrenador */
    box.innerHTML = `<div class="rt-empty">
        <div style="font-size:44px">🏋️</div>
        <div class="rt-name" style="margin-top:10px">Aún no tienes rutina</div>
        <div class="rt-meta" style="margin-top:4px">Tu entrenador te asignará una pronto.</div>
        <button class="cr-gen" style="max-width:280px;margin-top:20px" onclick="exSetView('create')">⚡ Crear mi propio entreno</button>
      </div>`;
    return;
  }
  const assigned = true;   /* lo que se muestra es siempre la rutina del coach */
  /* Normaliza cada ejercicio (array predefinido u objeto personalizado) */
  const norm = ex => Array.isArray(ex)
    ? { exId: ex[0], nombre: ex[1], line1: `${ex[2]} series × ${ex[3]}${ex[4] ? ' · ' + ex[4] + 's descanso' : ''}`, line2: '' }
    : { exId: ex.exId,
        nombre: (ex.exId && _exData && (_exData.find(e => e.id === ex.exId) || {}).name) || ex.nombre,
        line1: `${ex.sets || ''}${ex.sets ? ' sets' : ''}${ex.reps ? ' × ' + ex.reps : ''}${ex.tempo ? ' · TUT ' + ex.tempo : ''}`.replace(/^ × /, ''),
        line2: ex.nota || '' };
  const done = assigned ? _getTrainDone() : {};
  box.innerHTML =
    (assigned ? `<div style="background:var(--accent-l);border:1px solid rgba(244,199,90,.3);border-radius:10px;padding:9px 12px;font-size:12px;color:var(--accent-d);font-weight:600;margin:10px 0 2px">★ Asignada por tu coach — marca cada ejercicio al hacerlo${nota ? '. ' + esc(nota) : ''}</div>` : '') +
    `<div class="rt-head">
       <div class="rt-name">${title}</div>
       <div class="rt-meta">${meta}</div>
       ${(!assigned && nota) ? `<div class="rt-note">💡 ${esc(nota)}</div>` : ''}
     </div>` +
    dias.map((d, di) => {
      const exs = d.ex.map(norm);
      const dDone = assigned ? exs.filter((n, xi) => done[di + '-' + xi]).length : 0;
      return `<div class="rt-day">
         <div class="rt-day-title">${d.t}${assigned ? ` <span style="color:var(--accent-d);font-weight:700">· ${dDone}/${exs.length}</span>` : ''}</div>` +
         exs.map((n, xi) => {
           const key = di + '-' + xi;
           const isDone = assigned && !!done[key];
           return `<div class="rt-ex${isDone ? ' done' : ''}"${n.exId ? ` onclick="openExDetail('${n.exId}')"` : ''}>
              ${n.exId
                ? `<img class="rt-ex-gif" src="${EX_GIF_BASE}${n.exId}.gif" loading="lazy" alt="" onerror="this.outerHTML=&quot;<div class='rt-ex-gif rt-gif-fail'>🏋️</div>&quot;">`
                : `<div class="rt-ex-gif" style="display:flex;align-items:center;justify-content:center;font-size:22px">🏋️</div>`}
              <div class="rt-ex-info">
                <div class="rt-ex-name">${esc(n.nombre)}</div>
                <div class="rt-ex-sets">${esc(n.line1)}</div>
                ${n.line2 ? `<div style="font-size:11px;color:var(--mid);margin-top:2px">${esc(n.line2)}</div>` : ''}
              </div>
              ${assigned
                ? `<button class="rt-check${isDone ? ' on' : ''}" onclick="event.stopPropagation();toggleExDone('${key}')" title="Marcar como hecho">${isDone ? '✓' : ''}</button>`
                : (n.exId ? '<span class="rt-ex-arrow">›</span>' : '')}
            </div>`;
         }).join('') +
       `</div>`;
    }).join('');
}

/* ── Marcado de ejercicios hechos (Mi rutina) — por día, sincronizado a la nube ──
   Vive en S.trainDone {fecha:{key:1}} → saveState() lo guarda en localStorage y
   en Firestore (users/{uid}.trainDone), así no se pierde al cambiar de dispositivo
   y el entrenador puede verlo. fbAutoSync hidrata S.trainDone desde la nube. */
function _ensureTrainDone() {
  if (S.trainDone) return S.trainDone;
  /* migración del formato viejo (localStorage suelto) una sola vez */
  try { S.trainDone = JSON.parse(localStorage.getItem('np-train-done') || '{}'); }
  catch(_) { S.trainDone = {}; }
  return S.trainDone;
}
function _getTrainDone() {
  return _ensureTrainDone()[todayKey()] || {};
}
function toggleExDone(key) {
  const all = _ensureTrainDone();
  const day = all[todayKey()] || {};
  if (day[key]) delete day[key]; else day[key] = 1;
  all[todayKey()] = day;
  /* conserva ~60 días de historial (cubre meses de entrenamiento) */
  const keys = Object.keys(all).sort();
  while (keys.length > 60) delete all[keys.shift()];
  saveState();   /* persiste local + Firebase en un solo paso */
  if (_rtLevel === '__mine__') renderRoutine();
}

function _buildExFilterChips() {
  const wrap = document.getElementById('ex-filters');
  if (!wrap || wrap.dataset.built) return;
  wrap.dataset.built = '1';
  wrap.innerHTML = EX_BODY_PARTS.map(bp =>
    `<button class="ex-chip${bp.key === _exFilter ? ' active' : ''}" data-key="${bp.key}" onclick="setExFilter('${bp.key}')">${bp.label}</button>`
  ).join('');
}

function setExFilter(key) {
  _exFilter = key;
  _exPage = 0;
  document.querySelectorAll('.ex-chip').forEach(c => c.classList.toggle('active', c.dataset.key === key));
  renderExercises();
}

function exSearch(val) {
  _exSearch = val;
  _exPage = 0;
  renderExercises();
}

function renderExercises() {
  const grid = document.getElementById('ex-grid');
  if (!grid) return;
  if (!_exData) return;
  const all = _exFiltered();
  if (!all.length) {
    grid.innerHTML = '<div class="ex-empty-msg">Sin resultados</div>';
    return;
  }
  const show = all.slice(0, (_exPage + 1) * EX_PAGE);
  grid.innerHTML = show.map(e => `
    <div class="ex-card" onclick="openExDetail('${e.id}')">
      <div class="ex-gif-wrap">
        <img class="ex-gif" src="${EX_GIF_BASE}${e.id}.gif" alt="" loading="lazy" onerror="this.parentNode.classList.add('img-fail'); this.remove()">
      </div>
      <div class="ex-card-info">
        <div class="ex-card-name">${esc(e.name)}</div>
        <div class="ex-card-target">${esc(e.target)}</div>
      </div>
    </div>
  `).join('');
  if (show.length < all.length) {
    grid.insertAdjacentHTML('beforeend',
      `<div class="ex-load-more" onclick="loadMoreEx()">Ver más (${all.length - show.length} restantes)</div>`);
  }
}

function loadMoreEx() {
  _exPage++;
  renderExercises();
}

async function openExDetail(id) {
  if (!_exData) await _loadExData();
  const ex = _exData && _exData.find(e => e.id === id);
  if (!ex) return;
  const panel = document.getElementById('ex-detail-panel');
  if (!panel) return;
  document.getElementById('ex-detail-gif').src = EX_GIF_BASE + ex.id + '.gif';
  document.getElementById('ex-detail-name').textContent = ex.name;
  document.getElementById('ex-detail-meta').textContent =
    [ex.target, ex.equipment].filter(Boolean).join(' · ');
  document.getElementById('ex-detail-steps').innerHTML =
    ex.steps.map((s, i) => `<div class="ex-step"><span class="ex-step-num">${i+1}</span><span>${esc(s)}</span></div>`).join('');
  panel.classList.add('open');
}

function closeExDetail() {
  const panel = document.getElementById('ex-detail-panel');
  if (panel) panel.classList.remove('open');
}
