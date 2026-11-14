// Modo edición, cumpleaños y PDF. Uso: node tests/semana.test.js <Base_Unificada.xlsx> <carpeta salida>
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
(async () => {
  const [base, out] = process.argv.slice(2), U = 'http://localhost:8765';
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  await p.clock.setFixedTime(new Date('2026-11-12T07:55:00')); await p.goto(U + '/#config');
  await p.setInputFiles('input[type=file] >> nth=0', base); await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Base unificada cargada'), null, { timeout: 30000 });
  const evs = () => p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos'))); const n0 = (await evs()).length;
  await p.goto(U + '/#semana'); await p.waitForSelector('.ev'); assert.equal(await p.locator('.evt').count(), 0, 'sin controles fuera del modo edición');
  assert(await p.locator('.semana .ev .evh').count() > 0, 'horario en línea propia'); const box = async s => (await p.locator(s).first().boundingBox()); const h = await box('.semana .ev:has(.evh) .evh'), t = await box('.semana .ev:has(.evh) b'); assert(t.y >= h.y + h.height - 1, 'el título va debajo del horario'); console.log('✓ horario en una línea distinta al nombre');
  await p.click('[data-a=modo-edit]'); await p.waitForSelector('.evt'); console.log('✓ modo edición:', await p.locator('.semana .evt').count(), 'actividades con controles ·', await p.locator('.ev.dup').count(), 'posibles duplicados marcados'); await p.screenshot({ path: path.join(out, 'edicion.png'), fullPage: true });
  // eliminar con un clic + deshacer
  const id = await p.locator(await p.locator('.semana .ev.dup').count() ? '.semana .ev.dup' : '.semana .ev').first().getAttribute('data-id'); await p.locator(`.ev[data-id="${id}"] [data-a=ev-del]`).click(); await p.waitForTimeout(150); assert.equal((await evs()).length, n0 - 1); assert.equal(await p.locator('.modal').count(), 0, 'eliminar no abre ventana');
  await p.click('#toast [data-a=deshacer]'); await p.waitForTimeout(150); assert.equal((await evs()).length, n0); console.log('✓ eliminar con un clic y deshacer');
  await p.locator(`.ev[data-id="${id}"] [data-a=ev-del]`).click(); await p.waitForTimeout(100);
  // mover de día y de jornada con un clic
  const id2 = await p.locator('[data-drop="sec:2026-11-10:ESTUDIANTES"] .ev').first().getAttribute('data-id'), ev = async i => (await evs()).find(e => e.id === i);
  await p.locator(`.ev[data-id="${id2}"] [data-a=ev-mv][data-n="1"]`).click(); await p.waitForTimeout(120); assert.equal((await ev(id2)).fecha, '2026-11-11');
  await p.locator(`.ev[data-id="${id2}"] [data-c=ev-sec]`).selectOption('EXTERNAS'); await p.waitForTimeout(120); assert.equal((await ev(id2)).seccion, 'EXTERNAS'); console.log('✓ mover de día y de sección con un clic');
  await p.locator(`.ev[data-id="${id2}"] .evt [data-a=edit-ev]`).click(); await p.waitForSelector('.modal #f_titulo'); await p.fill('#f_titulo', 'Título corregido'); await p.click('[data-a=guardar]'); await p.waitForTimeout(120); assert.equal((await ev(id2)).titulo, 'Título corregido'); console.log('✓ editar desde el modo edición');
  await p.click('[data-a=modo-edit]'); await p.waitForTimeout(100); assert.equal(await p.locator('.evt').count(), 0);
  // editor de detalle: subsección + línea con hora, curso, actividad y lugar
  await p.locator('[data-drop="sec:2026-11-12:ESTUDIANTES"] [data-a=nuevo-ev]').click(); await p.fill('#f_titulo', 'Feria científica');
  await p.click('[data-a=det-add][data-t=sub]'); await p.locator('.drow.dsubrow input').last().fill('E. Media');
  await p.click('[data-a=det-add][data-t=item]'); const r = p.locator('.drow:not(.dsubrow)').last(); await r.locator('[data-f=hora]').fill('10:00'); await r.locator('[data-f=curso]').fill('3° Medio A'); await r.locator('[data-f=act]').fill('Presentación'); await r.locator('[data-f=lugar]').fill('Gimnasio');
  await p.click('[data-a=det-add][data-t=sub]'); await p.locator('.drow.dsubrow input').last().fill('1° Ciclo');
  await p.click('[data-a=det-add][data-t=item]'); const r2 = p.locator('.drow:not(.dsubrow)').last(); await r2.locator('[data-f=hora]').fill('11:30'); await r2.locator('[data-f=curso]').fill('4° Básico B'); await r2.locator('[data-f=lugar]').fill('Biblioteca');
  await p.click('[data-a=guardar]'); await p.waitForTimeout(150);
  const fe = (await evs()).find(e => e.titulo === 'Feria científica'); assert.equal(fe.detalle, '== E. Media\n10:00 | 3° Medio A | Presentación | Gimnasio\n== 1° Ciclo\n11:30 | 4° Básico B |  | Biblioteca', fe.detalle);
  const bfe = p.locator('.ev', { hasText: 'Feria científica' }); assert.equal(await bfe.locator('.dsub').count(), 2); const its = await bfe.locator('.dit').allTextContents(); assert.deepEqual(its, ['10:00 3° Medio A · Presentación (Gimnasio)', '11:30 4° Básico B (Biblioteca)'], its.join('|'));
  console.log('✓ editor de detalle: subsecciones con línea punteada; lugar entre paréntesis →', its.join(' / '));
  await bfe.click(); await p.waitForSelector('.drow'); assert.equal(await p.locator('.drow').count(), 4, 'al reabrir se cargan las filas'); await p.keyboard.press('Escape');
  // cumpleaños
  const docente = await p.evaluate((() => { const b = JSON.parse(localStorage.getItem('sigutp:t:bloques')), f = JSON.parse(localStorage.getItem('sigutp:t:funcionarios')), c = {}; for (const x of b) if (x.tipo === 'CLASE' && +x.dia === 4 && x.func_id) c[x.func_id] = (c[x.func_id] || 0) + 1; const id = Object.keys(c).sort((a, z) => c[z] - c[a])[0]; return f.find(x => x.id === id).nombre; }));
  for (const [n, d] of [[docente, 11], ['María Externa (asistente)', 14]]) { await p.locator('[data-a=edit-cum][data-id=""]').first().click(); await p.fill('#f_nombre', n); await p.fill('#f_dia', String(d)); await p.selectOption('#f_mes', '11'); await p.click('[data-a=guardar]'); await p.waitForTimeout(120); }
  assert(await p.locator('.ev.k-cum .cumn', { hasText: docente.split(' ')[0] }).count() >= 1); assert(await p.locator('.ev.k-cum .cumn', { hasText: 'María Externa' }).count() === 1); console.log('✓ cumpleaños en burbuja naranja:', (await p.locator('.ev.k-cum .cumn').allTextContents()).join(' | '));
  await p.click('[data-a=boletin]'); assert((await p.inputValue('.mono')).includes('¡FELIZ CUMPLEAÑOS!')); await p.keyboard.press('Escape');
  await p.screenshot({ path: path.join(out, 'semana-final.png'), fullPage: true });
  // PDF
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-a=pdf]')]); const f = path.join(out, dl.suggestedFilename()); await dl.saveAs(f); console.log('✓ PDF descargado:', dl.suggestedFilename());
  // semana sin eventos también debe generar PDF
  await p.goto(U + '/#semana'); for (let i = 0; i < 6; i++) await p.click('[data-a=fecha][data-n="7"]'); const [d2] = await Promise.all([p.waitForEvent('download'), p.click('[data-a=pdf]')]); await d2.saveAs(path.join(out, 'vacia.pdf')); console.log('✓ PDF de semana futura:', d2.suggestedFilename());
  // respaldo incluye cumpleaños
  await p.goto(U + '/#config'); const [d3] = await Promise.all([p.waitForEvent('download'), p.click('[data-a=exportar]')]); await d3.saveAs(path.join(out, 'base.xlsx'));
  assert.deepEqual(errs, []); console.log('✓ sin errores JS\n\nTODO OK'); await b.close();
})().catch(e => { console.error('FALLO:', e.message.slice(0, 500)); process.exit(1); });
