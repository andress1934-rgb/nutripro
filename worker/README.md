# Cámara IA — proxy de Cloudflare Worker

Este mini-servidor recibe la foto del plato desde la app, verifica que quien
pide es un cliente real de Imperium (Firebase), aplica un límite de 20
fotos/día por cliente, y llama a Claude Vision con la API key guardada en
secreto — la key **nunca** va en el código público de GitHub Pages.

## Requisitos

- Cuenta de Cloudflare (gratis) — https://dash.cloudflare.com/sign-up
- Node.js (ya lo tienes instalado)
- Tu API key de Anthropic (la pegas en el paso 4, nunca en un archivo)

## Pasos para desplegar

Todos los comandos se corren **dentro de la carpeta `worker/`**:

```bash
cd worker
npm install
```

### 1. Iniciar sesión en Cloudflare

```bash
npx wrangler login
```

Abre el navegador, inicia sesión o crea la cuenta gratis, y autoriza.

### 2. Crear el namespace de KV (para el límite de 20 fotos/día)

```bash
npx wrangler kv namespace create RATE_LIMIT_KV
```

Copia el `id` que imprime y pégalo en `wrangler.toml`, reemplazando
`PENDIENTE_PEGAR_AQUI`.

### 3. Guardar tu API key de Anthropic como secreto

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

Te va a pedir que pegues la key — pégala y Enter. Queda cifrada en
Cloudflare, nunca en un archivo del repo.

### 4. Desplegar

```bash
npx wrangler deploy
```

Al terminar imprime una URL como:
`https://imperium-camera-ia.<tu-usuario>.workers.dev`

**Copia esa URL** — la necesito para conectarla en `app.js`
(`CAMERA_WORKER_URL`).

## Verificar que funciona

```bash
curl -i https://imperium-camera-ia.<tu-usuario>.workers.dev -X POST
```

Debería responder `401 No autenticado` (correcto — sin token de Firebase no
deja pasar). Si responde otra cosa, avísame.

## Costos

- Cloudflare Workers: gratis hasta 100,000 peticiones/día — muy por encima de
  lo que vas a usar.
- Claude API (Sonnet con visión): ~$0.01 (1 centavo) por foto analizada.
  Con 20 fotos/día/cliente de tope, el gasto máximo por cliente es de
  ~$0.20/día si lo usara al límite todos los días — en la práctica va a ser
  mucho menos.

## Ajustar el límite diario

Editar `DAILY_LIMIT` en `src/index.js` y volver a correr `npx wrangler deploy`.
