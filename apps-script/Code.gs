/**
 * SIG-UTP · Backend en Google Apps Script sobre una Google Sheet.
 * Seguridad: cada petición trae un ID token de Google; se verifica firma/audiencia con Google
 * y el correo debe estar en la hoja `usuarios` (rol admin | editor | lector).
 * La base de datos es la misma Hoja de Google "SIG-UTP Base de datos" (pestañas 01_… a 09_…), así que se puede editar
 * desde la app, a mano en la hoja o con otras herramientas: los cambios hechos fuera de la app se detectan por la
 * fecha de modificación del archivo y las apps descargan todo de nuevo.
 * Instalación: ver README. Ejecuta `instalar()` una vez desde el editor.
 */
// Pestaña de la Hoja para cada tabla (mismos nombres que la base unificada .xlsx).
var HOJAS = { semanas: '01_Semanas_Clases', eventos: '02_Eventos_Calendario', ausencias: '03_Ausencias_Reemplazos', funcionarios: '04_Funcionarios',
  espacios: '05_Espacios_Edificios', cursos: '06_Cursos', matriz: '07_Matriz_Fija_Semanal', bloques: '08_Bloques_Docentes', cumpleanos: '09_Cumpleanos',
  proyectos: '10_Proyectos', tareas: '11_Tareas', reservas: '12_Reservas' };
var MARGEN_EXTERNO = 10000; // ms: diferencia mínima para considerar que alguien editó la hoja fuera de la app
var TABLAS = {
  semanas: ['id', 'inicio', 'fin', 'tipo', 'semestre', 'etiqueta'],
  eventos: ['id', 'fecha', 'titulo', 'hora', 'mensual', 'seccion', 'especial', 'detalle', 'jornada', 'area', 'cursos', 'espacio_id', 'responsable', 'origen'],
  ausencias: ['id', 'fecha', 'hasta', 'func_id', 'nombre', 'tipo', 'jornada', 'nota', 'cobertura'],
  funcionarios: ['id', 'nombre', 'estamento', 'departamento', 'cargo', 'jefatura', 'horas_contrato', 'horas_lectivas', 'horas_no_lectivas', 'email'],
  cursos: ['id', 'orden', 'ciclo', 'jornada', 'sala_id', 'profesor_jefe', 'equipo_pie', 'profesor_jefe_id', 'equipo_pie_ids'],
  espacios: ['id', 'nombre', 'edificio', 'tipo', 'capacidad', 'encargado'],
  bloques: ['id', 'func_id', 'dia', 'ini', 'fin', 'tipo', 'curso_id', 'detalle', 'sala_id'],
  matriz: ['id', 'categoria', 'dia', 'ini', 'fin', 'titulo', 'grupo', 'sala_id', 'participantes', 'participantes_ids'],
  cumpleanos: ['id', 'nombre', 'dia', 'mes', 'func_id'],
  proyectos: ['id', 'area', 'nombre', 'responsable', 'estado', 'doc_url', 'orden'],
  tareas: ['id', 'proyecto_id', 'titulo', 'responsable', 'inicio', 'fin', 'hito', 'estado', 'duracion_min', 'agendada', 'evento_id', 'nota'],
  reservas: ['id', 'fecha', 'ini', 'fin', 'espacio_id', 'curso_id', 'grupo', 'func_id', 'responsable', 'asignatura', 'actividad', 'recursos', 'lugar_original', 'origen']
};
var META = ['_rev', '_del', '_por'];
var SOLO_ADMIN = { funcionarios: 1, cursos: 1, espacios: 1, bloques: 1, matriz: 1, semanas: 1 };
var MAX_OPS = 1500, MAX_CELDA = 4000;

/** Ejecutar UNA vez: prepara las pestañas (agrega columnas de control) y te registra como administrador. */
function instalar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), p = PropertiesService.getScriptProperties(), rev = Math.max(1, Number(p.getProperty('REV')) || 0);
  Object.keys(TABLAS).forEach(function (t) {
    var sh = hoja_(ss, HOJAS[t], TABLAS[t].concat(META)), vals = sh.getDataRange().getDisplayValues(), cr = vals[0].indexOf('_rev');
    var marcas = [], hay = false; // filas que vienen de la base unificada: quedan como ya sincronizadas
    for (var r = 1; r < vals.length; r++) { var v = vals[r][cr]; if (!v && vals[r][0]) hay = true; marcas.push([v || (vals[r][0] ? String(rev) : '')]); }
    if (hay) sh.getRange(2, cr + 1, marcas.length, 1).setNumberFormat('@').setValues(marcas);
  });
  var u = ss.getSheetByName('usuarios') || hoja_(ss, 'usuarios', ['email', 'rol', 'nombre']);
  if (u.getLastRow() < 2) u.appendRow([Session.getEffectiveUser().getEmail().toLowerCase(), 'admin', 'Administrador/a']);
  p.setProperty('REV', String(rev));
  if (!p.getProperty('EXTERNO')) p.setProperty('EXTERNO', '1');
  if (!p.getProperty('GOOGLE_CLIENT_ID')) p.setProperty('GOOGLE_CLIENT_ID', 'PEGA_AQUI_TU_CLIENT_ID');
  SpreadsheetApp.flush(); p.setProperty('ULTIMA', String(Date.now()));
}
/** Pestaña con encabezados: si existe, agrega al final las columnas que falten (no toca las que ya están). */
function hoja_(ss, nombre, cols) {
  var sh = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold'); sh.setFrozenRows(1); }
  else {
    var head = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getDisplayValues()[0], faltan = cols.filter(function (c) { return head.indexOf(c) < 0; });
    if (faltan.length) { if (sh.getMaxColumns() < head.length + faltan.length) sh.insertColumnsAfter(sh.getMaxColumns(), head.length + faltan.length - sh.getMaxColumns()); sh.getRange(1, head.length + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold'); }
  }
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).setNumberFormat('@'); // todo como texto: evita fórmulas inyectadas
  return sh;
}
/** ¿Alguien modificó la Hoja fuera de la app (a mano o con otra herramienta) desde la última escritura del backend? */
function cambioExterno_(ss, props) {
  try { return DriveApp.getFileById(ss.getId()).getLastUpdated().getTime() > (Number(props.getProperty('ULTIMA')) || 0) + MARGEN_EXTERNO; }
  catch (e) { return false; }
}

/**
 * Sirve la app (página "index" de este proyecto, que carga el código desde GitHub Pages).
 * Implementar como Aplicación web · Ejecutar como: Yo · Acceso: solo usuarios del dominio del colegio.
 * Así Google identifica a cada persona con su cuenta institucional y no hace falta Google Cloud.
 */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index').setTitle('SIG-UTP · Colegio Marina de Chile')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // permite incrustarla en el Google Sites del colegio
}

/** Llamado por la app con google.script.run: la identidad la da la sesión de Google (cuentas del dominio). */
function api(cuerpo) {
  try {
    var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    if (!email) return JSON.stringify({ ok: false, code: 401, error: 'No se pudo identificar tu cuenta. Entra con tu cuenta del colegio.' });
    var role = rol_(email);
    if (!role) return JSON.stringify({ ok: false, code: 403, error: 'La cuenta ' + email + ' no está autorizada. Pide acceso a la Jefatura de UTP.' });
    var req = JSON.parse(cuerpo || '{}');
    if (!(req.ops || []).length) { try { respaldar_(false); } catch (e) { console.error('respaldo', e); } } // al abrir la app: copia si corresponde
    return JSON.stringify(procesar_(req, { ok: true, email: email, role: role }));
  } catch (err) { console.error(err); return JSON.stringify({ ok: false, code: 500, error: 'Error interno del servidor.' }); }
}

// ---------- respaldo automático ----------
// Cada 2 días se guarda una copia completa de la Hoja en la carpeta "SIG-UTP Respaldos" (junto a la base) y se conservan
// las últimas 15. Se hace al abrir la app y, si se ejecutó instalarRespaldo(), también con una tarea diaria de Apps Script.
var RESPALDO_CADA_MS = 2 * 24 * 3600 * 1000, RESPALDOS_MAX = 15, CARPETA_RESPALDOS = 'SIG-UTP Respaldos';
function respaldar_(forzar) {
  var p = PropertiesService.getScriptProperties(), vence = function () { return Date.now() - (Number(p.getProperty('RESPALDO')) || 0) >= RESPALDO_CADA_MS - 3600000; };
  if (!forzar && !vence()) return false;
  var lock = LockService.getScriptLock(); if (!lock.tryLock(2000)) return false;
  try {
    if (!forzar && !vence()) return false; // otra ejecución ya lo hizo
    var ss = SpreadsheetApp.getActiveSpreadsheet(), f = DriveApp.getFileById(ss.getId()), ps = f.getParents(), padre = ps.hasNext() ? ps.next() : DriveApp.getRootFolder();
    var it = padre.getFoldersByName(CARPETA_RESPALDOS), dir = it.hasNext() ? it.next() : padre.createFolder(CARPETA_RESPALDOS);
    f.makeCopy(ss.getName() + ' · respaldo ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm'), dir);
    p.setProperty('RESPALDO', String(Date.now()));
    var copias = [], fs = dir.getFiles(); while (fs.hasNext()) copias.push(fs.next());
    copias.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    copias.slice(RESPALDOS_MAX).forEach(function (x) { x.setTrashed(true); }); // a la papelera: se puede recuperar 30 días
    return true;
  } finally { lock.releaseLock(); }
}
/** Ejecutar UNA vez desde el editor: crea la tarea diaria (copia cada 2 días aunque nadie abra la app) y hace la primera copia. */
function instalarRespaldo() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'respaldoAutomatico') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('respaldoAutomatico').timeBased().everyDays(1).atHour(3).create();
  respaldar_(true);
}
function respaldoAutomatico() { respaldar_(false); }
/** Copia inmediata (por ejemplo, antes de un cambio grande). */
function respaldarAhora() { respaldar_(true); }

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents || '{}');
    var u = autenticar_(req.token);
    if (!u.ok) return json_(u);
    return json_(procesar_(req, u));
  } catch (err) {
    console.error(err);
    return json_({ ok: false, code: 500, error: 'Error interno del servidor.' });
  }
}

/** Valida permisos y aplica los cambios (común a doPost con token y a api() con sesión de Google). */
function procesar_(req, u) {
  var ops = req.ops || [];
  if (ops.length > MAX_OPS) return { ok: false, code: 413, error: 'Demasiados cambios en una sola petición.' };
  if (ops.length && u.role === 'lector') return { ok: false, code: 403, error: 'Tu cuenta es de solo lectura.' };
  for (var i = 0; i < ops.length; i++) {
    if (!TABLAS[ops[i].t] || typeof ops[i].id !== 'string' || !ops[i].id) return { ok: false, code: 400, error: 'Operación inválida.' };
    if (SOLO_ADMIN[ops[i].t] && u.role !== 'admin' && !(ops[i].t === 'semanas' && !ops[i].del))
      return { ok: false, code: 403, error: 'Solo un administrador puede modificar la configuración (' + ops[i].t + ').' };
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(25000);
  try { return sincronizar_(ops, Number(req.since) || 0, u); }
  finally { lock.releaseLock(); }
}

function sincronizar_(ops, since, u) {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (cambioExterno_(ss, props)) { // edición fuera de la app: se avisa a todas las apps con un nuevo número EXTERNO
    props.setProperties({ EXTERNO: String((Number(props.getProperty('EXTERNO')) || 0) + 1), ULTIMA: String(Date.now()) });
  }
  var all = props.getProperties();
  var rev = Number(all.REV) || 0, desde = since > 0 ? since : -1; // descarga completa: incluye filas escritas a mano (sin _rev)
  var porTabla = {};
  ops.forEach(function (o) { (porTabla[o.t] = porTabla[o.t] || []).push(o); });
  var nuevas = {};
  if (ops.length) rev++;
  var changes = {};
  Object.keys(TABLAS).forEach(function (t) {
    var tocada = porTabla[t], trev = Number(all['REV_' + t]) || 0;
    if (!tocada && trev <= since && since > 0) return; // sin novedades: no se lee la hoja
    var sh = ss.getSheetByName(HOJAS[t]);
    if (!sh) return;
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
      if (rr <= desde || !vals[k][col.id]) continue;
      var obj = {};
      TABLAS[t].forEach(function (c) { var v = vals[k][col[c]]; if (v !== '' && v != null) obj[c] = v.charAt(0) === "'" ? v.slice(1) : v; });
      if (vals[k][col._del]) { if (since === 0) continue; obj._del = 1; }
      out.push(obj);
    }
    if (out.length) changes[t] = out;
  });
  if (ops.length) { SpreadsheetApp.flush(); nuevas.REV = String(rev); nuevas.ULTIMA = String(Date.now()); props.setProperties(nuevas); }
  return { ok: true, rev: rev, externo: Number(all.EXTERNO) || 0, respaldo: Number(all.RESPALDO) || 0, role: u.role, email: u.email, changes: changes };
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

/** Mantenimiento opcional: elimina físicamente las filas borradas (ejecutar a fin de semestre). */
function purgarEliminados() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABLAS).forEach(function (t) {
    var sh = ss.getSheetByName(HOJAS[t]), vals = sh.getDataRange().getDisplayValues(), d = vals[0].indexOf('_del');
    for (var r = vals.length - 1; r >= 1; r--) if (vals[r][d]) sh.deleteRow(r + 1);
  });
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
