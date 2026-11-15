// Simulador local de Google Apps Script para probar apps-script/Code.gs sin desplegar.
// Sirve la app en http://localhost:8766 con la API en /exec. SOLO PARA PRUEBAS.
const http = require('http'), fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..'), CID = 'test-client.apps.googleusercontent.com';
const sheets = {}, props = {}, cache = {}; let actualizado = Date.now(); // fecha de modificación simulada del archivo en Drive
function Sheet(name) { this.name = name; this.d = []; }
Sheet.prototype = {
  getName() { return this.name; }, getLastRow() { return this.d.length; }, getLastColumn() { return this.d[0] ? this.d[0].length : 0; }, getMaxRows() { return Math.max(this.d.length, 1000); }, getMaxColumns() { return 26; },
  setFrozenRows() { }, insertRowsAfter() { }, insertColumnsAfter() { }, appendRow(r) { this.d.push(r.map(String)); }, deleteRow(n) { this.d.splice(n - 1, 1); },
  getDataRange() { return this.getRange(1, 1, this.d.length, this.getLastColumn()); },
  getRange(r, c, nr, nc) { const s = this; return { setFontWeight() { return this; }, setNumberFormat() { return this; },
    setValues(v) { actualizado = Date.now(); for (let i = 0; i < v.length; i++) { s.d[r - 1 + i] = s.d[r - 1 + i] || []; for (let j = 0; j < v[i].length; j++) { let x = String(v[i][j]); if (/^[=+]/.test(x)) throw new Error('FORMULA SIN SANEAR: ' + x); s.d[r - 1 + i][c - 1 + j] = x.replace(/^'/, ''); } } return this; }, // Sheets oculta el apóstrofo inicial
    getDisplayValues() { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((s.d[r - 1 + i] || [])[c - 1 + j] || ''); o.push(row); } return o; }, getSheet() { return s; }, getRow() { return r; }, getNumRows() { return nr; } }; }
};
const ss = { getId: () => 'hoja-prueba', getSheetByName: n => sheets[n] || null, insertSheet: n => sheets[n] = new Sheet(n) };
const sandbox = { console, JSON, Date, Math, String, Number, Object, Array, encodeURIComponent,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() { } }, DriveApp: { getFileById: () => ({ getLastUpdated: () => new Date(actualizado) }) }, Session: { getEffectiveUser: () => ({ getEmail: () => 'admin@colegio.test' }) },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, getProperties: () => ({ ...props }), setProperties: o => Object.assign(props, o) }) },
  CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() { }, tryLock: () => true, releaseLock() { } }) },
  Utilities: { DigestAlgorithm: { SHA_256: 1 }, computeDigest: (a, s) => [...crypto.createHash('sha256').update(s).digest()], base64EncodeWebSafe: b => Buffer.from(b).toString('base64url') },
  UrlFetchApp: { fetch: u => { // imita tokeninfo: el "token" de prueba es header.payload.firma con firma "ok"
    const t = decodeURIComponent(u.split('id_token=')[1]).split('.'); let c = null; try { c = JSON.parse(Buffer.from(t[1], 'base64url').toString()); } catch { }
    const ok = c && t[2] === 'ok'; return { getResponseCode: () => ok ? 200 : 400, getContentText: () => JSON.stringify(c) }; } },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ t, setMimeType() { return this; } }) } };
vm.createContext(sandbox); vm.runInContext(fs.readFileSync(path.join(ROOT, 'apps-script/Code.gs'), 'utf8'), sandbox);
if (process.env.PREFILL) { // como la Hoja real: pestañas con datos, sin columnas de control
  const ev = ss.insertSheet('02_Eventos_Calendario'); ev.d = [['id', 'fecha', 'titulo', 'hora', 'mensual', 'seccion', 'especial', 'detalle', 'jornada', 'area', 'cursos', 'espacio_id', 'responsable', 'origen'], ['EV-A', '2026-11-12', 'SIMCE 2° medio', '', 'SI', 'ESTUDIANTES', 'NO', '== E. Media\n08:00 | 2° A | Ingreso |', 'MANANA', 'UTP', '', '', '', 'Calendario anual'], ['EV-B', '2026-11-13', 'Feriado', '', 'SI', 'ESTUDIANTES', 'SI', '', 'AMBAS', 'UTP', '', '', '', 'Calendario anual']];
  ss.insertSheet('VISTA_NOVIEMBRE').d = [['NOVIEMBRE']]; }
sandbox.instalar(); props.GOOGLE_CLIENT_ID = CID;
sheets.usuarios.appendRow(['editor@colegio.test', 'editor', '']); sheets.usuarios.appendRow(['lector@colegio.test', 'lector', '']);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  if (req.url === '/exec' && req.method === 'POST') { let b = ''; req.on('data', c => b += c); req.on('end', () => { const out = sandbox.doPost({ postData: { contents: b } }); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(out.t); }); return; }
  if (req.url === '/__tarea-externa' && req.method === 'POST') { // tarea escrita por la API de Sheets (fuera de la app)
    let b = ''; req.on('data', c => b += c); req.on('end', () => { const row = JSON.parse(b), h = sheets['11_Tareas']; h.d.push(h.d[0].map(k => String(row[k] ?? ''))); actualizado = Date.now() + 20000; res.end('ok'); }); return; }
  if (req.url.startsWith('/__externo')) { // simula una edición hecha directamente en la Hoja (fuera de la app)
    const h = sheets['02_Eventos_Calendario'], c = h.d[0], fila = c.map(k => ({ id: 'EXT-1', fecha: '2026-11-12', titulo: 'Agregado directo en la Hoja', mensual: 'SI', seccion: 'ESTUDIANTES', jornada: 'AMBAS', area: 'UTP' }[k] || ''));
    h.d.push(fila); actualizado = Date.now() + 20000; res.end('ok'); return; }
  if (req.url === '/__sheet') { res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k, s]) => [k, s.d])))); return; }
  let f = req.url.split('?')[0]; if (f === '/') f = '/index.html';
  if (f === '/config.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(`window.SIG_CONFIG={API_URL:'/exec',GOOGLE_CLIENT_ID:'${CID}',COLEGIO:'Colegio de Prueba',ANIO:2026};`); }
  const fp = path.join(ROOT, path.normalize(f)); if (!fp.startsWith(ROOT) || !fs.existsSync(fp)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' }); res.end(fs.readFileSync(fp));
}).listen(8766, () => console.log('mock listo en http://localhost:8766'));
