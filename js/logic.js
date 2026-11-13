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
      etiqueta: receso ? 'Receso de invierno' : '', foco: '', consejo_tema: '', lineal_cursos: '' });
    d = addDias(d, 7);
  }
  return out;
}

// ---------- ausencias y cobertura (Módulo 2) ----------
export function ausActiva(a, fecha) { return a.fecha <= fecha && fecha <= (a.hasta || a.fecha); }
export function ausenciasDe(fecha) { return all('ausencias').filter(a => ausActiva(a, fecha)); }
export function cob(a) { try { return a.cobertura ? JSON.parse(a.cobertura) : {}; } catch { return {}; } }
const enJornada = (j, ini) => !j || j === 'AMBAS' || j === jornadaDe(ini);

/** Bloques lectivos que quedan sin docente por una ausencia en una fecha. */
export function afectados(a, fecha) {
  if (!a.func_id || dow(fecha) > 5) return [];
  const d = dow(fecha), c = cob(a);
  return all('bloques').filter(b => b.func_id === a.func_id && +b.dia === d && b.tipo === 'CLASE' && enJornada(a.jornada, b.ini))
    .sort((x, y) => tmin(x.ini) - tmin(y.ini))
    .map(b => ({ b, key: fecha + '|' + b.id, cod: bloqueDe(b.ini, b.fin), cubre: c[fecha + '|' + b.id] || '' }));
}
/** Conteo de reemplazos realizados por persona en el mes (equidad). */
export function conteoMes(fecha) {
  const mes = fecha.slice(0, 7), n = {};
  for (const a of all('ausencias')) { const c = cob(a); for (const k in c) if (k.slice(0, 7) === mes && c[k] && c[k] !== INSPECTORIA) n[c[k]] = (n[c[k]] || 0) + 1; }
  return n;
}
/** ¿Quién puede cubrir? Docentes en No Lectivo o PIE en Aula de Recursos, presentes y sin otra cobertura en ese tramo. */
export function candidatos(fecha, ini, fin) {
  const d = dow(fecha), A = tmin(ini), B = tmin(fin), aus = ausenciasDe(fecha), cnt = conteoMes(fecha);
  const fuera = new Set(aus.filter(a => enJornada(a.jornada, ini)).map(a => a.func_id).filter(Boolean));
  const ocupados = new Set(); // ya asignados a cubrir en un tramo que se traslapa
  for (const a of aus) { const c = cob(a); for (const k in c) { const [f, id] = k.split('|'); if (f !== fecha) continue; const b = get('bloques', id); if (b && tmin(b.ini) < B && tmin(b.fin) > A) ocupados.add(c[k]); } }
  const por = {};
  for (const b of all('bloques')) {
    if (+b.dia !== d || tmin(b.ini) >= B || tmin(b.fin) <= A) continue;
    (por[b.func_id] = por[b.func_id] || []).push(b.tipo);
  }
  const out = [];
  for (const id in por) {
    if (fuera.has(id)) continue;
    const t = por[id], f = get('funcionarios', id); if (!f || ocupados.has(f.nombre)) continue;
    if (t.some(x => x !== 'NOLECT' && x !== 'AULAREC')) continue;
    out.push({ id, nombre: f.nombre, tipo: t.includes('NOLECT') ? 'NOLECT' : 'AULAREC', n: cnt[f.nombre] || 0 });
  }
  return out.sort((x, y) => x.n - y.n || (x.tipo === y.tipo ? x.nombre.localeCompare(y.nombre) : x.tipo === 'NOLECT' ? -1 : 1));
}
export function resumenDia(fecha) {
  const aus = ausenciasDe(fecha); let af = 0, cu = 0;
  for (const a of aus) for (const x of afectados(a, fecha)) { af++; if (x.cubre) cu++; }
  return { aus, afectados: af, cubiertos: cu, eventos: eventosDe(fecha) };
}

// ---------- eventos ----------
export function eventosDe(fecha) {
  const o = { MANANA: 0, AMBAS: 1, TARDE: 2 };
  return all('eventos').filter(e => e.fecha === fecha).sort((a, b) => (o[a.jornada] - o[b.jornada]) || String(a.hora || '').localeCompare(String(b.hora || '')));
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
