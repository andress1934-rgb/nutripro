// Autocheck minimo (sin framework) para la logica de seguridad del Worker:
// saneo de numeros de la IA + orden lectura/incremento del limite diario.
// Correr con: node test.mjs
import assert from 'node:assert/strict';
import { clampNum, sanitizeResult } from './src/index.js';

// clampNum: valores fuera de rango, no-numericos y ausentes caen al minimo
assert.equal(clampNum(50, 0, 100), 50);
assert.equal(clampNum(-5, 0, 100), 0);
assert.equal(clampNum(500, 0, 100), 100);
assert.equal(clampNum(NaN, 0, 100), 0);
assert.equal(clampNum(undefined, 0, 100), 0);
assert.equal(clampNum('abc', 0, 100), 0);
assert.equal(clampNum(Infinity, 0, 100), 0);  // no-finito -> min (tratado como "sin dato", no como techo)

// sanitizeResult: un item "malo" (negativo, NaN, string, undefined, enorme)
// no debe explotar ni pasar sin acotar al diario del cliente
const r = sanitizeResult({
  items: [
    { name: 'Arroz', grams: 180, kcal: 234, prot: 4.3, carbs: 51, fat: 0.4 },
    { name: 'Malo', grams: -50, kcal: 999999, prot: NaN, carbs: 'x', fat: undefined },
  ],
  confidence_note: 'ok',
});
assert.equal(r.items.length, 2);
assert.equal(r.items[0].grams, 180);
assert.equal(r.items[1].grams, 0);    // negativo -> 0
assert.equal(r.items[1].kcal, 5000);  // techo
assert.equal(r.items[1].prot, 0);     // NaN -> 0
assert.equal(r.items[1].carbs, 0);    // string no numerico -> 0
assert.equal(r.items[1].fat, 0);      // undefined -> 0

// items ausente/no-array o confidence_note null -> vacio, no explota
const r2 = sanitizeResult({ items: 'no-es-array', confidence_note: null });
assert.equal(r2.items.length, 0);
assert.equal(r2.confidence_note, '');

// mas de 20 items -> se recorta (limite de sanidad ante una respuesta rara)
const many = { items: Array.from({ length: 30 }, (_, i) => ({ name: 'x' + i, grams: 1, kcal: 1, prot: 1, carbs: 1, fat: 1 })) };
assert.equal(sanitizeResult(many).items.length, 20);

console.log('worker self-check: OK');
