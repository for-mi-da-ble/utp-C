// Planeación (Gantt): carga, vista, edición y llegada de cambios hechos fuera de la app (API de Sheets).
// Uso: node tests/mock-backend.js &  node tests/plan.test.js <Base_Unificada_con_10_Proyectos_y_11_Tareas.xlsx>
const { chromium } = require('playwright'); const assert = require('assert');
const U = 'http://localhost:8766', CID = 'test-client.apps.googleusercontent.com';
const jwt = email => ['x', Buffer.from(JSON.stringify({ aud: CID, iss: 'https://accounts.google.com', email, email_verified: 'true', exp: Math.floor(Date.now() / 1000) + 30 * 86400 })).toString('base64url'), 'ok'].join('.');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const sesion = async email => { const c = await b.newContext({ viewport: { width: 1440, height: 1000 } }); const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
    await p.addInitScript(t => { window.google = { accounts: { id: { initialize(o) { this.cb = o.callback; }, renderButton() { }, prompt() { this.cb({ credential: t }); }, disableAutoSelect() { } } } }; }, jwt(email));
    await p.clock.setFixedTime(new Date('2026-11-16T08:00:00')); await p.goto(U + '/#config'); return p; };
  const sincronizado = p => p.waitForFunction(() => /Sincronizado$/.test(document.querySelector('#sync').textContent.trim()), null, { timeout: 60000 });
  const A = await sesion('admin@colegio.test'); await sincronizado(A);
  await A.setInputFiles('input[type=file] >> nth=0', process.argv[2]); await A.waitForFunction(() => document.querySelector('#toast').textContent.includes('cargada'), null, { timeout: 30000 });
  assert(/\d+ proyectos, \d+ tareas/.test(await A.textContent('#toast')), 'la base debe traer proyectos y tareas'); await sincronizado(A);
  const hoja = await (await fetch(U + '/__sheet')).json(); assert(hoja.proyectos.length > 5 && hoja.tareas.length > 20, 'proyectos y tareas deben subir a la planilla'); console.log('✓ proyectos', hoja.proyectos.length - 1, 'y tareas', hoja.tareas.length - 1, 'en la planilla');
  await A.goto(U + '/#plan'); await A.waitForSelector('tr.gt'); const n0 = await A.locator('tr.gt').count(); assert(n0 > 10); console.log('✓ Gantt con', n0, 'tareas visibles');
  // editor crea una tarea desde la app
  const E = await sesion('editor@colegio.test'); await sincronizado(E); await E.goto(U + '/#plan'); await E.waitForSelector('tr.gp');
  await E.locator('[data-a=plan-tar-n][data-p]').first().click(); await E.fill('#f_titulo', 'Tarea del editor'); await E.fill('#f_inicio', '2026-11-23'); await E.fill('#f_fin', '2026-11-27'); await E.click('[data-a=guardar]'); assert.equal(await E.textContent('#toast'), 'Guardado'); await E.waitForTimeout(1500); await sincronizado(E);
  assert((await (await fetch(U + '/__sheet')).json()).tareas.some(r => r.includes('Tarea del editor'))); console.log('✓ el editor crea tareas y llegan a la planilla');
  // lector: sin botones de edición
  const C = await sesion('lector@colegio.test'); await sincronizado(C); await C.goto(U + '/#plan'); await C.waitForSelector('tr.gt'); assert.equal(await C.locator('[data-a=plan-tar-n]').count(), 0); console.log('✓ lector ve la Gantt sin poder editar');
  // escritura externa (como la haría un asistente por la API de Sheets) → sellarExternos → llega a la app
  await fetch(U + '/__externo', { method: 'POST', body: JSON.stringify({ t: 'tareas', row: { id: 'TA-EXT-1', proyecto_id: hoja.proyectos[1][0], titulo: 'Tarea escrita desde fuera', responsable: 'Esteban Aburto', inicio: '2026-11-24', fin: '2026-11-24', hito: 'NO', estado: 'PENDIENTE' } }) });
  const s = await (await fetch(U + '/__sellar')).json(); assert(s.triggers.includes('sellarExternos'), 'instalar() debe crear el disparador');
  await A.goto(U + '/#config'); await A.click('[data-a=sync]'); await A.waitForTimeout(800); await sincronizado(A); await A.goto(U + '/#plan'); await A.waitForSelector('tr.gt');
  assert(await A.locator('text=Tarea escrita desde fuera').count() > 0, 'la tarea externa debe aparecer en la Gantt'); console.log('✓ cambio externo sellado y recibido por la app');
  assert.deepEqual(errs, []); console.log('\nTODO OK'); await b.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
