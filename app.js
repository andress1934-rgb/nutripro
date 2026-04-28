/* ══ STATE ══ */
let S = { nombre:'Atleta', peso:78.4, talla:178, edad:26, sexo:'m', act:1.55, obj:0, waterCount:6, waterMeta:12 };
let actVal = 1.55;
let currentTab = 'dash';

/* ══ NAVIGATION ══ */
function goScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.transform = '';
  });
  const el = document.getElementById(id);
  el.classList.add('active');
}

function goTab(tab) {
  const screens = { dash:'s-dash', macros:'s-macros', diary:'s-diary', settings:'s-settings' };
  const navIds  = { dash:'nav-dash', macros:'nav-macros', diary:'nav-diary', settings:'nav-settings' };

  Object.keys(screens).forEach(t => {
    const el = document.getElementById(screens[t]);
    if (el) { el.style.opacity='0'; el.style.pointerEvents='none'; el.style.transform='translateX(20px)'; }
    const nav = document.getElementById(navIds[t]);
    if (nav) nav.classList.remove('active');
  });

  const target = document.getElementById(screens[tab]);
  if (target) {
    target.style.opacity='1'; target.style.pointerEvents='all';
    target.style.transform='translateX(0)';
    target.style.transition='opacity .3s ease, transform .3s ease';
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
  s.style.opacity='1'; s.style.pointerEvents='all'; s.style.zIndex='20';
  s.style.transition='opacity .3s ease';
}

function closeFood() {
  const s = document.getElementById('s-food');
  s.style.opacity='0'; s.style.pointerEvents='none'; s.style.zIndex='1';
}

/* ══ ONBOARDING ══ */
function selChip(el) {
  document.querySelectorAll('.goal-chip').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
}

function selDiet(el) {
  document.querySelectorAll('.diet-card').forEach(c => c.classList.remove('sel'));
  el.classList.add('sel');
}

function selAct(el, val) {
  document.querySelectorAll('.act-pill').forEach(p => p.classList.remove('sel'));
  el.classList.add('sel');
  actVal = val;
}

function finishOnboarding() {
  S.nombre = document.getElementById('f-nombre').value.trim() || 'Atleta';
  S.peso   = +document.getElementById('f-peso').value   || 78.4;
  S.talla  = +document.getElementById('f-talla').value  || 178;
  S.edad   = +document.getElementById('f-edad').value   || 26;
  S.sexo   = document.getElementById('f-sexo').value;
  S.act    = actVal;
  calcMetrics();
  goScreen('s-app');
  goTab('dash');
  initWater();
  buildCalendar();
  buildKeyboard();
  setTimeout(animateMacroBars, 600);
}

/* ══ METRICS ══ */
function calcMetrics() {
  const { peso, talla, edad, sexo, act } = S;
  const bmr  = sexo==='m' ? 10*peso+6.25*talla-5*edad+5 : 10*peso+6.25*talla-5*edad-161;
  const tdee = Math.round(bmr * act);
  const prot = Math.round(peso * 2.2);
  const fat  = Math.round(peso * 1.0);
  const cho  = Math.max(0, Math.round((tdee - prot*4 - fat*9) / 4));
  const agua = +(peso * 0.035 + 0.5).toFixed(1);
  Object.assign(S, { tdee, prot, cho, fat, agua, waterMeta: Math.ceil(agua/0.25) });

  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('greet-name', S.nombre);
  set('prof-name',  S.nombre);
  set('prof-sub',   `${peso} kg · ${talla} cm · ${edad} años`);
  set('st-tdee',    tdee.toLocaleString());
  set('st-prot',   '2.2g');
  set('l-prot',    Math.round(prot*0.86)+'g');
  set('l-cho',     Math.round(cho*0.7)+'g');
  set('l-fat',     Math.round(fat*0.87)+'g');
  set('mn-prot',   Math.round(prot*0.86));
  set('mn-prot-meta', prot);
  set('mn-cho',    Math.round(cho*0.7));
  set('mn-cho-meta',  cho);
  set('mn-fat',    Math.round(fat*0.87));
  set('mn-fat-meta',  fat);
}

function animateMacroBars() {
  const pb = (id, pct) => { const el=document.getElementById(id); if(el) el.style.width=pct+'%'; };
  pb('pb-prot', 86);
  pb('pb-cho',  70);
  pb('pb-fat',  87);
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
      document.querySelectorAll('.wcup').forEach((c,j) => c.classList.toggle('full', j < waterFilled));
      updateWater();
      toast('💧 ' + (waterFilled*0.25).toFixed(2) + 'L registrados');
    };
    track.appendChild(d);
  }
  updateWater();
}

function updateWater() {
  const liters = (waterFilled*0.25).toFixed(1);
  const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('w-liters', liters+'L');
  set('st-agua',  liters+'L');
}

/* ══ CALENDAR ══ */
function buildCalendar() {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;
  grid.innerHTML = '';
  const today    = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).getDay();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate();
  const datadays = [2,5,8,10,12,15,17,19,22,24,26];
  for (let i=0; i<firstDay; i++) {
    const d=document.createElement('div'); d.className='cal-day other'; grid.appendChild(d);
  }
  for (let d=1; d<=daysInMonth; d++) {
    const el=document.createElement('div');
    el.className='cal-day'+(d===today.getDate()?' today':'')+(datadays.includes(d)?' has-data':'');
    el.textContent=d;
    el.onclick=()=>toast('📅 '+d+' seleccionado');
    grid.appendChild(el);
  }
}

/* ══ KEYBOARD ══ */
let kbText = '';
function buildKeyboard() {
  const rows=[['Q','W','E','R','T','Y','U','I','O','P'],['A','S','D','F','G','H','J','K','L']];
  const r1=document.getElementById('kb-row1');
  const r2=document.getElementById('kb-row2');
  if (!r1||!r2) return;
  r1.innerHTML=''; r2.innerHTML='';
  rows[0].forEach(k=>{const b=document.createElement('button');b.className='key-btn';b.textContent=k;b.onclick=()=>kbType(k);r1.appendChild(b);});
  rows[1].forEach(k=>{const b=document.createElement('button');b.className='key-btn';b.textContent=k;b.onclick=()=>kbType(k);r2.appendChild(b);});
}

function kbType(char, action) {
  if (action==='del') kbText=kbText.slice(0,-1); else kbText+=char;
  const d=document.getElementById('kb-display');
  if (d) d.textContent=kbText||'Buscar alimento...';
}

function kbSearch() {
  toast(kbText.trim() ? '🔍 Buscando "'+kbText.trim()+'"...' : '✍️ Escribe un alimento primero');
}

/* ══ CHAT ══ */
function openChat() {
  document.getElementById('chat-overlay').classList.add('open');
  const n=document.getElementById('nav-ai'); if(n) n.classList.add('active');
}

function closeChat() {
  document.getElementById('chat-overlay').classList.remove('open');
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const navEl=document.getElementById('nav-'+currentTab); if(navEl) navEl.classList.add('active');
}

document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('chat-overlay').addEventListener('click',function(e){ if(e.target===this) closeChat(); });
});

function timeStr(){ return new Date().toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); }

function addMsg(text, role) {
  const area=document.getElementById('chat-msgs');
  const w=document.createElement('div'); w.className='chat-bubble-wrap '+role;
  w.innerHTML=`<div class="chat-bub">${text.replace(/\n/g,'<br>')}</div><div class="chat-bub-time">${timeStr()}</div>`;
  area.appendChild(w); area.scrollTop=area.scrollHeight;
}

function addTyping() {
  const area=document.getElementById('chat-msgs');
  const t=document.createElement('div'); t.className='chat-bubble-wrap ai'; t.id='typing-msg';
  t.innerHTML='<div class="typing-bub"><div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div></div>';
  area.appendChild(t); area.scrollTop=area.scrollHeight;
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
  const t = q.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const n = S.nombre || 'atleta';
  const pe = S.peso || 78;
  const td = S.tdee || 2800;
  const pr = S.prot || Math.round(pe * 2.2);
  const ag = S.agua || +(pe * 0.035 + 0.5).toFixed(1);

  // TDEE / calorías
  if (/tdee|calorias|caloría|kcal|metabolismo|gasto/i.test(t))
    return `🔥 Tu TDEE es ~${td} kcal/día, ${n}. Es la energía total que tu cuerpo quema considerando tu actividad física.\n\nPara perder grasa necesitas ~${td-400} kcal. Para ganar músculo ~${td+300} kcal. Para mantener, quédate en ${td} kcal. ¡La consistencia es clave! 💪`;

  // Proteína
  if (/proteina|proteína|protein|aminoacido|whey/i.test(t))
    return `💪 Con tu peso de ${pe}kg necesitas ~${pr}g de proteína al día. Eso equivale a ${Math.round(pr/4)} comidas con ~25g de proteína cada una.\n\nFuentes top: pollo (31g/100g), atún (30g/100g), huevos (13g/100g), whey protein (25g/scoop), legumbres (20g/100g). La proteína preserva músculo y mantiene la saciedad. 🥩`;

  // Carbohidratos
  if (/carbo|carbohidrato|glucosa|glucogeno|arroz|avena|pasta/i.test(t))
    return `⚡ Los carbohidratos son tu combustible principal. Para tu nivel de actividad, te sugiero entre ${Math.round(pe*4)}–${Math.round(pe*6)}g/día.\n\nOpciones premium: arroz integral, avena, batata, plátano, quinoa. Úsalos estratégicamente: más carbos pre y post entrenamiento, menos en la noche. 🍚`;

  // Grasas
  if (/grasa|lipido|omega|aceite|aguacate|mantequilla/i.test(t))
    return `🥑 Las grasas saludables son esenciales para tus hormonas, absorción de vitaminas y salud cerebral. Meta: ~${Math.round(pe*1)}g/día.\n\nElige: aceite de oliva virgen, aguacate, nueces, salmón, sardinas. Evita grasas trans (comida ultraprocesada). Las grasas no engordan — el exceso calórico sí. 🧠`;

  // Agua / Hidratación
  if (/agua|hidrat|liquido|líquido|beber|sed/i.test(t))
    return `💧 Tu meta diaria es ${ag}L de agua, ${n}. Esto considera tu peso y nivel de actividad.\n\nTip: suma 500ml por cada hora de ejercicio intenso. La orina debe ser amarillo claro. La deshidratación del 2% ya reduce el rendimiento un 20%. ¡Hidratarse antes de tener sed! 🏃`;

  // Creatina
  if (/creatina|creatin/i.test(t))
    return `💊 La creatina monohidratada es el suplemento más respaldado por la ciencia. Beneficios: +10–15% en fuerza, mayor volumen de entrenamiento, recuperación más rápida.\n\nProtocolo: 3–5g/día (sin fase de carga necesaria). Tómala con carbohidratos para mejor absorción. Es segura a largo plazo y apta para vegetarianos. 🏋️`;

  // Post-entreno
  if (/post.?entreno|post.?workout|despues.*entrenar|recovery|recuperaci/i.test(t))
    return `🏃 La ventana post-entrenamiento es clave, ${n}. Idealmente en los primeros 30–60 min consume:\n\n• 30–40g de proteína (whey o pollo)\n• 60–80g de carbohidratos rápidos (plátano, arroz, avena)\n• Hidratación: 500ml + electrolitos\n\nEsto maximiza la síntesis proteica y repone glucógeno muscular. ⚡`;

  // Pre-entreno
  if (/pre.?entreno|pre.?workout|antes.*entrenar|energia.*entreno/i.test(t))
    return `⚡ El pre-entreno ideal depende de tu objetivo, ${n}. 1–2h antes consume:\n\n• 30–40g carbohidratos complejos (avena, pan integral)\n• 20–25g proteína (huevos, pollo, yogur griego)\n• Cafeína natural (café negro): 3–6mg/kg de peso\n\nEvita grasas en exceso antes de entrenar (retrasan la digestión). 🎯`;

  // Pérdida de grasa / déficit
  if (/perder|bajar.*peso|deficit|adelgaz|quemar.*grasa|grasa.*corporal/i.test(t))
    return `🎯 Para perder grasa manteniendo músculo, ${n}: déficit de 300–500 kcal/día (~${td-400} kcal).\n\nRegla de oro: alta proteína (${pr}g), entrenamiento de fuerza 3–4x/semana, cardio moderado. Pierde 0.5–1% de tu peso por semana máximo. Más rápido = pérdida de músculo. La paciencia es tu superpoder. 🔥`;

  // Ganar músculo
  if (/ganar.*musculo|músculo|hipertrofia|volumen|masa.*muscular|crecer/i.test(t))
    return `💪 Para ganar músculo de calidad, ${n}: superávit de 200–300 kcal (~${td+250} kcal/día).\n\nProtocolo: ${pr}g proteína, entrenamiento de fuerza progresivo, 7–9h de sueño. El músculo crece fuera del gym — el descanso es donde ocurre la magia. Espera 0.5–1kg de músculo/mes como máximo fisiológico. 🏆`;

  // Sueño / descanso
  if (/sueno|sueño|dormir|descanso|recover/i.test(t))
    return `😴 El sueño es el suplemento más barato y poderoso, ${n}. Durante las 7–9h de sueño se libera hormona de crecimiento, se repara tejido muscular y se regula cortisol.\n\nFalta de sueño = más hambre (grelina ↑), menos músculo, más grasa. Prioriza el sueño tanto como el entrenamiento. 🌙`;

  // Vitaminas / micronutrientes
  if (/vitamina|mineral|micronutri|hierro|calcio|magnesio|zinc|omega/i.test(t))
    return `🌿 Los micronutrientes son los directores de orquesta de tu metabolismo. Prioridades clave:\n\n• Vitamina D: 1000–2000 UI/día (pocos la tienen óptima)\n• Magnesio: 300–400mg (mejora sueño y fuerza)\n• Omega-3: 2–3g EPA+DHA (antiinflamatorio)\n• Zinc: 15–25mg (testosterona y sistema inmune)\n\nUna dieta variada y colorida cubre la mayoría. 🎨`;

  // Keto / low carb
  if (/keto|cetosis|low.?carb|cetogenica|ayuno/i.test(t))
    return `🥑 La dieta keto puede ser efectiva para pérdida de grasa e insulina estable. Restricción a <50g de carbos/día.\n\nAdaptación: 2–4 semanas de "keto flu". Requiere alta adherencia. No es superior en grasa perdida vs dietas isocalóricas, pero algunos la prefieren por control del apetito. ¿Tienes contexto específico sobre el que quieras saber? 🧠`;

  // Mediterránea
  if (/mediterrane|mediterráneo/i.test(t))
    return `🫒 La dieta mediterránea es una de las más respaldadas científicamente para salud a largo plazo. Base: aceite de oliva, vegetales, legumbres, pescado, frutos secos, cereales integrales.\n\nBeneficios: corazón sano, antiinflamatoria, sostenible culturalmente. Perfecta para rendimiento deportivo + longevidad. Es un estilo de vida, no una dieta. 🌊`;

  // Intermittent fasting / ayuno
  if (/ayuno|intermitente|fasting|16.?8|ventana/i.test(t))
    return `⏰ El ayuno intermitente (16:8 más común) puede ayudar a reducir ingesta calórica total sin contar calorías.\n\nNo es mágico: si comes mal en tu ventana, no funciona. Ventajas: mejora sensibilidad insulínica, simplifica la logística. Desventaja: puede reducir síntesis proteica si no hay proteína suficiente. Funciona mejor combinado con entrenamiento vespertino. 🎯`;

  // Suplementos generales
  if (/suplemento|supplement|bcaa|glutamina|beta.?alanina|cafeina|l-carnitina/i.test(t))
    return `💊 Jerarquía de suplementos con evidencia sólida para ti, ${n}:\n\n1. Creatina monohidratada (5g/día) — Nivel A\n2. Proteína en polvo (si no llegas a ${pr}g/día) — Nivel A\n3. Cafeína pre-entreno (3–5mg/kg) — Nivel A\n4. Vitamina D + Omega-3 — Nivel B\n5. Beta-alanina (carnosina, aguante) — Nivel B\n\nBCAA y glutamina: innecesarios si consumes proteína suficiente. 🧪`;

  // Plan nutricional
  if (/plan|dieta|menu|que.*comer|alimentacion|alimentación/i.test(t))
    return `📋 Tu plan base, ${n} (${td} kcal):\n\n🌅 Desayuno: Avena 60g + 3 huevos + fruta = ~500 kcal\n☀️ Almuerzo: Pollo 200g + arroz 150g + verduras = ~650 kcal\n⚡ Snack: Yogur griego + nueces = ~300 kcal\n🌙 Cena: Salmón 180g + batata 150g + ensalada = ~550 kcal\n\nAjusta porciones según tu objetivo. ¡La consistencia supera la perfección! 💪`;

  // IMC / peso ideal
  if (/imc|peso.*ideal|sobrepeso|obesidad|indice/i.test(t)) {
    const imc = +(pe / Math.pow((S.talla||175)/100, 2)).toFixed(1);
    let cat = imc < 18.5 ? 'bajo peso' : imc < 25 ? 'peso normal ✅' : imc < 30 ? 'sobrepeso' : 'obesidad';
    return `📊 Tu IMC es ${imc} (${cat}). Sin embargo, ${n}, el IMC no distingue músculo de grasa — un atleta puede tener IMC alto con muy baja grasa.\n\nMejor indicador: porcentaje de grasa corporal. Para hombres, óptimo deportivo: 10–15%. Para mujeres: 18–25%. La composición corporal > el número en la báscula. 🏋️`;
  }

  // Salud general / bienestar
  if (/salud|bienestar|habito|habito|rutina|estilo.*vida/i.test(t))
    return `🌟 Los pilares de salud óptima, ${n}:\n\n1. 💤 Sueño: 7–9h de calidad\n2. 🥗 Nutrición: alimentos reales, proteína suficiente\n3. 🏋️ Ejercicio: fuerza + cardio + movilidad\n4. 💧 Hidratación: ${ag}L/día\n5. 🧘 Gestión del estrés: cortisol alto destruye músculo\n\nNo hace falta ser perfecto. Un 80% de consistencia da el 95% de los resultados. ¡Tú puedes! 🚀`;

  // Saludo
  if (/hola|buenos|buenas|hello|hi|saludos|hey/i.test(t))
    return `¡Hola ${n}! 🌿 Soy NutriBot Pro, tu nutricionista IA.\n\nPuedo ayudarte con tus macros (tienes meta de ${pr}g proteína/día), tu TDEE de ${td} kcal, suplementación, planes de comida, hidratación y más.\n\n¿Qué quieres optimizar hoy? 💪`;

  // Gracias
  if (/gracias|thanks|genial|perfecto|excelente|chevere|chévere/i.test(t))
    return `¡De nada, ${n}! 🙌 Para eso estoy aquí. Recuerda: la nutrición es la base de todo rendimiento. Si tienes más dudas, ¡aquí estaré! 🌿 Sigue adelante, ¡lo estás haciendo genial! 🚀`;

  // Default inteligente
  return `🤔 Buena pregunta, ${n}. Tu perfil: ${pe}kg, ${td} kcal/día, meta de ${pr}g proteína.\n\nPuedo ayudarte con: macros, TDEE, proteínas, carbohidratos, grasas, agua, creatina, sueño, pérdida de grasa, ganancia muscular, suplementos, planes de comida y más.\n\n¿Sobre cuál tema quieres profundizar? 🎯`;
}

function quickChat(q) { document.getElementById('chat-inp').value = q; sendMsg(); }

/* ══ UI HELPERS ══ */
function selMgPill(el) {
  document.querySelectorAll('.mg-pill').forEach(p=>p.classList.remove('sel'));
  el.classList.add('sel');
  toast('⚖️ Protocolo actualizado: '+el.textContent);
}

function toast(msg) {
  const host=document.getElementById('toast-host');
  const pill=document.createElement('div'); pill.className='toast-pill'; pill.textContent=msg;
  host.appendChild(pill);
  setTimeout(()=>{ pill.style.animation='toastOut .25s ease forwards'; setTimeout(()=>pill.remove(),250); },2800);
}
