// Lógica de dominio pura (sin DOM): fechas, semanas lectivas, bloques, cobertura.
import { all, get } from './store.js';

export const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export const BLOQUES = [
  ['M1', '08:00', '08:45'], ['M2', '08:45', '09:30'], ['M3', '09:45', '10:30'], ['M4', '10:30', '11:15'],
  ['M5', '11:30', '12:15'], ['M6', '12:15', '13:00'], ['M7', '13:00', '13:45'], ['M8', '13:45', '14:30'],
  ['T1', '14:00', '14:45'], ['T2', '14:45', '15:30'], ['T3', '15:45', '16:30'], ['T4', '16:30', '17:15'],
  ['T5', '17:30', '18:15'], ['T6', '18:15', '19:00'], ['T7', '19:00', '19:45']
].map(([c, i, f]) => ({ c, i, f, j: c[0], a: tmin(i), b: tmin(f) }));

export const TIPOS = {
  CLASE: { n: 'Clase lectiva', k: 'blue' }, CODOC: { n: 'Co-docencia PIE', k: 'green' },
  NOLECT: { n: 'No lectivo / Preparación', k: 'lime' }, AULAREC: { n: 'Aula de recursos PIE', k: 'violet' },
  COLAB: { n: 'Trabajo colaborativo PIE', k: 'cyan' }, COLACION: { n: 'Colación', k: 'gray' },
  TURNO: { n: 'Turno / Recreo', k: 'pink' }, CONSEJO: { n: 'Consejo de profesores', k: 'pink' },
  LINEAL: { n: 'Reunión lineal', k: 'pink' }, DEPTO: { n: 'Reunión de departamento', k: 'pink' },
  COORD: { n: 'Coordinación / PIE', k: 'pink' }, GESTION: { n: 'Gestión', k: 'violet' },
  APOD: { n: 'Atención de apoderados', k: 'amber' }, ACLE: { n: 'Taller ACLE', k: 'amber' }
};
export const AUS_TIPOS = {
  LICENCIA: 'Licencia médica', ADMINISTRATIVO: 'Día administrativo', ADMIN_MEDIO: '½ día administrativo',
  SALIDA_CAMPEONATO: 'Salida pedagógica / Campeonato / Ensayo', CAPACITACION: 'Capacitación'
};
export const AREAS = { UTP: 'blue', PIE: 'violet', Convivencia: 'green', Direccion: 'pink', ACLE: 'amber' };
export const CICLOS = ['Ed. Parvularia', '1° Ciclo Básico', '2° Ciclo Básico', 'Enseñanza Media'];
export const EDIFICIOS = {
  ED_MATRIZ: 'Edificio Matriz', ED_CICLO_MENOR: 'Edificio Ciclo Menor y Párvulo',
  ED_PIE: 'Aulas de Recursos PIE y Especialidades', ED_COMUNES: 'Espacios Deportivos, CRA y Gestión'
};
export const MATRIZ_CAT = { TALLER_ACLE: 'Talleres ACLE', REFORZAMIENTO: 'Reforzamientos', REUNION_FIJA: 'Reuniones fijas' };
export const INSPECTORIA = 'Inspectoría + Guía pedagógica';

// ---------- tiempo ----------
export function tmin(s) { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? +m[1] * 60 + +m[2] : NaN; }
export function hhmm(s) { const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '')); return m ? m[1].padStart(2, '0') + ':' + m[2] : ''; }
const p2 = n => String(n).padStart(2, '0');
export function iso(d) { return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()); }
export function pd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function hoy() { const d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
export function addDias(s, n) { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
export function dow(s) { return ((pd(s).getUTCDay() + 6) % 7) + 1; } // 1=Lunes … 7=Domingo
export function lunesDe(s) { return addDias(s, 1 - dow(s)); }
export function fechaLarga(s) { const d = pd(s); return `${DIAS[dow(s)]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()].toLowerCase()} de ${d.getUTCFullYear()}`; }
export function fechaCorta(s) { const d = pd(s); return `${p2(d.getUTCDate())} ${MESES[d.getUTCMonth()].slice(0, 3)}`; }
export function proximoHabil(s) { let d = s; while (dow(d) > 5) d = addDias(d, 1); return d; }

export function bloqueDe(ini, fin) { // código M1..T7 con mayor traslape
  const a = tmin(ini), b = tmin(fin); let best = null, bo = 0;
  for (const B of BLOQUES) { const o = Math.min(b, B.b) - Math.max(a, B.a); if (o > bo) { bo = o; best = B; } }
  return best ? best.c : '';
}
export function jornadaDe(ini) { return tmin(ini) < 14 * 60 ? 'MANANA' : 'TARDE'; }
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[º°ª]/g, '°').replace(/\s+/g, ' ').trim();

// ---------- semanas lectivas (RF-1.2) ----------
// La numeración se calcula: las semanas tipo RECESO no avanzan el contador.
export function semanas() {
  let n = 0;
  return all('semanas').slice().sort((a, b) => a.inicio < b.inicio ? -1 : 1)
    .map(w => ({ ...w, num: w.tipo === 'RECESO' ? 0 : ++n }));
}
export function semanaDe(fecha) {
  const l = lunesDe(fecha);
  return semanas().find(w => w.inicio === l) || null;
}
export function etiquetaSemana(w) { return !w ? 'Fuera del año lectivo' : w.num ? `Semana ${w.num} de clases` : (w.etiqueta || 'Receso'); }
export function generarSemanas(anio) { // año escolar base: 1er lunes de marzo, receso de invierno 22-jun a 03-jul
  let d = `${anio}-03-01`; while (dow(d) !== 1) d = addDias(d, 1);
  const out = []; let n = 0;
  while (n < 42) {
    const receso = d >= `${anio}-06-22` && d <= `${anio}-07-03`;
    if (!receso) n++;
    out.push({ id: 'W' + d, inicio: d, fin: addDias(d, 4), tipo: receso ? 'RECESO' : 'LECTIVA', semestre: d < `${anio}-06-22` ? 1 : 2,
      etiqueta: receso ? 'Receso de invierno' : '' });
    d = addDias(d, 7);
  }
  return out;
}

// ---------- ausencias y cobertura (Módulo 2) ----------
export function ausActiva(a, fecha) { return a.fecha <= fecha && fecha <= (a.hasta || a.fecha); }
export function ausenciasDe(fecha) { return all('ausencias').filter(a => ausActiva(a, fecha)); }
export function cob(a) { try { return a.cobertura ? JSON.parse(a.cobertura) : {}; } catch { return {}; } }
// Tramo de una ausencia: AMBAS | MANANA | TARDE (desde las 14:00) | "HH:MM-HH:MM" (por horas).
export const RE_HORAS = /^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/;
export function enJornada(j, ini, fin) {
  if (!j || j === 'AMBAS') return true;
  const m = RE_HORAS.exec(j); if (m) return tmin(ini) < tmin(m[2]) && tmin(fin || ini) > tmin(m[1]);
  return j === jornadaDe(ini);
}
export function textoTramo(j) { const m = RE_HORAS.exec(j || ''); return m ? `de ${m[1]} a ${m[2]}` : j === 'MANANA' ? 'solo mañana' : j === 'TARDE' ? 'solo tarde (desde 14:00)' : ''; }

/** Bloques lectivos que quedan sin docente por una ausencia en una fecha. */
export function afectados(a, fecha) {
  if (!a.func_id || dow(fecha) > 5) return [];
  const d = dow(fecha), c = cob(a);
  return all('bloques').filter(b => b.func_id === a.func_id && +b.dia === d && b.tipo === 'CLASE' && enJornada(a.jornada, b.ini, b.fin))
    .sort((x, y) => tmin(x.ini) - tmin(y.ini))
    .map(b => ({ b, key: fecha + '|' + b.id, cod: bloqueDe(b.ini, b.fin), cubre: c[fecha + '|' + b.id] || '' }));
}
/** Los bloques afectados agrupados en tramos: horas seguidas con el mismo curso y asignatura (como en el horario). */
export function tramos(a, fecha) {
  const out = [];
  for (const x of afectados(a, fecha)) {
    const t = out[out.length - 1];
    if (t && t.fin === x.b.ini && (t.b.curso_id || '') === (x.b.curso_id || '') && t.b.detalle === x.b.detalle) { t.fin = x.b.fin; t.xs.push(x); t.cod2 = x.cod; continue; }
    out.push({ b: x.b, ini: x.b.ini, fin: x.b.fin, xs: [x], cod: x.cod, cod2: '' });
  }
  for (const t of out) { const cs = [...new Set(t.xs.map(x => x.cubre))]; t.keys = t.xs.map(x => x.key).join(','); t.cubre = cs.length === 1 ? cs[0] : ''; t.parcial = cs.length > 1; t.codigo = t.cod + (t.cod2 ? '–' + t.cod2 : ''); }
  return out;
}
/** Conteo de reemplazos realizados por persona en el mes (equidad). */
export function conteoMes(fecha) {
  const mes = fecha.slice(0, 7), n = {};
  for (const a of all('ausencias')) { const c = cob(a); for (const k in c) if (k.slice(0, 7) === mes && c[k] && c[k] !== INSPECTORIA) n[c[k]] = (n[c[k]] || 0) + 1; }
  return n;
}
// Prioridad para cubrir (colores en la app): 1 PIE que está en ese curso a esa hora (verde) · 2 PIE que trabaja con
// ese curso pero a esa hora está en aula de recursos (amarillo) · 3 docentes de asignatura en horas no lectivas (rojo)
// · 4 resto del equipo PIE libre o en aula de recursos (gris, solo en "Otros").
export const GRUPOS = {
  PIE_CURSO: { n: 'PIE en el curso', d: 'Acompaña a este curso en ese horario', k: 'g-verde' },
  PIE_AR: { n: 'PIE en aula de recursos', d: 'Trabaja con este curso; a esa hora está en aula de recursos', k: 'g-amarillo' },
  DOC: { n: 'Docente disponible', d: 'Docente de asignatura en horas no lectivas', k: 'g-rojo' },
  OTRO: { n: 'Otros PIE disponibles', d: 'Equipo PIE libre o en aula de recursos con otro curso', k: 'g-gris' }
};
const ORDEN_G = { PIE_CURSO: 0, PIE_AR: 1, DOC: 2, OTRO: 3 };
const esPIE = f => /pie/i.test(f.estamento || '') || /pie/i.test(f.departamento || '');
/** ¿Quién puede cubrir el tramo ini–fin del curso? Presentes, sin otra cobertura en ese tramo, clasificados por prioridad. */
export function candidatos(fecha, ini, fin, curso) {
  const d = dow(fecha), A = tmin(ini), B = tmin(fin), aus = ausenciasDe(fecha), cnt = conteoMes(fecha), dur = B - A;
  const fuera = new Set(aus.filter(a => enJornada(a.jornada, ini, fin)).map(a => a.func_id).filter(Boolean));
  const ocupados = new Set(); // ya asignados a cubrir en un tramo que se traslapa
  for (const a of aus) { const c = cob(a); for (const k in c) { const [f, id] = k.split('|'); if (f !== fecha) continue; const b = get('bloques', id); if (b && tmin(b.ini) < B && tmin(b.fin) > A) ocupados.add(c[k]); } }
  const por = {}, enCurso = new Set();
  for (const b of all('bloques')) {
    if (curso && b.curso_id === curso && (b.tipo === 'CODOC' || b.tipo === 'AULAREC')) enCurso.add(b.func_id);
    if (+b.dia !== d || tmin(b.ini) >= B || tmin(b.fin) <= A) continue;
    (por[b.func_id] = por[b.func_id] || []).push(b);
  }
  const out = [];
  for (const id in por) {
    if (fuera.has(id)) continue;
    const bs = por[id], f = get('funcionarios', id); if (!f || ocupados.has(f.nombre)) continue;
    const solapa = b => Math.min(tmin(b.fin), B) - Math.max(tmin(b.ini), A);
    const libre = b => b.tipo === 'NOLECT' || b.tipo === 'AULAREC', pie = esPIE(f);
    let g = '';
    if (curso && bs.some(b => b.tipo === 'CODOC' && b.curso_id === curso && solapa(b) >= Math.min(20, dur))) g = 'PIE_CURSO';
    else if (bs.every(b => libre(b) || (b.tipo === 'CODOC' && b.curso_id === curso))) {
      const ar = bs.some(b => b.tipo === 'AULAREC');
      if (pie && ar && curso && (enCurso.has(id) || bs.some(b => b.curso_id === curso))) g = 'PIE_AR';
      else if (!pie) g = 'DOC';
      else g = 'OTRO';
    }
    if (!g) continue;
    out.push({ id, nombre: f.nombre, grupo: g, tipo: bs.some(b => b.tipo === 'NOLECT') ? 'NOLECT' : 'AULAREC', n: cnt[f.nombre] || 0 });
  }
  return out.sort((x, y) => ORDEN_G[x.grupo] - ORDEN_G[y.grupo] || x.n - y.n || x.nombre.localeCompare(y.nombre));
}
export function resumenDia(fecha) {
  const aus = ausenciasDe(fecha); let af = 0, cu = 0;
  for (const a of aus) for (const x of afectados(a, fecha)) { af++; if (x.cubre) cu++; }
  return { aus, afectados: af, cubiertos: cu, eventos: eventosDe(fecha) };
}

// ---------- eventos ----------
export function eventosDe(fecha) {
  // primero las actividades sin horario, luego por hora de inicio
  const t = e => e.hora ? tmin(e.hora) : -1, o = { MANANA: 0, AMBAS: 1, TARDE: 2 };
  return all('eventos').filter(e => e.fecha === fecha).sort((a, b) => (t(a) - t(b)) || (o[a.jornada] - o[b.jornada]) || String(a.titulo).localeCompare(String(b.titulo)));
}
export function eventoAfectaCurso(e, curso) {
  const t = norm(e.cursos); if (!t) return false;
  if (/\btod[oa]s\b/.test(t) && !/\btodos los \d/.test(t)) return true;
  return t.includes(norm(curso.id)) || t.includes(norm(curso.ciclo)) || (curso.corto && t.split(/[,;/]/).some(x => x.trim() === norm(curso.corto)));
}
export function rangoHoras(e) { // "09:00-10:30" -> [min,min] o jornada completa
  const m = /(\d{1,2}:\d{2})\s*[-–a]\s*(\d{1,2}:\d{2})/.exec(e.hora || '');
  if (m) return [tmin(m[1]), tmin(m[2])];
  const u = /(\d{1,2}:\d{2})/.exec(e.hora || ''); if (u) return [tmin(u[1]), tmin(u[1]) + 60];
  return e.jornada === 'MANANA' ? [480, 825] : e.jornada === 'TARDE' ? [840, 1140] : [480, 1140];
}
/** Colisiones de un evento con otros eventos, clases y matriz fija en el mismo espacio (RF-4.3). */
export function colisiones(e) {
  if (!e.espacio_id || !e.fecha) return [];
  const [A, B] = rangoHoras(e), d = dow(e.fecha), out = [];
  for (const o of all('eventos')) if (o.id !== e.id && o.fecha === e.fecha && o.espacio_id === e.espacio_id) { const [a, b] = rangoHoras(o); if (a < B && b > A) out.push(`Evento: ${o.titulo} (${o.hora || o.jornada})`); }
  for (const m of all('matriz')) if (m.sala_id === e.espacio_id && +m.dia === d && tmin(m.ini) < B && tmin(m.fin) > A) out.push(`Fijo: ${m.titulo} (${m.ini}–${m.fin})`);
  const vistos = new Set();
  for (const b of all('bloques')) if (b.sala_id === e.espacio_id && +b.dia === d && b.tipo === 'CLASE' && tmin(b.ini) < B && tmin(b.fin) > A) { const k = b.curso_id + b.ini; if (!vistos.has(k)) { vistos.add(k); out.push(`Clase: ${b.curso_id || ''} ${b.detalle || ''} (${b.ini}–${b.fin})`); } }
  return out;
}
export function nombreEspacio(id) { const s = get('espacios', id); return s ? s.nombre : ''; }
export function nombreCorto(n) { // "APELLIDO APELLIDO NOMBRE NOMBRE" o "Nombre Apellido" -> legible
  const p = String(n || '').trim().split(/\s+/); return p.slice(0, 3).join(' ');
}
export function tituloCaso(s) { return String(s || '').toLowerCase().replace(/(^|[\s.\-/(])([a-záéíóúñ])/g, (m, a, b) => a + b.toUpperCase()); }

// ---------- cumpleaños ----------
/** Cumpleaños entre dos fechas (inclusive), con la fecha concreta en que caen. */
export function cumplesEntre(desde, hasta) {
  const out = []; for (let f = desde; f <= hasta; f = addDias(f, 1)) { const m = +f.slice(5, 7), d = +f.slice(8); for (const c of all('cumpleanos')) if (+c.mes === m && +c.dia === d) out.push({ ...c, fecha: f }); }
  return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.nombre.localeCompare(b.nombre));
}
/** Posibles duplicados en un mismo día (p. ej. "SIMCE 2° MEDIO" / "SIMCE II° MEDIO"). Devuelve ids de los repetidos. */
export function duplicados(evs) {
  const clave = t => norm(t).replace(/\b(iv|iii|ii|i)(?=\s*°|\s*medio)/g, m => ({ i: 1, ii: 2, iii: 3, iv: 4 }[m])).replace(/[^a-z0-9]/g, ''), vistos = [], dup = new Set();
  for (const e of evs) { const k = clave(e.titulo); if (k.length >= 4 && vistos.some(v => v === k || (Math.min(v.length, k.length) >= 8 && (v.includes(k) || k.includes(v))))) dup.add(e.id); vistos.push(k); }
  return dup;
}

// ---------- hora visible ----------
/** Hora para mostrar: la del evento o, si no tiene, el rango de horas que aparece en su detalle. */
export function horaVisible(e) {
  if (e.hora) return { txt: String(e.hora).replace('-', '–'), varios: false };
  const t = [...String(e.detalle || '').matchAll(/\b(\d{1,2})[:.](\d{2})\b/g)].map(m => +m[1] * 60 + +m[2]).filter(x => x >= 420 && x <= 1260).sort((a, b) => a - b);
  if (!t.length) return null;
  const f = x => String(Math.floor(x / 60)).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
  return { txt: t.length > 1 && t[t.length - 1] !== t[0] ? `${f(t[0])}–${f(t[t.length - 1])}` : f(t[0]), varios: t.length > 1 };
}

// ---------- rutina semanal (matriz fija) en el calendario ----------
const RE_SIN_CLASES = /\b(feriado|interferiado|vacaciones|receso|suspension de clases|sin clases)\b/;
/** Actividades fijas que ocurren en una fecha: solo en semanas lectivas y no en días marcados como feriado. */
export function rutinaDe(fecha, cats) {
  const d = dow(fecha); if (d > 5) return [];
  const w = semanaDe(fecha); if (!w || !w.num) return [];
  if (all('eventos').some(e => e.fecha === fecha && RE_SIN_CLASES.test(norm(e.titulo)))) return [];
  return all('matriz').filter(m => +m.dia === d && (!cats || cats[m.categoria])).sort((a, b) => tmin(a.ini) - tmin(b.ini));
}

// ---------- eventos: calendario mensual vs. detalle semanal ----------
// Un evento puede ser un hito del calendario MENSUAL (mensual = 'SI', p. ej. "SIMCE II° medio") y además llevar en
// `detalle` lo que ocurre hora a hora, que solo se despliega en la vista semanal, el PDF y el parte diario.
export const enMensual = e => e.mensual === 'SI';
/** Normaliza nombres antiguos de columnas (nota → detalle, tipo → origen) y completa `mensual`. Devuelve null si no cambia. */
export function migrarEvento(e) {
  if (e.nota === undefined && e.tipo === undefined && e.mensual && e.seccion !== 'NOTA') return null;
  const o = { ...e };
  if (o.nota !== undefined) { if (!o.detalle) o.detalle = o.nota; delete o.nota; }
  if (o.tipo !== undefined) { if (!o.origen) o.origen = o.tipo; delete o.tipo; }
  if (!o.mensual) o.mensual = /anual/i.test(o.origen || '') ? 'SI' : 'NO';
  if (o.seccion === 'NOTA') { o.especial = 'SI'; o.seccion = seccionDe(o); } // la sección "Nota especial" pasa a ser una marca
  return o;
}
const claveTitulo = t => norm(t).replace(/\b(iv|iii|ii)(?=\s*°|\s*medio)/g, m => ({ ii: 2, iii: 3, iv: 4 }[m])).replace(/[^a-z0-9]/g, '');
export function mismoTitulo(a, b) {
  const x = claveTitulo(a), y = claveTitulo(b), c = Math.min(x.length, y.length), l = Math.max(x.length, y.length);
  // un nombre contenido en el otro solo cuenta si no es un fragmento demasiado corto (evita unir "1° Ciclo" con "Autocuidado HPV1 - 1° Ciclo")
  return x.length >= 4 && (x === y || (c >= 6 && (x.includes(y) || y.includes(x)) && (c >= 10 || c / l >= 0.4)));
}
/** Pares [evento del mensual, actividad solo semanal] del mismo día con título equivalente: la misma cosa registrada dos veces. */
export function paresDuplicados() {
  const porDia = {}; for (const e of all('eventos')) (porDia[e.fecha] = porDia[e.fecha] || []).push(e);
  const pares = [];
  for (const f in porDia) {
    const an = porDia[f].filter(enMensual), se = porDia[f].filter(e => !enMensual(e)), usados = new Set();
    for (const a of an) { const b = se.find(x => !usados.has(x.id) && mismoTitulo(a.titulo, x.titulo)); if (b) { usados.add(b.id); pares.push([a, b]); } }
  }
  return pares.sort((x, y) => x[0].fecha.localeCompare(y[0].fecha));
}
/** Une un par: queda el hito del mensual (con su título) y recibe la hora, el detalle y los datos de la actividad semanal. */
export function fusionar(a, b) {
  const hora = a.hora || b.hora || '', lineas = [...new Set([a.detalle, b.detalle].filter(Boolean).flatMap(n => String(n).split('\n')))];
  return { ...a, mensual: 'SI', hora, jornada: hora ? jornadaDe(hora) : (a.jornada !== 'AMBAS' ? a.jornada : b.jornada || 'AMBAS'), detalle: lineas.join('\n'),
    espacio_id: a.espacio_id || b.espacio_id || '', cursos: a.cursos || b.cursos || '', responsable: a.responsable || b.responsable || '',
    area: a.area !== 'UTP' ? a.area : b.area || a.area, seccion: b.seccion || a.seccion || seccionDe(b), especial: esEspecial(a) || esEspecial(b) ? 'SI' : (a.especial || b.especial || ''), origen: 'Calendario anual + semanal' };
}

// ---------- secciones del calendario semanal (como la planilla del colegio) ----------
export const SECCIONES = { ESTUDIANTES: 'Actividades estudiantes', FUNCIONARIOS: 'Actividades funcionarios', EXTERNAS: 'Reuniones externas' };
/** "Nota especial" (plazo, feriado, cambio de horario) es una marca del evento, no una sección: puede estar en estudiantes o funcionarios. */
export const esEspecial = e => e.especial ? e.especial === 'SI' : e.seccion === 'NOTA';
/** Barra de la semana en que se muestra cada sección: las notas van con estudiantes y las externas con funcionarios. */
export const barraDe = sec => sec === 'ESTUDIANTES' ? 'ESTUDIANTES' : 'FUNCIONARIOS';
export const RE_NOTA = /\b(plazo|cambio de horario|horario de salida|horarios de salida|jornada reducida|salida anticipada|suspension de clases|sin clases|feriado|interferiado|ultimo dia de clases|termino de clases|receso)\b/;
const RE_EXT = /\b(red (de )?(directores|utp|pie|ingles|colegios|cra)|red utp|red directores|slep|seremi|mineduc|deprov|comision local|seminario|jornada (pme|usm)|microcentro)\b/;
const RE_FUNC = /\b(consejo|coordinador|acompanamiento|autocuidado|capacitacion|calendario (de )?ev|cierre (de )?(notas|actas)|plazo|revision (de )?libro|informes? de|calificacion|planificacion|equipo de gestion|eq\.? gestion|docentes?|profes\b|ingreso profesores|asistentes de la educacion|dia del profesor|evaluacion docente|hito entrega)/;
/** Sección de un evento: la guardada o, si no tiene, una deducida de su origen y su título. */
export function seccionDe(e) {
  if (e.seccion && SECCIONES[e.seccion]) return e.seccion;
  if (e.seccion === 'NOTA') return seccionDe({ ...e, seccion: '', origen: 'Calendario anual' }); // antigua sección "Nota especial": se ubica por su título
  const origen = e.origen || e.tipo || '';
  if (origen === 'Reunión externa') return 'EXTERNAS';
  const t = norm(e.titulo); if (RE_EXT.test(t)) return 'EXTERNAS';
  if (/^calendario (anual \+ )?semanal/i.test(origen)) return 'ESTUDIANTES'; // en la planilla semanal venían bajo "Actividades estudiantes"
  if (/reunion/.test(t) && !/apoderad/.test(t)) return 'FUNCIONARIOS';
  return RE_FUNC.test(t) && !/estudiantes?\b/.test(t.replace(/profes y estudiantes/, '')) ? 'FUNCIONARIOS' : 'ESTUDIANTES';
}

// ---------- detalle con subsecciones ----------
// Formato guardado en `detalle` (una línea por elemento, legible en Excel):
//   ## E. Media                         → subsección (línea punteada). "== E. Media" también se acepta, pero en
//                                          Google Sheets una celda que empieza con "=" se toma como fórmula.
//   08:10 | 2° Medios | Acto | Gimnasio  → hora | curso | actividad | lugar (cualquiera puede ir vacío)
//   08:00 Ingreso estudiantes            → forma simple: hora + actividad
const RE_CICLO = /^(e\.?\s*media|ense[nñ]anza media|(1|2|primer|segundo)\s*[°ºª]?\s*ciclo|primer ciclo|segundo ciclo|p[aá]rvulos?|ed\.?\s*parvularia|educaci[oó]n parvularia|todos los ciclos|b[aá]sica)\b[\s:.-]*/i;
const RE_HORA_INI = /^(\d{1,2}[:.]\d{2}(?:\s*(?:-|–|a)\s*\d{1,2}[:.]\d{2})?)\s*(?:hrs?\.?)?\s*[-–:]?\s*/i;
export function parseDetalle(texto) {
  const out = []; let ciclo = '';
  for (const raw of String(texto || '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    if (/^(==|##)/.test(l)) { out.push({ sub: l.replace(/^(==|##)\s*/, '') }); ciclo = ''; continue; }
    if (l.includes('|')) { const [hora = '', curso = '', act = '', lugar = ''] = l.split('|').map(x => x.trim()); out.push({ hora: hora.replace('.', ':'), curso, act, lugar }); continue; }
    const mh = RE_HORA_INI.exec(l), hora = mh ? mh[1].replace(/\./g, ':').replace(/\s*(-|–|a)\s*/, '-') : '', resto = mh ? l.slice(mh[0].length) : l;
    const mc = RE_CICLO.exec(resto);
    if (!hora && mc && resto.length - mc[0].length <= 2) { out.push({ sub: resto.replace(/[\s:.-]+$/, '') }); ciclo = ''; continue; } // línea que solo nombra un ciclo
    if (hora && mc && resto.length > mc[0].length) { // "08:00-08:15 E. Media 4° Medio": el ciclo pasa a ser subsección
      const c = mc[0].replace(/[\s:.-]+$/, ''); if (norm(c) !== norm(ciclo)) { out.push({ sub: c }); ciclo = c; }
      out.push({ hora, curso: '', act: resto.slice(mc[0].length).trim(), lugar: '' }); continue;
    }
    out.push({ hora, curso: '', act: resto, lugar: '' });
  }
  return out;
}
export function serializarDetalle(items) {
  return items.map(i => i.sub !== undefined ? (i.sub.trim() ? '## ' + i.sub.trim() : '') : (i.curso || i.lugar) ? [i.hora, i.curso, i.act, i.lugar].map(x => (x || '').trim()).join(' | ') : [i.hora, i.act].map(x => (x || '').trim()).filter(Boolean).join(' '))
    .filter(Boolean).join('\n');
}
/** Texto de un elemento: curso y actividad, con el lugar entre paréntesis después de lo último. */
export function textoItem(i) { const a = [i.curso, i.act].filter(Boolean).join(' · '); return i.lugar ? (a ? `${a} (${i.lugar})` : `(${i.lugar})`) : a; }

// ---------- reuniones fijas agrupadas y talleres ----------
/** Tipo de reunión: consejo de profesores, reunión lineal, trabajo colaborativo PIE, departamento u otra (GEN). */
export function tipoReunion(m) {
  const t = norm(m.titulo);
  return /colaborativo/.test(t) ? 'PIE' : /\b(departamento|depto)\b/.test(t) ? 'DEPTO' : /\bconsejo\b/.test(t) && !/escolar/.test(t) ? 'CONSEJO' : /\blineal(es)?\b/.test(t) ? 'LINEAL' : 'GEN';
}
/** Nombre de taller sin la palabra "Taller(es) (de)" al comienzo: "Taller Ajedrez - 2° ciclo" → "Ajedrez - 2° ciclo". */
export const sinTaller = t => String(t || '').replace(/^\s*taller(?:es)?\s+(de\s+)?/i, '').trim();
