/**
 * Imperium — proxy de cámara con IA (Cloudflare Worker)
 *
 * Recibe una foto del plato desde la app, valida que quien pide es un usuario
 * real de Firebase, aplica un límite diario por cliente, y llama a Claude
 * Vision con la API key guardada en secreto (nunca en el código de la app
 * pública). Devuelve una lista de alimentos detectados con gramos y macros.
 *
 * Variables de entorno requeridas (ver README.md de esta carpeta):
 *   - ANTHROPIC_API_KEY   (secret)  — wrangler secret put ANTHROPIC_API_KEY
 *   - FIREBASE_PROJECT_ID (var)     — "nutripro-4759a"
 *   - RATE_LIMIT_KV       (KV binding)
 */

import { jwtVerify, createRemoteJWKSet } from 'jose';

const FIREBASE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MODEL = 'claude-sonnet-5';
const DAILY_LIMIT = 20;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024; // ~6MB en base64, de sobra para una foto de 1024px comprimida

const ALLOWED_ORIGINS = new Set([
  'https://andress1934-rgb.github.io',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

/* ponytail: JWKS remoto se cachea solo, jose lo maneja internamente con las
   cabeceras Cache-Control de Google — no hace falta cachearlo nosotros. */
let jwks = null;
function getJwks() {
  if (!jwks) jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return jwks;
}

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin',
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function verifyFirebaseToken(authHeader, env) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
      audience: env.FIREBASE_PROJECT_ID,
    });
    if (!payload.sub) return null;
    return payload.sub; // uid
  } catch (e) {
    return null;
  }
}

/* ponytail: contador simple en KV (no Durable Objects) — una carrera rara
   deja pasar 1-2 fotos de más en un limite de 20/dia, aceptable a esta escala.
   Separado en leer/incrementar: se lee temprano (rechazo barato si ya no
   queda cupo) y se incrementa solo justo antes de llamar a Anthropic — así
   una imagen invalida o un cuerpo malformado (que nunca llega a costar nada)
   ya no gasta una foto del limite diario del cliente. */
async function getRateLimitStatus(uid, env) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${uid}:${day}`;
  const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
  return { key, current, allowed: current < DAILY_LIMIT };
}
async function incrementRateLimit(key, current, env) {
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 172800 }); // 2 dias de margen
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nombre del alimento en español, ej. "Arroz blanco" o "Encebollado de pescado"' },
          grams: { type: 'number', description: 'Gramos estimados de la porcion visible' },
          kcal: { type: 'number' },
          prot: { type: 'number', description: 'Proteina en gramos' },
          carbs: { type: 'number', description: 'Carbohidratos en gramos' },
          fat: { type: 'number', description: 'Grasa en gramos' },
        },
        required: ['name', 'grams', 'kcal', 'prot', 'carbs', 'fat'],
        additionalProperties: false,
      },
    },
    confidence_note: {
      type: 'string',
      description: 'Una frase corta en español avisando si la estimacion es incierta (poca luz, plato parcialmente fuera de cuadro, sin referencia de tamano, etc). Cadena vacia si no hay avisos.',
    },
  },
  required: ['items', 'confidence_note'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Eres un nutricionista analizando una foto de un plato de comida para una app de Ecuador. Identifica cada alimento por separado con su porcion estimada en gramos y sus macros (kcal, proteina, carbohidratos, grasa).

Reconoces platos ecuatorianos comunes: encebollado, bolon de verde, seco de pollo/chivo, menestra, llapingachos, ceviche, patacones, arroz con menestra y carne, caldo de bola, mote, guatita, entre otros — ademas de comida generica (arroz, pollo, ensaladas, frutas, etc).

Si hay un cubierto, mano, o plato de tamano estandar visible en la foto, usalo como referencia de escala. Si no hay ninguna referencia de tamano, dilo en confidence_note.

Nunca inventes alimentos que no se ven en la foto. Si la imagen no muestra comida real (esta vacia, borrosa, o es otra cosa), responde con items: [] y explica por que en confidence_note.`;

/* Error "seguro": su mensaje SÍ puede mostrarse al cliente tal cual.
   Cualquier otro error (fallo de red, detalle interno de la API de Anthropic,
   JSON malformado) se trata como NO seguro por defecto — ver el catch en
   el handler principal, que es el único lugar que decide qué llega al cliente. */
function safeError(msg) {
  const e = new Error(msg);
  e.safe = true;
  return e;
}

/* Los numeros que devuelve el modelo son datos NO confiables (input del
   propio modelo, que a su vez interpreta una imagen) — se acotan aqui, en la
   frontera del Worker, para que todo consumidor aguas abajo (el diario del
   cliente) reciba siempre valores finitos y en rango razonable de un plato. */
function clampNum(n, min, max) {
  n = Number(n);
  if (!Number.isFinite(n)) return min;
  return Math.min(Math.max(n, min), max);
}
function sanitizeResult(parsed) {
  const items = Array.isArray(parsed && parsed.items) ? parsed.items : [];
  return {
    items: items.slice(0, 20).map(it => ({
      name: String((it && it.name) || 'Alimento').slice(0, 80),
      grams: clampNum(it && it.grams, 0, 3000),
      kcal: clampNum(it && it.kcal, 0, 5000),
      prot: clampNum(it && it.prot, 0, 500),
      carbs: clampNum(it && it.carbs, 0, 800),
      fat: clampNum(it && it.fat, 0, 500),
    })),
    confidence_note: String((parsed && parsed.confidence_note) || '').slice(0, 300),
  };
}

async function callClaudeVision(base64Image, mediaType, env) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: 'Analiza este plato y devuelve los alimentos detectados.' },
        ],
      }],
      output_config: { format: { type: 'json_schema', schema: RESULT_SCHEMA } },
    }),
  });

  const body = await res.json();
  if (!res.ok) {
    console.error('Anthropic API error', res.status, body);
    throw new Error('anthropic_api_error');
  }
  if (body.stop_reason === 'refusal') {
    throw safeError('La IA no pudo analizar esta imagen (rechazada por seguridad).');
  }
  const textBlock = body.content.find(b => b.type === 'text');
  if (!textBlock) {
    console.error('Respuesta de Anthropic sin bloque de texto', body);
    throw new Error('no_text_block');
  }
  let parsed;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch (e) {
    console.error('JSON invalido de Anthropic', textBlock.text);
    throw new Error('invalid_json');
  }
  return sanitizeResult(parsed);
}

export { clampNum, sanitizeResult };

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Metodo no permitido' }, 405, origin);
    }

    const uid = await verifyFirebaseToken(request.headers.get('Authorization'), env);
    if (!uid) {
      return json({ error: 'No autenticado' }, 401, origin);
    }

    /* Lectura barata: rechaza temprano si ya no queda cupo, SIN gastar nada
       todavía — el incremento real pasa mas abajo, solo si la peticion es
       valida y realmente va a llegar a Anthropic (ver comentario en
       getRateLimitStatus/incrementRateLimit). */
    const rl = await getRateLimitStatus(uid, env);
    if (!rl.allowed) {
      return json({ error: `Llegaste al limite de ${DAILY_LIMIT} fotos por hoy. Usa el estimador por porciones mientras tanto.` }, 429, origin);
    }

    let payload;
    try {
      payload = await request.json();
    } catch (e) {
      return json({ error: 'Cuerpo invalido' }, 400, origin);
    }

    const { image, mediaType } = payload || {};
    if (!image || typeof image !== 'string') {
      return json({ error: 'Falta la imagen' }, 400, origin);
    }
    if (image.length > MAX_IMAGE_BYTES) {
      return json({ error: 'Imagen demasiado grande' }, 413, origin);
    }
    const safeMediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(mediaType) ? mediaType : 'image/jpeg';

    /* A partir de aqui la peticion es valida y SI va a llegar a Anthropic
       (costo real) — recien aqui se gasta la foto del limite diario. */
    await incrementRateLimit(rl.key, rl.current, env);

    try {
      const result = await callClaudeVision(image, safeMediaType, env);
      return json(result, 200, origin);
    } catch (e) {
      /* Unico punto de decision de que error es seguro mostrarle al cliente.
         Por defecto NUNCA se expone e.message (puede traer detalle interno
         de la API de Anthropic) — solo los errores marcados .safe (ver
         safeError arriba) tienen su mensaje pensado para el usuario final. */
      if (!e.safe) console.error('callClaudeVision error:', e);
      const msg = e.safe ? e.message : 'No se pudo analizar la foto. Intenta de nuevo o usa el estimador por porciones.';
      return json({ error: msg }, 502, origin);
    }
  },
};
