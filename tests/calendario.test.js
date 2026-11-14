// Vista mensual (horas y rutina), formulario simple, fusión de repetidos y PDF de una hoja para TODAS las semanas.
// Uso: node tests/calendario.test.js <Base_Unificada.xlsx> <carpeta salida>
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path'); const { execFileSync } = require('child_process');
(async () => {
  const [base, out] = process.argv.slice(2), U = 'http://localhost:8765';
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.clock.setFixedTime(new Date('2026-11-12T07:55:00')); await p.goto(U + '/#config');
  await p.setInputFiles('input[type=file] >> nth=0', base); await p.waitForFunction(() => document.querySelector('#toast').textContent.includes('Base unificada cargada'), null, { timeout: 30000 });
  // mensual
  await p.goto(U + '/#calendario'); await p.waitForSelector('.cal .ev');
  const lun9 = '[data-drop="dia:2026-11-09"]'; assert.equal(await p.locator('.cal .rut').count(), 0, 'el mensual no muestra rutina por defecto');
  const hitos = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).filter(e => e.mensual === 'SI' && e.fecha.startsWith('2026-11')).length);
  assert.equal(await p.locator('.cal .cal-d:not(.out) .ev').count(), hitos, 'el mensual muestra solo los hitos');
  const simceMes = p.locator('[data-drop="dia:2026-11-11"] .ev', { hasText: 'SIMCE 2°MEDIO' }); assert.equal(await simceMes.count(), 1); assert.equal(await simceMes.locator('.agenda').count(), 0, 'en el mensual es un solo bloque');
  console.log(`✓ mensual: ${hitos} hitos de noviembre (solo los del calendario anual), SIMCE II° medio como un bloque`);
  await p.screenshot({ path: path.join(out, 'mensual.png'), fullPage: true });
  await p.click('[data-a=rut-mes]'); await p.waitForSelector('.cal .rut'); const nr = await p.locator(`${lun9} .rut`).count(); assert(nr >= 10); assert.equal(await p.locator('[data-drop="dia:2026-11-14"] .rut').count(), 0); console.log(`✓ rutina opcional en el mensual (${nr} el lunes 9), nunca en fin de semana`);
  // feriado: sin rutina
  const fer = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => /feriado/i.test(e.titulo) && new Date(e.fecha).getUTCDay() >= 1 && new Date(e.fecha).getUTCDay() <= 5)?.fecha);
  if (fer) { await p.click(`[data-a=mes][data-m="${fer.slice(0, 7)}"]`); assert.equal(await p.locator(`[data-drop="dia:${fer}"] .rut`).count(), 0); console.log('✓ sin rutina en feriado', fer); await p.click('[data-a=mes][data-m="2026-11"]'); }
  await p.click('[data-a=rut-mes]');
  // formulario simple
  await p.click('.pacts [data-a=nuevo-ev]'); await p.waitForSelector('.modal');
  assert(await p.locator('.det').isHidden(), 'detalles ocultos'); const vis = await p.locator('.modal .fld:visible label').allTextContents(); console.log('✓ formulario simple:', vis.join(' · '));
  await p.fill('#f_titulo', 'Prueba automática SIG-UTP'); await p.fill('#f_fecha', '2026-11-19'); await p.fill('#f_hora', '15:00-16:00'); await p.click('.seg label:has([value=FUNCIONARIOS])'); assert.equal(await p.locator('[name=seccion]:checked').inputValue(), 'FUNCIONARIOS', 'clic en opción de sección'); await p.fill('#f_hora', '15:30-16:00'); await p.locator('#f_hora').blur(); await p.waitForTimeout(80);
  assert.equal(await p.locator('[name=jornada]:checked').inputValue(), 'TARDE', 'jornada automática en el formulario');
  await p.screenshot({ path: path.join(out, 'form-simple.png') });
  await p.click('[data-a=mas-det]'); assert(await p.locator('.det').isVisible()); await p.selectOption('#f_espacio_id', { label: 'Gimnasio Matriz' }); await p.screenshot({ path: path.join(out, 'form-detalles.png') }); await p.click('[data-a=guardar]'); await p.waitForTimeout(100);
  const nv = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => e.titulo === 'Prueba automática SIG-UTP')); assert.equal(nv.jornada, 'TARDE', 'jornada guardada ' + JSON.stringify(nv)); assert.equal(nv.seccion, 'FUNCIONARIOS'); assert(nv.espacio_id); console.log('✓ formulario: sección elegida con un clic, "Todos los detalles" despliega el resto, jornada automática');
  // fusión de repetidos
  await p.goto(U + '/#semana'); await p.click('[data-a=fecha-hoy]'); await p.waitForFunction(() => /Semana 35/.test(document.querySelector('.phead h1').textContent)); const simceSem = p.locator('.semana .ev', { hasText: 'SIMCE 2°MEDIO' }).first(); assert.equal(await simceSem.locator('.agenda li').count(), 5, await p.evaluate(() => location.hash + ' ' + (document.querySelector('.phead h1') || {}).textContent + ' ' + [...document.querySelectorAll('.semana .ev')].filter(x => /SIMCE/.test(x.textContent)).map(x => x.outerHTML.slice(0, 300)).join('\n'))); console.log('✓ semana: el mismo SIMCE muestra su detalle hora a hora (' + (await simceSem.locator('.agenda li').allTextContents()).join(' | ') + ')');
  await p.goto(U + '/#config'); const n0 = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).length);
  await p.click('[data-a=ver-dup]'); await p.waitForTimeout(150); const np = await p.locator('[data-par]').count(); if (!np) console.log('✓ no quedan repetidos por unir (la base ya viene unida)'); else { await p.screenshot({ path: path.join(out, 'duplicados.png') }); await p.locator('[data-par]').first().uncheck(); await p.click('[data-a=ok-dup]'); await p.waitForTimeout(150);
  const n1 = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).length); assert.equal(n0 - n1, np - 1); console.log(`✓ fusión: ${np} pares encontrados, ${np - 1} fusionados (1 desmarcado)`); }
  const tv = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => /Vocacional UST\(4MB\)/i.test(e.titulo))); if (tv) console.log('  ejemplo fusionado:', tv.fecha, tv.titulo, '|', tv.hora);
  // semana por secciones
  await p.goto(U + '/#semana'); await p.click('[data-a=fecha-hoy]'); await p.waitForSelector('[data-drop="sec:2026-11-09:FUNCIONARIOS"]'); const filas = await p.locator('.semana .wk-j b').allTextContents(); assert.deepEqual(filas.slice(0, 4), ['Actividades estudiantes', 'Actividades funcionarios', 'Talleres y reforzamientos', 'Reuniones y acciones externas']);
  assert(await p.locator('[data-drop="sec:2026-11-09:FUNCIONARIOS"] .rut').count() >= 5, 'reuniones fijas en funcionarios'); assert(await p.locator('.wk-cell.sec-TALLERES .rut').count() >= 20, 'talleres en su fila');
  console.log('✓ semana por secciones:', filas.join(' · ')); await p.screenshot({ path: path.join(out, 'semana-secciones.png'), fullPage: true });
  await p.click('[data-a=boletin]'); const bt = await p.inputValue('.mono'); for (const t of ['ACTIVIDADES ESTUDIANTES', 'ACTIVIDADES FUNCIONARIOS', 'TALLERES Y REFORZAMIENTOS']) assert(bt.includes(t), t); await p.keyboard.press('Escape'); console.log('✓ boletín ordenado por secciones');
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
