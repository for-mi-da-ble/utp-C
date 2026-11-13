// Arrastrar/soltar, importación de Calendario Anual y exportación. Uso: node tests/features.test.js <BD.xlsx> <carpeta tmp>
const { chromium } = require('playwright'); const assert = require('assert'); const path = require('path');
(async () => {
  const [bd, tmp] = process.argv.slice(2), U = 'http://localhost:8765';
  const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true }), p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  let dialogs = 0; p.on('dialog', d => { dialogs++; d.dismiss(); });
  await p.clock.setFixedTime(new Date('2026-11-12T07:55:00')); await p.goto(U + '/#config');
  const imp = async (f, txt) => { await p.waitForTimeout(400); await p.evaluate(() => document.querySelector('#toast').textContent = ''); await p.setInputFiles('input[type=file] >> nth=0', f); await p.waitForFunction(t => document.querySelector('#toast').textContent.includes(t), txt, { timeout: 30000 }); return p.textContent('#toast'); };
  await imp(bd, 'importada');
  // Calendario anual sintético en formato "humano": genera el archivo con SheetJS dentro del navegador
  const cal = path.join(tmp, 'Calendario Anual.xlsx');
  const b64 = await p.evaluate(() => { const X = window.XLSX, wb = X.utils.book_new();
    const D = d => 25569 + Date.UTC(2026, 10, d) / 864e5; // fechas reales de Excel, cada día ocupa 2 columnas (como el archivo del colegio)
    const nov = [[null, 'CALENDARIO ANUAL 2026 - NOVIEMBRE'], [null, 'Lunes', null, 'Martes', null, 'Miércoles', null, 'Jueves', null, 'Viernes', null, 'Sábado', null, 'Domingo'], [null, null, null, null, null, null, null, null, null, null, null, null, null, D(1), 'Día de Todos los Santos'],
      [null, D(2), null, D(3), null, 'SIMCE 4° básico', null, D(5), null, D(6), null, D(7), null, D(8)], [null, 'Consejo de profesores 14:30', null, ' ', null, 'Reunión PIE 15:00-16:00', 'Feria de las pulgas', 'Taller ACLE ajedrez', null, 'Acto día del profesor'], [null, ' ', null, 'Entrega de notas', null, ' ..........'],
      [null, D(9), null, D(10), null, D(11), null, D(12), null, D(13)], [null, 'Ensayo PAES 4° medios', null, null, null, 'Salida pedagógica 2° MEDIO A 09:00', null, 'Encuesta Trabün\nDIA cierre'], [null, D(30), null, 'Notes:'], [null, 'PAES regular', null, '*DIA CIERRE']];
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(nov), 'NOV');
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['DICIEMBRE'], ['2026-12-01', '2026-12-02'], ['Licenciatura 4° medios 19:00', 'Cierre año lectivo']]), 'DICIEMBRE'); return X.write(wb, { type: 'base64', bookType: 'xlsx' }); });
  require('fs').writeFileSync(cal, Buffer.from(b64, 'base64'));
  console.log('✓', await imp(cal, 'Calendario anual importado'));
  const evs = await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos'))); const por = t => evs.find(e => e.titulo.includes(t));
  assert.equal(evs.length, 15, 'eventos: ' + evs.map(e => e.fecha + ' ' + e.titulo).join(' | ')); assert.equal(por('SIMCE').fecha, '2026-11-04', 'fecha sobrescrita con texto se infiere'); assert.equal(por('Reunión PIE').fecha, '2026-11-04'); assert.equal(por('Reunión PIE').area, 'PIE'); assert.equal(por('Reunión PIE').hora, '15:00-16:00'); assert.equal(por('Reunión PIE').jornada, 'TARDE');
  assert.equal(por('pulgas').fecha, '2026-11-04', 'segunda columna del día'); assert.equal(por('Todos los Santos').fecha, '2026-11-01', 'efeméride junto a la fecha'); assert.equal(por('Entrega de notas').fecha, '2026-11-03'); assert.equal(por('PAES 4').fecha, '2026-11-09'); assert.equal(por('Trabün').fecha, '2026-11-12'); assert.equal(por('PAES regular').fecha, '2026-11-30'); assert(!por('Notes') && !por('DIA CIERRE'), 'notas al pie fuera'); assert.equal(por('Licenciatura').fecha, '2026-12-01'); assert.equal(por('ajedrez').area, 'ACLE');
  console.log('✓ cada línea de celda = un evento, con fecha, área y jornada correctas');
  assert((await imp(cal, 'No se encontraron')).includes('No se encontraron')); console.log('✓ reimportar no duplica');
  // Arrastrar evento en calendario mensual (mouse)
  const arrastrar = async (from, to) => { await from.waitFor(); await to.waitFor(); await p.waitForTimeout(80); const a = await from.boundingBox(), z = await to.boundingBox(); await p.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await p.mouse.down(); await p.mouse.move(a.x + a.width / 2 + 12, a.y + a.height / 2 + 12, { steps: 3 }); await p.mouse.move(z.x + z.width / 2, z.y + z.height - 12, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(150); };
  const ev = t => p.evaluate(t => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => e.titulo.includes(t)), t);
  await p.goto(U + '/#calendario'); await arrastrar(p.locator('.ev', { hasText: 'PAES 4' }), p.locator('[data-drop="dia:2026-11-20"]'));
  assert.equal((await ev('PAES 4')).fecha, '2026-11-20'); assert.equal(await p.locator('.modal').count(), 0, 'soltar no debe abrir modal'); console.log('✓ arrastrar evento entre días (mes)');
  // Semana: mover a otro día y jornada
  await p.goto(U + '/#semana'); await arrastrar(p.locator('.ev', { hasText: 'Trabün' }), p.locator('[data-drop="cel:2026-11-13:TARDE"]'));
  const t = await ev('Trabün'); assert.equal(t.fecha, '2026-11-13'); assert.equal(t.jornada, 'TARDE'); console.log('✓ arrastrar entre días y Mañana/Tarde (semana)');
  await p.fill('[data-k=foco]', 'Cierre de promedios'); await p.keyboard.press('Tab'); await p.waitForTimeout(100); assert.equal((await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:semanas')).find(w => w.inicio === '2026-11-09'))).foco, 'Cierre de promedios'); console.log('✓ foco semanal editable');
  // Horario: swap de bloques
  await p.goto(U + '/#horarios'); await p.click('[data-a=ciclo][data-v="Enseñanza Media"]'); await p.click('[data-a=curso][data-v="2° MEDIO B"]'); await p.waitForSelector('[data-a=curso][data-v="2° MEDIO B"].on'); await p.waitForTimeout(100);
  const txt = s => p.locator(`[data-drop="${s}"] .hb b`).first().textContent(); const a0 = await txt('hc:M1:1'), b0 = await txt('hc:M3:2');
  await arrastrar(p.locator('[data-drag="hc:M1:1"]'), p.locator('[data-drop="hc:M3:2"]')); await p.waitForTimeout(150); assert.equal(await txt('hc:M1:1'), b0); assert.equal(await txt('hc:M3:2'), a0); console.log(`✓ swap de bloques: ${a0} ⇄ ${b0}`);
  // Táctil: pulsación larga y arrastre
  const cm = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, storageState: await c.storageState() }), m = await cm.newPage(); await m.clock.install({ time: new Date('2026-11-12T07:55:00') }); await m.goto(U + '/#semana'); await m.waitForSelector('.ev');
  const cdp = await cm.newCDPSession(m), src = await m.locator('.ev', { hasText: 'Salida pedagógica' }).boundingBox(); await m.locator('[data-drop="cel:2026-11-10:MANANA"]').scrollIntoViewIfNeeded(); const s2 = await m.locator('.ev', { hasText: 'Salida pedagógica' }).boundingBox(), dst = await m.locator('[data-drop="cel:2026-11-10:MANANA"]').boundingBox();
  const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await tp('touchStart', s2.x + 30, s2.y + 10); await m.clock.runFor(450); await tp('touchMove', s2.x + 30, s2.y - 20); await tp('touchMove', dst.x + 40, dst.y + 20); await tp('touchEnd'); await m.waitForTimeout(200);
  const sp = await m.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:eventos')).find(e => e.titulo.includes('Salida pedagógica'))); assert.equal(sp.fecha, '2026-11-10'); console.log('✓ arrastre táctil con pulsación larga (celular)');
  // Colisión de espacio
  await p.goto(U + '/#calendario'); await p.click('.pacts [data-a=nuevo-ev]'); await p.fill('#f_titulo', 'Ensayo obra de teatro'); await p.fill('#f_fecha', '2026-11-09'); await p.fill('#f_hora', '10:45-12:00'); await p.selectOption('#f_espacio_id', { label: 'Gimnasio Matriz' }); await p.waitForSelector('#colis .alert');
  console.log('✓ alerta de choque:', (await p.textContent('#colis')).replace(/\s+/g, ' ').slice(0, 110)); await p.click('[data-a=guardar]');
  // Exportar y restaurar
  await p.goto(U + '/#config'); const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-a=exportar]')]); const out = path.join(tmp, 'export.xlsx'); await dl.saveAs(out);
  const info = await p.evaluate(async () => { const r = JSON.parse(localStorage.getItem('sigutp:t:bloques')).length; return r; });
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) localStorage.removeItem(k); }); await p.reload(); await p.goto(U + '/#config');
  console.log('✓ exportado y restaurado →', await imp(out, 'Base unificada cargada')); assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('sigutp:t:bloques')).length), info);
  const hojas = await p.evaluate(async () => { return null; });
  assert.equal(dialogs, 0, 'sin diálogos nativos'); assert.deepEqual(errs, []); console.log('✓ sin alert/confirm nativos, sin errores JS\n\nTODO OK'); await b.close();
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
