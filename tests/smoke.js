// Prueba de humo: node tests/smoke.js <ruta BD.xlsx> <carpeta capturas>
const { chromium } = require('playwright');
(async () => {
  const [xlsx, out] = process.argv.slice(2);
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage(); const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.clock.setFixedTime(new Date('2026-11-12T07:55:00'));
  await p.goto('http://localhost:8765/#config');
  await p.setInputFiles('input[type=file] >> nth=0', xlsx);
  await p.waitForFunction(() => document.querySelector('#toast').textContent.match(/importada|cargada/), null, { timeout: 30000 });
  console.log(await p.textContent('#toast'));
  const shot = async n => { await p.waitForTimeout(250); await p.screenshot({ path: `${out}/${n}.png`, fullPage: true }); };
  // ausencia
  await p.goto('http://localhost:8765/#hoy'); await p.click('[data-a=nueva-aus]');
  const docente = await p.evaluate((() => { const b = JSON.parse(localStorage.getItem('sigutp:t:bloques')), f = JSON.parse(localStorage.getItem('sigutp:t:funcionarios')), c = {}; for (const x of b) if (x.tipo === 'CLASE' && +x.dia === 4 && x.func_id) c[x.func_id] = (c[x.func_id] || 0) + 1; const id = Object.keys(c).sort((a, z) => c[z] - c[a])[0]; return f.find(x => x.id === id).nombre; })); await p.fill('#f_nombre', docente); await p.waitForTimeout(100); await shot('02-modal-ausencia');
  const t0 = Date.now(); await p.click('[data-a=guardar]'); await p.waitForSelector('.afe'); console.log('ms hasta ver cobertura:', Date.now() - t0, 'bloques afectados:', await p.locator('.afe').count());
  await p.locator('.afe .chip.lime, .afe .chip.violet').first().click(); await p.locator('.afe:not(.ok) .chip.dark').first().click();
  // evento
  await p.click('[data-a=nuevo-ev]'); await p.fill('#f_titulo', 'Ensayo SIMCE 2° medios'); await p.fill('#f_hora', '09:45-11:15'); await p.click('[data-a=mas-det]'); await p.fill('#f_cursos', '2° MEDIO A, 2° MEDIO B'); await p.selectOption('#f_espacio_id', { label: 'Gimnasio Matriz' }); await p.waitForTimeout(100); await shot('03-modal-evento'); await p.click('[data-a=guardar]');
  await shot('01-hoy');
  await p.click('[data-a=parte]'); await shot('04-parte'); console.log((await p.inputValue('.mono')).split('\n').slice(0, 14).join('\n')); await p.keyboard.press('Escape');
  for (const v of ['semana', 'calendario', 'horarios', 'espacios']) { await p.goto('http://localhost:8765/#' + v); await shot('05-' + v); }
  await p.goto('http://localhost:8765/#horarios'); await p.click('[data-a=ciclo][data-v="Enseñanza Media"]'); await p.click('[data-a=curso][data-v="2° MEDIO B"]'); await shot('06-curso');
  await p.click('[data-a=htab][data-v=docente]'); await shot('07-docente'); await p.click('[data-a=htab][data-v=sabana]'); await shot('08-sabana');
  await p.goto('http://localhost:8765/#config'); await p.click('[data-a=cfg][data-v=semanas]'); await shot('09-config');
  await p.setViewportSize({ width: 390, height: 844 }); for (const v of ['hoy', 'semana', 'calendario', 'horarios']) { await p.goto('http://localhost:8765/#' + v); await shot('m-' + v); }
  console.log('errores consola:', errs.length, errs.slice(0, 8)); await b.close();
})();
