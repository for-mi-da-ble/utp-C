// Vista mensual (horas y rutina), formulario simple, fusión de repetidos y PDF de una hoja para TODAS las semanas.
// Uso: node tests/calendario.test.js <Base_Unificada.xlsx> <carpeta salida>
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path'); const { execFileSync } = require('child_process');
(async () => {
  const [base, out] = process.argv.slice(2), U = 'http://localhost:8765';
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-12T07:55:00')); await p.goto(U + '/#config');
  await p.setInputFiles('input[type=file] >> nth=0', base); await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Base unificada cargada'), null, { timeout: 30000 });
  // mensual
  await p.goto(U + '/#calendario'); await p.waitForSelector('.rut');
  const lun9 = '[data-drop="dia:2026-11-09"]'; const nr = await p.locator(`${lun9} .rut`).count(); assert(nr >= 10, 'rutina del lunes: ' + nr);
  assert.equal(await p.locator('[data-drop="dia:2026-11-14"] .rut').count(), 0, 'sin rutina en sábado');
  const actos = await p.locator(`${lun9} .ev`, { hasText: 'Actos Académicos' }).first().locator('.evh').textContent(); assert(/08:00/.test(actos), 'hora desde el detalle: ' + actos);
  console.log(`✓ mensual: rutina en días lectivos (${nr} el lunes 9), nada en fin de semana; hora tomada del detalle → "${actos}"`);
  await p.screenshot({ path: path.join(out, 'mensual.png'), fullPage: true });
  await p.click('[data-a=rut][data-v=TALLER_ACLE]'); await p.click('[data-a=rut][data-v=REFORZAMIENTO]'); const solo = await p.locator(`${lun9} .rut`).count(); assert(solo < nr && solo > 0); console.log(`✓ filtros de rutina (solo reuniones: ${solo})`);
  await p.click('[data-a=rut][data-v=TALLER_ACLE]'); await p.click('[data-a=rut][data-v=REFORZAMIENTO]');
  // feriado: sin rutina
  const fer = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => /feriado/i.test(e.titulo) && new Date(e.fecha).getUTCDay() >= 1 && new Date(e.fecha).getUTCDay() <= 5)?.fecha);
  if (fer) { await p.click(`[data-a=mes][data-m="${fer.slice(0, 7)}"]`); assert.equal(await p.locator(`[data-drop="dia:${fer}"] .rut`).count(), 0); console.log('✓ sin rutina en feriado', fer); await p.click('[data-a=mes][data-m="2026-11"]'); }
  // formulario simple
  await p.click('.pacts [data-a=nuevo-ev]'); await p.waitForSelector('.modal');
  assert(await p.locator('.det').isHidden(), 'detalles ocultos'); const vis = await p.locator('.modal .fld:visible label').allTextContents(); console.log('✓ formulario simple:', vis.join(' · '));
  await p.fill('#f_titulo', 'Prueba automática SIG-UTP'); await p.fill('#f_fecha', '2026-11-19'); await p.fill('#f_hora', '15:00-16:00'); await p.click('.seg label:has([value=AMBAS])'); assert.equal(await p.locator('[name=jornada]:checked').inputValue(), 'AMBAS', 'clic en opción de jornada'); await p.fill('#f_hora', '15:30-16:00'); await p.locator('#f_hora').blur(); await p.waitForTimeout(80);
  assert.equal(await p.locator('[name=jornada]:checked').inputValue(), 'TARDE', 'jornada automática en el formulario');
  await p.screenshot({ path: path.join(out, 'form-simple.png') });
  await p.click('[data-a=mas-det]'); assert(await p.locator('.det').isVisible()); await p.selectOption('#f_espacio_id', { label: 'Gimnasio Matriz' }); await p.screenshot({ path: path.join(out, 'form-detalles.png') }); await p.click('[data-a=guardar]'); await p.waitForTimeout(100);
  const nv = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => e.titulo === 'Prueba automática SIG-UTP')); assert.equal(nv.jornada, 'TARDE', 'jornada guardada ' + JSON.stringify(nv)); assert(nv.espacio_id); console.log('✓ "Todos los detalles" despliega el resto; jornada se ajusta sola al horario');
  // fusión de repetidos
  await p.goto(U + '/#config'); const n0 = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).length);
  await p.click('[data-a=ver-dup]'); const np = await p.locator('[data-par]').count(); await p.screenshot({ path: path.join(out, 'duplicados.png') }); await p.locator('[data-par]').first().uncheck(); await p.click('[data-a=ok-dup]'); await p.waitForTimeout(150);
  const n1 = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).length); assert.equal(n0 - n1, np - 1); console.log(`✓ fusión: ${np} pares encontrados, ${np - 1} fusionados (1 desmarcado)`);
  const tv = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => /Vocacional UST\(4MB\)/i.test(e.titulo))); if (tv) console.log('  ejemplo fusionado:', tv.fecha, tv.titulo, '|', tv.hora);
  // PDF: todas las semanas en una hoja
  await p.goto(U + '/#semana'); for (let i = 0; i < 40; i++) await p.click('[data-a=fecha][data-n="-7"]');
  const pags = {}; let max = { n: 0 };
  for (let i = 0; i < 44; i++) {
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-a=pdf]')]); const f = path.join(out, dl.suggestedFilename()); await dl.saveAs(f);
    const n = +/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f]).toString())[1]; pags[n] = (pags[n] || 0) + 1; await p.click('[data-a=fecha][data-n="7"]');
  }
  assert.deepEqual(Object.keys(pags), ['1'], 'páginas por PDF: ' + JSON.stringify(pags)); console.log(`✓ PDF: las ${pags[1]} semanas del año caben en una sola hoja carta`);
  assert.deepEqual(errs, []); console.log('\nTODO OK'); await b.close();
})().catch(e => { console.error('FALLO:', e.message.slice(0, 600)); process.exit(1); });
