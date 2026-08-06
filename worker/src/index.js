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
   deja pasar 1-2 fotos de más en un limite de 20/dia, aceptable a esta escala. */
async function checkAndIncrementRateLimit(uid, env) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `rl:${uid}:${day}`;
  const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0', 10);
  if (current >= DAILY_LIMIT) return false;
  await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 172800 }); // 2 dias de margen
  return true;
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
    throw new Error(`Anthropic API ${res.status}: ${body?.error?.message || 'error desconocido'}`);
  }
  if (body.stop_reason === 'refusal') {
    throw new Error('La IA no pudo analizar esta imagen (rechazada por seguridad).');
  }
  const textBlock = body.content.find(b => b.type === 'text');
  if (!textBlock) throw new Error('Respuesta sin contenido de texto.');
  return JSON.parse(textBlock.text);
}

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

    const allowed = await checkAndIncrementRateLimit(uid, env);
    if (!allowed) {
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

    try {
      const result = await callClaudeVision(image, safeMediaType, env);
      return json(result, 200, origin);
    } catch (e) {
      return json({ error: e.message || 'Error analizando la imagen' }, 502, origin);
    }
  },
};
