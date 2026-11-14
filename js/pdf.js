// PDF del calendario semanal: tamaño carta apaisado, generado en el navegador (sin servidor) con jsPDF.
// Estética de agenda: encabezado de día con línea dorada, hora en negrita azul a la izquierda, filas separadas por
// líneas finas y etiquetas tipo píldora para el tipo de actividad. Tipografía Outfit incrustada (Helvetica si no carga).
import { all } from './store.js';
import * as L from './logic.js';

const CFG = window.SIG_CONFIG || {};
let cargando;
function jspdf() {
  if (window.jspdf) return Promise.resolve(window.jspdf.jsPDF);
  return cargando = cargando || new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'vendor/jspdf.min.js'; s.onload = () => ok(window.jspdf.jsPDF); s.onerror = () => no(new Error('No se pudo cargar el generador de PDF')); document.head.appendChild(s); });
}
// Las fuentes estándar del PDF solo cubren Latin-1: se quitan emojis y símbolos fuera de rango.
const txt = s => String(s == null ? '' : s).replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, '...').replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, '').replace(/[ \t]+/g, ' ').trim();
// Etiquetas (fondo, texto) por tipo de actividad.
const P = { nota: [[251, 224, 222], [140, 29, 29], 'Nota'], cum: [[255, 230, 199], [122, 59, 0], 'Cumpleaños'], pie: [[249, 225, 238], [122, 23, 71], 'PIE'],
  ext: [[233, 236, 242], [59, 65, 76], 'Externa'], ref: [[255, 240, 163], [92, 71, 0], 'Ref.'], tal: [[220, 242, 251], [13, 79, 107], 'Taller'] };
const NAVY = [32, 64, 112], GOLD = [226, 194, 90], INK = [29, 36, 51], MUTE = [92, 106, 128], DET = [59, 69, 88], RULE = [225, 229, 236], DASH = [196, 203, 215];

// ---- recursos: tipografía Outfit (3 pesos) y escudo, cargados una vez ----
let recursos;
const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
const traer = r => fetch(r).then(x => { if (!x.ok) throw new Error(r); return x.arrayBuffer(); });
function cargarRecursos() {
  return recursos = recursos || Promise.all([
    Promise.all(['regular', 'semibold', 'bold'].map(n => traer(`vendor/outfit-${n}.ttf`).then(b64))).catch(() => null),
    traer('icons/escudo.png').then(b => 'data:image/png;base64,' + b64(b)).catch(() => null)
  ]).then(([fuentes, escudo]) => ({ fuentes, escudo }));
}

// Una hoja carta apaisada con cinco columnas (lunes a viernes) y franjas a lo ancho: actividades estudiantes, actividades
// funcionarios y, si hay, talleres y reforzamientos. Si no cabe, se achica la letra, se acortan textos y, al final, se indica "+N más".
export async function pdfSemana(l) {
  const [JsPDF, R] = await Promise.all([jspdf(), cargarRecursos()]), doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true });
  let FN = 'helvetica', FSB = ['helvetica', 'bold'];
  if (R.fuentes) try {
    ['regular', 'semibold', 'bold'].forEach((n, i) => doc.addFileToVFS(`outfit-${n}.ttf`, R.fuentes[i]));
    doc.addFont('outfit-regular.ttf', 'Outfit', 'normal'); doc.addFont('outfit-bold.ttf', 'Outfit', 'bold'); doc.addFont('outfit-semibold.ttf', 'OutfitSB', 'normal');
    doc.setFont('Outfit', 'normal'); FN = 'Outfit'; FSB = ['OutfitSB', 'normal'];
  } catch { FN = 'helvetica'; FSB = ['helvetica', 'bold']; }
  const F = { n: [FN, 'normal'], b: [FN, 'bold'], sb: FSB }, fuente = (s, fs) => doc.setFont(...F[s]).setFontSize(fs);

  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 23, GX = 10, cw = (W - 2 * M - 4 * GX) / 5, PIE_Y = H - 26;
  const w = L.semanaDe(l), sem = L.etiquetaSemana(w), dias = [0, 1, 2, 3, 4].map(i => L.addDias(l, i)), cum = L.cumplesEntre(l, L.addDias(l, 6));
  const rangoTxt = (() => { const a = L.fechaLarga(l).split(' '), b = L.fechaLarga(L.addDias(l, 4)).split(' '); return a[3] === b[3] ? `${a[1]} al ${b.slice(1).join(' ')}` : `${a.slice(1, 4).join(' ')} al ${b.slice(1).join(' ')}`; })();

  // ---- contenido: ítem = { h: [líneas de hora], k (etiqueta), t (título), x (texto), lug (lugar), det: [{ sub } | { b, x }] } ----
  const horaCol = (hora, jornada) => { const m = String(hora || '').match(/\d{1,2}[:.]\d{2}/g); if (m) return m.slice(0, 2).map((h, i) => (i ? '-' : '') + h.replace('.', ':').padStart(5, '0')); return [jornada === 'MANANA' ? 'AM' : jornada === 'TARDE' ? 'PM' : 'Día']; };
  const det = d => L.parseDetalle(d).map(i => i.sub !== undefined ? { sub: txt(i.sub) } : { b: txt(String(i.hora || '').split('-')[0]), x: txt(L.textoItem(i)) });
  const deEvento = (e, k) => { const hv = L.horaVisible(e), enT = e.hora && txt(e.titulo).includes(String(e.hora).slice(0, 5));
    return { h: enT ? [''] : horaCol(hv && hv.txt, e.jornada), k, t: txt(e.titulo), x: txt(e.cursos), lug: txt(L.nombreEspacio(e.espacio_id)), det: det(e.detalle) }; };
  const sala = m => m.sala_id ? txt(L.nombreEspacio(m.sala_id)) : '';
  const deMat = (m, k, quita) => ({ h: horaCol(m.ini), k, t: k ? '' : txt(m.titulo), x: k ? txt(quita ? m.titulo.replace(quita, '') : m.titulo) : '', lug: sala(m), det: [] });
  const agrupa = (ms, k, t, quita) => { if (!ms.length) return []; const h0 = horaCol(ms[0].ini)[0];
    return [{ h: [h0], k, t, x: '', lug: '', det: ms.map(m => ({ b: horaCol(m.ini)[0] === h0 && ms.every(o => o.ini === m.ini) ? '' : horaCol(m.ini)[0], x: txt(m.titulo.replace(quita, '')) + (sala(m) ? ` (${sala(m)})` : '') })) }]; };
  const filas = [['ESTUDIANTES', 'Actividades estudiantes'], ['FUNCIONARIOS', 'Actividades funcionarios'], ['TALLERES', 'Talleres y reforzamientos']].map(([barra, nombre]) => ({ nombre, cells: dias.map((f, i) => {
    const evs = L.eventosDe(f), de = k => evs.filter(e => L.seccionDe(e) === k);
    if (barra === 'TALLERES') return [...L.rutinaDe(f, { REFORZAMIENTO: 1 }).map(m => deMat(m, 'ref', /^reforzamiento\s+/i)), ...L.rutinaDe(f, { TALLER_ACLE: 1 }).map(m => deMat(m, 'tal', /^taller(?:es)?\s+(de\s+)?/i))];
    if (barra === 'ESTUDIANTES') {
      const cs = cum.filter(c => i === 4 ? c.fecha >= f : c.fecha === f).map(c => txt(c.nombre) + (L.dow(c.fecha) > 5 ? ` (${L.DIAS[L.dow(c.fecha)].slice(0, 3).toLowerCase()} ${+c.dia})` : ''));
      return [...de('NOTA').map(e => deEvento(e, 'nota')), ...(cs.length ? [{ h: ['Día'], k: 'cum', t: '', x: cs.join(' · '), lug: '', det: [] }] : []), ...de('ESTUDIANTES').map(e => deEvento(e))];
    }
    const reu = L.rutinaDe(f, { REUNION_FIJA: 1 });
    return [...de('FUNCIONARIOS').map(e => deEvento(e)), ...reu.filter(m => L.tipoReunion(m) === 'GEN').map(m => deMat(m)),
      ...agrupa(reu.filter(m => L.tipoReunion(m) === 'DEPTO'), null, 'Reuniones de departamento', /^reuni[oó]n\s+(de\s+)?(departamento|depto\.?)\s+/i),
      ...agrupa(reu.filter(m => L.tipoReunion(m) === 'PIE'), 'pie', 'Trabajo colaborativo', /^trabajo colaborativo pie\s*[-–:]?\s*/i),
      ...de('EXTERNAS').map(e => deEvento(e, 'ext'))];
  }) })).filter((f, n) => n < 2 || f.cells.some(c => c.length));
  // dentro de cada celda, por hora (lo de todo el día primero); notas y cumpleaños van siempre arriba
  const clave = it => it.k === 'nota' || it.k === 'cum' ? '0' : /\d/.test(it.h[0]) ? '2' + it.h[0] : '1';
  for (const f of filas) for (const c of f.cells) c.sort((a, b) => clave(a).localeCompare(clave(b)));

  // ---- texto enriquecido: tramos { s: estilo, c: color, t } repartidos en líneas de un ancho dado ----
  const ancho = (s, fs, t) => { fuente(s, fs); return doc.getTextWidth(t); };
  function envolver(tramos, fs, wd, ind, max) {
    const lineas = [[]]; let x = ind;
    for (const tr of tramos) for (const pal of tr.t.split(/(?=\s)/)) {
      let p = pal; const wp = ancho(tr.s, fs, p);
      if (x + wp > wd && x > (lineas.length === 1 ? ind : 0)) { lineas.push([]); x = 0; p = p.replace(/^\s+/, ''); }
      while (p.length > 1 && x + ancho(tr.s, fs, p) > wd) p = p.slice(0, -1); // palabra más ancha que la columna
      if (p) { lineas[lineas.length - 1].push({ ...tr, t: p, x }); x += ancho(tr.s, fs, p); }
    }
    if (lineas.length > max) { const u = lineas[max - 1], fin = () => { const s = u[u.length - 1]; return s.x + ancho(s.s, fs, s.t + '...'); }; lineas.length = max;
      while (u.length && fin() > wd) { const s = u[u.length - 1]; s.t = s.t.slice(0, -1); if (!s.t) u.pop(); } if (u.length) u[u.length - 1].t = u[u.length - 1].t.replace(/[\s·]+$/, '') + '...'; }
    return lineas;
  }
  const PAD = 3.2, IL = 1.3;
  const medir = (it, Lv) => {
    const fs = Lv.fs, dfs = fs - 0.9, hc = ancho('b', fs + 0.2, '00:00') + fs * 0.6, tw = cw - hc, pfs = fs - 1.7;
    it.fs = fs; it.dfs = dfs; it.hc = hc; it.pfs = pfs;
    it.pw = it.k ? ancho('b', pfs, P[it.k][2]) + 7 + (it.k === 'nota' ? pfs * 0.9 + 1.5 : 0) : 0;
    const tr = []; const sep = c => ({ s: 'n', c, t: ' · ' });
    if (it.t) tr.push({ s: 'sb', c: INK, t: it.t });
    if (it.x) { if (tr.length) tr.push(sep(INK)); tr.push({ s: 'n', c: INK, t: it.x }); }
    if (it.lug) { if (tr.length) tr.push(sep(MUTE)); tr.push({ s: 'n', c: MUTE, t: it.lug }); }
    it.lin = envolver(tr.length ? tr : [{ s: 'n', c: INK, t: '' }], fs, tw, it.pw ? it.pw + 3 : 0, Lv.tm);
    let alto = it.lin.length * fs * IL;
    const conB = it.det.some(d => d.b); it.bc = conB ? ancho('b', dfs, '00:00') + dfs * 0.5 : 0;
    for (const d of it.det) {
      if (d.sub !== undefined) { d.alto = dfs * IL + 3; alto += d.alto; continue; }
      d.lin = envolver([{ s: 'n', c: DET, t: d.x || '' }], dfs, tw - it.bc, 0, Lv.lm); d.alto = d.lin.length * dfs * IL; alto += d.alto;
    }
    if (it.det.length) alto += 1.5;
    if (it.mas) alto += dfs * IL;
    it.alto = Math.max(alto, it.h.length * fs * IL) + 2 * PAD;
  };
  const altoCelda = c => c.reduce((s, it) => s + it.alto, 0) + (c.mas ? 11 : 0);
  const altoFila = f => Math.max(14, ...f.cells.map(altoCelda)), SEC = 15;
  const TOP = 86, DISP = PIE_Y - 6 - TOP - filas.length * SEC;
  const NIV = []; for (const fs of [8.8, 8.3, 7.8, 7.3, 6.9, 6.5, 6.1]) NIV.push({ fs, tm: 4, lm: 2 }); NIV.push({ fs: 6.1, tm: 2, lm: 1 }, { fs: 5.7, tm: 2, lm: 1 });
  const total = () => filas.reduce((s, f) => s + altoFila(f), 0);
  let Lv; for (Lv of NIV) { for (const f of filas) for (const c of f.cells) for (const it of c) medir(it, Lv); if (total() <= DISP) break; }
  let ocultos = 0; // último recurso: quitar líneas de detalle (o ítems) de la celda más alta
  for (let guard = 0; total() > DISP && guard < 800; guard++) {
    let best = null; for (const f of filas) for (const c of f.cells) { const h = altoCelda(c); if (c.length && (!best || h > best.h)) best = { c, h }; }
    if (!best) break; const c = best.c, it = c.reduce((m, x) => x.det.length > (m ? m.det.length : 0) ? x : m, null);
    if (it) { it.det.pop(); it.mas = (it.mas || 0) + 1; medir(it, Lv); } else if (c.length > 1) { c.pop(); c.mas = (c.mas || 0) + 1; } else break;
    ocultos++;
  }

  // ---- dibujo ----
  const estrella = (cx, cy, r, col) => { const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]); }
    doc.setFillColor(...col).lines(pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]), pts[0][0], pts[0][1], [1, 1], 'F', true); };
  const pildora = (k, x, yBase, fs, etiqueta) => { // yBase: línea base del texto que acompaña
    const [bg, fg] = P[k], t = etiqueta || P[k][2], st = k === 'nota' ? fs * 0.9 + 1.5 : 0, pw = ancho('b', fs, t) + 7 + st, ph = fs * 1.55;
    doc.setFillColor(...bg).roundedRect(x, yBase - ph * 0.78, pw, ph, ph / 2, ph / 2, 'F');
    if (st) estrella(x + 3.5 + fs * 0.45, yBase - fs * 0.36, fs * 0.47, fg);
    fuente('b', fs); doc.setTextColor(...fg).text(t, x + 3.5 + st, yBase); return pw; };
  const tramos = (lin, x0, y) => { for (const s of lin) { fuente(s.s, s.fs); doc.setTextColor(...s.c).text(s.t, x0 + s.x, y); } };

  // encabezado
  let hx = M; if (R.escudo) try { doc.addImage(R.escudo, 'PNG', M, 18, 27, 27); hx = M + 35; } catch { /* sin escudo */ }
  fuente('b', 6.2); doc.setCharSpace(1.1).setTextColor(...NAVY).text('CALENDARIO SEMANAL · UTP', hx, 28.5); doc.setCharSpace(0);
  fuente('b', 15); doc.text(txt(sem), hx, 44);
  fuente('sb', 10); doc.setTextColor(...INK).text(txt(rangoTxt), W - M, 31, { align: 'right' });
  fuente('n', 7.6); doc.setTextColor(...MUTE).text(txt([w && w.semestre ? `Semestre ${w.semestre}` : '', CFG.COLEGIO || ''].filter(Boolean).join(' · ')), W - M, 42, { align: 'right' });
  doc.setDrawColor(...NAVY).setLineWidth(1.6).line(M, 52, W - M, 52);
  // días
  dias.forEach((f, i) => { const x = M + i * (cw + GX); fuente('b', 8.8); doc.setCharSpace(1.2).setTextColor(...NAVY).text(txt(`${L.DIAS[i + 1].slice(0, 3)} ${+f.slice(8)}`).toUpperCase(), x, 68); doc.setCharSpace(0);
    doc.setDrawColor(...GOLD).setLineWidth(1.9).line(x, 73, x + cw, 73); });
  let y = TOP - 8;
  for (const f of filas) {
    fuente('b', 6); doc.setCharSpace(1.5).setTextColor(...MUTE).text(txt(f.nombre).toUpperCase(), M, y + 9); const lw = doc.getTextWidth(txt(f.nombre).toUpperCase()); doc.setCharSpace(0);
    doc.setDrawColor(...DASH).setLineWidth(0.6).setLineDashPattern([2, 1.6], 0).line(M + lw + 6, y + 7, W - M, y + 7).setLineDashPattern([], 0);
    y += SEC;
    f.cells.forEach((c, i) => {
      const x = M + i * (cw + GX); let yy = y;
      for (const it of c) {
        const fs = it.fs, tx = x + it.hc; let ty = yy + PAD + fs;
        fuente('b', fs + 0.2); doc.setTextColor(...NAVY); it.h.forEach((h, j) => { if (j) fuente('b', it.dfs); doc.text(h, x, ty + j * fs * IL); });
        if (it.k) pildora(it.k, tx, ty, it.pfs);
        it.lin.forEach((ln, j) => { tramos(ln.map(s => ({ ...s, fs })), tx, ty + j * fs * IL); });
        ty += (it.lin.length - 1) * fs * IL;
        if (it.det.length) ty += 1.5;
        for (const d of it.det) {
          if (d.sub !== undefined) { doc.setDrawColor(183, 192, 206).setLineWidth(0.5).setLineDashPattern([0.8, 1.2], 0).line(tx, ty + 3.2, x + cw, ty + 3.2).setLineDashPattern([], 0);
            ty += d.alto; fuente('b', it.dfs - 1); doc.setCharSpace(0.7).setTextColor(...MUTE).text(d.sub.toUpperCase(), tx, ty); doc.setCharSpace(0); continue; }
          d.lin.forEach((ln, j) => { ty += it.dfs * IL; if (!j && d.b) { fuente('b', it.dfs); doc.setTextColor(...NAVY).text(d.b, tx, ty); } tramos(ln.map(s => ({ ...s, fs: it.dfs })), tx + it.bc, ty); });
        }
        if (it.mas) { ty += it.dfs * IL; fuente('b', it.dfs); doc.setTextColor(194, 24, 91).text(`+${it.mas} más (ver plataforma)`, tx, ty); }
        yy += it.alto; doc.setDrawColor(...RULE).setLineWidth(0.7).line(x, yy, x + cw, yy);
      }
      if (c.mas) { fuente('b', Lv.fs - 1.2); doc.setTextColor(194, 24, 91).text(`+${c.mas} más (ver plataforma)`, x, yy + 8); }
    });
    y += altoFila(f);
  }
  // pie: leyenda
  doc.setDrawColor(...RULE).setLineWidth(0.7).line(M, PIE_Y, W - M, PIE_Y);
  let lx = M; const ly = PIE_Y + 12;
  for (const [k, t] of [['nota', 'Nota especial'], ['cum', 'Cumpleaños'], ['pie', 'Colaborativo PIE'], ['ext', 'Reunión externa'], ['ref', 'Ref. = Reforzamiento'], ['tal', 'Taller extraescolar']]) lx += pildora(k, lx, ly, 6.2, t) + 5;
  fuente('n', 6.4); doc.setTextColor(...MUTE).text(txt(`Unidad Técnico-Pedagógica · ${new Date().toLocaleDateString('es-CL')}${ocultos ? ' · semana muy cargada: hay líneas que no caben' : ''}`), W - M, ly, { align: 'right' });
  const nombre = `Calendario_Semanal_${w && w.num ? 'S' + String(w.num).padStart(2, '0') : 'semana'}_${l}.pdf`;
  doc.save(nombre);
  return nombre;
}
