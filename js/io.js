// Importación / exportación .XLSX (RF-5.1). SheetJS se carga solo cuando se necesita.
import { all, bulk, uid, del } from './store.js';
import { unificarSalas, BLOQUES, hhmm, tmin, tituloCaso, norm, MESES, DIAS, pd, iso, addDias, dow, lunesDe, jornadaDe, generarSemanas, semanas, seccionDe, enMensual, mismoTitulo, fusionar, migrarEvento, sinTaller, esEspecial, nombreEspacio, EDIFICIOS } from './logic.js';

let cargando;
export function sheetjs() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return cargando = cargando || new Promise((ok, no) => { const s = document.createElement('script'); s.src = ((window.SIG_CONFIG || {}).BASE || '') + 'vendor/xlsx.min.js'; s.onload = () => ok(window.XLSX); s.onerror = () => no(new Error('No se pudo cargar el lector de Excel')); document.head.appendChild(s); });
}
const leer = async file => (await sheetjs()).read(await file.arrayBuffer());
const filas = (X, wb, n) => wb.Sheets[n] ? X.utils.sheet_to_json(wb.Sheets[n], { raw: false, defval: '' }) : [];
const v = x => { const s = String(x == null ? '' : x).trim(); return s === '-' || s === 'None' ? '' : s; };

const TIPO_MAP = [['clase lectiva', 'CLASE'], ['apoyo en aula', 'CODOC'], ['preparaci', 'NOLECT'], ['colaci', 'COLACION'], ['aula de recursos', 'AULAREC'],
['colaborativo', 'COLAB'], ['turno', 'TURNO'], ['consejo', 'CONSEJO'], ['lineal', 'LINEAL'], ['departamento', 'DEPTO'], ['coordinaci', 'COORD'], ['gesti', 'GESTION'], ['apoderados', 'APOD'], ['acle', 'ACLE']];
const tipoDe = t => { const n = norm(t); const m = TIPO_MAP.find(([k]) => n.includes(k)); return m ? m[1] : 'GESTION'; };
function edificioDe(nombre, sede, tipo) {
  const n = norm(nombre + ' ' + tipo);
  if (/pie|recursos|fono|terapia/.test(n)) return 'ED_PIE';
  if (/sala de clases/.test(norm(tipo))) return /ciclo menor/.test(norm(sede)) ? 'ED_CICLO_MENOR' : 'ED_MATRIZ';
  if (/ciclo menor|parvulo|sala nt/.test(n)) return /gimnasio/.test(n) ? 'ED_COMUNES' : 'ED_CICLO_MENOR';
  return 'ED_COMUNES';
}

/** Detecta qué tipo de libro es y lo importa. Devuelve un resumen legible. */
export async function importarArchivo(file) {
  if (/\.csv$/i.test(file.name)) return importarCumpleanos(file);
  const X = await sheetjs(), wb = await leer(file), names = wb.SheetNames;
  if (names.includes('04_Bloques_Horario')) return importarBD(X, wb);
  if (names.some(n => HOJA_DE[n])) return importarUnificada(X, wb);
  if (names.filter(n => /^\d{1,2}$/.test(n.trim())).length >= 3) return importarSemanal(X, wb);
  if (names.some(n => mesDe(n) >= 0)) return importarCalendario(X, wb);
  throw new Error('No reconozco el formato. Se esperaba la BD de horarios, el Calendario Anual (hojas por mes), el Calendario Semanal (hojas 01, 02…) la base unificada de SIG-UTP o el listado de docentes/asistentes (.csv).');
}
// ---- Cumpleaños desde los listados de docentes / asistentes (CSV del Mineduc, separado por ";") ----
// Minimización de datos: del listado solo se guarda el nombre, el día y el mes. El RUN y el año de nacimiento se descartan.
async function importarCumpleanos(file) {
  const buf = await file.arrayBuffer(); let txt;
  try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { txt = new TextDecoder('windows-1252').decode(buf); }
  const filas = txt.split(/\r?\n/).filter(l => l.trim()), cab = (filas.shift() || '').split(';').map(x => x.trim().toUpperCase());
  const col = re => cab.findIndex(h => re.test(h)), iN = col(/_NOMBRE$/), iP = col(/_PATERNO$/), iM = col(/_MATERNO$/), iF = col(/(FEC_NAC|FECHA_NACIMIENTO)$/);
  if (iN < 0 || iP < 0 || iF < 0) throw new Error('El CSV no parece un listado de docentes o asistentes (faltan columnas de nombre o fecha de nacimiento).');
  const existentes = new Map(all('cumpleanos').map(c => [norm(c.nombre), c])), nuevos = new Map(); let leidos = 0, sinFecha = 0;
  for (const l of filas) {
    const c = l.split(';'), m = /^(\d{1,2})[/-](\d{1,2})[/-]\d{2,4}$/.exec((c[iF] || '').trim()); leidos++;
    if (!m) { sinFecha++; continue; }
    const nombre = tituloCaso([(c[iN] || '').trim().split(/\s+/)[0], c[iP], iM >= 0 ? c[iM] : ''].map(x => (x || '').trim()).filter(Boolean).join(' '));
    const dia = +m[1], mes = +m[2]; if (!nombre || !(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12)) { sinFecha++; continue; }
    const prev = existentes.get(norm(nombre)) || nuevos.get(norm(nombre));
    nuevos.set(norm(nombre), { id: prev ? prev.id : uid('CU'), nombre, dia, mes });
  }
  const filasOk = [...nuevos.values()], antes = filasOk.filter(c => existentes.has(norm(c.nombre))).length;
  if (!filasOk.length) throw new Error('No se encontraron fechas de nacimiento válidas en el archivo.');
  bulk('cumpleanos', filasOk);
  return `Cumpleaños cargados: ${filasOk.length - antes} nuevos y ${antes} actualizados (de ${leidos} filas${sinFecha ? `, ${sinFecha} sin fecha válida` : ''}). Solo se guardó nombre, día y mes.`;
}
// "NOV", "SEPT", "MARZO" o "NOVIEMBRE 2026" -> índice de mes
function mesDe(nombre) { const n = norm(nombre).replace(/[^a-z]/g, ''); return n.length < 3 ? -1 : MESES.findIndex(m => { const k = norm(m); return k.startsWith(n) || n.startsWith(k); }); }
const esSerial = c => (typeof c === 'number' && c > 40000 && c < 60000) || (typeof c === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.trim())); // fecha de Excel o texto AAAA-MM-DD
const serialISO = c => typeof c === 'string' ? c.trim() : iso(new Date(Math.round((c - 25569) * 86400000)));
const util = t => /[a-z0-9áéíóúñ]/i.test(t);

// ---- Base de horarios (BD_AppSheet_Horarios) ----
function importarBD(X, wb) {
  // Minimización de datos: el RUT y los enlaces a Drive del archivo de origen NO se importan.
  const func = filas(X, wb, '01_Funcionarios').filter(r => v(r.ID_Funcionario)).map(r => ({
    id: v(r.ID_Funcionario), nombre: tituloCaso(v(r.Funcionario)), estamento: /docente/i.test(r.Estamento_Rol) ? 'DOCENTE' : 'PIE',
    cargo: v(r.Estamento_Rol), departamento: tituloCaso(v(r.Departamento)), jefatura: /sin jefatura/i.test(r.Jefatura) ? '' : v(r.Jefatura),
    horas_contrato: v(r.Horas_Contrato_Total), horas_lectivas: v(r.Horas_Clases_Cron), horas_no_lectivas: v(r.Horas_Preparacion), email: ''
  }));
  const cursos = filas(X, wb, '02_Cursos').filter(r => v(r.ID_Curso)).map(r => ({
    id: v(r.ID_Curso), orden: +r.Orden_Nivel || 0, ciclo: v(r.Ciclo), jornada: /tarde/i.test(r.Jornada) ? 'TARDE' : 'MANANA',
    sala_id: v(r.ID_Sala_Base), profesor_jefe: v(r.Profesor_Jefe), equipo_pie: v(r.Equipo_PIE_Asignado)
  }));
  const esp = new Map();
  for (const r of filas(X, wb, '03_Salas')) if (v(r.ID_Sala)) esp.set(v(r.ID_Sala), { id: v(r.ID_Sala), nombre: v(r.Nombre_Sala), edificio: edificioDe(r.Nombre_Sala, r.Sede_Sector, r.Tipo_Espacio), tipo: v(r.Tipo_Espacio), capacidad: '', encargado: '' });
  const ensure = (id, nombre) => { if (id && !esp.has(id)) esp.set(id, { id, nombre: v(nombre) || id, edificio: edificioDe(nombre, '', ''), tipo: 'Dependencia', capacidad: '', encargado: '' }); };
  const bloques = [], vistos = new Set(); let omit = 0;
  for (const r of filas(X, wb, '04_Bloques_Horario')) {
    let ini = hhmm(r.Hora_Inicio), fin = hhmm(r.Hora_Fin); const id = v(r.ID_Bloque), lab = v(r.Bloque), num = /^(\d+)°$/.exec(lab);
    // Filas "Entre 2°", "Recreo", etc. son artefactos de celdas combinadas con horas de relleno: se omiten.
    if (!id || vistos.has(id) || !(num || lab === 'R')) { omit++; continue; }
    if (!(tmin(fin) > tmin(ini))) { // hora de término corrupta: se usa el bloque estándar de esa fila
      const std = BLOQUES.find(b => b.c === (/tarde/i.test(r.Jornada) ? 'T' : 'M') + (num ? num[1] : ''));
      if (!std || std.i !== ini) { omit++; continue; } fin = std.f;
    }
    vistos.add(id); ensure(v(r.ID_Sala), r.Sala_Dependencia);
    bloques.push({ id, func_id: v(r.ID_Funcionario), dia: +r.Orden_Dia, ini, fin, tipo: tipoDe(r.Tipo_Actividad), curso_id: v(r.ID_Curso), detalle: v(r.Asignatura_o_Detalle).slice(0, 200), sala_id: v(r.ID_Sala) });
  }
  // Complemento: clases que figuran en la grilla del curso pero no en el horario de ningún funcionario
  // (p. ej. "Por Asignar / Electivo"). Se agregan sin docente para que el horario del curso quede completo.
  const porNombre = new Map(filas(X, wb, '01_Funcionarios').map(r => [norm(r.Funcionario), v(r.ID_Funcionario)]));
  const salaCurso = new Map(cursos.map(c => [c.id, c.sala_id])), DCOL = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes']; let comp = 0;
  const cubierto = {}; for (const b of bloques) if (b.tipo === 'CLASE' && b.curso_id) (cubierto[b.curso_id + '|' + b.dia] = cubierto[b.curso_id + '|' + b.dia] || []).push([tmin(b.ini), tmin(b.fin)]);
  for (const r of filas(X, wb, '07_Grilla_Visual_Cursos_Salas')) {
    if (!/^1/.test(r.Tipo_Grilla) || !salaCurso.has(v(r.ID_Curso))) continue;
    const [ini, fin] = String(r.Horario_Desde_Hasta).split(/\s+-\s+/).map(hhmm); if (!(tmin(fin) > tmin(ini))) continue;
    DCOL.forEach((dc, i) => {
      const t = v(r[dc]), cur = v(r.ID_Curso); if (!t) return;
      if ((cubierto[cur + '|' + (i + 1)] || []).some(([a, b]) => a < tmin(fin) && b > tmin(ini))) return;
      const m = /^(.*?)\s*\((.*?)\)\s*(\[PIE:.*)?$/.exec(t), doc = m ? m[2].split(',').map(x => porNombre.get(norm(x))).find(Boolean) : '';
      bloques.push({ id: `G-${cur}-${i + 1}-${ini}`.replace(/\s+/g, ''), func_id: doc || '', dia: i + 1, ini, fin, tipo: 'CLASE', curso_id: cur, detalle: (m ? m[1] : t).slice(0, 200), sala_id: salaCurso.get(cur) || '' }); comp++;
    });
  }
  const matriz = filas(X, wb, '05_Actividades_Recurrentes').filter(r => v(r.ID_Actividad_Semanal)).map(r => {
    ensure(v(r.ID_Sala), r.Sala_Dependencia);
    return { id: v(r.ID_Actividad_Semanal), categoria: /acle/i.test(r.Categoria_Actividad) ? 'TALLER_ACLE' : /reforz/i.test(r.Nombre_Actividad) && !/acle/i.test(r.Categoria_Actividad) ? 'REFORZAMIENTO' : 'REUNION_FIJA',
      dia: +r.Orden_Dia, ini: hhmm(r.Hora_Inicio), fin: hhmm(r.Hora_Fin), titulo: /acle/i.test(r.Categoria_Actividad) ? sinTaller(v(r.Nombre_Actividad)) : v(r.Nombre_Actividad), grupo: v(r.Ciclo_o_Departamento), sala_id: v(r.ID_Sala), participantes: v(r.Participantes_Convocados).slice(0, 500) };
  });
  { // una sala física por número: "Sala 8 (Mañana)" y "Sala 8 (Tarde)" pasan a ser "Sala 8"
    const u = unificarSalas({ espacios: [...esp.values()], bloques, cursos, matriz });
    if (u) { for (const id of u.borrar) esp.delete(id); for (const e of u.espacios) esp.set(e.id, e);
      for (const [lista, c] of [[bloques, 'sala_id'], [cursos, 'sala_id'], [matriz, 'sala_id']]) for (const r of lista) if (u.mapa.has(r[c])) r[c] = u.mapa.get(r[c]); }
  }
  bulk('funcionarios', func, true); bulk('cursos', cursos, true); bulk('espacios', [...esp.values()], true); bulk('bloques', bloques, true); bulk('matriz', matriz, true);
  if (!all('semanas').length) bulk('semanas', generarSemanas((window.SIG_CONFIG || {}).ANIO || new Date().getFullYear()));
  return `Base de horarios importada: ${func.length} funcionarios, ${cursos.length} cursos, ${esp.size} espacios, ${bloques.length} bloques (${omit} filas de relleno omitidas, ${comp} clases sin docente asignado tomadas de la grilla de cursos) y ${matriz.length} actividades fijas.`;
}

// ---- Calendario Anual (grilla mensual humana) ----
const AREA_KW = [['PIE', /\bpie\b|diferencial|fonoaudi|psicopedag/], ['ACLE', /acle|taller|campeonato|extraescolar|deport/], ['Convivencia', /convivencia|apoderad|orientaci|efem|d[ií]a del|aniversario|acto/], ['Direccion', /direcci|slep|consejo escolar|cuenta p|sostenedor/]];
export function clasificar(t) {
  const n = norm(t), area = (AREA_KW.find(([, re]) => re.test(n)) || ['UTP'])[0];
  const h = /(\d{1,2})[:.](\d{2})\s*(?:[-–a]\s*(\d{1,2})[:.](\d{2}))?/.exec(t);
  const hora = h ? `${h[1].padStart(2, '0')}:${h[2]}` + (h[3] ? `-${h[3].padStart(2, '0')}:${h[4]}` : '') : '';
  const jornada = hora ? jornadaDe(hora) : /tarde/.test(n) ? 'TARDE' : /manana/.test(n) ? 'MANANA' : 'AMBAS';
  return { area, hora, jornada };
}
function importarCalendario(X, wb) {
  // Formato real: cada día ocupa 1–2 columnas; una fila de fechas y debajo una línea por evento.
  // La columna contigua a la fecha lleva efemérides; a veces la fecha fue sobrescrita con texto (se infiere por sus vecinas).
  const nuevos = [], existentes = new Set();
  const agregar = (f, texto) => { for (const linea of String(texto).split(/\r?\n/)) {
    const t = linea.replace(/\.{4,}/g, ' ').replace(/^[\s•·\-*]+/, '').replace(/\s+/g, ' ').trim(); if (t.length < 3 || !util(t) || /^notes?:?$/i.test(t)) continue;
    const key = f + '|' + norm(t); if (existentes.has(key)) continue; existentes.add(key);
    nuevos.push({ id: uid('EV'), fecha: f, titulo: t.slice(0, 200), origen: 'Calendario anual', mensual: 'SI', cursos: '', espacio_id: '', responsable: '', detalle: '', ...clasificar(t) }); } };
  for (const name of wb.SheetNames) {
    const mi = mesDe(name); if (mi < 0) continue;
    const g = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const filasFecha = []; g.forEach((row, r) => { if ((row || []).some(esSerial)) filasFecha.push(r); });
    filasFecha.forEach((r, n) => {
      const row = g[r], cols = []; row.forEach((c, i) => { if (esSerial(c)) cols.push(i); });
      const paso = cols.length > 1 ? Math.min(...cols.slice(1).map((c, i) => c - cols[i])) : 2, dias = new Map(cols.map(c => [c, serialISO(row[c])]));
      if (cols.length >= 3) for (let k = -6; k <= 6; k++) { // fechas faltantes dentro de la misma semana y mes
        const c = cols[0] + k * paso, f = addDias(dias.get(cols[0]), k);
        if (c < 0 || dias.has(c) || lunesDe(f) !== lunesDe(dias.get(cols[0])) || pd(f).getUTCMonth() !== mi) continue;
        dias.set(c, f); if (typeof row[c] === 'string') agregar(f, row[c]);
      }
      const fin = Math.min(n + 1 < filasFecha.length ? filasFecha[n + 1] : g.length, r + 16);
      for (const [c, f] of dias) for (let k = r; k < fin; k++) for (let j = c; j < c + paso; j++) {
        if (k === r && j === c) continue; const cel = (g[k] || [])[j]; if (typeof cel === 'string' && !esSerial(cel)) agregar(f, cel);
      }
    });
  }
  if (!nuevos.length) throw new Error('No se encontraron eventos en el calendario anual.');
  return sincronizarAnual(nuevos);
}
// El calendario anual es la fuente del calendario MENSUAL: al cargarlo, la app queda igual a él sin perder
// el detalle semanal ni lo editado en los eventos que siguen existiendo.
function sincronizarAnual(archivo) {
  const prev = all('eventos').filter(e => enMensual(e) && /anual/i.test(e.origen || '')), usados = new Set(), cambios = [], borrar = [];
  let iguales = 0, renombrados = 0, nuevos = 0, quitados = 0, degradados = 0, unidos = 0;
  for (const n of archivo) {
    const x = prev.find(e => !usados.has(e.id) && e.fecha === n.fecha && norm(e.titulo) === norm(n.titulo)) || prev.find(e => !usados.has(e.id) && e.fecha === n.fecha && mismoTitulo(e.titulo, n.titulo));
    if (x) { usados.add(x.id); if (x.titulo !== n.titulo) { cambios.push({ ...x, titulo: n.titulo }); renombrados++; } else iguales++; continue; }
    const sem = all('eventos').find(e => !enMensual(e) && !usados.has(e.id) && e.fecha === n.fecha && mismoTitulo(e.titulo, n.titulo)); // la misma actividad ya estaba en el semanal
    n.seccion = seccionDe(n);
    if (sem) { usados.add(sem.id); cambios.push(fusionar(n, sem)); borrar.push(sem.id); unidos++; } else { cambios.push(n); nuevos++; }
  }
  for (const e of prev) if (!usados.has(e.id)) {
    if (e.origen === 'Calendario anual') { borrar.push(e.id); quitados++; }
    else { cambios.push({ ...e, mensual: 'NO', origen: 'Calendario semanal' }); degradados++; } // traía detalle semanal: se conserva en la semana
  }
  if (cambios.length) bulk('eventos', cambios);
  for (const id of borrar) del('eventos', id);
  return `Calendario anual cargado: ${archivo.length} eventos en el mensual · ${nuevos} nuevos, ${unidos} unidos con su detalle semanal, ${renombrados} con nombre actualizado, ${quitados} quitados${degradados ? `, ${degradados} pasan solo a la semana` : ''}, ${iguales} sin cambios.`;
}

// ---- Calendario Semanal (hojas 01…NN; dos diseños: celda única por día, o pares hora|texto por secciones) ----
const RE_H = /^(\d{1,2})[:.](\d{2})\s*(?:hrs?\.?)?\s*(?:(?:-|–|a|:)\s*(\d{1,2})[:.](\d{2}))?\s*(?:hrs?\.?)?\s*[:\-–]?\s*(.*)$/i;
const p2 = n => String(n).padStart(2, '0');
function horaDe(v) { // serial de Excel o texto -> ["HH:MM" | "HH:MM-HH:MM", resto]
  if (typeof v === 'number' && v >= 0 && v < 1) { const m = Math.round(v * 1440); return [p2(Math.floor(m / 60)) + ':' + p2(m % 60), '']; }
  const m = RE_H.exec(String(v == null ? '' : v).trim()); if (!m || +m[1] > 23) return null;
  return [p2(m[1]) + ':' + m[2] + (m[3] ? '-' + p2(m[3]) + ':' + m[4] : ''), m[5].trim()];
}
const RE_SUB = /^(e\.? ?media|ensenanza media|[12][°a]? ?ciclo|parvulo|ed\.? parvularia|todos los ciclos|basica)\s*:?$/;
const RE_SEC = [[/^actividades estudiantes/, 'ev'], [/^reuniones externas/, 'ext'], [/^reforzamientos?$/, 'REFORZAMIENTO'], [/^talleres extraescolares/, 'TALLER_ACLE'],
  [/^(trabajo colaborativo|actividades funcionarios|reuniones$|consideraciones|feliz cumple|cumpleanos)/, 'omitir']];
function importarSemanal(X, wb) {
  const sem = semanas(); if (!sem.length) throw new Error('Primero genera las semanas lectivas (Ajustes → Datos y conexión).');
  const porNum = new Map(sem.filter(w => w.num).map(w => [w.num, w])), espacios = new Map(all('espacios').map(e => [norm(e.nombre), e.id]));
  const existentes = new Set(all('eventos').map(e => e.fecha + '|' + norm(e.titulo))), nuevos = [], fijos = []; let hojas = 0;
  const ultima = Math.max(...wb.SheetNames.filter(n => /^\d{1,2}$/.test(n.trim())).map(Number));
  for (const name of wb.SheetNames) {
    if (!/^\d{1,2}$/.test(name.trim())) continue; const w = porNum.get(+name); if (!w) continue; hojas++;
    const g = X.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    const hr = g.findIndex(r => (r || []).filter(c => typeof c === 'string' && /^\s*(lunes|martes|mi[eé]rcoles|jueves|viernes)\b/i.test(c)).length >= 3); if (hr < 0) continue;
    const dcols = []; g[hr].forEach((c, i) => { const m = typeof c === 'string' && /^\s*(lunes|martes|mi[eé]rcoles|jueves|viernes)\b/i.exec(c); if (m) dcols.push([i, ['lunes', 'martes', 'miercoles', 'jueves', 'viernes'].indexOf(norm(m[1]))]); });
    const moderno = g.slice(hr + 1, hr + 3).some(r => (r || []).some(c => typeof c === 'string' && /actividades estudiantes/i.test(c)));
    for (const [c, d] of dcols) {
      const fecha = addDias(w.inicio, d), toks = []; // secuencia de {h: hora, x: texto} del día; null = separador
      if (moderno) for (let k = hr + 1; k < g.length; k++) { const a = (g[k] || [])[c], b = (g[k] || [])[c + 1], ha = a == null || a === '' ? null : horaDe(a), xb = typeof b === 'string' ? b.replace(/\s+/g, ' ').trim() : '';
        if ((a == null || String(a).trim() === '') && !xb) toks.push(null); else if (ha && (xb || ha[1])) toks.push({ h: ha[0], x: xb || ha[1] }); else if (ha) continue; else toks.push({ h: '', x: (String(a || '').replace(/\s+/g, ' ').trim() || xb), soloB: !String(a || '').trim() }); }
      else { toks.push({ h: '', x: 'Actividades Estudiantes' }); for (const linea of String((g[hr + 1] || [])[c] || '').split(/\r?\n/)) { const t = linea.replace(/\s+/g, ' ').trim(); if (!t) { toks.push(null); continue; } const h = horaDe(t); toks.push(h && h[1] ? { h: h[0], x: h[1] } : { h: '', x: t }); } }
      let modo = 'omitir', cur = null; const evs = [];
      for (const t of toks) {
        if (!t) { cur = null; continue; }
        const n = norm(t.x), sec = !t.h && RE_SEC.find(([re]) => re.test(n));
        if (sec) { modo = sec[1]; cur = null; continue; }
        if (modo === 'omitir') continue;
        if (modo === 'REFORZAMIENTO' || modo === 'TALLER_ACLE') { if (+name === ultima && t.h && /-/.test(t.h)) fijos.push({ categoria: modo, dia: d + 1, ini: t.h.slice(0, 5), fin: t.h.slice(6), titulo: modo === 'REFORZAMIENTO' ? 'Reforzamiento ' + t.x : sinTaller(t.x) }); continue; }
        const nota = !t.h && (RE_SUB.test(n) || /^[-•*]/.test(t.x) || (cur && /:$/.test(t.x)));
        if (cur && (nota || (t.h && cur.grupo))) { cur.nota.push((t.h ? t.h + ' ' : '') + t.x.replace(/^[-•*]\s*/, '')); continue; }
        if (!util(t.x)) continue;
        cur = { titulo: t.x.replace(/^[-•*]\s*/, ''), hora: t.h, nota: [], grupo: !t.h, ext: modo === 'ext' }; evs.push(cur);
      }
      for (const e of evs) {
        if (!e.hora && e.nota.length === 1) { const h = horaDe(e.nota[0]); if (h) { e.hora = h[0]; e.nota = h[1] ? [h[1]] : []; } }
        let espacio_id = ''; if (e.nota.length === 1 && espacios.has(norm(e.nota[0]))) { espacio_id = espacios.get(norm(e.nota[0])); e.nota = []; }
        const key = fecha + '|' + norm(e.titulo); if (existentes.has(key)) continue; existentes.add(key);
        const cl = clasificar(e.titulo), hr1 = e.hora || (e.nota.map(x => (horaDe(x) || [])[0]).find(Boolean) || '');
        nuevos.push({ id: uid('EV'), fecha, titulo: e.titulo.slice(0, 200), hora: e.hora, jornada: hr1 ? jornadaDe(hr1) : 'AMBAS', area: e.ext ? 'Direccion' : cl.area, origen: e.ext ? 'Reunión externa' : 'Calendario semanal', mensual: 'NO', seccion: e.ext ? 'EXTERNAS' : 'ESTUDIANTES', cursos: '', espacio_id, responsable: '', detalle: e.nota.join('\n').slice(0, 1500) });
      }
    }
  }
  if (!hojas) throw new Error('Las hojas del calendario semanal no calzan con las semanas lectivas configuradas.');
  let msg = `Calendario semanal importado: ${nuevos.length} actividades nuevas desde ${hojas} semanas.`;
  if (nuevos.length) bulk('eventos', nuevos);
  if (fijos.length >= 5) { // la matriz de talleres y reforzamientos se toma de la semana más reciente
    const vistos = new Set(), filas = fijos.filter(f => { const k = [f.categoria, f.dia, f.ini, norm(f.titulo)].join('|'); return vistos.has(k) ? false : vistos.add(k); }).map((f, i) => ({ id: `SEM-${f.categoria === 'TALLER_ACLE' ? 'T' : 'R'}${p2(i + 1)}`, grupo: '', sala_id: '', participantes: '', ...f }));
    bulk('matriz', all('matriz').filter(m => m.categoria === 'REUNION_FIJA').concat(filas), true);
    msg += ` Matriz permanente actualizada desde la semana ${ultima}: ${filas.filter(f => f.categoria === 'TALLER_ACLE').length} talleres y ${filas.filter(f => f.categoria === 'REFORZAMIENTO').length} reforzamientos.`;
  }
  return msg;
}

// ---- Respaldo / exportación completa ----
// ================= BASE DE DATOS UNIFICADA (un solo libro .xlsx) =================
// Una hoja por tabla, con las mismas columnas que la planilla de Google. Es el único archivo que hay que conservar.
const ESQUEMA = {
  semanas: ['01_Semanas_Clases', ['id', 'inicio', 'fin', 'tipo', 'semestre', 'etiqueta']],
  eventos: ['02_Eventos_Calendario', ['id', 'fecha', 'titulo', 'hora', 'mensual', 'seccion', 'especial', 'detalle', 'jornada', 'area', 'cursos', 'espacio_id', 'responsable', 'origen']],
  ausencias: ['03_Ausencias_Reemplazos', ['id', 'fecha', 'hasta', 'func_id', 'nombre', 'tipo', 'jornada', 'nota', 'cobertura']],
  funcionarios: ['04_Funcionarios', ['id', 'nombre', 'estamento', 'departamento', 'cargo', 'jefatura', 'horas_contrato', 'horas_lectivas', 'horas_no_lectivas', 'email']],
  espacios: ['05_Espacios_Edificios', ['id', 'nombre', 'edificio', 'tipo', 'capacidad', 'encargado']],
  cursos: ['06_Cursos', ['id', 'orden', 'ciclo', 'jornada', 'sala_id', 'profesor_jefe', 'equipo_pie']],
  matriz: ['07_Matriz_Fija_Semanal', ['id', 'categoria', 'dia', 'ini', 'fin', 'titulo', 'grupo', 'sala_id', 'participantes']],
  bloques: ['08_Bloques_Docentes', ['id', 'func_id', 'dia', 'ini', 'fin', 'tipo', 'curso_id', 'detalle', 'sala_id']],
  cumpleanos: ['09_Cumpleanos', ['id', 'nombre', 'dia', 'mes']],
  proyectos: ['10_Proyectos', ['id', 'area', 'nombre', 'responsable', 'estado', 'doc_url', 'orden']],
  tareas: ['11_Tareas', ['id', 'proyecto_id', 'titulo', 'responsable', 'inicio', 'fin', 'hito', 'estado', 'duracion_min', 'agendada', 'evento_id', 'nota']]
};
const HOJA_DE = {}; for (const t in ESQUEMA) { HOJA_DE[ESQUEMA[t][0]] = t; HOJA_DE['SIG_' + t] = t; }
const LEEME = [
  ['SIG-UTP · BASE DE DATOS UNIFICADA'], [''],
  ['Este libro es la base de datos completa de la plataforma. Es el ÚNICO archivo que necesitas conservar.'],
  ['Para cargarlo: Ajustes → Base de datos → Cargar base unificada. Reemplaza todo lo que haya en la app.'],
  ['Para actualizarlo: Ajustes → Descargar base unificada (hazlo como respaldo cada cierto tiempo).'], [''],
  ['HOJAS DE DATOS (se pueden editar en Excel respetando los encabezados):'],
  ['01_Semanas_Clases', 'Semanas lectivas. tipo = LECTIVA o RECESO (los recesos no cuentan en la numeración).'],
  ['02_Eventos_Calendario', 'Todos los eventos. mensual = SI si aparece en el calendario MENSUAL (los hitos del calendario anual) o NO si es solo de la semana. detalle = lo que ocurre hora a hora (una línea por horario, ej. "08:30 Ingreso a sala"), visible solo en la semana, el PDF y el parte diario. seccion = ESTUDIANTES, FUNCIONARIOS o EXTERNAS. especial = SI si es una nota especial (plazo, feriado, cambio de horario): se muestra primero y en rojo en su sección. En detalle, una línea "## E. Media" es una subsección (línea punteada) y una línea "08:10 | 2° Medio A | Acto | Gimnasio" es hora | curso | actividad | lugar. jornada = MANANA, TARDE o AMBAS. area = UTP, PIE, Convivencia, Direccion, ACLE. origen = de dónde vino.'],
  ['03_Ausencias_Reemplazos', 'Ausencias y quién cubre cada bloque (columna cobertura: la administra la app).'],
  ['04_Funcionarios', 'Docentes y equipo PIE. No incluye RUT.'],
  ['05_Espacios_Edificios', 'edificio = ED_MATRIZ, ED_CICLO_MENOR, ED_PIE o ED_COMUNES.'],
  ['06_Cursos', 'El id es el nombre del curso. jornada = MANANA o TARDE.'],
  ['07_Matriz_Fija_Semanal', 'categoria = TALLER_ACLE, REFORZAMIENTO o REUNION_FIJA. dia = 1 (lunes) a 5 (viernes).'],
  ['08_Bloques_Docentes', 'Horario de cada funcionario por bloque. De aquí salen los horarios de cursos, la sábana y la cobertura. tipo = CLASE, CODOC, NOLECT, AULAREC, COLAB, COLACION, TURNO, CONSEJO, LINEAL, DEPTO, COORD, GESTION, APOD, ACLE.'],
  ['09_Cumpleanos', 'Cumpleaños de funcionarios: nombre, dia (1-31) y mes (1-12). Sin año ni RUN. Se cargan desde los listados de docentes y asistentes del Mineduc (.csv) en Ajustes → Agregar desde archivos originales.'],
  ['10_Proyectos', 'Proyectos de la Planeación UTP (carta Gantt). area = GP (Gestión Pedagógica), LID (Liderazgo), CONV (Convivencia) o REC (Gestión de Recursos). estado = EN_CURSO, BORRADOR o CERRADO. doc_url = enlace al Doc del proyecto (acta y bitácora). orden = posición dentro de su área. No guardes aquí notas privadas: esta base la ve el equipo directivo.'],
  ['11_Tareas', 'Tareas de cada proyecto: una barra en la Gantt desde inicio hasta fin (AAAA-MM-DD). hito = SI si es un solo día clave (rombo). estado = PENDIENTE, EN_CURSO o HECHA. duracion_min = minutos estimados para reservar tiempo en el calendario. agendada = cuándo quedó bloqueada en el calendario. evento_id = id del evento de 02_Eventos_Calendario con el que se relaciona (opcional).'], [''],
  ['REGLAS AL EDITAR A MANO:'],
  ['• No cambies la columna id ni los nombres de las hojas o encabezados. Para agregar una fila, inventa un id nuevo que no se repita.'],
  ['• Fechas como texto AAAA-MM-DD (ej.: 2026-11-12) y horas como texto HH:MM (ej.: 08:45).'],
  ['• Las hojas VISTA_… (calendario por mes) son solo para leer o imprimir: se regeneran al descargar y sus cambios NO se cargan.'],
  ['• Contiene datos personales del colegio: no lo subas a GitHub ni lo compartas fuera del equipo directivo.']
];
function importarUnificada(X, wb) {
  const tablas = {}, res = [];
  for (const n of wb.SheetNames) { const t = HOJA_DE[n]; if (!t) continue;
    const cols = ESQUEMA[t][1], vistos = new Set(), rows = [];
    for (const r of X.utils.sheet_to_json(wb.Sheets[n], { raw: false, defval: '', dateNF: 'yyyy-mm-dd' })) {
      const id = String(r.id == null ? '' : r.id).trim(); if (!id || vistos.has(id)) continue; vistos.add(id);
      const o = { id }; for (const k of cols) { if (k === 'id') continue; let x = String(r[k] == null ? '' : r[k]).trim(); if (x === '') continue;
        if ((k === 'ini' || k === 'fin') && t !== 'tareas') x = hhmm(x) || x; else if (k === 'dia' || k === 'orden' || k === 'mes') x = +x || 0; o[k] = x; }
      if (t === 'matriz' && o.categoria === 'TALLER_ACLE' && o.titulo) o.titulo = sinTaller(o.titulo); // los talleres se nombran sin "Taller"
      if (t === 'eventos') { if (!o.detalle && r.nota) o.detalle = String(r.nota).trim(); if (!o.origen && r.tipo) o.origen = String(r.tipo).trim(); Object.assign(o, migrarEvento(o) || {}); if (o.mensual) o.mensual = /^s/i.test(o.mensual) ? 'SI' : 'NO'; if (o.especial) o.especial = /^s/i.test(o.especial) ? 'SI' : 'NO'; } // bases anteriores (nota, tipo)
      rows.push(o);
    }
    tablas[t] = rows;
  }
  // Validación mínima antes de reemplazar: evita vaciar la app con un libro dañado.
  for (const e of tablas.eventos || []) if (!/^\d{4}-\d{2}-\d{2}$/.test(e.fecha || '')) throw new Error(`Fecha inválida en 02_Eventos_Calendario (id ${e.id}): "${e.fecha || ''}". Usa texto AAAA-MM-DD.`);
  for (const b of tablas.bloques || []) if (!(tmin(b.fin) > tmin(b.ini)) || !(b.dia >= 1 && b.dia <= 5)) throw new Error(`Bloque inválido en 08_Bloques_Docentes (id ${b.id}): revisa dia, ini y fin.`);
  for (const t of tablas.tareas || []) for (const k of ['inicio', 'fin']) if (t[k] && !/^\d{4}-\d{2}-\d{2}$/.test(t[k])) throw new Error(`Fecha inválida en 11_Tareas (id ${t.id}, ${k}): "${t[k]}". Usa texto AAAA-MM-DD.`);
  for (const t of tablas.tareas || []) if (!t.inicio) throw new Error(`Falta la fecha de inicio en 11_Tareas (id ${t.id}).`);
  for (const w of tablas.semanas || []) if (!/^\d{4}-\d{2}-\d{2}$/.test(w.inicio || '')) throw new Error(`Fecha inválida en 01_Semanas_Clases (id ${w.id}).`);
  for (const t in ESQUEMA) if (tablas[t]) { bulk(t, tablas[t], true); res.push(`${tablas[t].length} ${{ cumpleanos: 'cumpleaños', matriz: 'actividades fijas' }[t] || t}`); }
  return `Base unificada cargada: ${res.join(', ')}.`;
}
export async function exportarLibro() {
  const X = await sheetjs(), wb = X.utils.book_new();
  // 1) Calendario en formato humano: una hoja por mes, grilla Lunes–Domingo con una línea por evento.
  const sem = semanas(); if (sem.length) {
    const y = +sem[0].inicio.slice(0, 4), porDia = {};
    for (const e of all('eventos')) (porDia[e.fecha] = porDia[e.fecha] || []).push((e.hora ? e.hora + ' ' : '') + e.titulo + (e.espacio_id ? ` (${nombreEspacio(e.espacio_id)})` : ''));
    for (let m = 2; m <= 11; m++) {
      const aoa = [[`${MESES[m].toUpperCase()} ${y}`], DIAS.slice(1)];
      let d = `${y}-${String(m + 1).padStart(2, '0')}-01`; d = addDias(d, 1 - dow(d));
      for (;;) {
        const f = [], t = [];
        for (let i = 0; i < 7; i++, d = addDias(d, 1)) { const en = d.slice(0, 4) == y && pd(d).getUTCMonth() === m; f.push(en ? d : ''); t.push(en ? (porDia[d] || []).join('\n') : ''); }
        if (!f.some(Boolean)) break;
        aoa.push(f, t);
      }
      const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = Array(7).fill({ wch: 30 }); X.utils.book_append_sheet(wb, ws, MESES[m].toUpperCase());
    }
  }
  XLSX_escribir(X, wb);
}
function XLSX_escribir(X, vistas) {
  const wb = X.utils.book_new(), lee = X.utils.aoa_to_sheet(LEEME); lee['!cols'] = [{ wch: 28 }, { wch: 120 }]; X.utils.book_append_sheet(wb, lee, 'LEEME');
  const ANCHO = { titulo: 46, mensual: 9, nombre: 34, detalle: 34, nota: 40, cobertura: 30, participantes: 40, equipo_pie: 40, profesor_jefe: 28, cargo: 34, id: 20, foco: 30 };
  for (const t in ESQUEMA) { const [hoja, cols] = ESQUEMA[t];
    const orden = t === 'tareas' ? (a, b) => String(a.inicio).localeCompare(String(b.inicio)) || String(a.proyecto_id).localeCompare(String(b.proyecto_id)) : t === 'proyectos' ? (a, b) => String(a.area).localeCompare(String(b.area)) || (+a.orden || 99) - (+b.orden || 99) : t === 'eventos' || t === 'ausencias' ? (a, b) => String(a.fecha).localeCompare(String(b.fecha)) : t === 'semanas' ? (a, b) => String(a.inicio).localeCompare(String(b.inicio)) : t === 'cursos' ? (a, b) => a.orden - b.orden : t === 'bloques' ? (a, b) => String(a.func_id).localeCompare(String(b.func_id), 'es', { numeric: true }) || a.dia - b.dia || tmin(a.ini) - tmin(b.ini) : (a, b) => String(a.id).localeCompare(String(b.id), 'es', { numeric: true });
    const aoa = [cols].concat(all(t).slice().sort(orden).map(r => cols.map(k => t === 'eventos' && k === 'seccion' ? seccionDe(r) : t === 'eventos' && k === 'mensual' ? (r.mensual || 'NO') : t === 'eventos' && k === 'especial' ? (esEspecial(r) ? 'SI' : 'NO') : r[k] == null ? '' : String(r[k]))));
    const ws = X.utils.aoa_to_sheet(aoa); ws['!cols'] = cols.map(k => ({ wch: ANCHO[k] || 14 })); ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(aoa.length - 1, 0), c: cols.length - 1 } }) };
    X.utils.book_append_sheet(wb, ws, hoja); }
  for (const n of vistas.SheetNames) X.utils.book_append_sheet(wb, vistas.Sheets[n], 'VISTA_' + n);
  X.writeFile(wb, `SIG-UTP_Base_Unificada_${new Date().toISOString().slice(0, 10)}.xlsx`, { compression: true });
}
export { EDIFICIOS };
