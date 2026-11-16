// Prueba de integración multiusuario contra el simulador: node tests/mock-backend.js & node tests/sync.test.js <BD.xlsx>
const { chromium } = require('playwright'); const assert = require('assert');
const U = 'http://localhost:8766', CID = 'test-client.apps.googleusercontent.com';
const jwt = (email, o = {}) => ['x', Buffer.from(JSON.stringify({ aud: CID, iss: 'https://accounts.google.com', email, email_verified: 'true', exp: Math.floor(Date.now() / 1000) + 3600, ...o })).toString('base64url'), o.sig || 'ok'].join('.');
const api = async (token, ops = [], since = 0) => (await fetch(U + '/exec', { method: 'POST', body: JSON.stringify({ token, ops, since }) })).json();
(async () => {
  const b = await chromium.launch();
  const sesion = async email => { const c = await b.newContext({ viewport: { width: 1300, height: 900 } }); const p = await c.newPage(); p.on('pageerror', e => console.log('PAGEERROR', email, e.message));
    await p.addInitScript(t => { window.google = { accounts: { id: { initialize(o) { this.cb = o.callback; }, renderButton() { }, prompt() { this.cb({ credential: t }); }, disableAutoSelect() { } } } }; }, jwt(email)); // sustituye al botón de Google
    await p.clock.setFixedTime(new Date('2026-11-12T07:55:00')); // fecha fija: la prueba no depende del día en que se ejecute
    await p.goto(U + '/#config'); return p; };
  const sincronizado = async p => { await p.waitForTimeout(300); await p.waitForFunction(() => /Sincronizado$/.test(document.querySelector('#sync').textContent.trim()) && JSON.parse(localStorage.getItem('sigutp:outbox') || '[]').length === 0, null, { timeout: 60000 }); };
  // 1. admin importa
  const A = await sesion('admin@colegio.test'); await sincronizado(A);
  await A.setInputFiles('input[type=file] >> nth=0', process.argv[2]); await A.waitForFunction(() => document.querySelector('#toast').textContent.match(/importada|cargada/), null, { timeout: 30000 });
  const t0 = Date.now(); await sincronizado(A); console.log('✓ admin importó y subió todo en', Date.now() - t0, 'ms');
  const hoja = await (await fetch(U + '/__sheet')).json(); console.log('  filas en planilla: bloques', hoja['08_Bloques_Docentes'].length - 1, 'funcionarios', hoja['04_Funcionarios'].length - 1, 'semanas', hoja['01_Semanas_Clases'].length - 1);
  assert(hoja['08_Bloques_Docentes'].length > 3000 && hoja['01_Semanas_Clases'].length > 40); assert(!JSON.stringify(hoja['04_Funcionarios']).match(/\d{1,2}\.\d{3}\.\d{3}-[\dkK]/), 'no debe haber RUT');
  // 2. editor recibe datos y registra ausencia
  const B = await sesion('editor@colegio.test'); await sincronizado(B); await B.goto(U + '/#hoy');
  await B.waitForSelector('[data-a=nueva-aus]'); await B.click('[data-a=nueva-aus]'); const docente = await B.evaluate((() => { const b = JSON.parse(localStorage.getItem('sigutp:t:bloques')), f = JSON.parse(localStorage.getItem('sigutp:t:funcionarios')), c = {}; for (const x of b) if (x.tipo === 'CLASE' && +x.dia === 4 && x.func_id) c[x.func_id] = (c[x.func_id] || 0) + 1; const id = Object.keys(c).sort((a, z) => c[z] - c[a])[0]; return f.find(x => x.id === id).nombre; })); await B.fill('#f_nombre', docente); await B.fill('#f_fecha', '2026-11-12'); await B.click('[data-a=guardar]');
  await B.waitForSelector('.afe'); await B.locator('.afe .chip.lime').first().click(); await sincronizado(B); console.log('✓ editor registró ausencia y reemplazo');
  // 3. admin la ve tras sincronizar
  await A.click('[data-a=sync]'); await sincronizado(A); await A.goto(U + '/#hoy'); await A.evaluate(() => { }); 
  await A.click('[data-a=fecha-hoy]'); const f = await A.evaluate(() => localStorage.getItem('sigutp:t:ausencias')); assert(f.includes(docente), 'admin debe recibir la ausencia'); console.log('✓ admin recibió la ausencia del editor');
  // 4. editor no ve controles de admin; lector no ve controles de edición
  await B.goto(U + '/#config'); assert.equal(await B.locator('input[type=file]').count(), 0);
  const C = await sesion('lector@colegio.test'); await sincronizado(C); await C.goto(U + '/#hoy'); await C.waitForSelector('.aus'); assert.equal(await C.locator('[data-a=nueva-aus]').count(), 0); assert.equal(await C.locator('.afe .chip').count(), 0); console.log('✓ lector: solo lectura en la interfaz');
  // 5. seguridad del servidor
  const r = async (n, p, code) => { const j = await p; assert.equal(j.code, code, n + ' → ' + JSON.stringify(j).slice(0, 120)); assert(!j.changes, n + ' no debe filtrar datos'); console.log('✓ rechazado:', n, `(${code})`); };
  await r('sin token', api(''), 401); await r('firma inválida', api(jwt('admin@colegio.test', { sig: 'mala' })), 401); await r('token de otra aplicación', api(jwt('admin@colegio.test', { aud: 'otra-app' })), 401);
  await r('token expirado', api(jwt('admin@colegio.test', { exp: 1 })), 401); await r('correo no verificado', api(jwt('admin@colegio.test', { email_verified: 'false' })), 401);
  await r('cuenta fuera de la lista', api(jwt('intruso@gmail.com')), 403); await r('lector intentando escribir', api(jwt('lector@colegio.test'), [{ t: 'eventos', id: 'X1', row: { titulo: 'x' } }]), 403);
  await r('editor modificando horarios', api(jwt('editor@colegio.test'), [{ t: 'bloques', id: 'X1', row: { tipo: 'CLASE' } }]), 403); await r('editor borrando semanas', api(jwt('editor@colegio.test'), [{ t: 'semanas', id: 'W2026-03-02', del: 1 }]), 403);
  await r('tabla inexistente (usuarios)', api(jwt('admin@colegio.test'), [{ t: 'usuarios', id: 'a', row: { email: 'intruso@gmail.com', rol: 'admin' } }]), 400);
  // 6. inyección de fórmulas y columnas desconocidas
  const j = await api(jwt('editor@colegio.test'), [{ t: 'eventos', id: 'EVF', row: { titulo: '=IMPORTXML("http://malo","//a")', fecha: '2026-11-13', jornada: 'MANANA', _rev: '999999', rol: 'admin' } }]); assert(j.ok);
  const h2 = await (await fetch(U + '/__sheet')).json(); const fila = h2['02_Eventos_Calendario'].find(x => x[0] === 'EVF'); assert(fila, 'fila escrita'); assert(Number(fila[h2['02_Eventos_Calendario'][0].indexOf('_rev')]) < 999999, '_rev lo fija el servidor');
  await api(jwt('editor@colegio.test'), [{ t: 'eventos', id: 'EV2', row: { titulo: 'normal', fecha: '2026-11-13', jornada: 'TARDE' } }]); // reescribe la hoja: el simulador lanza error si una fórmula quedara sin sanear
  console.log('✓ fórmulas neutralizadas y metadatos controlados por el servidor');
  // 7. XSS: el título malicioso llega a otro cliente y se muestra como texto
  await api(jwt('editor@colegio.test'), [{ t: 'eventos', id: 'EVX', row: { titulo: '<img src=x onerror="window.__xss=1">', fecha: '2026-11-12', jornada: 'MANANA', area: 'UTP' } }]);
  await A.goto(U + '/#config'); await A.click('[data-a=sync]'); await sincronizado(A); await A.goto(U + '/#hoy'); await A.click('[data-a=fecha-hoy]'); await A.waitForSelector('.ev'); await A.waitForTimeout(300);
  assert.equal(await A.evaluate(() => window.__xss), undefined); assert((await A.textContent('#view')).includes('<img src=x')); console.log('✓ XSS: contenido de otros usuarios se muestra escapado');
  // 8. cambio hecho directamente en la Hoja (a mano o desde otra herramienta): la app lo descarga sola
  await fetch(U + '/__externo'); await A.goto(U + '/#config'); await A.click('[data-a=sync]'); await A.waitForFunction(() => (localStorage.getItem('sigutp:t:eventos') || '').includes('Agregado directo en la Hoja'), null, { timeout: 30000 });
  console.log('✓ edición directa en la Hoja: la app detecta el cambio y descarga todo');
  await b.close(); console.log('\nTODO OK');
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
