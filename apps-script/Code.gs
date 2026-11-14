/**
 * SIG-UTP · Backend en Google Apps Script sobre una Google Sheet.
 * Seguridad: cada petición trae un ID token de Google; se verifica firma/audiencia con Google
 * y el correo debe estar en la hoja `usuarios` (rol admin | editor | lector).
 * Instalación: ver README. Ejecuta `instalar()` una vez desde el editor.
 */
var TABLAS = {
  semanas: ['id', 'inicio', 'fin', 'tipo', 'semestre', 'etiqueta', 'foco', 'consejo_tema', 'lineal_cursos'],
  eventos: ['id', 'fecha', 'titulo', 'hora', 'mensual', 'seccion', 'detalle', 'jornada', 'area', 'cursos', 'espacio_id', 'responsable', 'origen'],
  ausencias: ['id', 'fecha', 'hasta', 'func_id', 'nombre', 'tipo', 'jornada', 'nota', 'cobertura'],
  funcionarios: ['id', 'nombre', 'estamento', 'departamento', 'cargo', 'jefatura', 'horas_contrato', 'horas_lectivas', 'horas_no_lectivas', 'email'],
  cursos: ['id', 'orden', 'ciclo', 'jornada', 'sala_id', 'profesor_jefe', 'equipo_pie'],
  espacios: ['id', 'nombre', 'edificio', 'tipo', 'capacidad', 'encargado'],
  bloques: ['id', 'func_id', 'dia', 'ini', 'fin', 'tipo', 'curso_id', 'detalle', 'sala_id'],
  matriz: ['id', 'categoria', 'dia', 'ini', 'fin', 'titulo', 'grupo', 'sala_id', 'participantes'],
  cumpleanos: ['id', 'nombre', 'dia', 'mes']
};
var META = ['_rev', '_del', '_por'];
var SOLO_ADMIN = { funcionarios: 1, cursos: 1, espacios: 1, bloques: 1, matriz: 1, semanas: 1 };
var MAX_OPS = 1500, MAX_CELDA = 4000;

/** Ejecutar UNA vez: crea las hojas y te registra como administrador. */
function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLAS).forEach(function (t) { hoja_(ss, t, TABLAS[t].concat(META)); });
  var u = hoja_(ss, 'usuarios', ['email', 'rol', 'nombre']);
  if (u.getLastRow() < 2) u.appendRow([Session.getEffectiveUser().getEmail().toLowerCase(), 'admin', 'Administrador/a']);
  var p = PropertiesService.getScriptProperties();
  if (!p.getProperty('REV')) p.setProperty('REV', '0');
  if (!p.getProperty('GOOGLE_CLIENT_ID')) p.setProperty('GOOGLE_CLIENT_ID', 'PEGA_AQUI_TU_CLIENT_ID');
}
function hoja_(ss, nombre, cols) {
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); sh.setFrozenRows(1); }
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@'); // todo como texto: evita fórmulas inyectadas
  return sh;
}

function doGet() { return json_({ ok: true, servicio: 'SIG-UTP' }); }

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var u = autenticar_(req.token);
    if (!u.ok) return json_(u);
    var ops = req.ops || [];
    if (ops.length > MAX_OPS) return json_({ ok: false, code: 413, error: 'Demasiados cambios en una sola petición.' });
    if (ops.length && u.role === 'lector') return json_({ ok: false, code: 403, error: 'Tu cuenta es de solo lectura.' });
    for (var i = 0; i < ops.length; i++) {
      if (!TABLAS[ops[i].t] || typeof ops[i].id !== 'string' || !ops[i].id) return json_({ ok: false, code: 400, error: 'Operación inválida.' });
      if (SOLO_ADMIN[ops[i].t] && u.role !== 'admin' && !(ops[i].t === 'semanas' && !ops[i].del))
        return json_({ ok: false, code: 403, error: 'Solo un administrador puede modificar la configuración (' + ops[i].t + ').' });
    }
    var lock = LockService.getScriptLock();
    lock.waitLock(25000);
    try { return json_(sincronizar_(ops, Number(req.since) || 0, u)); }
    finally { lock.releaseLock(); }
  } catch (err) {
    console.error(err);
    return json_({ ok: false, code: 500, error: 'Error interno del servidor.' });
  }
}

function sincronizar_(ops, since, u) {
  var props = PropertiesService.getScriptProperties();
  var all = props.getProperties();
  var rev = Number(all.REV) || 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var porTabla = {};
  ops.forEach(function (o) { (porTabla[o.t] = porTabla[o.t] || []).push(o); });
  var nuevas = {};
  if (ops.length) rev++;
  var changes = {};
  Object.keys(TABLAS).forEach(function (t) {
    var tocada = porTabla[t], trev = Number(all['REV_' + t]) || 0;
    if (!tocada && trev <= since) return; // sin novedades: no se lee la hoja
    var sh = ss.getSheetByName(t);
    var vals = sh.getDataRange().getDisplayValues();
    var head = vals[0], col = {};
    head.forEach(function (h, i) { col[h] = i; });
    if (tocada) {
      var fila = {};
      for (var r = 1; r < vals.length; r++) fila[vals[r][col.id]] = r;
      tocada.forEach(function (o) {
        var r = fila[o.id];
        if (r == null) { if (o.del) return; r = vals.length; fila[o.id] = r; vals.push(head.map(function () { return ''; })); vals[r][col.id] = o.id; }
        if (o.del) { vals[r][col._del] = '1'; }
        else {
          TABLAS[t].forEach(function (c) { if (c !== 'id' && o.row && o.row[c] !== undefined) vals[r][col[c]] = limpiar_(o.row[c]); });
          vals[r][col._del] = '';
        }
        vals[r][col._rev] = String(rev); vals[r][col._por] = u.email;
      });
      if (sh.getMaxRows() < vals.length) sh.insertRowsAfter(sh.getMaxRows(), vals.length - sh.getMaxRows());
      // getDisplayValues oculta el apóstrofo protector: se vuelve a sanear todo antes de escribir.
      for (var w = 1; w < vals.length; w++) for (var z = 0; z < head.length; z++) vals[w][z] = limpiar_(vals[w][z]);
      sh.getRange(1, 1, vals.length, head.length).setNumberFormat('@').setValues(vals);
      nuevas['REV_' + t] = String(rev);
    }
    var out = [];
    for (var k = 1; k < vals.length; k++) {
      var rr = Number(vals[k][col._rev]) || 0;
      if (rr <= since || !vals[k][col.id]) continue;
      var obj = {};
      TABLAS[t].forEach(function (c) { var v = vals[k][col[c]]; if (v !== '' && v != null) obj[c] = v.charAt(0) === "'" ? v.slice(1) : v; });
      if (vals[k][col._del]) { if (since === 0) continue; obj._del = 1; }
      out.push(obj);
    }
    if (out.length) changes[t] = out;
  });
  if (ops.length) { nuevas.REV = String(rev); props.setProperties(nuevas); }
  return { ok: true, rev: rev, role: u.role, email: u.email, changes: changes };
}

/** Texto plano acotado; neutraliza valores que Sheets interpretaría como fórmula. */
function limpiar_(v) {
  if (v == null) return '';
  var s = String(v).slice(0, MAX_CELDA);
  return /^[=+@]/.test(s) ? "'" + s : s;
}

function autenticar_(token) {
  if (!token || typeof token !== 'string' || token.length > 4096) return { ok: false, code: 401, error: 'Inicia sesión con tu cuenta Google.' };
  var cache = CacheService.getScriptCache();
  var key = 'tok_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token));
  var email = cache.get(key);
  if (!email) {
    var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(token), { muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return { ok: false, code: 401, error: 'Sesión expirada. Vuelve a iniciar sesión.' };
    var c = JSON.parse(res.getContentText());
    var cid = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
    if (c.aud !== cid || (c.iss !== 'accounts.google.com' && c.iss !== 'https://accounts.google.com') ||
      String(c.email_verified) !== 'true' || Number(c.exp) * 1000 < Date.now())
      return { ok: false, code: 401, error: 'Credencial no válida para esta aplicación.' };
    email = String(c.email).toLowerCase();
    cache.put(key, email, Math.max(1, Math.min(600, Number(c.exp) - Math.floor(Date.now() / 1000))));
  }
  var role = rol_(email);
  if (!role) return { ok: false, code: 403, error: 'La cuenta ' + email + ' no está autorizada. Pide acceso a la Jefatura de UTP.' };
  return { ok: true, email: email, role: role };
}
function rol_(email) {
  var cache = CacheService.getScriptCache(), k = 'rol_' + email, r = cache.get(k);
  if (r != null) return r;
  var vals = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('usuarios').getDataRange().getDisplayValues();
  r = '';
  for (var i = 1; i < vals.length; i++) if (String(vals[i][0]).trim().toLowerCase() === email) { r = String(vals[i][1]).trim().toLowerCase(); break; }
  if (['admin', 'editor', 'lector'].indexOf(r) < 0) r = '';
  cache.put(k, r, 120); // cambios de permisos tardan hasta 2 minutos en aplicarse
  return r;
}

/**
 * Ediciones manuales en la planilla: marca la fila para que las apps la descarguen.
 * (Edita una fila a la vez; no cambies la columna `id`.)
 */
function onEdit(e) {
  var sh = e.range.getSheet(), t = sh.getName();
  if (!TABLAS[t] || e.range.getRow() < 2) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) return;
  try {
    var props = PropertiesService.getScriptProperties();
    var rev = (Number(props.getProperty('REV')) || 0) + 1;
    var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0];
    var cr = head.indexOf('_rev') + 1, cp = head.indexOf('_por') + 1;
    if (!cr) return;
    var n = e.range.getNumRows(), revs = [], por = [];
    for (var i = 0; i < n; i++) { revs.push([String(rev)]); por.push(['planilla']); }
    sh.getRange(e.range.getRow(), cr, n, 1).setValues(revs);
    if (cp) sh.getRange(e.range.getRow(), cp, n, 1).setValues(por);
    var o = { REV: String(rev) }; o['REV_' + t] = String(rev);
    props.setProperties(o);
  } finally { lock.releaseLock(); }
}

/** Mantenimiento opcional: elimina físicamente las filas borradas (ejecutar a fin de semestre). */
function purgarEliminados() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLAS).forEach(function (t) {
    var sh = ss.getSheetByName(t), vals = sh.getDataRange().getDisplayValues(), d = vals[0].indexOf('_del');
    for (var r = vals.length - 1; r >= 1; r--) if (vals[r][d]) sh.deleteRow(r + 1);
  });
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
