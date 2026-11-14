import * as S from './store.js';
import * as L from './logic.js';
import { esc, $, ic, toast, modal, cerrarModal, campos, leerForm, initDrag, copiar } from './ui.js';
import { importarArchivo, exportarLibro } from './io.js';

const CFG = window.SIG_CONFIG || {};
const { all, get, put, del } = S;
const ui = { view: 'hoy', fecha: L.proximoHabil(L.hoy()), mes: '', hTab: 'curso', ciclo: '', curso: '', func: '', sabDia: 0, sabJ: 'M', edit: false, rutMes: false, edificio: 'ED_MATRIZ', cfg: 'datos', q: '', area: '' };
const VISTAS = [['hoy', 'Hoy', 'home'], ['semana', 'Semana', 'week'], ['calendario', 'Calendario', 'cal'], ['horarios', 'Horarios', 'grid'], ['espacios', 'Espacios', 'pin']];
const ed = () => S.puedeEditar(), adm = () => S.esAdmin();
const lunes = () => L.lunesDe(ui.fecha);
const cursosOrd = () => all('cursos').slice().sort((a, b) => a.orden - b.orden);
const funcOrd = () => all('funcionarios').slice().sort((a, b) => a.nombre.localeCompare(b.nombre));
const fn = id => (get('funcionarios', id) || {}).nombre || (id ? '' : 'Por asignar');
const materia = b => { const d = String(b.detalle || ''); const p = d.split('·'); return (p.length > 1 ? p[p.length - 1] : d.replace(/^\s*\d\s*[º°]\s*(medio|b[aá]sico)\s*[a-d]\b/i, '')).trim() || d; };
const rango = b => `${b.ini}–${b.fin}`;

// ============ render ============
function render(fondo) {
  const a = document.activeElement; // una actualización de fondo (sincronización) no debe pisar lo que se está escribiendo en línea
  if (fondo === true && a && a.closest && a.closest('#view') && a.dataset.inline) { pendFondo = true; return; }
  pendFondo = false;
  $('#nav').innerHTML = VISTAS.map(([k, n]) => `<a href="#${k}" class="pill ${ui.view === k ? 'on' : ''}">${n}</a>`).join('');
  $('#bnav').innerHTML = VISTAS.concat([['config', 'Ajustes', 'gear']]).map(([k, n, i]) => `<a href="#${k}" class="${ui.view === k ? 'on' : ''}">${ic(i)}<span>${n}</span></a>`).join('');
  const e = S.estado, pend = S.pendientes();
  const st = { local: ['Modo local', 'gray'], ok: ['Sincronizado', 'green'], sincronizando: ['Sincronizando…', 'blue'], pendiente: ['Conectando…', 'blue'], offline: ['Sin conexión', 'amber'], error: ['Error de sincronización', 'pink'], sesion: ['Inicia sesión', 'amber'] }[e.sync];
  $('#sync').innerHTML = `<span class="dot ${st[1]}"></span><span class="lbl">${st[0]}${pend && S.nube ? ` · ${pend}` : ''}</span>`;
  $('#sync').title = e.error || (e.email ? e.email + ' · ' + e.rol : '');
  const v = $('#view'), y = window.scrollY;
  if (!all('funcionarios').length && ui.view !== 'config') v.innerHTML = vacio();
  else v.innerHTML = ({ hoy: vHoy, semana: vSemana, calendario: vCal, horarios: vHor, espacios: vEsp, config: vCfg }[ui.view] || vHoy)();
  window.scrollTo(0, y);
  $('#login').hidden = !(S.nube && !S.sesionValida() && !S.estado.rol);
  $('#banner').innerHTML = S.nube && !S.sesionValida() && S.estado.rol ? `<div class="banner">${ic('alert')} Sesión expirada: ves la copia guardada en este dispositivo. <button class="btn sm" data-a="relogin">Iniciar sesión</button></div>` : (e.sync === 'error' && e.error ? `<div class="banner pink">${ic('alert')} ${esc(e.error)}</div>` : '');
}
let raf, pendFondo = false, hayFrente = false; const pedir = fondo => { if (fondo !== true) hayFrente = true; cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const f = !hayFrente; hayFrente = false; render(f); }); };
const vacio = () => `<div class="empty card"><h2>Bienvenido/a a SIG-UTP</h2><p>Aún no hay datos cargados. ${adm() ? 'Carga la <b>base de datos unificada</b> (.xlsx) para comenzar.' : 'Pide a la Jefatura de UTP que cargue la base de horarios.'}</p>${adm() ? `<a class="btn dark" href="#config">${ic('gear')} Ir a Configuración</a>` : ''}</div>`;
const head = (t, sub, right) => `<div class="phead"><div><h1>${t}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div><div class="pacts">${right || ''}</div></div>`;
const navFecha = (paso, lbl) => `<div class="datenav"><button class="ibtn" data-a="fecha" data-n="${-paso}" aria-label="Anterior">${ic('left')}</button><button class="pill" data-a="fecha-hoy">${lbl}</button><button class="ibtn" data-a="fecha" data-n="${paso}" aria-label="Siguiente">${ic('right')}</button></div>`;

// ============ HOY (contingencia) ============
function donut(p, c1) { const r = 52, C = 2 * Math.PI * r; return `<svg viewBox="0 0 130 130" class="donut"><circle cx="65" cy="65" r="${r}" class="trk"/><circle cx="65" cy="65" r="${r}" stroke="${c1}" stroke-dasharray="${(C * p).toFixed(1)} ${C}" transform="rotate(-90 65 65)" class="arc"/></svg>`; }
function chipsCobertura(a, x, fecha) {
  if (x.cubre) return `<div class="cubre"><span class="tag green">${ic('check')} ${esc(x.cubre)}</span>${ed() ? `<button class="ibtn sm" data-a="descubrir" data-id="${a.id}" data-k="${x.key}" aria-label="Quitar reemplazo">${ic('x')}</button>` : ''}</div>`;
  if (!ed()) return `<span class="tag pink">Sin cubrir</span>`;
  const c = L.candidatos(fecha, x.b.ini, x.b.fin);
  return `<div class="chips">${c.slice(0, 5).map(p => `<button class="chip ${p.tipo === 'NOLECT' ? 'lime' : 'violet'}" data-a="cubrir" data-id="${a.id}" data-k="${x.key}" data-n="${esc(p.nombre)}" title="${p.tipo === 'NOLECT' ? 'No lectivo' : 'Aula de recursos PIE'} · ${p.n} reemplazos este mes">${esc(L.nombreCorto(p.nombre))}<i>${p.n}</i></button>`).join('')}
    ${c.length > 5 ? `<button class="chip" data-a="mas-cand" data-id="${a.id}" data-k="${x.key}">+${c.length - 5}</button>` : ''}${!c.length ? '<span class="muted sm">Nadie disponible · </span>' : ''}
    <button class="chip dark" data-a="cubrir" data-id="${a.id}" data-k="${x.key}" data-n="${esc(L.INSPECTORIA)}">Inspectoría + Guía</button><button class="chip" data-a="cubrir-otro" data-id="${a.id}" data-k="${x.key}">Otro…</button></div>`;
}
function tarjetaAusencia(a, fecha) {
  const af = L.afectados(a, fecha), jor = a.jornada === 'MANANA' ? ' · solo mañana' : a.jornada === 'TARDE' ? ' · solo tarde' : '';
  return `<div class="aus"><div class="aus-h" data-a="edit-aus" data-id="${a.id}"><span class="avatar pink">${ic('user')}</span><div><b>${esc(a.nombre)}</b><small>${esc(L.AUS_TIPOS[a.tipo] || a.tipo)}${jor}${a.hasta && a.hasta !== a.fecha ? ` · hasta ${L.fechaCorta(a.hasta)}` : ''}${a.nota ? ' · ' + esc(a.nota) : ''}</small></div></div>
    ${af.length ? af.map(x => `<div class="afe ${x.cubre ? 'ok' : ''}"><div class="afe-i"><span class="blk">${x.cod}</span><div><b>${esc(x.b.curso_id || '—')}</b> · ${esc(materia(x.b))}<small>${rango(x.b)} · ${esc(L.nombreEspacio(x.b.sala_id) || 'Sala por definir')}</small></div></div>${chipsCobertura(a, x, fecha)}</div>`).join('')
      : `<p class="muted sm pad">${a.func_id ? 'No tiene clases lectivas en este tramo: no deja cursos sin atención.' : 'Persona externa a la nómina: sin horario registrado.'}</p>`}</div>`;
}
function vHoy() {
  const f = ui.fecha, r = L.resumenDia(f), w = L.semanaDe(f), sin = r.afectados - r.cubiertos, p = r.afectados ? r.cubiertos / r.afectados : 1;
  const ev = j => r.eventos.filter(e => j === 'M' ? e.jornada !== 'TARDE' : e.jornada === 'TARDE');
  const evl = l => l.length ? l.map(e => evChip(e)).join('') : '<p class="muted sm">Sin actividades.</p>';
  return head(f === L.hoy() ? 'Hoy' : L.DIAS[L.dow(f)], `${L.fechaLarga(f)} · ${L.etiquetaSemana(w)}`, navFecha(1, f === L.hoy() ? 'Hoy' : 'Ir a hoy') + (ed() ? `<button class="btn dark" data-a="nueva-aus">${ic('plus')} Registrar ausencia</button>` : '')) +
    `<div class="grid3">
      <div class="card kpi"><div class="kh"><span class="avatar pink">${ic('user')}</span><span>Ausencias<br>docentes</span></div><div class="big">${r.aus.length}</div><div class="kf">${r.aus.length ? esc(r.aus.slice(0, 3).map(a => L.nombreCorto(a.nombre)).join(', ')) + (r.aus.length > 3 ? '…' : '') : 'Dotación completa'}</div></div>
      <div class="card kpi"><div class="kh"><span class="avatar ${sin ? 'amber' : 'green'}">${ic(sin ? 'alert' : 'check')}</span><span>Bloques<br>sin cubrir</span></div><div class="big">${sin}<sup class="${sin ? 'dn' : 'up'}">${r.cubiertos}/${r.afectados} cubiertos</sup></div><div class="bar"><i class="${sin ? 'pink' : 'green'}" style="width:${Math.round(p * 100)}%"></i></div></div>
      <div class="card kpi"><div class="kh"><span class="avatar blue">${ic('cal')}</span><span>Semana<br>de clases</span><a class="ibtn" href="#semana" aria-label="Ver semana">${ic('arrow')}</a></div><div class="big">${w && w.num ? w.num : '—'}<sup>${w ? `Semestre ${esc(w.semestre)}` : ''}</sup></div><div class="kf">${w && w.foco ? 'Foco: ' + esc(w.foco) : 'Sin foco definido'}</div></div>
    </div>
    <div class="grid2w">
      <div class="card"><div class="ch"><h3>Ausencias y cobertura</h3>${r.afectados ? `<div class="dmini">${donut(p, sin ? 'var(--pink)' : 'var(--green)')}<b>${Math.round(p * 100)}%</b></div>` : ''}</div>
        ${r.aus.length ? r.aus.map(a => tarjetaAusencia(a, f)).join('') : `<div class="okbox">${ic('check')}<p>Sin ausencias registradas para este día.</p></div>`}</div>
      <div class="col">
        <div class="card"><div class="ch"><h3>Actividades del día</h3>${ed() ? `<button class="ibtn" data-a="nuevo-ev" data-f="${f}" aria-label="Agregar actividad">${ic('plus')}</button>` : ''}</div>
          <h4>Mañana <small>08:00–13:45</small></h4>${evl(ev('M'))}<h4>Tarde <small>14:00–19:00</small></h4>${evl(ev('T'))}${L.cumplesEntre(f, f).length ? `<h4>🎂 Cumpleaños</h4><div class="chips">${L.cumplesEntre(f, f).map(c => `<button class="chip cum" data-a="edit-cum" data-id="${c.id}">${esc(c.nombre)}</button>`).join('')}</div>` : ''}</div>
        <div class="card parte"><h3>Parte diario</h3><p class="muted sm">Texto y tabla listos para Gmail o WhatsApp con las ausencias, reemplazos y actividades.</p><button class="btn dark wide" data-a="parte">${ic('mail')} Generar parte de las 08:00</button></div>
      </div>
    </div>`;
}
const evTools = e => `<div class="evt"><button data-a="ev-mv" data-id="${e.id}" data-n="-1" title="Día anterior" aria-label="Mover al día anterior">${ic('left')}</button><button data-a="ev-mv" data-id="${e.id}" data-n="1" title="Día siguiente" aria-label="Mover al día siguiente">${ic('right')}</button><select data-c="ev-sec" data-id="${e.id}" aria-label="Sección" title="Mover a otra sección">${SEC_OPC.map(([k, n]) => `<option value="${k}" ${L.seccionDe(e) === k ? 'selected' : ''}>${n}</option>`).join('')}</select><span class="grow"></span><button data-a="edit-ev" data-id="${e.id}" title="Editar">Editar</button><button class="del" data-a="ev-del" data-id="${e.id}" title="Eliminar" aria-label="Eliminar">${ic('x')}</button></div>`;
const RUT_K = { TALLER_ACLE: 'amber', REFORZAMIENTO: 'green', REUNION_FIJA: 'gray' };
const rutChip = m => `<div class="rut ${RUT_K[m.categoria]}" ${adm() ? `data-a="edit-mat" data-id="${m.id}"` : 'data-a="nada"'} title="${esc(`${m.ini}–${m.fin} ${m.titulo}${m.sala_id ? ' · ' + L.nombreEspacio(m.sala_id) : ''}`)}"><b>${m.ini}</b> ${esc(m.titulo)}</div>`;
// Detalle por hora: cada línea "08:30 Ingreso a sala" se muestra con la hora destacada.
// Clase de color de cada burbuja según su sección (vista semanal, Hoy y PDF).
const K_SEC = { NOTA: 'nota', ESTUDIANTES: 'est', FUNCIONARIOS: 'func', EXTERNAS: 'ext' };
// Detalle con subsecciones: "== E. Media" se dibuja como separador punteado; cada línea muestra hora, curso, actividad y (lugar).
const detalleHTML = d => { const it = L.parseDetalle(d); return it.length ? `<div class="det">${it.map(i => i.sub !== undefined ? `<div class="dsub">${esc(i.sub)}</div>` : `<div class="dit">${i.hora ? `<b>${esc(i.hora.replace('-', '–'))}</b> ` : ''}${esc(L.textoItem(i))}</div>`).join('')}</div>` : ''; };
const horaEnTitulo = e => !!e.hora && String(e.titulo).replace('.', ':').includes(String(e.hora).slice(0, 5)); // "11:40 Carta de amor": no repetir la hora
// En la semana la primera línea muestra solo la hora propia del evento (nunca una deducida del detalle: cada curso tiene la suya).
const evChip = (e, edit, dup, mes) => mes ? `<div class="ev ${L.AREAS[e.area] || 'blue'}" ${ed() ? `data-drag="ev:${e.id}"` : ''} data-a="edit-ev" data-id="${e.id}" ${e.detalle ? `title="${esc(L.parseDetalle(e.detalle).map(i => i.sub !== undefined ? '— ' + i.sub : [i.hora, L.textoItem(i)].filter(Boolean).join(' ')).join('\n').slice(0, 400))}"` : ''}>${e.hora && !horaEnTitulo(e) ? `<span class="evh">${esc(String(e.hora).replace('-', '–'))}</span>` : ''}<b>${esc(e.titulo)}</b></div>`
  : `<div class="ev k-${K_SEC[L.seccionDe(e)]} ${dup === true ? 'dup' : ''}" ${ed() ? `data-drag="ev:${e.id}"` : ''} data-a="edit-ev" data-id="${e.id}">${e.hora && !horaEnTitulo(e) ? `<span class="evh">${esc(String(e.hora).replace('-', '–'))}</span>` : ''}<b>${esc(e.titulo)}</b>${L.enMensual(e) ? '<i class="tag mes" title="También aparece en el calendario mensual">mensual</i>' : ''}${dup === true ? '<i class="tag amber">¿duplicado?</i>' : ''}${e.cursos || e.espacio_id ? `<small>${esc([e.cursos, L.nombreEspacio(e.espacio_id)].filter(Boolean).join(' · '))}</small>` : ''}${detalleHTML(e.detalle)}${edit === true ? evTools(e) : ''}</div>`;
// Burbuja que agrupa varias líneas de un mismo tipo en un día (notas, cumpleaños, reforzamiento, talleres, reuniones, externas).
const grupo = (k, titulo, lineas) => lineas.length ? `<div class="ev grp k-${k}"><b class="gt">${titulo}</b>${lineas.join('')}</div>` : '';
const linEv = e => `<div class="gl" ${ed() ? `data-drag="ev:${e.id}"` : ''} data-a="edit-ev" data-id="${e.id}">${e.hora && !horaEnTitulo(e) ? `<b>${esc(String(e.hora).replace('-', '–'))}</b> ` : ''}${esc(e.titulo)}${detalleHTML(e.detalle)}</div>`;
const linMat = (m, quita) => `<div class="gl" ${adm() ? `data-a="edit-mat" data-id="${m.id}"` : 'data-a="nada"'}><b>${m.ini}</b> ${esc(quita ? m.titulo.replace(quita, '') : m.titulo)}${m.sala_id ? ` <span class="lug">(${esc(L.nombreEspacio(m.sala_id))})</span>` : ''}</div>`;

function parteDiario(f) {
  const r = L.resumenDia(f), w = L.semanaDe(f), ln = [`PARTE DIARIO UTP — ${CFG.COLEGIO || ''}`, `${L.fechaLarga(f)} · ${L.etiquetaSemana(w)}`, ''];
  let html = `<p><b>Parte diario UTP — ${esc(CFG.COLEGIO || '')}</b><br>${esc(L.fechaLarga(f))} · ${esc(L.etiquetaSemana(w))}</p>`;
  ln.push('ACTIVIDADES DEL DÍA'); html += '<p><b>Actividades del día</b></p><ul>';
  if (!r.eventos.length) { ln.push('• Sin actividades programadas.'); html += '<li>Sin actividades programadas.</li>'; }
  for (const e of r.eventos) { const t = `${e.hora || (e.jornada === 'TARDE' ? 'Tarde' : e.jornada === 'MANANA' ? 'Mañana' : 'Jornada')} · ${e.titulo}${e.cursos ? ' (' + e.cursos + ')' : ''}${e.espacio_id ? ' — ' + L.nombreEspacio(e.espacio_id) : ''}`; const nt = lineasDet(e.detalle, ''); ln.push('• ' + t, ...nt.map(x => '     ' + x)); html += `<li>${esc(t)}${nt.length ? '<br><small>' + nt.map(esc).join('<br>') + '</small>' : ''}</li>`; }
  ln.push('', 'AUSENCIAS Y REEMPLAZOS'); html += '</ul><p><b>Ausencias y reemplazos</b></p>';
  if (!r.aus.length) { ln.push('• Sin ausencias informadas.'); html += '<p>Sin ausencias informadas.</p>'; }
  else {
    html += '<table border="1" cellpadding="6" style="border-collapse:collapse;font-family:Arial;font-size:13px"><tr style="background:#eef0f3"><th>Docente</th><th>Motivo</th><th>Bloque</th><th>Curso</th><th>Sala</th><th>Cubre</th></tr>';
    for (const a of r.aus) {
      const af = L.afectados(a, f), mot = L.AUS_TIPOS[a.tipo] + (a.jornada === 'MANANA' ? ' (mañana)' : a.jornada === 'TARDE' ? ' (tarde)' : '');
      ln.push(`• ${a.nombre} — ${mot}`);
      if (!af.length) html += `<tr><td>${esc(a.nombre)}</td><td>${esc(mot)}</td><td colspan="4">Sin clases lectivas afectadas</td></tr>`;
      af.forEach((x, i) => { const c = x.cubre || 'POR DEFINIR'; ln.push(`   ${x.cod} ${rango(x.b)} · ${x.b.curso_id} · ${materia(x.b)} → ${c}`); html += `<tr>${i ? '' : `<td rowspan="${af.length}">${esc(a.nombre)}</td><td rowspan="${af.length}">${esc(mot)}</td>`}<td>${x.cod} ${rango(x.b)}</td><td>${esc(x.b.curso_id)} · ${esc(materia(x.b))}</td><td>${esc(L.nombreEspacio(x.b.sala_id))}</td><td>${x.cubre ? esc(c) : '<b>POR DEFINIR</b>'}</td></tr>`; });
    }
    html += '</table>';
  }
  const cum = L.cumplesEntre(f, f); if (cum.length) { const t = 'Cumpleaños de hoy: ' + cum.map(c => c.nombre).join(', '); ln.push('', t); html += `<p>🎂 ${esc(t)}</p>`; }
  ln.push('', 'Unidad Técnico-Pedagógica'); html += '<p>Unidad Técnico-Pedagógica</p>';
  return { texto: ln.join('\n'), html, asunto: `Parte diario UTP · ${L.fechaLarga(f)}` };
}
const lineasDet = (d, sangria) => L.parseDetalle(d).map(i => sangria + (i.sub !== undefined ? `-- ${i.sub} --` : [i.hora, L.textoItem(i)].filter(Boolean).join(' ')));
function boletin(l) {
  const w = L.semanaDe(l), ln = [`BOLETÍN SEMANAL — ${L.etiquetaSemana(w)} (${L.fechaCorta(l)} al ${L.fechaCorta(L.addDias(l, 4))})`, ''];
  if (w) { if (w.foco) ln.push('Foco de la semana: ' + w.foco); if (w.consejo_tema) ln.push('Consejo de profesores (lunes): ' + w.consejo_tema); if (w.lineal_cursos) ln.push('Reunión lineal (miércoles): ' + w.lineal_cursos); ln.push(''); }
  const dias = [0, 1, 2, 3, 4].map(i => L.addDias(l, i)), cum = L.cumplesEntre(l, L.addDias(l, 6));
  const ev = (e, pre) => [`   ${pre} ${e.hora ? e.hora + ' ' : ''}${e.titulo}${e.cursos ? ' (' + e.cursos + ')' : ''}${e.espacio_id ? ' — ' + L.nombreEspacio(e.espacio_id) : ''}`, ...lineasDet(e.detalle, '       ')];
  const mat = (t, ms) => ms.length ? [`   • ${t}:`, ...ms.map(m => `       ${m.ini}–${m.fin} ${m.titulo}${m.sala_id ? ' (' + L.nombreEspacio(m.sala_id) + ')' : ''}`)] : [];
  for (const [barra, nombre] of [['ESTUDIANTES', 'ACTIVIDADES ESTUDIANTES'], ['FUNCIONARIOS', 'ACTIVIDADES FUNCIONARIOS']]) {
    ln.push(nombre);
    dias.forEach((f, i) => {
      const evs = L.eventosDe(f), de = k => evs.filter(e => L.seccionDe(e) === k), b = [];
      if (barra === 'ESTUDIANTES') {
        de('NOTA').forEach(e => b.push(...ev(e, '[!]')));
        const cs = cum.filter(c => i === 4 ? c.fecha >= f : c.fecha === f); if (cs.length) b.push('   Cumpleaños: ' + cs.map(c => c.nombre).join(', '));
        de('ESTUDIANTES').forEach(e => b.push(...ev(e, '•'))); const rut = L.rutinaDe(f, { REFORZAMIENTO: 1, TALLER_ACLE: 1 });
        b.push(...mat('Reforzamiento', rut.filter(m => m.categoria === 'REFORZAMIENTO')), ...mat('Talleres extraescolares', rut.filter(m => m.categoria === 'TALLER_ACLE')));
      } else {
        de('FUNCIONARIOS').forEach(e => b.push(...ev(e, '•'))); b.push(...mat('Reuniones', L.rutinaDe(f, { REUNION_FIJA: 1 })));
        const x = de('EXTERNAS'); if (x.length) { b.push('   • Reuniones externas:'); x.forEach(e => b.push(...ev(e, '  -'))); }
      }
      if (b.length) ln.push(`  ${L.DIAS[i + 1].toUpperCase()} ${L.fechaCorta(f)}`, ...b);
    });
    ln.push('');
  }
  return { texto: ln.join('\n'), asunto: `Boletín semanal · ${L.etiquetaSemana(w)}` };
}
function mEnvio(titulo, o) {
  const u = encodeURIComponent;
  modal(titulo, `<textarea class="mono" rows="16" readonly>${esc(o.texto)}</textarea>`,
    `<button class="btn" data-a="copiar-txt">Copiar texto</button>${o.html ? `<button class="btn" data-a="copiar-html">Copiar con tabla</button>` : ''}
     <a class="btn" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${u(o.texto)}">WhatsApp</a>
     <a class="btn dark" target="_blank" rel="noopener noreferrer" href="https://mail.google.com/mail/?view=cm&fs=1&su=${u(o.asunto)}&body=${u(o.texto.slice(0, 6000))}">${ic('mail')} Abrir en Gmail</a>`, 'wide');
  mEnvio.o = o;
}

// ============ SEMANA ============
function celdaSemana(f, i, barra, E, dups, cum) {
  const evs = L.eventosDe(f), de = k => evs.filter(e => L.seccionDe(e) === k), chips = l => l.map(e => evChip(e, E, dups.has(e.id))).join('');
  let h = '';
  if (barra === 'ESTUDIANTES') {
    const notas = de('NOTA'), cs = cum.filter(c => i === 4 ? c.fecha >= f : c.fecha === f);
    h += E ? chips(notas) : grupo('nota', 'Nota especial', notas.map(linEv));                                   // 1. notas especiales (rojo pálido)
    h += grupo('cum', '🎂 Cumpleaños', cs.map(c => `<button class="gl cumn" data-a="edit-cum" data-id="${c.id}">${L.dow(c.fecha) > 5 ? `<b>${L.DIAS[L.dow(c.fecha)].slice(0, 3)} ${+c.dia}</b> ` : ''}${esc(c.nombre)}</button>`)); // 2. cumpleaños (naranja)
    h += chips(de('ESTUDIANTES'));                                                                                 // 3. actividades (azul)
    const rut = L.rutinaDe(f, { REFORZAMIENTO: 1, TALLER_ACLE: 1 });
    h += grupo('ref', 'Reforzamiento', rut.filter(m => m.categoria === 'REFORZAMIENTO').map(m => linMat(m, /^reforzamiento\s+/i)));   // 4. reforzamiento (amarillo)
    h += grupo('tal', 'Talleres extraescolares', rut.filter(m => m.categoria === 'TALLER_ACLE').map(m => linMat(m, /^talleres?\s+(de\s+)?/i))); // 5. talleres (celeste)
  } else {
    h += chips(de('FUNCIONARIOS'));                                                                                // 1. trabajo con funcionarios (amarillo pálido)
    h += grupo('func', 'Reuniones', L.rutinaDe(f, { REUNION_FIJA: 1 }).map(m => linMat(m)));                       // 2. reuniones fijas
    const ext = de('EXTERNAS'); h += E ? chips(ext) : grupo('ext', 'Reuniones externas', ext.map(linEv));         // 3. externas (gris)
  }
  const add = ed() ? `<button class="add" data-a="nuevo-ev" data-f="${f}" data-s="${barra}" aria-label="Agregar actividad">${ic('plus')}</button>` : '';
  return `<div class="wk-cell" data-drop="sec:${f}:${barra}"><span class="dlbl">${L.DIAS[i + 1]} ${L.fechaCorta(f)}</span>${h}${add}</div>`;
}
function vSemana() {
  const l = lunes(), w = L.semanaDe(l), dis = ed() && w ? '' : 'disabled', E = ui.edit && ed();
  const inp = (k, lbl, ph) => `<div class="fld"><label>${lbl}</label><input data-inline="1" data-c="sem" data-k="${k}" value="${esc(w ? w[k] : '')}" placeholder="${ph}" maxlength="300" ${dis}></div>`;
  const dias = [0, 1, 2, 3, 4].map(i => L.addDias(l, i)), cum = L.cumplesEntre(l, L.addDias(l, 6));
  const dups = new Set(); let ndup = 0, nev = 0; if (E) for (const f of dias) for (const id of L.duplicados(L.eventosDe(f))) { dups.add(id); ndup++; }
  for (const f of dias) nev += L.eventosDe(f).length;
  let g = '<div class="wk2">' + dias.map((f, i) => { const n = L.ausenciasDe(f).length; return `<div class="wk-d ${f === L.hoy() ? 'today' : ''}" data-a="ir-dia" data-f="${f}"><b>${L.DIAS[i + 1]}</b><span>${L.fechaCorta(f)}</span>${n ? `<i class="tag pink">${n} aus.</i>` : ''}</div>`; }).join('');
  for (const [barra, nombre] of [['ESTUDIANTES', 'Actividades estudiantes'], ['FUNCIONARIOS', 'Actividades funcionarios']]) {
    g += `<div class="secbar">${nombre}</div>` + dias.map((f, i) => celdaSemana(f, i, barra, E, dups, cum)).join('');
  }
  g += '</div>';
  const ley = [['nota', 'Nota especial'], ['cum', 'Cumpleaños'], ['est', 'Actividad estudiantes'], ['ref', 'Reforzamiento'], ['tal', 'Taller extraescolar'], ['func', 'Trabajo funcionarios'], ['ext', 'Reunión externa']];
  return head(w ? L.etiquetaSemana(w) : 'Semana', `${L.fechaCorta(l)} al ${L.fechaCorta(L.addDias(l, 4))} ${l.slice(0, 4)}${w ? ` · Semestre ${esc(w.semestre)}` : ' · fuera del año lectivo'}`, navFecha(7, 'Semana actual') + (ed() ? `<button class="btn ${E ? 'on' : ''}" data-a="modo-edit" aria-pressed="${E}">${E ? ic('check') + ' Terminar edición' : 'Modo edición'}</button><button class="btn" data-a="edit-cum" data-id="" data-f="${l}">🎂 Cumpleaños</button>` : '') + `<button class="btn" data-a="pdf">PDF carta</button><button class="btn dark" data-a="boletin">${ic('mail')} Boletín del viernes</button>`) +
    (E ? `<div class="editbar">${ic('alert')}<div><b>Modo edición general.</b> Cada actividad muestra sus controles: ◀ ▶ la mueve de día, el selector la cambia de sección, <b>Editar</b> abre su ficha y ✕ la elimina al instante (con opción de deshacer). Las notas y las reuniones externas se separan en burbujas para editarlas. ${nev} actividades esta semana${ndup ? ` · <b>${ndup} posible${ndup > 1 ? 's' : ''} duplicado${ndup > 1 ? 's' : ''}</b> marcado${ndup > 1 ? 's' : ''} en amarillo` : ''}.</div></div>` : '') +
    `<div class="card foco">${inp('foco', 'Foco de la semana', 'Ej.: Cierre de evaluaciones del 2° semestre')}${inp('consejo_tema', 'Consejo de profesores (lunes)', 'Tema del consejo')}${inp('lineal_cursos', 'Reunión lineal (miércoles)', 'Cursos citados')}</div>
     <div class="card nopad semana ${E ? 'editing' : ''}">${g}</div>
     <div class="legend semleg">${ley.map(([k, n]) => `<span><i class="sw k-${k}"></i>${n}</span>`).join('')}</div>`;
}
function mDuplicados() {
  const p = L.paresDuplicados(); if (!p.length) return toast('No hay hitos del mensual repetidos en la semana', 'ok');
  modal(`Eventos repetidos (${p.length})`, `<p class="muted sm">Cada par es un hito del calendario mensual y una actividad de la semana con el mismo nombre y día. Al unirlos queda <b>uno solo</b>: en el mensual se ve como un bloque con el nombre del hito, y en la semana lleva la hora y el detalle de la actividad. Desmarca los que no sean el mismo evento.</p>
    <div class="row sm"><button class="btn sm" data-a="dup-todos" data-v="1">Marcar todos</button><button class="btn sm" data-a="dup-todos" data-v="0">Desmarcar todos</button></div>
    <div class="dups">${p.map(([a, b]) => `<label class="dup"><input type="checkbox" checked data-par="${a.id}|${b.id}"><span class="df">${L.fechaCorta(a.fecha)}</span><span><b>${esc(a.titulo)}</b> <small>mensual</small><br>${esc(b.titulo)} <small>semana${b.hora ? ' · ' + esc(b.hora) : ''}</small></span></label>`).join('')}</div>`,
    `<span class="grow"></span><button class="btn dark" data-a="ok-dup">Unir marcados</button>`, 'wide');
}
function mCumple(id, f) {
  if (!ed()) return; const base = f || ui.fecha, c = get('cumpleanos', id) || { dia: +base.slice(8), mes: +base.slice(5, 7) };
  modal(id ? 'Editar cumpleaños' : 'Agregar cumpleaños', `<form class="form" data-form="cum" data-id="${esc(id || '')}">${campos([{ k: 'nombre', label: 'Nombre', req: 1, list: 'dl-func', ph: 'Funcionario/a (o cualquier nombre)' }, { k: 'dia', label: 'Día', type: 'number', req: 1, w: 'half' }, { k: 'mes', label: 'Mes', type: 'select', options: L.MESES.map((m, i) => [i + 1, m]), w: 'half' }], c)}</form>`, pie(!!id, 'cum'));
}

// ============ CALENDARIO ============
function vCal() {
  const y = +(L.semanas()[0] || { inicio: (CFG.ANIO || 2026) + '-03-01' }).inicio.slice(0, 4);
  if (!ui.mes) ui.mes = ui.fecha.slice(0, 7);
  const m = +ui.mes.slice(5) - 1, sems = Object.fromEntries(L.semanas().map(w => [w.inicio, w]));
  let d = L.lunesDe(`${ui.mes}-01`), g = L.DIAS.slice(1).map(x => `<div class="cal-h">${x.slice(0, 3)}</div>`).join('');
  const evs = {}; for (const e of all('eventos')) if (!ui.area || e.area === ui.area) (evs[e.fecha] = evs[e.fecha] || []).push(e);
  do {
    for (let i = 0; i < 7; i++, d = L.addDias(d, 1)) {
      const en = L.pd(d).getUTCMonth() === m, w = i === 0 && sems[d], list = L.eventosDe(d).filter(e => L.enMensual(e) && (!ui.area || e.area === ui.area)), rut = ui.rutMes && en && !ui.area ? L.rutinaDe(d) : [];
      g += `<div class="cal-d ${en ? '' : 'out'} ${d === L.hoy() ? 'today' : ''} ${i > 4 ? 'we' : ''} ${en && !list.length && !rut.length ? 'vac' : ''}" data-drop="dia:${d}" data-a="nuevo-ev" data-f="${d}" data-m="SI"><div class="cal-n"><span>${L.pd(d).getUTCDate()}<em> ${L.DIAS[i + 1]}</em></span>${w ? `<i class="tag ${w.num ? 'blue' : 'gray'}">${w.num ? 'S' + w.num : 'Receso'}</i>` : ''}</div>${list.map(e => evChip(e, false, false, true)).join('')}${rut.length ? `<div class="rutbox"><span class="rutlbl">Rutina</span>${rut.map(rutChip).join('')}</div>` : ''}</div>`;
    }
  } while (L.pd(d).getUTCMonth() === m);
  const cnt = {}; for (const e of all('eventos')) if (L.enMensual(e)) cnt[e.fecha.slice(0, 7)] = (cnt[e.fecha.slice(0, 7)] || 0) + 1;
  return head(`${L.MESES[m]} ${y}`, `${cnt[ui.mes] || 0} evento${cnt[ui.mes] === 1 ? "" : "s"} este mes · arrastra un evento para cambiarlo de día`, ed() ? `<button class="btn dark" data-a="nuevo-ev" data-m="SI" data-f="${ui.mes === L.hoy().slice(0, 7) ? L.hoy() : ui.mes + '-01'}">${ic('plus')} Nuevo evento</button>` : '') +
    `<div class="pills scroll">${L.MESES.map((n, i) => i < 2 ? '' : `<button class="pill ${i === m ? 'on' : ''}" data-a="mes" data-m="${y}-${String(i + 1).padStart(2, '0')}">${n.slice(0, 3)}<i>${cnt[`${y}-${String(i + 1).padStart(2, '0')}`] || ''}</i></button>`).join('')}</div>
     <div class="pills scroll"><button class="pill sm ${ui.area ? '' : 'on'}" data-a="area" data-v="">Todas las áreas</button>${Object.keys(L.AREAS).map(a => `<button class="pill sm ${ui.area === a ? 'on' : ''}" data-a="area" data-v="${a}"><span class="dot ${L.AREAS[a]}"></span>${a === 'Direccion' ? 'Dirección' : a}</button>`).join('')}</div>
     <div class="pills scroll"><button class="pill sm ${ui.rutMes ? 'on' : ''}" data-a="rut-mes" aria-pressed="${ui.rutMes}">${ui.rutMes ? 'Ocultar' : 'Mostrar'} rutina semanal</button><span class="muted sm">El mensual muestra solo actividades específicas; la rutina (reuniones fijas, talleres y reforzamientos) está en la vista Semana.</span></div>
     <div class="card nopad"><div class="cal">${g}</div></div>`;
}

// ============ HORARIOS ============
function filasBloque(jor) { return L.BLOQUES.filter(b => !jor || (jor === 'MANANA' ? b.j === 'M' : b.j === 'T')); }
function celdas(blocks) { const m = {}; for (const b of blocks) { const c = L.bloqueDe(b.ini, b.fin); if (c) (m[c + '|' + b.dia] = m[c + '|' + b.dia] || []).push(b); } return m; }
function ausenteEn(fecha, b) { return L.ausenciasDe(fecha).find(a => a.func_id === b.func_id && (!a.jornada || a.jornada === 'AMBAS' || a.jornada === L.jornadaDe(b.ini))); }
function grillaHor(blocks, rows, modo, pref) {
  const m = celdas(blocks), l = lunes();
  let g = `<div class="hg"><div class="hg-c"></div>${[1, 2, 3, 4, 5].map(d => `<div class="hg-d ${L.addDias(l, d - 1) === L.hoy() ? 'today' : ''}"><b>${L.DIAS[d]}</b><span>${L.fechaCorta(L.addDias(l, d - 1))}</span></div>`).join('')}`;
  for (const r of rows) {
    g += `<div class="hg-b"><b>${r.c}</b><small>${r.i}<br>${r.f}</small></div>`;
    for (let d = 1; d <= 5; d++) {
      const bs = (m[r.c + '|' + d] || []).sort((a, b) => (a.tipo === 'CLASE' ? 0 : 1) - (b.tipo === 'CLASE' ? 0 : 1)), f = L.addDias(l, d - 1), key = `${pref}:${r.c}:${d}`;
      g += `<div class="hg-cell" data-drop="${key}" ${adm() ? `data-a="nuevo-blq" data-d="${d}" data-c="${r.c}"` : ''}>${bs.map((b, i) => {
        const T = L.TIPOS[b.tipo] || L.TIPOS.GESTION, au = b.tipo === 'CLASE' && ausenteEn(f, b), cu = au && L.cob(au)[f + '|' + b.id];
        const t = modo === 'curso' ? (b.tipo === 'CLASE' ? `<b>${esc(materia(b))}</b><small>${esc(L.nombreCorto(fn(b.func_id)))}</small>` : `PIE · ${esc(L.nombreCorto(fn(b.func_id)))}`)
          : `<b>${esc(b.curso_id || T.n)}</b><small>${esc(b.curso_id ? materia(b) : b.detalle || '')}</small>`;
        return `<div class="hb ${T.k} ${b.tipo !== 'CLASE' && modo === 'curso' ? 'mini' : ''} ${au ? 'aus' : ''}" ${adm() && i === 0 ? `data-drag="${key}"` : ''} data-a="edit-blq" data-id="${b.id}" title="${esc(T.n)} · ${rango(b)}">${t}${au ? `<em>${cu ? '↪ ' + esc(L.nombreCorto(cu)) : 'Ausente · sin cubrir'}</em>` : ''}</div>`;
      }).join('')}</div>`;
    }
  }
  return g + '</div>';
}
function vHor() {
  const tabs = `<div class="pills"><button class="pill ${ui.hTab === 'curso' ? 'on' : ''}" data-a="htab" data-v="curso">Por curso</button><button class="pill ${ui.hTab === 'docente' ? 'on' : ''}" data-a="htab" data-v="docente">Por docente / PIE</button><button class="pill ${ui.hTab === 'sabana' ? 'on' : ''}" data-a="htab" data-v="sabana">Sábana comparativa</button></div>`;
  const l = lunes(), w = L.semanaDe(l), hd = head('Horarios', `${L.etiquetaSemana(w)} · ${L.fechaCorta(l)} al ${L.fechaCorta(L.addDias(l, 4))}`, navFecha(7, 'Semana actual'));
  if (ui.hTab === 'docente') {
    const f = get('funcionarios', ui.func) || funcOrd()[0]; if (!f) return hd + tabs; ui.func = f.id;
    const bs = all('bloques').filter(b => b.func_id === f.id), usados = new Set(bs.map(b => L.bloqueDe(b.ini, b.fin))), rows = L.BLOQUES.filter(r => usados.has(r.c) || (r.c !== 'M8' && r.c !== 'T7'));
    const hrs = t => (bs.filter(b => t.includes(b.tipo)).reduce((s, b) => s + L.tmin(b.fin) - L.tmin(b.ini), 0) / 60).toFixed(1).replace('.0', '');
    return hd + tabs + `<div class="card sel"><div class="fld grow"><label>Funcionario/a</label><select data-c="func">${['DOCENTE', 'PIE'].map(e => `<optgroup label="${e === 'PIE' ? 'Equipo PIE' : 'Docentes'}">${funcOrd().filter(x => (x.estamento === 'PIE') === (e === 'PIE')).map(x => `<option value="${x.id}" ${x.id === f.id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</optgroup>`).join('')}</select></div>
      <div class="stat"><b>${hrs(['CLASE'])} h</b><small>lectivas</small></div><div class="stat"><b>${hrs(['NOLECT'])} h</b><small>no lectivas</small></div><div class="stat"><b>${esc(f.horas_contrato || '—')}</b><small>contrato</small></div><div class="stat grow2"><b>${esc(f.departamento || '')}</b><small>${esc(f.cargo || f.estamento)}${f.jefatura ? ' · Jefatura ' + esc(f.jefatura) : ''}</small></div></div>
      <div class="card nopad">${grillaHor(bs, rows, 'docente', 'hf')}</div><div class="legend">${['CLASE', 'CODOC', 'NOLECT', 'AULAREC', 'COLAB', 'CONSEJO', 'COLACION'].map(t => `<span><i class="hb ${L.TIPOS[t].k}"></i>${t === 'CONSEJO' ? 'Reuniones / turnos' : L.TIPOS[t].n}</span>`).join('')}</div>`;
  }
  if (ui.hTab === 'sabana') {
    const d = ui.sabDia || Math.min(L.dow(ui.fecha), 5), f = L.addDias(l, d - 1), rows = filasBloque(ui.sabJ === 'M' ? 'MANANA' : 'TARDE'), por = {};
    for (const b of all('bloques')) if (+b.dia === d && b.tipo === 'CLASE' && b.curso_id) (por[b.curso_id + '|' + L.bloqueDe(b.ini, b.fin)] = por[b.curso_id + '|' + L.bloqueDe(b.ini, b.fin)] || []).push(b);
    const evs = L.eventosDe(f);
    let t = `<table class="sab"><thead><tr><th>Curso</th>${rows.map(r => `<th>${r.c}<small>${r.i}</small></th>`).join('')}</tr></thead><tbody>`, ciclo = '';
    for (const c of cursosOrd()) {
      if (c.ciclo !== ciclo) { ciclo = c.ciclo; t += `<tr class="grp"><td colspan="${rows.length + 1}">${esc(ciclo)}</td></tr>`; }
      const ea = evs.filter(e => L.eventoAfectaCurso(e, c));
      t += `<tr><th data-a="ver-curso" data-id="${esc(c.id)}">${esc(c.id)}${ea.length ? `<i class="tag amber" title="${esc(ea.map(e => e.titulo).join(' · '))}">${ea.length} act.</i>` : ''}</th>${rows.map(r => { const bs = por[c.id + '|' + r.c] || []; if (!bs.length) return '<td class="vac">·</td>'; const b = bs[0], au = ausenteEn(f, b), cu = au && L.cob(au)[f + '|' + b.id]; return `<td class="${au ? (cu ? 'cub' : 'desc') : ''}" data-a="edit-blq" data-id="${b.id}"><b>${esc(materia(b))}</b><small>${au ? (cu ? '↪ ' + esc(L.nombreCorto(cu)) : 'SIN DOCENTE') : esc(L.nombreCorto(fn(b.func_id)))}</small></td>`; }).join('')}</tr>`;
    }
    return hd + tabs + `<div class="pills scroll">${[1, 2, 3, 4, 5].map(x => `<button class="pill sm ${x === d ? 'on' : ''}" data-a="sabdia" data-v="${x}">${L.DIAS[x]} ${L.fechaCorta(L.addDias(l, x - 1)).slice(0, 2)}</button>`).join('')}<span class="sep"></span><button class="pill sm ${ui.sabJ === 'M' ? 'on' : ''}" data-a="sabj" data-v="M">Mañana</button><button class="pill sm ${ui.sabJ === 'T' ? 'on' : ''}" data-a="sabj" data-v="T">Tarde</button></div><div class="card nopad scrollx">${t}</tbody></table></div>`;
  }
  const cs = cursosOrd(); if (!cs.length) return hd + tabs;
  let c = get('cursos', ui.curso); if (!c) { c = cs.find(x => !ui.ciclo || x.ciclo === ui.ciclo) || cs[0]; ui.curso = c.id; } ui.ciclo = c.ciclo;
  const bs = all('bloques').filter(b => b.curso_id === c.id && (b.tipo === 'CLASE' || b.tipo === 'CODOC')), usados = new Set(bs.filter(b => b.tipo === 'CLASE').map(b => L.bloqueDe(b.ini, b.fin)));
  const rows = L.BLOQUES.filter(r => usados.has(r.c) || ((c.jornada === 'TARDE' ? r.j === 'T' : r.j === 'M') && r.c !== 'M8' && r.c !== 'T7'));
  const al = []; for (let i = 0; i < 5; i++) for (const e of L.eventosDe(L.addDias(l, i))) if (L.eventoAfectaCurso(e, c)) al.push(e);
  return hd + tabs + `<div class="pills scroll">${L.CICLOS.map(x => `<button class="pill sm ${x === ui.ciclo ? 'on' : ''}" data-a="ciclo" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <div class="pills scroll">${cs.filter(x => x.ciclo === ui.ciclo).map(x => `<button class="pill sm ${x.id === c.id ? 'on' : ''}" data-a="curso" data-v="${esc(x.id)}">${esc(x.id)}</button>`).join('')}</div>
    ${al.length ? `<div class="alerts">${al.map(e => `<div class="alert" data-a="edit-ev" data-id="${e.id}">${ic('alert')}<div><b>${L.DIAS[L.dow(e.fecha)]} ${L.fechaCorta(e.fecha)}${e.hora ? ' · ' + esc(e.hora) : ''}</b> ${esc(e.titulo)}</div></div>`).join('')}</div>` : ''}
    <div class="card sel"><div class="stat grow2"><b>${esc(c.id)}</b><small>${esc(L.nombreEspacio(c.sala_id) || 'Sala por definir')} · Jornada ${c.jornada === 'TARDE' ? 'tarde' : 'mañana'}</small></div><div class="stat grow2"><b>${esc(c.profesor_jefe || '—')}</b><small>Profesor/a jefe</small></div><div class="stat grow"><b class="sm">${esc(c.equipo_pie || '—')}</b><small>Equipo PIE</small></div></div>
    <div class="card nopad">${grillaHor(bs, rows, 'curso', 'hc')}</div>${adm() ? '<p class="muted sm">Arrastra una asignatura sobre otra para intercambiar los bloques. Toca un bloque para editarlo.</p>' : ''}`;
}

// ============ ESPACIOS ============
function ocupacion(id) {
  const o = {}, add = (dia, ini, fin, txt, k) => { const c = L.bloqueDe(ini, fin); if (!c) return; const key = c + '|' + dia; o[key] = o[key] || []; if (!o[key].some(x => x.txt === txt)) o[key].push({ txt, k }); };
  for (const b of all('bloques')) if (b.sala_id === id && b.tipo !== 'COLACION') add(+b.dia, b.ini, b.fin, b.tipo === 'CLASE' ? `${b.curso_id} · ${materia(b)}` : `${(L.TIPOS[b.tipo] || {}).n} · ${L.nombreCorto(fn(b.func_id))}`, (L.TIPOS[b.tipo] || {}).k);
  for (const m of all('matriz')) if (m.sala_id === id) for (const B of L.BLOQUES) if (L.tmin(m.ini) < B.b && L.tmin(m.fin) > B.a) add(+m.dia, B.i, B.f, m.titulo, 'amber');
  return o;
}
function vEsp() {
  const esp = all('espacios').filter(s => s.edificio === ui.edificio).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  return head('Espacios', 'Capacidad, encargado y ocupación por bloque de cada dependencia', adm() ? `<button class="btn dark" data-a="edit-esp" data-id="">${ic('plus')} Nuevo espacio</button>` : '') +
    `<div class="pills scroll">${Object.entries(L.EDIFICIOS).map(([k, n]) => `<button class="pill ${k === ui.edificio ? 'on' : ''}" data-a="edif" data-v="${k}">${n}<i>${all('espacios').filter(s => s.edificio === k).length}</i></button>`).join('')}</div>
     <div class="grid3">${esp.map(s => { const o = ocupacion(s.id), n = Object.keys(o).length, p = Math.round(n / 65 * 100); return `<div class="card kpi esp" data-a="ver-esp" data-id="${esc(s.id)}"><div class="kh"><span class="avatar ${p > 60 ? 'pink' : p > 25 ? 'blue' : 'green'}">${ic('pin')}</span><span>${esc(s.nombre)}</span><span class="ibtn">${ic('arrow')}</span></div><div class="big">${p}%<sup>${n} bloques/sem.</sup></div><div class="bar"><i class="${p > 60 ? 'pink' : p > 25 ? 'blue' : 'green'}" style="width:${Math.max(p, 2)}%"></i></div><div class="kf">${s.capacidad ? 'Capacidad ' + esc(s.capacidad) + ' · ' : ''}${esc(s.encargado || 'Sin encargado')}</div></div>`; }).join('') || '<p class="muted">No hay espacios en este edificio.</p>'}</div>`;
}
function mEspacio(id) {
  const s = get('espacios', id), o = ocupacion(id), l = lunes(); if (!s) return;
  const evs = []; for (let i = 0; i < 5; i++) for (const e of L.eventosDe(L.addDias(l, i))) if (e.espacio_id === id) evs.push(e);
  let g = `<div class="hg sm"><div class="hg-c"></div>${[1, 2, 3, 4, 5].map(d => `<div class="hg-d"><b>${L.DIAS[d].slice(0, 3)}</b></div>`).join('')}`;
  for (const r of L.BLOQUES.filter(r => r.c !== 'M8' && r.c !== 'T7' || [1, 2, 3, 4, 5].some(d => o[r.c + '|' + d]))) { g += `<div class="hg-b"><b>${r.c}</b><small>${r.i}</small></div>`; for (let d = 1; d <= 5; d++) g += `<div class="hg-cell">${(o[r.c + '|' + d] || []).map(x => `<div class="hb ${x.k || 'gray'}"><small>${esc(x.txt)}</small></div>`).join('')}</div>`; }
  modal(s.nombre, `<div class="sel flat"><div class="stat"><b>${esc(s.capacidad || '—')}</b><small>capacidad</small></div><div class="stat grow2"><b>${esc(s.encargado || '—')}</b><small>encargado/a</small></div><div class="stat grow2"><b class="sm">${esc(L.EDIFICIOS[s.edificio] || '')}</b><small>${esc(s.tipo || '')}</small></div></div>
    ${evs.length ? `<h4>Reservas esta semana</h4>${evs.map(e => evChip(e)).join('')}` : ''}<h4>Ocupación fija semanal</h4><div class="scrollx">${g}</div></div>`,
    `${adm() ? `<button class="btn" data-a="edit-esp" data-id="${esc(id)}">Editar ficha</button>` : ''}${ed() ? `<button class="btn dark" data-a="nuevo-ev" data-f="${ui.fecha}" data-e="${esc(id)}">${ic('plus')} Reservar</button>` : ''}`, 'wide');
}

// ============ CONFIGURACIÓN ============
const ESQ = {
  funcionarios: { n: 'Funcionarios', cols: [['nombre', 'Nombre'], ['estamento', 'Estamento'], ['departamento', 'Departamento'], ['horas_contrato', 'Hrs. contrato'], ['horas_no_lectivas', 'No lectivas']], pre: 'F',
    f: () => [{ k: 'nombre', label: 'Nombre completo', req: 1 }, { k: 'estamento', label: 'Estamento', type: 'select', options: ['DOCENTE', 'PIE', 'DIRECTIVO', 'ASISTENTE'], w: 'half' }, { k: 'departamento', label: 'Departamento', w: 'half' }, { k: 'cargo', label: 'Cargo / rol' }, { k: 'jefatura', label: 'Jefatura de curso', w: 'half' }, { k: 'email', label: 'Correo institucional', type: 'email', w: 'half' }, { k: 'horas_contrato', label: 'Horas contrato', w: 'third' }, { k: 'horas_lectivas', label: 'Horas lectivas', w: 'third' }, { k: 'horas_no_lectivas', label: 'Horas no lectivas', w: 'third' }] },
  cursos: { n: 'Cursos', cols: [['id', 'Curso'], ['ciclo', 'Ciclo'], ['profesor_jefe', 'Profesor/a jefe'], ['equipo_pie', 'Dupla / equipo PIE']], idEdit: 1,
    f: () => [{ k: 'id', label: 'Nombre del curso', req: 1, w: 'half' }, { k: 'orden', label: 'Orden', type: 'number', w: 'half' }, { k: 'ciclo', label: 'Ciclo', type: 'select', options: L.CICLOS, w: 'half' }, { k: 'jornada', label: 'Jornada', type: 'select', options: [['MANANA', 'Mañana'], ['TARDE', 'Tarde']], w: 'half' }, { k: 'sala_id', label: 'Sala base', type: 'select', options: optEsp() }, { k: 'profesor_jefe', label: 'Profesor/a jefe', list: 'dl-func' }, { k: 'equipo_pie', label: 'Dupla / equipo PIE', max: 300 }] },
  espacios: { n: 'Espacios', cols: [['nombre', 'Espacio'], ['edificio', 'Edificio'], ['capacidad', 'Capacidad'], ['encargado', 'Encargado/a']], pre: 'SALA',
    f: () => [{ k: 'nombre', label: 'Nombre del espacio', req: 1 }, { k: 'edificio', label: 'Edificio / sector', type: 'select', options: Object.entries(L.EDIFICIOS) }, { k: 'tipo', label: 'Tipo', w: 'half' }, { k: 'capacidad', label: 'Capacidad máxima', type: 'number', w: 'half' }, { k: 'encargado', label: 'Funcionario/a responsable', list: 'dl-func' }] },
  matriz: { n: 'Matriz fija', cols: [['titulo', 'Actividad'], ['categoria', 'Categoría'], ['dia', 'Día'], ['ini', 'Inicio'], ['fin', 'Fin']], pre: 'REC',
    f: () => [{ k: 'titulo', label: 'Actividad', req: 1 }, { k: 'categoria', label: 'Categoría', type: 'select', options: Object.entries(L.MATRIZ_CAT) }, { k: 'dia', label: 'Día', type: 'select', options: [1, 2, 3, 4, 5].map(d => [d, L.DIAS[d]]), w: 'third' }, { k: 'ini', label: 'Inicio', type: 'time', w: 'third' }, { k: 'fin', label: 'Fin', type: 'time', w: 'third' }, { k: 'grupo', label: 'Ciclo / departamento', w: 'half' }, { k: 'sala_id', label: 'Espacio', type: 'select', options: optEsp(), w: 'half' }, { k: 'participantes', label: 'Participantes', type: 'textarea' }] },
  cumpleanos: { n: 'Cumpleaños', cols: [['nombre', 'Nombre'], ['dia', 'Día'], ['_mes', 'Mes']], pre: 'CU',
    f: () => [{ k: 'nombre', label: 'Nombre', req: 1, list: 'dl-func' }, { k: 'dia', label: 'Día', type: 'number', req: 1, w: 'half' }, { k: 'mes', label: 'Mes', type: 'select', options: L.MESES.map((m, i) => [i + 1, m]), w: 'half' }] },
  semanas: { n: 'Semanas lectivas', cols: [['_num', 'N°'], ['inicio', 'Inicio'], ['fin', 'Término'], ['tipo', 'Tipo'], ['semestre', 'Sem.'], ['foco', 'Foco']], pre: 'W',
    f: () => [{ k: 'inicio', label: 'Lunes de inicio', type: 'date', req: 1, w: 'half' }, { k: 'tipo', label: 'Tipo', type: 'select', options: [['LECTIVA', 'Semana lectiva (cuenta)'], ['RECESO', 'Receso / no lectiva (no cuenta)']], w: 'half' }, { k: 'semestre', label: 'Semestre', type: 'select', options: [1, 2], w: 'half' }, { k: 'etiqueta', label: 'Etiqueta (recesos)', w: 'half' }, { k: 'foco', label: 'Foco de la semana', max: 300 }, { k: 'consejo_tema', label: 'Tema del consejo', max: 300 }, { k: 'lineal_cursos', label: 'Cursos reunión lineal', max: 300 }] }
};
function optEsp() { return [['', '— Sin espacio —']].concat(Object.entries(L.EDIFICIOS).map(([k, n]) => ({ group: n, items: all('espacios').filter(s => s.edificio === k).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })).map(s => [s.id, s.nombre]) }))); }
function vCfg() {
  const tabs = `<div class="pills scroll"><button class="pill ${ui.cfg === 'datos' ? 'on' : ''}" data-a="cfg" data-v="datos">Datos y conexión</button>${Object.entries(ESQ).map(([k, e]) => `<button class="pill ${ui.cfg === k ? 'on' : ''}" data-a="cfg" data-v="${k}">${e.n}<i>${all(k).length}</i></button>`).join('')}</div>`;
  if (ui.cfg === 'datos') {
    const e = S.estado;
    return head('Configuración', 'Datos, respaldo y conexión con Google Workspace') + tabs + `<div class="grid2">
      <div class="card"><h3>Base de datos unificada</h3><p class="muted sm">Toda la plataforma vive en <b>un solo libro .xlsx</b> (una hoja por tabla + un LEEME). Descárgalo como respaldo, edítalo en Excel si quieres y vuelve a cargarlo.</p>
        <button class="btn dark wide" data-a="exportar">Descargar base unificada (.xlsx)</button>
        ${adm() ? `<label class="btn wide filebtn">Cargar base unificada (.xlsx)<input type="file" accept=".xlsx" data-c="import" hidden></label><p class="muted sm">Cargar una base unificada <b>reemplaza</b> todos los datos actuales por los del archivo.</p>` : '<p class="tag amber">Solo un administrador puede cargar datos.</p>'}</div>
      <div class="card"><h3>Agregar desde archivos originales</h3><p class="muted sm">Opcional. Para incorporar datos desde las planillas antiguas del colegio: base de horarios (BD_AppSheet), Calendario Anual (hojas por mes) o Calendario Semanal (hojas 01, 02…) o los listados de docentes y asistentes del Mineduc (.csv) para los cumpleaños. El formato se detecta solo y nada se duplica.</p>
        ${adm() ? `<label class="btn wide filebtn">${ic('plus')} Elegir archivo original<input type="file" accept=".xlsx,.xls,.csv" data-c="import" hidden></label>` : ''}</div>
      ${ed() ? `<div class="card"><h3>Limpieza del calendario</h3><p class="muted sm">${(n => n ? `<b>${n} evento${n === 1 ? '' : 's'}</b> aparece${n === 1 ? '' : 'n'} dos veces el mismo día: como hito del mensual y como actividad de la semana.` : 'No hay hitos del mensual repetidos en la semana.')(L.paresDuplicados().length)}</p><button class="btn wide" data-a="ver-dup">Revisar y unir repetidos</button></div>` : ''}
      <div class="card"><h3>Conexión</h3><p><span class="dot ${S.nube ? 'green' : 'gray'}"></span> ${S.nube ? 'Conectado a Google Sheets (nube)' : '<b>Modo local</b>: los datos viven solo en este navegador.'}</p>
        ${S.nube ? `<p class="muted sm">Cuenta: <b>${esc(e.email || '—')}</b> · Rol: <b>${esc(e.rol || '—')}</b><br>Cambios pendientes de subir: <b>${S.pendientes()}</b>${e.ultima ? ' · Última sincronización ' + new Date(e.ultima).toLocaleTimeString('es-CL') : ''}</p><div class="row"><button class="btn" data-a="sync">Sincronizar ahora</button><button class="btn" data-a="salir">Cerrar sesión y borrar datos de este equipo</button></div>`
        : '<p class="muted sm">Para trabajar varios usuarios a la vez, sigue el README: crea la planilla, despliega el Apps Script y completa <code>config.js</code>.</p>'}</div>
      <div class="card"><h3>Roles</h3><p class="muted sm"><b>admin</b>: todo, incluida la configuración e importación. <b>editor</b>: eventos, ausencias, reemplazos y foco semanal. <b>lector</b>: solo consulta. Los permisos se administran en la hoja <code>usuarios</code> de la planilla maestra.</p>
        ${adm() && !all('semanas').length ? `<button class="btn" data-a="gen-sem">Generar semanas lectivas ${CFG.ANIO || ''}</button>` : ''}</div></div>`;
  }
  const E = ESQ[ui.cfg], q = L.norm(ui.q), sems = ui.cfg === 'semanas' ? Object.fromEntries(L.semanas().map(w => [w.id, w.num])) : null;
  let rows = all(ui.cfg).filter(r => !q || L.norm(E.cols.map(([k]) => r[k]).join(' ')).includes(q));
  rows = ui.cfg === 'semanas' ? rows.sort((a, b) => a.inicio < b.inicio ? -1 : 1) : ui.cfg === 'cumpleanos' ? rows.sort((a, b) => a.mes - b.mes || a.dia - b.dia) : ui.cfg === 'cursos' ? rows.sort((a, b) => a.orden - b.orden) : rows.sort((a, b) => String(a[E.cols[0][0]]).localeCompare(String(b[E.cols[0][0]]), 'es', { numeric: true }));
  const cel = (r, k) => k === '_num' ? (sems[r.id] || '—') : k === '_mes' ? L.MESES[r.mes - 1] : k === 'dia' && ui.cfg === 'cumpleanos' ? r.dia : k === 'dia' ? L.DIAS[r.dia] : k === 'edificio' ? L.EDIFICIOS[r.edificio] : k === 'categoria' ? L.MATRIZ_CAT[r.categoria] : r[k];
  return head('Configuración', `${E.n}: ${rows.length} registros`, adm() ? `<button class="btn dark" data-a="crud" data-t="${ui.cfg}" data-id="">${ic('plus')} Agregar</button>` : '') + tabs +
    `<div class="card nopad"><div class="tbar"><input type="search" data-inline="1" data-c="q" value="${esc(ui.q)}" placeholder="Buscar…" aria-label="Buscar"></div><div class="scrollx"><table class="tbl"><thead><tr>${E.cols.map(([, n]) => `<th>${n}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr data-a="crud" data-t="${ui.cfg}" data-id="${esc(r.id)}">${E.cols.map(([k]) => `<td>${esc(cel(r, k))}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`;
}
function mCrud(t, id, pre) {
  const E = ESQ[t], r = get(t, id) || pre || (t === 'matriz' ? { dia: 1, categoria: 'TALLER_ACLE' } : t === 'semanas' ? { tipo: 'LECTIVA', semestre: 2 } : t === 'espacios' ? { edificio: ui.edificio } : t === 'cursos' ? { ciclo: L.CICLOS[0], jornada: 'MANANA' } : t === 'cumpleanos' ? { dia: 1, mes: 1 } : { estamento: 'DOCENTE' });
  if (!(adm() || (t === 'cumpleanos' && ed()))) return toast('Solo un administrador puede modificar la configuración');
  const fs = E.f().filter(f => !(f.k === 'id' && id));
  modal((id ? 'Editar · ' : 'Nuevo · ') + E.n, `<form class="form" data-form="crud" data-t="${t}" data-id="${esc(id || '')}">${campos(fs, r)}</form>`, pie(!!id, 'crud'));
}
const pie = (existe, f, extra) => `${existe ? `<button class="btn danger" data-a="borrar" data-f="${f}">Eliminar</button>` : ''}<span class="grow"></span>${extra || ''}<button class="btn dark" data-a="guardar" data-f="${f}">Guardar</button>`;

// ============ modales de dominio ============
const EV_DET = ['area', 'cursos', 'espacio_id', 'responsable'];
const SEC_OPC = [['ESTUDIANTES', 'Estudiantes'], ['NOTA', 'Nota especial'], ['FUNCIONARIOS', 'Funcionarios'], ['EXTERNAS', 'Externa']];
// Editor del detalle: filas de hora · curso · actividad · lugar, y subsecciones (p. ej. por ciclo) que se separan con línea punteada.
const filaDet = i => i.sub !== undefined
  ? `<div class="drow dsubrow"><input data-f="sub" value="${esc(i.sub)}" placeholder="Subsección (ej.: E. Media, 1° Ciclo)" aria-label="Subsección"><button type="button" class="ibtn sm" data-a="det-del" aria-label="Quitar">${ic('x')}</button></div>`
  : `<div class="drow"><input data-f="hora" value="${esc(i.hora || '')}" placeholder="Hora" aria-label="Hora" class="dh"><input data-f="curso" value="${esc(i.curso || '')}" placeholder="Curso" aria-label="Curso"><input data-f="act" value="${esc(i.act || '')}" placeholder="Actividad" aria-label="Actividad"><input data-f="lugar" value="${esc(i.lugar || '')}" placeholder="Lugar" aria-label="Lugar"><button type="button" class="ibtn sm" data-a="det-del" aria-label="Quitar">${ic('x')}</button></div>`;
const editorDet = d => `<div class="detedit"><div class="dhead"><b>Detalle por curso u horario</b><span class="muted sm">Opcional. Si cada curso o ciclo tiene su propio horario, deja vacío el Horario de arriba y agrega una subsección por ciclo.</span></div>
  <div class="drows">${L.parseDetalle(d).map(filaDet).join('')}</div>
  <div class="row sm"><button type="button" class="btn sm" data-a="det-add" data-t="item">${ic('plus')} Línea</button><button type="button" class="btn sm" data-a="det-add" data-t="sub">${ic('plus')} Subsección (línea punteada)</button></div>
  <input type="hidden" name="detalle" value="${esc(d || '')}"></div>`;
function syncDet(form) { const h = form && form.querySelector('[name=detalle]'); if (!h) return; h.value = L.serializarDetalle([...form.querySelectorAll('.drow')].map(r => { const v = k => (r.querySelector(`[data-f=${k}]`) || {}).value || ''; return r.classList.contains('dsubrow') ? { sub: v('sub') } : { hora: v('hora').trim(), curso: v('curso'), act: v('act'), lugar: v('lugar') }; }).filter(i => i.sub !== undefined ? i.sub.trim() : (i.hora || i.curso || i.act || i.lugar))); }
function mEvento(id, pre) {
  const e0 = get('eventos', id) || { fecha: ui.fecha, jornada: 'AMBAS', area: 'UTP', seccion: 'ESTUDIANTES', mensual: 'NO', ...pre }, e = { ...e0, seccion: L.seccionDe(e0) };
  if (!ed() && !id) return;
  const n = EV_DET.filter(k => e[k] && !(k === 'area' && e.area === 'UTP')).length, abrir = !!pre && !!pre.espacio_id;
  modal(id ? 'Editar evento' : 'Nuevo evento', `<form class="form" data-form="ev" data-id="${esc(id || '')}">${campos([
    { k: 'titulo', label: 'Actividad', req: 1, ph: 'Ej.: Ensayo SIMCE 4° básicos' }, { k: 'fecha', label: 'Fecha', type: 'date', req: 1, w: 'half' }, { k: 'hora', label: 'Horario', ph: '09:00-10:30 (vacío = sin hora)', w: 'half', max: 20 },
    { k: 'seccion', label: 'Sección en la semana', type: 'seg', options: SEC_OPC },
    { k: 'mensual', label: '¿Aparece en el calendario mensual?', type: 'seg', options: [['SI', 'Sí, es un hito del mes'], ['NO', 'No, solo en la semana']] }], e)}
    ${editorDet(e.detalle)}
    <button type="button" class="more" data-a="mas-det" aria-expanded="${abrir}">${abrir ? 'Ocultar detalles' : 'Todos los detalles'}${n ? ` <i>${n}</i>` : ''}</button>
    <div class="det" ${abrir ? '' : 'hidden'}>${campos([
    { k: 'jornada', label: 'Jornada (se ajusta sola al escribir el horario)', type: 'seg', options: [['MANANA', 'Mañana'], ['TARDE', 'Tarde'], ['AMBAS', 'Todo el día']] },
    { k: 'area', label: 'Área', type: 'select', options: Object.keys(L.AREAS).map(a => [a, a === 'Direccion' ? 'Dirección' : a]), w: 'half' }, { k: 'responsable', label: 'Responsable', list: 'dl-func', w: 'half' },
    { k: 'cursos', label: 'Cursos involucrados', ph: 'Ej.: 2° MEDIO A, 4° BÁSICO B · o "Todos" · o un ciclo', hint: 'Los cursos nombrados verán una alerta en su horario.' },
    { k: 'espacio_id', label: 'Espacio físico', type: 'select', options: optEsp() }], e)}</div>
    <div id="colis"></div></form>`,
    ed() ? pie(!!id, 'ev', id ? `<button class="btn" data-a="duplicar">Duplicar +7 días</button>` : '') : '');
  avisoColision();
}
function avisoColision() { const f = $('[data-form=ev]'); if (!f) return; const o = leerForm(f); o.id = f.dataset.id; const c = L.colisiones(o); $('#colis').innerHTML = c.length ? `<div class="alert pink">${ic('alert')}<div><b>Posible choque de espacio</b><br>${c.slice(0, 4).map(esc).join('<br>')}${c.length > 4 ? `<br>…y ${c.length - 4} más` : ''}</div></div>` : ''; }
function mAusencia(id) {
  const a = get('ausencias', id) || { fecha: ui.fecha, tipo: 'LICENCIA', jornada: 'AMBAS' };
  if (!ed()) return;
  modal(id ? 'Editar ausencia' : 'Registrar ausencia', `<form class="form" data-form="aus" data-id="${esc(id || '')}">${campos([
    { k: 'nombre', label: 'Docente ausente', req: 1, list: 'dl-func', ph: 'Escribe para buscar o ingresa un nombre libre' },
    { k: 'tipo', label: 'Motivo', type: 'select', options: Object.entries(L.AUS_TIPOS) },
    { k: 'jornada', label: 'Tramo', type: 'seg', options: [['AMBAS', 'Día completo'], ['MANANA', 'Mañana'], ['TARDE', 'Tarde']] },
    { k: 'fecha', label: 'Desde', type: 'date', req: 1, w: 'half' }, { k: 'hasta', label: 'Hasta (opcional)', type: 'date', w: 'half' }, { k: 'nota', label: 'Observación', ph: 'Ej.: deja guía en UTP' }], a)}<div id="prev"></div></form>`, pie(!!id, 'aus'));
  previaAusencia();
}
function funcPorNombre(n) { const k = L.norm(n); return k && all('funcionarios').find(f => L.norm(f.nombre) === k); }
function previaAusencia() {
  const f = $('[data-form=aus]'); if (!f) return; const o = leerForm(f), fu = funcPorNombre(o.nombre), box = $('#prev');
  if (o.tipo === 'ADMIN_MEDIO' && o.jornada === 'AMBAS') { const r = f.querySelector('[name=jornada][value=MANANA]'); r.checked = true; o.jornada = 'MANANA'; }
  if (!o.nombre) return box.innerHTML = '';
  if (!fu) return box.innerHTML = `<div class="alert">${ic('user')}<div>Nombre libre (fuera de la nómina): se registrará sin cruce de horario.</div></div>`;
  const af = L.afectados({ func_id: fu.id, jornada: o.jornada, cobertura: '' }, o.fecha);
  box.innerHTML = af.length ? `<div class="alert pink">${ic('alert')}<div><b>Deja ${af.length} bloque${af.length > 1 ? 's' : ''} sin docente el ${L.DIAS[L.dow(o.fecha)].toLowerCase()}:</b><div class="prevl">${af.map(x => `<span><b>${x.cod}</b> ${esc(x.b.curso_id)} · ${L.candidatos(o.fecha, x.b.ini, x.b.fin).length} disp.</span>`).join('')}</div></div></div>` : `<div class="alert green">${ic('check')}<div>No tiene clases lectivas en ese tramo.</div></div>`;
}
function mBloque(id, pre) {
  const b = get('bloques', id) || { tipo: 'CLASE', ...pre }, T = L.TIPOS[b.tipo] || {};
  if (!adm()) { if (!id) return; return modal('Bloque', `<div class="sel flat"><div class="stat grow2"><b>${esc(b.curso_id || T.n)}</b><small>${esc(b.detalle || '')}</small></div><div class="stat"><b>${L.DIAS[b.dia]}</b><small>${rango(b)}</small></div></div><p><b>${esc(fn(b.func_id))}</b><br><span class="muted">${esc(T.n || '')} · ${esc(L.nombreEspacio(b.sala_id))}</span></p>`); }
  modal(id ? 'Editar bloque' : 'Nuevo bloque', `<form class="form" data-form="blq" data-id="${esc(id || '')}">${campos([
    { k: 'func_id', label: 'Funcionario/a', type: 'select', options: [['', '— Por asignar —']].concat(funcOrd().map(f => [f.id, f.nombre])) }, { k: 'tipo', label: 'Tipo de actividad', type: 'select', options: Object.entries(L.TIPOS).map(([k, v]) => [k, v.n]) },
    { k: 'dia', label: 'Día', type: 'select', options: [1, 2, 3, 4, 5].map(d => [d, L.DIAS[d]]), w: 'third' }, { k: 'ini', label: 'Inicio', type: 'time', req: 1, w: 'third' }, { k: 'fin', label: 'Fin', type: 'time', req: 1, w: 'third' },
    { k: 'curso_id', label: 'Curso', type: 'select', options: [['', '— Sin curso —']].concat(cursosOrd().map(c => [c.id, c.id])), w: 'half' }, { k: 'sala_id', label: 'Sala', type: 'select', options: optEsp(), w: 'half' }, { k: 'detalle', label: 'Asignatura / detalle' }], b)}</form>`, pie(!!id, 'blq'));
}

// ============ acciones ============
function guardar(f) {
  const form0 = $(`[data-form=${f}]`); if (f === 'ev') syncDet(form0);
  const form = form0, o = leerForm(form), id = form.dataset.id;
  const falta = [...form.querySelectorAll('[required]')].find(el => !el.value.trim()); if (falta) { falta.focus(); return toast('Completa los campos obligatorios', 'err'); }
  if (f === 'ev') { const prev = { ...(get('eventos', id) || { origen: 'App' }) }; delete prev.nota; delete prev.tipo; put('eventos', { ...prev, ...o, id: id || S.uid('EV') }); ui.fecha = o.fecha; if (ui.view === 'calendario') ui.mes = o.fecha.slice(0, 7); }
  else if (f === 'aus') {
    if (o.hasta && o.hasta < o.fecha) return toast('La fecha "hasta" es anterior al inicio', 'err');
    const fu = funcPorNombre(o.nombre), prev = get('ausencias', id) || {};
    put('ausencias', { ...prev, ...o, hasta: o.hasta || o.fecha, func_id: fu ? fu.id : '', nombre: fu ? fu.nombre : o.nombre, cobertura: prev.func_id === (fu ? fu.id : '') ? (prev.cobertura || '') : '', id: id || S.uid('AU') });
    ui.fecha = o.fecha; if (!id) location.hash = '#hoy';
  }
  else if (f === 'cum') { o.dia = +o.dia; o.mes = +o.mes; if (!(o.dia >= 1 && o.dia <= 31)) return toast('El día debe estar entre 1 y 31', 'err'); const fu = funcPorNombre(o.nombre); put('cumpleanos', { ...o, nombre: fu ? fu.nombre : o.nombre, id: id || S.uid('CU') }); }
  else if (f === 'blq') { if (!(L.tmin(o.fin) > L.tmin(o.ini))) return toast('La hora de término debe ser posterior al inicio', 'err'); put('bloques', { ...(get('bloques', id) || {}), ...o, dia: +o.dia, id: id || S.uid('B') }); }
  else if (f === 'crud') {
    const t = form.dataset.t, E = ESQ[t]; let nid = id;
    if (!id) { nid = E.idEdit ? o.id.toUpperCase() : t === 'semanas' ? 'W' + o.inicio : S.uid(E.pre); if (get(t, nid)) return toast('Ya existe un registro con ese nombre', 'err'); }
    if (t === 'semanas') { if (L.dow(o.inicio) !== 1) return toast('La semana debe comenzar un lunes', 'err'); o.fin = L.addDias(o.inicio, 4); }
    if (t === 'matriz' || t === 'cursos' || t === 'cumpleanos') for (const k of ['dia', 'orden', 'mes']) if (o[k] != null) o[k] = +o[k];
    if (t === 'cumpleanos' && !(o.dia >= 1 && o.dia <= 31)) return toast('El día debe estar entre 1 y 31', 'err');
    put(t, { ...(get(t, id) || {}), ...o, id: nid });
  }
  cerrarModal(); toast('Guardado', 'ok');
}
function borrar(btn, f) {
  if (!btn.dataset.ok) { btn.dataset.ok = 1; btn.textContent = '¿Seguro? Toca de nuevo'; setTimeout(() => { if (btn.isConnected) { delete btn.dataset.ok; btn.textContent = 'Eliminar'; } }, 3500); return; }
  const form = $(`[data-form=${f}]`), t = { ev: 'eventos', aus: 'ausencias', blq: 'bloques', cum: 'cumpleanos', crud: form.dataset.t }[f];
  if (t === 'funcionarios' && all('bloques').some(b => b.func_id === form.dataset.id)) return toast('Tiene bloques de horario asignados: reasígnalos antes de eliminar', 'err');
  if (t === 'cursos' && all('bloques').some(b => b.curso_id === form.dataset.id)) return toast('El curso tiene bloques de horario: no se puede eliminar', 'err');
  del(t, form.dataset.id); cerrarModal(); toast('Eliminado');
}
function setCob(id, k, nombre) { const a = get('ausencias', id); if (!a) return; const c = L.cob(a); if (nombre) c[k] = nombre; else delete c[k]; put('ausencias', { ...a, cobertura: JSON.stringify(c) }); }
function swap(pref, a, b) { // intercambia día/horario de los bloques de dos celdas
  if (a === b || !adm()) return; const [, ca, da] = a.split(':'), [, cb, db] = b.split(':');
  const base = pref === 'hc' ? all('bloques').filter(x => x.curso_id === ui.curso && (x.tipo === 'CLASE' || x.tipo === 'CODOC')) : all('bloques').filter(x => x.func_id === ui.func);
  const en = (c, d) => base.filter(x => +x.dia === +d && L.bloqueDe(x.ini, x.fin) === c), A = en(ca, da), B = en(cb, db), sa = L.BLOQUES.find(x => x.c === ca), sb = L.BLOQUES.find(x => x.c === cb);
  for (const x of A) put('bloques', { ...x, dia: +db, ini: sb.i, fin: sb.f }); for (const x of B) put('bloques', { ...x, dia: +da, ini: sa.i, fin: sa.f });
  toast(B.length ? 'Bloques intercambiados' : 'Bloque movido', 'ok');
}
let ultimo = null; // último registro eliminado en modo edición (para Deshacer)
function borrarRapido(t, id) { const r = get(t, id); if (!r) return; ultimo = { t, r }; del(t, id); toast(`Eliminado: ${String(r.titulo || '').slice(0, 40)}`, '', ['Deshacer', 'deshacer']); }
const A = {
  'modo-edit': () => { ui.edit = !ui.edit; },
  'det-add': el => { const c = el.closest('.detedit').querySelector('.drows'); c.insertAdjacentHTML('beforeend', filaDet(el.dataset.t === 'sub' ? { sub: '' } : {})); const n = c.lastElementChild.querySelector('input'); if (n) n.focus(); },
  'det-del': el => el.closest('.drow').remove(),
  'rut-mes': () => { ui.rutMes = !ui.rutMes; },
  'nueva-mat': el => { if (adm()) mCrud('matriz', '', { dia: +el.dataset.d, categoria: 'TALLER_ACLE' }); },
  'mas-det': el => { const d = el.nextElementSibling, ab = d.hidden; d.hidden = !ab; el.setAttribute('aria-expanded', ab); el.firstChild.textContent = ab ? 'Ocultar detalles' : 'Todos los detalles'; if (ab) { const f = d.querySelector('select,input'); if (f && matchMedia('(pointer:fine)').matches) f.focus(); } },
  'ver-dup': () => mDuplicados(),
  'ok-dup': () => { const sel = [...document.querySelectorAll('[data-par]:checked')].map(x => x.dataset.par); const pares = L.paresDuplicados(); let n = 0; for (const [a, b] of pares) if (sel.includes(a.id + '|' + b.id)) { put('eventos', L.fusionar(a, b)); del('eventos', b.id); n++; } cerrarModal(); toast(`${n} evento${n === 1 ? '' : 's'} fusionado${n === 1 ? '' : 's'}`, 'ok'); },
  'dup-todos': el => { const v = el.dataset.v === '1'; document.querySelectorAll('[data-par]').forEach(x => x.checked = v); }, 'ev-del': el => borrarRapido('eventos', el.dataset.id), 'mat-del': el => adm() && borrarRapido('matriz', el.dataset.id),
  deshacer: () => { if (ultimo) { put(ultimo.t, ultimo.r); ultimo = null; toast('Restaurado', 'ok'); } },
  'ev-mv': el => { const e = get('eventos', el.dataset.id); if (!e || !ed()) return; let f = L.addDias(e.fecha, +el.dataset.n); while (L.dow(f) > 5) f = L.addDias(f, Math.sign(+el.dataset.n)); put('eventos', { ...e, fecha: f }); if (L.lunesDe(f) !== lunes()) toast(`Movido al ${L.DIAS[L.dow(f)].toLowerCase()} ${L.fechaCorta(f)} (otra semana)`, 'ok'); },
  'edit-cum': el => mCumple(el.dataset.id, el.dataset.f),
  pdf: () => { toast('Generando PDF…'); import('./pdf.js').then(m => m.pdfSemana(lunes())).then(n => toast('PDF descargado: ' + n, 'ok')).catch(e => toast(e.message || 'No se pudo generar el PDF', 'err')); },
  cerrar: cerrarModal, 'cerrar-ovl': (el, e) => { if (e.target === el) cerrarModal(); },
  fecha: el => { ui.fecha = L.addDias(ui.fecha, +el.dataset.n); if (Math.abs(+el.dataset.n) === 1) { const s = Math.sign(+el.dataset.n); while (L.dow(ui.fecha) > 5) ui.fecha = L.addDias(ui.fecha, s); } ui.sabDia = 0; },
  'fecha-hoy': () => { ui.fecha = L.proximoHabil(L.hoy()); ui.sabDia = 0; }, 'ir-dia': el => { ui.fecha = el.dataset.f; location.hash = '#hoy'; },
  'nueva-aus': () => mAusencia(), 'edit-aus': el => mAusencia(el.dataset.id), 'nuevo-ev': el => { if (ed()) mEvento('', { fecha: el.dataset.f, ...(el.dataset.j ? { jornada: el.dataset.j } : {}), ...(el.dataset.s ? { seccion: el.dataset.s } : {}), mensual: el.dataset.m === 'SI' ? 'SI' : 'NO', ...(el.dataset.e ? { espacio_id: el.dataset.e } : {}) }); }, 'edit-ev': el => mEvento(el.dataset.id),
  'edit-mat': el => adm() ? mCrud('matriz', el.dataset.id) : null, 'edit-esp': el => mCrud('espacios', el.dataset.id), 'ver-esp': el => mEspacio(el.dataset.id), crud: el => mCrud(el.dataset.t, el.dataset.id),
  'edit-blq': el => mBloque(el.dataset.id), 'nuevo-blq': el => { const r = L.BLOQUES.find(x => x.c === el.dataset.c); mBloque('', { dia: +el.dataset.d, ini: r.i, fin: r.f, ...(ui.hTab === 'curso' ? { curso_id: ui.curso, sala_id: (get('cursos', ui.curso) || {}).sala_id } : { func_id: ui.func }) }); },
  guardar: el => guardar(el.dataset.f), borrar: el => borrar(el, el.dataset.f),
  duplicar: () => { const f = $('[data-form=ev]'); syncDet(f); const o = leerForm(f); put('eventos', { ...o, id: S.uid('EV'), fecha: L.addDias(o.fecha, 7) }); cerrarModal(); toast(`Duplicado al ${L.fechaCorta(L.addDias(o.fecha, 7))}`, 'ok'); },
  cubrir: el => { setCob(el.dataset.id, el.dataset.k, el.dataset.n); if ($('#modal-root').firstChild) cerrarModal(); }, descubrir: el => setCob(el.dataset.id, el.dataset.k, ''),
  'cubrir-otro': el => modal('Asignar reemplazo', `<form class="form" data-form="otro" data-id="${el.dataset.id}" data-k="${el.dataset.k}">${campos([{ k: 'n', label: 'Nombre de quien cubre', req: 1, list: 'dl-func', ph: 'Cualquier funcionario o reemplazante externo' }], {})}</form>`, `<span class="grow"></span><button class="btn dark" data-a="ok-otro">Asignar</button>`),
  'ok-otro': () => { const f = $('[data-form=otro]'), n = leerForm(f).n; if (!n) return; setCob(f.dataset.id, f.dataset.k, n); cerrarModal(); },
  'mas-cand': el => { const a = get('ausencias', el.dataset.id), [f, bid] = el.dataset.k.split('|'), b = get('bloques', bid); modal('¿Quién puede cubrir?', `<p class="muted sm">${esc(b.curso_id)} · ${rango(b)} · ordenados por menos reemplazos en el mes</p><div class="chips col">${L.candidatos(f, b.ini, b.fin).map(p => `<button class="chip ${p.tipo === 'NOLECT' ? 'lime' : 'violet'}" data-a="cubrir" data-id="${a.id}" data-k="${el.dataset.k}" data-n="${esc(p.nombre)}">${esc(p.nombre)} <small>${p.tipo === 'NOLECT' ? 'No lectivo' : 'Aula recursos'}</small><i>${p.n}</i></button>`).join('')}</div>`); },
  parte: () => mEnvio('Parte diario', parteDiario(ui.fecha)), boletin: () => mEnvio('Boletín semanal', boletin(lunes())),
  'copiar-txt': () => copiar(mEnvio.o.texto), 'copiar-html': () => copiar(mEnvio.o.texto, mEnvio.o.html),
  mes: el => ui.mes = el.dataset.m, area: el => ui.area = el.dataset.v, htab: el => ui.hTab = el.dataset.v, ciclo: el => { ui.ciclo = el.dataset.v; ui.curso = ''; }, curso: el => ui.curso = el.dataset.v,
  'ver-curso': el => { ui.curso = el.dataset.id; ui.hTab = 'curso'; }, sabdia: el => ui.sabDia = +el.dataset.v, sabj: el => ui.sabJ = el.dataset.v, edif: el => ui.edificio = el.dataset.v, cfg: el => { ui.cfg = el.dataset.v; ui.q = ''; },
  exportar: () => exportarLibro().catch(e => toast(e.message, 'err')), sync: () => S.sincronizar(), relogin: () => { $('#login').hidden = false; },
  salir: el => { if (!el.dataset.ok) { el.dataset.ok = 1; el.textContent = '¿Seguro? Toca de nuevo'; return; } S.cerrarSesion(true); },
  'gen-sem': () => { S.bulk('semanas', L.generarSemanas(CFG.ANIO || new Date().getFullYear())); toast('Semanas lectivas generadas', 'ok'); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]'); if (!el) return;
  if (el.dataset.a === 'cerrar-ovl' && e.target !== el) return; // clic dentro de la ventana: dejar funcionar casillas, opciones y enlaces
  if (el.tagName !== 'A') e.preventDefault();
  const fnA = A[el.dataset.a]; if (fnA) { fnA(el, e); pedir(); }
});
document.addEventListener('change', e => {
  const el = e.target, c = el.dataset && el.dataset.c;
  if (c === 'sem') { const w = L.semanaDe(lunes()); if (w && ed()) { const { num, ...row } = w; put('semanas', { ...row, [el.dataset.k]: el.value.trim() }); toast('Guardado', 'ok'); } }
  else if (c === 'func') { ui.func = el.value; pedir(); }
  else if (c === 'ev-sec') { const e = get('eventos', el.dataset.id); if (e && ed()) { put('eventos', { ...e, seccion: el.value }); toast('Movido a ' + L.SECCIONES[el.value].toLowerCase(), 'ok'); } }
  else if (c === 'import') { const file = el.files[0]; if (!file) return; if (file.size > 15e6) return toast('Archivo demasiado grande', 'err'); toast('Importando…'); importarArchivo(file).then(m => { toast(m, 'ok'); pedir(); }).catch(err => toast(err.message || 'No se pudo importar', 'err')); el.value = ''; }
  if (el.closest('[data-form=ev]')) avisoColision(); if (el.closest('[data-form=aus]')) previaAusencia();
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset && el.dataset.c === 'q') { ui.q = el.value; const p = el.selectionStart; delete el.dataset.inline; render(); const n = $('[data-c=q]'); n.focus(); n.setSelectionRange(p, p); }
  if (el.closest('[data-form=aus]') && el.name === 'nombre') previaAusencia();
  if (el.name === 'hora' && el.closest('[data-form=ev]')) { // el horario define la jornada (desde 14:00 = tarde)
    const m = /^\s*(\d{1,2})[:.](\d{2})/.exec(el.value), r = m && el.closest('form').querySelector(`[name=jornada][value=${+m[1] * 60 + +m[2] < 840 ? 'MANANA' : 'TARDE'}]`); if (r) r.checked = true; }
});
document.addEventListener('focusout', e => { if (pendFondo) setTimeout(() => pedir(true), 50); });
document.addEventListener('submit', e => { e.preventDefault(); const f = e.target.dataset.form; if (f === 'otro') A['ok-otro'](); else if (f) guardar(f); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarModal(); });
initDrag((src, dst) => {
  const [k, id] = src.split(':'), d = dst.split(':');
  if (k === 'ev' && ed()) { const e = get('eventos', id); if (!e) return; if (d[0] === 'dia' && e.fecha !== d[1]) { put('eventos', { ...e, fecha: d[1] }); toast(`Movido al ${L.fechaCorta(d[1])}`, 'ok'); } else if (d[0] === 'sec') { const act = L.seccionDe(e), sec = L.barraDe(act) === d[2] ? act : d[2]; if (e.fecha !== d[1] || sec !== act) { put('eventos', { ...e, fecha: d[1], seccion: sec }); toast(`Movido a ${L.DIAS[L.dow(d[1])].toLowerCase()} · ${L.SECCIONES[sec].toLowerCase()}`, 'ok'); } } }
  else if ((k === 'hc' || k === 'hf') && d[0] === k) swap(k, src, dst);
});

// ============ arranque ============
function ruta() { const h = location.hash.slice(1); ui.view = VISTAS.some(v => v[0] === h) || h === 'config' ? h : 'hoy'; cerrarModal(); render(); window.scrollTo(0, 0); }
S.cargarLocal();
if (S.puedeEditar()) {
  const mig = all('eventos').map(L.migrarEvento).filter(Boolean); if (mig.length) S.bulk('eventos', mig); // nombres de columnas anteriores
  let hecho = false; try { hecho = localStorage.getItem('sigutp:mig-nota') === '1'; } catch { }
  if (!hecho) { // v6: plazos, feriados y cambios de horario pasan a "Nota especial" (una vez; después manda lo que edite el usuario)
    const notas = all('eventos').filter(e => (e.seccion === 'ESTUDIANTES' || e.seccion === 'FUNCIONARIOS' || !e.seccion) && L.RE_NOTA.test(L.norm(e.titulo))).map(e => ({ ...e, seccion: 'NOTA' }));
    if (notas.length) S.bulk('eventos', notas); if (all('eventos').length) try { localStorage.setItem('sigutp:mig-nota', '1'); } catch { }
  }
}
S.onChange(() => { $('#dl-func').innerHTML = funcOrd().map(f => `<option value="${esc(f.nombre)}">`).join(''); pedir(true); });
window.addEventListener('hashchange', ruta);
$('#dl-func').innerHTML = funcOrd().map(f => `<option value="${esc(f.nombre)}">`).join('');
$('#brand').textContent = CFG.COLEGIO || 'SIG-UTP';
ruta();
if (S.nube) { S.iniciarGoogle($('#gbtn'), () => { $('#login').hidden = true; S.sincronizar(); }); if (S.sesionValida()) S.sincronizar(); }
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
