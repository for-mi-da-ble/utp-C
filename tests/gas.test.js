// Modo Apps Script (sin Google Cloud): la página "index" se sirve desde otro origen, carga la app desde el sitio
// estático y sincroniza con google.script.run; la identidad la da la sesión de Google.
// Uso: python3 tests/static-cors.py 8767 & node tests/mock-backend.js & node tests/gas.test.js <BD.xlsx> <carpeta>
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
const U = 'http://localhost:8766/gas.html';
(async () => {
  const [bd, out] = process.argv.slice(2), b = await chromium.launch();
  const abrir = async (email, hash = '#config') => { const c = await b.newContext({ acceptDownloads: true, viewport: { width: 1300, height: 900 } }), p = await c.newPage(); p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
    await p.clock.setFixedTime(new Date('2026-11-12T07:55:00')); await p.goto(`${U}?u=${encodeURIComponent(email)}${hash}`); return p; };
  const listo = async p => { await p.waitForTimeout(300); await p.waitForFunction(() => /Sincronizado$/.test(document.querySelector('#sync').textContent.trim()) && JSON.parse(localStorage.getItem('sigutp:outbox') || '[]').length === 0, null, { timeout: 60000 }); };
  const A = await abrir('admin@colegio.test'); await listo(A);
  assert(await A.locator('#login').isHidden(), 'sin pantalla de inicio de sesión'); assert(/Apps Script/.test(await A.textContent('#view')), 'conexión por Apps Script');
  await A.setInputFiles('input[type=file] >> nth=1', bd); await A.waitForFunction(() => /importada|cargada/.test(document.querySelector("#toast").textContent), null, { timeout: 30000 }); await listo(A);
  const hoja = await (await fetch('http://localhost:8766/__sheet')).json(); assert(hoja['08_Bloques_Docentes'].length > 3000); console.log('✓ admin (sesión de Google, sin token) cargó la base y quedó en la Hoja:', hoja['08_Bloques_Docentes'].length - 1, 'bloques');
  const [d1] = await Promise.all([A.waitForEvent('download'), A.click('[data-a=exportar]')]); await d1.saveAs(path.join(out, 'gas.xlsx'));
  await A.goto(U + '?u=admin%40colegio.test#semana'); await A.waitForSelector('[data-a=pdf]'); const [d2] = await Promise.all([A.waitForEvent('download'), A.click('[data-a=pdf]')]); await d2.saveAs(path.join(out, 'gas.pdf'));
  console.log('✓ Excel y PDF se generan cargando sus librerías desde el sitio publicado');
  for (const v of ['calendario', 'semana', 'hoy']) { await A.click(`#nav a[href="#${v}"]`); await A.waitForTimeout(200); assert(A.url().startsWith(U), 'el menú no debe salir de la página conectada: ' + A.url()); }
  assert(await A.evaluate(() => !!(window.google && google.script)), 'sigue en modo Apps Script'); console.log('✓ el menú navega dentro de la app conectada (no salta a GitHub Pages)');
  const E = await abrir('editor@colegio.test', '#hoy'); await listo(E); await E.click('[data-a=nueva-aus]'); await E.fill('#f_nombre', 'Profesor de reemplazo externo'); await E.click('[data-a=guardar]'); await listo(E);
  const h2 = await (await fetch('http://localhost:8766/__sheet')).json(); assert(JSON.stringify(h2['03_Ausencias_Reemplazos']).includes('Profesor de reemplazo externo')); console.log('✓ editor guardó una ausencia en la Hoja');
  const Lc = await abrir('lector@colegio.test', '#hoy'); await listo(Lc); assert.equal(await Lc.locator('[data-a=nueva-aus]').count(), 0); console.log('✓ lector: solo lectura');
  const X = await abrir('intruso@otro.cl', '#hoy'); await X.waitForFunction(() => /no está autorizada/.test(document.querySelector('#banner').textContent + document.querySelector('#sync').title), null, { timeout: 30000 }); console.log('✓ cuenta no registrada: rechazada');
  const rs = await (await fetch('http://localhost:8766/__respaldos')).json(); assert.equal(rs.length, 1, 'una copia al abrir (no una por cada apertura en menos de 2 días)'); console.log('✓ respaldo automático: 1 copia de la Hoja al abrir la app');
  await A.goto(U + '?u=admin%40colegio.test#config'); await listo(A); assert(/último respaldo automático/.test(await A.textContent('#view')), 'Ajustes muestra el último respaldo');
  for (const p of [A, E, Lc]) assert.deepEqual(p.errs, []); console.log('\nTODO OK'); await b.close();
})().catch(e => { console.error('FALLO:', e.message.slice(0, 400)); process.exit(1); });
