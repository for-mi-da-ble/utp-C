// Planeación UTP: carta Gantt por área del PME (proyectos → tareas) sobre las semanas de clases.
// Tablas: proyectos (10_Proyectos) y tareas (11_Tareas). Los hitos del calendario (eventos UTP marcados
// como nota especial) aparecen solos en una franja superior; no hay que copiarlos.
import * as S from './store.js';
import * as L from './logic.js';
import { esc, ic, modal, campos, toast } from './ui.js';

const { all, get, put } = S;
export const AREAS_PME = [['GP', 'Gestión Pedagógica', 'blue'], ['LID', 'Liderazgo', 'violet'], ['CONV', 'Convivencia', 'green'], ['REC', 'Gestión de Recursos', 'amber']];
const AREA = Object.fromEntries(AREAS_PME.map(([k, n, c]) => [k, { n, c }]));
export const EST_TAREA = [['PENDIENTE', 'Pendiente'], ['EN_CURSO', 'En curso'], ['HECHA', 'Hecha']];
export const EST_PROY = [['EN_CURSO', 'En curso'], ['BORRADOR', 'Borrador'], ['CERRADO', 'Cerrado']];
let ultimaHecha = null;
const st = { anio: 0, area: '', resp: '', hechas: true, tramo: 'anio' };

const ed = () => S.puedeEditar();
const lun = f => L.lunesDe(f);
const anios = () => { const s = new Set(all('tareas').map(t => +String(t.inicio || '').slice(0, 4)).filter(Boolean)); for (const w of all('semanas')) s.add(+w.inicio.slice(0, 4)); return [...s].sort(); };
const orden = (a, b) => (+a.orden || 99) - (+b.orden || 99) || String(a.nombre).localeCompare(String(b.nombre), 'es');
export const tareasDe = pid => all('tareas').filter(t => t.proyecto_id === pid).sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)) || String(a.titulo).localeCompare(String(b.titulo), 'es'));
export const atrasada = t => t.estado !== 'HECHA' && (t.fin || t.inicio) < L.hoy();

/** Columnas de la Gantt: un lunes por columna. Usa las semanas lectivas del año si existen; si no, un año base provisional. */
export function columnas(anio) {
  let ws = L.semanas().filter(w => w.inicio.startsWith(String(anio))), prov = false;
  if (!ws.length) { let n = 0; ws = L.generarSemanas(anio).map(w => ({ ...w, num: w.tipo === 'RECESO' ? 0 : ++n })); prov = true; }
  const por = Object.fromEntries(ws.map(w => [w.inicio, w]));
  let ini = ws[0].inicio, fin = ws[ws.length - 1].inicio;
  for (const t of all('tareas')) { const a = String(t.inicio || ''), b = String(t.fin || t.inicio || ''); if (a.startsWith(String(anio)) && lun(a) < ini) ini = lun(a); if (b.startsWith(String(anio)) && lun(b) > fin) fin = lun(b); }
  const cols = []; for (let d = ini; d <= fin; d = L.addDias(d, 7)) { const w = por[d]; cols.push({ lunes: d, num: w ? w.num : 0, tipo: w ? w.tipo : 'FUERA', sem: w ? +w.semestre : (+d.slice(5, 7) < 7 ? 1 : 2) }); }
  return { cols, prov };
}
/** Hitos del calendario por semana: eventos de UTP marcados como nota especial (plazos, SIMCE, cierres…). */
function hitosPorSemana(anio) {
  const m = {}; for (const e of all('eventos')) if (String(e.fecha).startsWith(String(anio)) && (e.area || 'UTP') === 'UTP' && L.esEspecial(e)) (m[lun(e.fecha)] = m[lun(e.fecha)] || []).push(e);
  for (const k in m) m[k].sort((a, b) => a.fecha.localeCompare(b.fecha)); return m;
}
const visible = t => (!st.resp || L.norm(t.responsable) === L.norm(st.resp)) && (st.hechas || t.estado !== 'HECHA');

export function vPlan(head) {
  const ys = anios(); if (!st.anio) st.anio = ys.includes(+L.hoy().slice(0, 4)) ? +L.hoy().slice(0, 4) : (ys[ys.length - 1] || +L.hoy().slice(0, 4));
  const { cols: todas, prov } = columnas(st.anio), cols = todas.filter(c => st.tramo === 'anio' || c.sem === +st.tramo);
  const hitos = hitosPorSemana(st.anio), hoyL = lun(L.hoy()), y = String(st.anio);
  const proys = all('proyectos').filter(p => !st.area || p.area === st.area).sort(orden);
  const resps = [...new Set(all('tareas').map(t => t.responsable).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  // encabezado de meses y semanas
  const meses = []; for (const c of cols) { const m = +c.lunes.slice(5, 7) - 1; if (meses.length && meses[meses.length - 1].m === m) meses[meses.length - 1].n++; else meses.push({ m, n: 1 }); }
  const thM = meses.map(x => `<th colspan="${x.n}" class="gm">${x.n > 1 ? L.MESES[x.m].slice(0, 3) : L.MESES[x.m][0]}</th>`).join('');
  const thW = cols.map(c => `<th class="gw ${c.tipo !== 'LECTIVA' ? 'off' : ''} ${c.lunes === hoyL ? 'now' : ''}" title="Semana del ${L.fechaCorta(c.lunes)}">${c.num || (c.tipo === 'RECESO' ? 'R' : '·')}</th>`).join('');
  const trH = cols.map(c => { const h = hitos[c.lunes] || []; return `<td class="gc ${c.tipo !== 'LECTIVA' ? 'off' : ''} ${c.lunes === hoyL ? 'now' : ''}">${h.length ? `<button class="gh" data-a="plan-hitos" data-v="${c.lunes}" title="${esc(h.map(e => L.fechaCorta(e.fecha) + ' · ' + e.titulo).join('\n'))}">${h.length}</button>` : ''}</td>`; }).join('');
  const celdas = (a, b, cls, hito) => cols.map(c => { const on = c.lunes >= lun(a) && c.lunes <= lun(b || a); return `<td class="gc ${c.tipo !== 'LECTIVA' ? 'off' : ''} ${c.lunes === hoyL ? 'now' : ''}">${on ? (hito ? `<span class="gd ${cls}"></span>` : `<span class="gb ${cls} ${c.lunes === lun(a) ? 'a' : ''} ${c.lunes === lun(b || a) ? 'z' : ''}"></span>`) : ''}</td>`; }).join('');
  let body = '';
  for (const [ak, an, ac] of AREAS_PME) {
    const ps = proys.filter(p => p.area === ak); if (!ps.length) continue;
    body += `<tr class="ga"><th class="gl"><div class="glin"><span class="dot ${ac}"></span>${an}</div></th><td colspan="${cols.length}" class="ga-f"></td></tr>`;
    for (const p of ps) {
      const ts = tareasDe(p.id).filter(t => String(t.inicio).startsWith(y) || String(t.fin).startsWith(y)), vs = ts.filter(visible);
      if (st.resp && !vs.length) continue;
      const hechas = ts.filter(t => t.estado === 'HECHA').length, ini = ts.map(t => t.inicio).sort()[0], fin = ts.map(t => t.fin || t.inicio).sort().pop();
      body += `<tr class="gp"><th class="gl"><div class="glin"><button class="gtit" data-a="plan-pry" data-id="${esc(p.id)}"><b>${esc(p.nombre)}</b><small>${esc(p.responsable || '')}${ts.length ? ` · ${hechas}/${ts.length}` : ''}${p.estado === 'BORRADOR' ? ' · borrador' : ''}</small></button>${ed() ? `<button class="ibtn sm" data-a="plan-tar-n" data-p="${esc(p.id)}" aria-label="Agregar tarea a ${esc(p.nombre)}">${ic('plus')}</button>` : ''}${p.doc_url ? `<a class="ibtn sm" href="${esc(p.doc_url)}" target="_blank" rel="noopener" aria-label="Abrir documento">${ic('arrow')}</a>` : ''}</div></th>${ini ? celdas(ini, fin, 'sum ' + ac) : cols.map(() => '<td class="gc"></td>').join('')}</tr>`;
      for (const t of vs) {
        const cls = [AREA[ak].c, t.estado === 'HECHA' ? 'done' : '', atrasada(t) ? 'late' : '', t.estado === 'EN_CURSO' ? 'run' : ''].join(' ');
        body += `<tr class="gt"><th class="gl"><div class="glin"><button class="gtit" data-a="plan-tar" data-id="${esc(t.id)}"><span>${t.estado === 'HECHA' ? '✓ ' : ''}${esc(t.titulo)}</span><small>${esc(L.nombreCorto(t.responsable || ''))}${t.fin ? ' · ' + L.fechaCorta(t.fin) : ''}${t.agendada ? ' · agendada' : ''}</small></button></div></th>${celdas(t.inicio, t.fin, cls, t.hito === 'SI')}</tr>`;
      }
    }
  }
  if (!body) body = `<tr><td colspan="${cols.length + 1}" class="gvac">${all('proyectos').length ? 'No hay tareas con estos filtros.' : 'Aún no hay proyectos. Carga la base unificada con las hojas 10_Proyectos y 11_Tareas, o crea el primero.'}</td></tr>`;
  const filtros = `<div class="pills scroll">${ys.map(a => `<button class="pill sm ${a === st.anio ? 'on' : ''}" data-a="plan-anio" data-v="${a}">${a}</button>`).join('')}<span class="sep"></span>
    ${[['anio', 'Año'], ['1', '1° sem.'], ['2', '2° sem.']].map(([k, n]) => `<button class="pill sm ${st.tramo === k ? 'on' : ''}" data-a="plan-tramo" data-v="${k}">${n}</button>`).join('')}<span class="sep"></span>
    <button class="pill sm ${!st.area ? 'on' : ''}" data-a="plan-area" data-v="">Todas las áreas</button>${AREAS_PME.map(([k, n, c]) => `<button class="pill sm ${st.area === k ? 'on' : ''}" data-a="plan-area" data-v="${k}"><span class="dot ${c}"></span>${n}</button>`).join('')}</div>
    <div class="row sm pfil"><label>Responsable <select data-c="plan-resp"><option value="">Todos</option>${resps.map(r => `<option ${r === st.resp ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>
    <label class="pchk"><input type="checkbox" data-c="plan-hechas" ${st.hechas ? 'checked' : ''}><span>Mostrar tareas hechas</span></label>
    ${prov ? `<span class="tag amber">Semanas ${st.anio} provisionales (año base). Ajusta las semanas lectivas en Ajustes cuando salga el calendario oficial.</span>` : ''}</div>`;
  return `<a class="back" href="#hoy">${ic('left')} Volver a Hoy</a>` + head('Carta Gantt', `Planeación UTP ${st.anio} por área del PME · rombo = hito de un día · números arriba = hitos del calendario`,
    ed() ? `<button class="btn" data-a="plan-pry-n">${ic('plus')} Proyecto</button><button class="btn dark" data-a="plan-tar-n">${ic('plus')} Tarea</button>` : '')
    + filtros
    + `<div class="card nopad"><div class="gantt"><table class="gtab"><thead><tr><th class="gl gcorner" rowspan="2">Proyecto / tarea</th>${thM}</tr><tr>${thW}</tr></thead>
      <tbody><tr class="gh-row"><th class="gl"><small>Hitos del calendario</small></th>${trH}</tr>${body}</tbody></table></div></div>
      <p class="muted sm legend"><span class="gb blue a z demo"></span> tarea · <span class="gb late a z demo"></span> atrasada · <span class="gb done a z demo"></span> hecha · columnas grises = receso o fuera del año lectivo · la columna marcada es la semana actual</p>`;
}

/** Bloque para la vista Hoy: tareas de la semana del día elegido y las atrasadas, con marcado rápido. */
export function bloqueHoy(fecha) {
  const lu = lun(fecha), vi = L.addDias(lu, 4), hoyL = lun(L.hoy());
  const mia = t => !st.resp || L.norm(t.responsable) === L.norm(st.resp);
  const sem = all('tareas').filter(t => t.estado !== 'HECHA' && mia(t) && t.inicio <= vi && (t.fin || t.inicio) >= lu);
  const atr = lu === hoyL ? all('tareas').filter(t => mia(t) && atrasada(t) && (t.fin || t.inicio) < lu) : [];
  const hechas = all('tareas').filter(t => t.estado === 'HECHA' && mia(t) && t.inicio <= vi && (t.fin || t.inicio) >= lu).length;
  const lista = atr.concat(sem.sort((a, b) => String(a.fin || a.inicio).localeCompare(String(b.fin || b.inicio))));
  const fila = t => { const p = get('proyectos', t.proyecto_id) || {}, late = atrasada(t);
    return `<div class="pitem ${late ? 'late' : ''}">${ed() ? `<button class="tick" data-a="plan-ok" data-id="${esc(t.id)}" aria-label="Marcar hecha: ${esc(t.titulo)}" title="Marcar hecha"></button>` : `<span class="dot ${(AREA[p.area] || {}).c || 'gray'}"></span>`}
      <button class="grow tl" data-a="plan-tar" data-id="${esc(t.id)}"><b>${t.hito === 'SI' ? '◆ ' : ''}${esc(t.titulo)}</b><small>${esc(p.nombre || '')}${t.responsable ? ' · ' + esc(L.nombreCorto(t.responsable)) : ''}${t.duracion_min ? ' · ' + esc(t.duracion_min) + ' min' : ''}</small></button>
      <span class="pf">${late ? 'Atrasada · ' : ''}${t.hito === 'SI' || !t.fin || t.fin === t.inicio ? L.fechaCorta(t.inicio) : 'hasta ' + L.fechaCorta(t.fin)}</span></div>`; };
  const resps = [...new Set(all('tareas').map(t => t.responsable).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  return `<div class="card prox"><div class="ch"><h3>Planeación de la semana <small class="muted">${L.fechaCorta(lu)} – ${L.fechaCorta(vi)}</small></h3>
    <div class="row sm pfil0"><select data-c="plan-resp" aria-label="Responsable"><option value="">Todos</option>${resps.map(r => `<option ${r === st.resp ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
    ${ed() ? `<button class="ibtn" data-a="plan-tar-n" aria-label="Nueva tarea">${ic('plus')}</button>` : ''}<a class="btn sm" href="#plan">${ic('gantt')} Carta Gantt</a></div></div>
    ${lista.length ? `<div class="plist">${lista.slice(0, 12).map(fila).join('')}</div>${lista.length > 12 ? `<p class="muted sm">…y ${lista.length - 12} más en la carta Gantt.</p>` : ''}` : `<div class="okbox">${ic('check')}<p>Sin tareas pendientes esta semana${hechas ? ` (${hechas} hecha${hechas > 1 ? 's' : ''})` : ''}.</p></div>`}
    ${atr.length ? `<p class="muted sm">${atr.length} atrasada${atr.length > 1 ? 's' : ''} de semanas anteriores al inicio de la lista.</p>` : ''}</div>`;
}

// ---------- modales ----------
const optProy = () => AREAS_PME.map(([k, n]) => ({ group: n, items: all('proyectos').filter(p => p.area === k).sort(orden).map(p => [p.id, p.nombre]) })).filter(g => g.items.length);
function optHitos(anio, actual) {
  const evs = all('eventos').filter(e => (String(e.fecha).startsWith(String(anio)) && L.esEspecial(e)) || e.id === actual).sort((a, b) => a.fecha.localeCompare(b.fecha));
  return [['', '— Sin hito asociado —']].concat(evs.map(e => [e.id, `${L.fechaCorta(e.fecha)} · ${e.titulo}`.slice(0, 80)]));
}
export function mProyecto(id) {
  const p = get('proyectos', id) || { area: st.area || 'GP', estado: 'EN_CURSO' };
  if (!ed() && !id) return;
  modal(id ? 'Editar proyecto' : 'Nuevo proyecto', `<form class="form" data-form="pry" data-id="${esc(id || '')}">${campos([
    { k: 'nombre', label: 'Proyecto', req: 1, ph: 'Ej.: Evaluación auténtica (Decreto 67)' },
    { k: 'area', label: 'Área PME', type: 'select', options: AREAS_PME.map(([k, n]) => [k, n]), w: 'half' }, { k: 'responsable', label: 'Responsable', list: 'dl-func', w: 'half' },
    { k: 'estado', label: 'Estado', type: 'seg', options: EST_PROY },
    { k: 'doc_url', label: 'Documento del proyecto (Google Docs)', type: 'url', ph: 'https://docs.google.com/…', max: 400, hint: 'Acta y bitácora. Las notas privadas no van aquí: esta base la ve el equipo directivo.' },
    { k: 'orden', label: 'Orden en la Gantt', type: 'number', w: 'third' }], p)}</form>`,
    ed() ? pie(!!id, 'pry') : '');
}
export function mTarea(id, pre) {
  const t = get('tareas', id) || { estado: 'PENDIENTE', inicio: L.lunesDe(L.hoy()), hito: 'NO', ...pre };
  if (!ed() && !id) return;
  if (!all('proyectos').length) return toast('Primero crea un proyecto', 'err');
  modal(id ? 'Editar tarea' : 'Nueva tarea', `<form class="form" data-form="tar" data-id="${esc(id || '')}">${campos([
    { k: 'titulo', label: 'Tarea', req: 1, ph: 'Ej.: Revisar planificaciones Unidad 3' },
    { k: 'proyecto_id', label: 'Proyecto', type: 'select', options: optProy(), w: 'half' }, { k: 'responsable', label: 'Responsable', list: 'dl-func', w: 'half' },
    { k: 'inicio', label: 'Desde', type: 'date', req: 1, w: 'half' }, { k: 'fin', label: 'Hasta (fecha límite)', type: 'date', w: 'half' },
    { k: 'hito', label: '', type: 'check', texto: 'Es un hito de un solo día (se dibuja como rombo)' },
    { k: 'estado', label: 'Estado', type: 'seg', options: EST_TAREA },
    { k: 'duracion_min', label: 'Duración estimada (min)', type: 'number', w: 'half', hint: 'Para reservar tiempo en el calendario.' }, { k: 'agendada', label: 'Agendada', w: 'half', ph: 'AAAA-MM-DD HH:MM', max: 40, hint: 'Cuándo se bloqueó en el calendario.' },
    { k: 'evento_id', label: 'Hito del calendario asociado', type: 'select', options: optHitos(String(t.inicio || L.hoy()).slice(0, 4), t.evento_id) },
    { k: 'nota', label: 'Nota', type: 'textarea' }], t)}</form>`,
    ed() ? pie(!!id, 'tar', id ? `<button class="btn" data-a="plan-hecha">${t.estado === 'HECHA' ? 'Reabrir' : 'Marcar hecha'}</button>` : '') : '');
}
const pie = (existe, f, extra) => `${existe ? `<button class="btn danger" data-a="borrar" data-f="${f}">Eliminar</button>` : ''}<span class="grow"></span>${extra || ''}<button class="btn dark" data-a="guardar" data-f="${f}">Guardar</button>`;
function mHitos(lunes) {
  const evs = all('eventos').filter(e => lun(e.fecha) === lunes && (e.area || 'UTP') === 'UTP' && L.esEspecial(e)).sort((a, b) => a.fecha.localeCompare(b.fecha));
  modal(`Hitos · semana del ${L.fechaCorta(lunes)}`, `<div class="chips col">${evs.map(e => `<button class="chip" data-a="ir-dia" data-f="${e.fecha}">${esc(e.titulo)}<small>${L.DIAS[L.dow(e.fecha)]} ${L.fechaCorta(e.fecha)}</small></button>`).join('')}</div>`);
}

/** Guardado de los formularios de Planeación. Devuelve false si hay un error (el modal queda abierto). */
export function guardarPlan(f, o, id) {
  if (f === 'pry') {
    if (o.doc_url && !/^https:\/\//i.test(o.doc_url)) { toast('El enlace debe comenzar con https://', 'err'); return false; }
    put('proyectos', { ...(get('proyectos', id) || {}), ...o, orden: o.orden === '' ? '' : +o.orden || '', id: id || S.uid('PR') });
    return true;
  }
  if (f === 'tar') {
    if (!o.proyecto_id) { toast('Elige un proyecto', 'err'); return false; }
    if (o.hito === 'SI' || !o.fin) o.fin = o.hito === 'SI' ? o.inicio : (o.fin || o.inicio);
    if (o.fin < o.inicio) { toast('La fecha límite es anterior al inicio', 'err'); return false; }
    put('tareas', { ...(get('tareas', id) || {}), ...o, id: id || S.uid('TA') });
    st.anio = +o.inicio.slice(0, 4); return true;
  }
  return true;
}
export function puedeBorrar(t, id) { if (t === 'proyectos' && all('tareas').some(x => x.proyecto_id === id)) { toast('El proyecto tiene tareas: muévelas o elimínalas antes', 'err'); return false; } return true; }

export const ACCIONES = {
  'plan-anio': el => { st.anio = +el.dataset.v; }, 'plan-tramo': el => { st.tramo = el.dataset.v; }, 'plan-area': el => { st.area = el.dataset.v; },
  'plan-pry': el => mProyecto(el.dataset.id), 'plan-pry-n': () => mProyecto(''),
  'plan-tar': el => mTarea(el.dataset.id), 'plan-tar-n': el => mTarea('', el.dataset.p ? { proyecto_id: el.dataset.p, responsable: (get('proyectos', el.dataset.p) || {}).responsable || '' } : {}),
  'plan-hitos': el => mHitos(el.dataset.v),
  'plan-ok': el => { const t = get('tareas', el.dataset.id); if (!t || !ed()) return; put('tareas', { ...t, estado: 'HECHA' }); toast(`Hecha: ${String(t.titulo).slice(0, 40)}`, 'ok', ['Deshacer', 'plan-deshacer']); ultimaHecha = t; },
  'plan-deshacer': () => { if (ultimaHecha) { put('tareas', ultimaHecha); ultimaHecha = null; toast('Restaurada', 'ok'); } },
  'plan-hecha': () => { const f = document.querySelector('[data-form=tar]'), t = f && get('tareas', f.dataset.id); if (!t) return; put('tareas', { ...t, estado: t.estado === 'HECHA' ? 'PENDIENTE' : 'HECHA' }); document.querySelector('#modal-root').innerHTML = ''; toast(t.estado === 'HECHA' ? 'Tarea reabierta' : 'Tarea hecha', 'ok'); }
};
export function cambioPlan(el) {
  const c = el.dataset && el.dataset.c;
  if (c === 'plan-resp') { st.resp = el.value; return true; }
  if (c === 'plan-hechas') { st.hechas = el.checked; return true; }
  return false;
}
