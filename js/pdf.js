// PDF del calendario semanal: tamaño carta apaisado, generado en el navegador (sin servidor) con jsPDF.
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
// Colores de burbuja (fondo, borde, texto): iguales a la vista Semana.
const K = { nota: [[253, 230, 230], [224, 90, 90], [140, 29, 29]], cum: [[255, 226, 194], [240, 138, 36], [122, 59, 0]], est: [[225, 234, 250], [47, 98, 196], [24, 52, 110]],
  func: [[253, 246, 214], [214, 180, 58], [95, 75, 0]], ext: [[236, 238, 241], [138, 145, 158], [59, 65, 76]], pie: [[253, 227, 239], [224, 85, 154], [122, 23, 71]], ref: [[255, 240, 163], [226, 182, 0], [92, 71, 0]], tal: [[220, 242, 251], [42, 163, 214], [13, 79, 107]] };
const NAVY = [32, 64, 112], GOLD = [240, 192, 48];
const IL = 1.34; // interlineado del PDF (algo más amplio para leer impreso)

// Una hoja carta apaisada: barra "Actividades estudiantes" y barra "Actividades funcionarios" a lo ancho, con las burbujas de
// cada día en el mismo orden que la vista Semana. Si no cabe, se achica la letra, se acortan textos y, al final, se indica "+N más".
export async function pdfSemana(l) {
  const JsPDF = await jspdf(), doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 20, GAP = 3, PAD = 3.5, cw = (W - 2 * M) / 5, BOT = H - 20, IW = cw - 2 * PAD - 7;
  const w = L.semanaDe(l), sem = L.etiquetaSemana(w), rangoTxt = `${L.fechaCorta(l)} al ${L.fechaCorta(L.addDias(l, 4))} de ${l.slice(0, 4)}`, dias = [0, 1, 2, 3, 4].map(i => L.addDias(l, i));
  const cum = L.cumplesEntre(l, L.addDias(l, 6));

  // ---- contenido: burbujas = { k, t (título), h (hora), ls: [{ sub } | { b, x }] } ----
  const horaEnT = e => e.hora && txt(e.titulo).includes(String(e.hora).slice(0, 5));
  const det = d => L.parseDetalle(d).map(i => i.sub !== undefined ? { sub: txt(i.sub) } : { b: txt((i.hora || '').replace('-', '-')), x: txt(L.textoItem(i)) });
  const burbuja = (k, e) => ({ k, t: txt(e.titulo), h: e.hora && !horaEnT(e) ? txt(e.hora) : '', ls: [...([e.cursos, L.nombreEspacio(e.espacio_id)].filter(Boolean).length ? [{ b: '', x: txt([e.cursos, L.nombreEspacio(e.espacio_id)].filter(Boolean).join(' · ')) }] : []), ...det(e.detalle)] });
  const grupo = (k, t, ls) => ls.length ? [{ k, t, ls }] : [];
  const deEv = e => [{ b: e.hora && !horaEnT(e) ? txt(e.hora) : '', x: txt(e.titulo) }, ...det(e.detalle)];
  const deMat = (m, quita) => ({ b: m.ini, x: txt(quita ? m.titulo.replace(quita, '') : m.titulo) + (m.sala_id ? ` (${txt(L.nombreEspacio(m.sala_id))})` : '') });
  const filas = [['ESTUDIANTES', 'Actividades estudiantes'], ['FUNCIONARIOS', 'Actividades funcionarios'], ['REF', 'Talleres y reforzamientos'], ['TAL', '']].map(([barra, nombre]) => ({ nombre, cells: dias.map((f, i) => {
    const evs = L.eventosDe(f), de = k => evs.filter(e => L.seccionDe(e) === k && !L.esEspecial(e)), notas = b => grupo('nota', 'Nota especial', evs.filter(e => L.esEspecial(e) && L.barraDe(L.seccionDe(e)) === b).flatMap(deEv));
    if (barra === 'REF') return grupo('ref', 'Reforzamiento', L.rutinaDe(f, { REFORZAMIENTO: 1 }).map(m => deMat(m, /^reforzamiento\s+/i)));
    if (barra === 'TAL') return grupo('tal', 'Talleres extraescolares', L.rutinaDe(f, { TALLER_ACLE: 1 }).map(m => deMat(m, /^taller(?:es)?\s+(de\s+)?/i)));
    if (barra === 'ESTUDIANTES') {
      return [...notas('ESTUDIANTES'), ...grupo('cum', 'FELIZ CUMPLEAÑOS', cum.filter(c => i === 4 ? c.fecha >= f : c.fecha === f).map(c => ({ b: '', x: txt(c.nombre) + (L.dow(c.fecha) > 5 ? ` (${L.DIAS[L.dow(c.fecha)].slice(0, 3).toLowerCase()} ${+c.dia})` : '') }))),
        ...de('ESTUDIANTES').map(e => burbuja('est', e))]; }
    return [...notas('FUNCIONARIOS'), ...de('FUNCIONARIOS').map(e => burbuja('func', e)), ...(reu => [...grupo('func', 'Reuniones', reu.filter(m => L.tipoReunion(m) === 'GEN').map(m => deMat(m))), ...grupo('func', 'Reuniones de departamento', reu.filter(m => L.tipoReunion(m) === 'DEPTO').map(m => deMat(m, /^reuni[oó]n\s+(de\s+)?(departamento|depto\.?)\s+/i))), ...grupo('pie', 'Trabajo colaborativo PIE', reu.filter(m => L.tipoReunion(m) === 'PIE').map(m => deMat(m, /^trabajo colaborativo pie\s*[-–:]?\s*/i)))])(L.rutinaDe(f, { REUNION_FIJA: 1 })), ...grupo('ext', 'Reuniones externas', de('EXTERNAS').flatMap(deEv))];
  }) })).filter((f, n) => n < 2 || f.cells.some(c => c.length)); // reforzamiento y talleres: sub-filas alineadas, solo si hay
  if (filas.length > 2 && !filas[2].nombre) filas[2].nombre = 'Talleres y reforzamientos';

  // ---- medición ----
  const recorta = (ls, max, ancho) => { if (ls.length <= max) return ls; const r = ls.slice(0, max); let u = r[max - 1]; while (u.length > 1 && doc.getTextWidth(u + '...') > ancho) u = u.slice(0, -1); r[max - 1] = u.replace(/\s+$/, '') + '...'; return r; };
  const medir = (bu, Lv) => {
    const fs = Lv.fs, hs = fs - 1.4; bu.fs = fs; bu.hs = hs; let alto = 2 * PAD;
    if (bu.h) alto += hs * IL;
    if (bu.t) { doc.setFont('helvetica', 'bold').setFontSize(fs); bu.tl = recorta(doc.splitTextToSize(bu.t, IW), Lv.tm, IW); alto += bu.tl.length * fs * IL; }
    for (const ln of bu.ls) {
      if (ln.sub !== undefined) { ln.alto = hs * IL + 4; alto += ln.alto; continue; }
      doc.setFont('helvetica', 'bold').setFontSize(hs); ln.pw = ln.b ? doc.getTextWidth(ln.b + ' ') : 0;
      doc.setFont('helvetica', 'normal'); ln.tl = recorta(doc.splitTextToSize(ln.x || '', IW - ln.pw), Lv.lm, IW - ln.pw); ln.alto = Math.max(1, ln.tl.length) * hs * IL; alto += ln.alto;
    }
    if (bu.mas) alto += hs * 1.2;
    bu.alto = alto;
  };
  const altoCelda = c => c.reduce((s, bu) => s + bu.alto + GAP, 0) + (c.mas ? 10 : 0);
  const altoFila = f => Math.max(16, ...f.cells.map(altoCelda)) + 3, BARRA = 11;
  const info = []; // la franja de foco / consejo / reunión lineal ya no se usa
  const TOP = 48 + (info.length ? 14 : 0) + 18, DISP = BOT - TOP - filas.filter(f => f.nombre).length * (BARRA + 2);
  const NIV = []; for (const fs of [8.5, 8, 7.5, 7, 6.5, 6]) NIV.push({ fs, tm: 3, lm: 2 }); NIV.push({ fs: 6, tm: 2, lm: 1 }, { fs: 5.5, tm: 2, lm: 1 });
  const total = () => filas.reduce((s, f) => s + altoFila(f), 0);
  let Lv; for (Lv of NIV) { for (const f of filas) for (const c of f.cells) for (const bu of c) medir(bu, Lv); if (total() <= DISP) break; }
  let ocultos = 0; // último recurso: quitar líneas (o burbujas) de la celda más alta
  for (let guard = 0; total() > DISP && guard < 800; guard++) {
    let best = null; for (const f of filas) for (const c of f.cells) { const h = altoCelda(c); if (c.length && (!best || h > best.h)) best = { c, h }; }
    if (!best) break; const c = best.c, bu = c.reduce((m, x) => x.ls.length > (m ? m.ls.length : 1) ? x : m, null);
    if (bu) { bu.ls.pop(); bu.mas = (bu.mas || 0) + 1; medir(bu, Lv); } else if (c.length > 1) { c.pop(); c.mas = (c.mas || 0) + 1; } else break;
    ocultos++;
  }

  // ---- dibujo ----
  doc.setFillColor(...NAVY).roundedRect(M, 14, W - 2 * M, 28, 7, 7, 'F'); doc.setFillColor(...GOLD).rect(M + 10, 39.5, 60, 2, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(13.5).text(txt(`CALENDARIO SEMANAL  ·  ${sem}`), M + 11, 32.5);
  doc.setFont('helvetica', 'normal').setFontSize(9.5).text(txt(rangoTxt), W - M - 11, 27.5, { align: 'right' }); doc.setFontSize(7.5).text(txt(CFG.COLEGIO || ''), W - M - 11, 37.5, { align: 'right' });
  let y = 48;
  if (info.length) { const iw = (W - 2 * M) / info.length;
    info.forEach(([k, v], i) => { const x = M + i * iw + 2; doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...NAVY); const kw = doc.getTextWidth(txt(k).toUpperCase() + ':  '); doc.text(txt(k).toUpperCase() + ':', x, y + 9); doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(27, 37, 54); doc.text(recorta(doc.splitTextToSize(txt(v), iw - kw - 8), 1, iw - kw - 8)[0], x + kw, y + 9); });
    y += 14; }
  doc.setFont('helvetica', 'bold').setFontSize(10);
  dias.forEach((f, i) => { const x = M + i * cw; doc.setFillColor(232, 238, 246).roundedRect(x + 1, y, cw - 2, 15, 4, 4, 'F'); doc.setTextColor(...NAVY).text(txt(`${L.DIAS[i + 1]} ${+f.slice(8)}`), x + cw / 2, y + 10.5, { align: 'center' }); });
  y += 18;
  const discontinua = (x1, x2, yy, col) => { doc.setDrawColor(...col).setLineWidth(0.7); for (let x = x1; x < x2; x += 4) doc.line(x, yy, Math.min(x + 2, x2), yy); };
  for (const f of filas) {
    if (f.nombre) {
    doc.setDrawColor(200, 210, 224).setLineWidth(0.6).line(M, y + BARRA - 1, W - M, y + BARRA - 1); doc.setFillColor(...GOLD).rect(M, y + 1.5, 2, BARRA - 3, 'F');
    doc.setTextColor(...NAVY).setFont('helvetica', 'bold').setFontSize(6.8).setCharSpace(0.6).text(txt(f.nombre).toUpperCase(), M + 6, y + BARRA - 3.6); doc.setCharSpace(0); y += BARRA + 2; }
    const alto = altoFila(f);
    f.cells.forEach((c, i) => {
      const x = M + i * cw; let yy = y;
      if (i) doc.setDrawColor(222, 228, 236).setLineWidth(0.5).line(x, y, x, y + alto - 3);
      for (const bu of c) {
        const [, bd] = K[bu.k], tx = [27, 37, 54]; doc.setDrawColor(...bd).setLineWidth(0.9).roundedRect(x + 2.5, yy, cw - 5, bu.alto, 2.5, 2.5, 'S'); doc.setLineWidth(2.2).line(x + 3.6, yy + 1.8, x + 3.6, yy + bu.alto - 1.8); // solo borde: pensado para imprimir
        let ty = yy + PAD; const tx0 = x + PAD + 5;
        if (bu.h) { ty += bu.hs; doc.setFont('helvetica', 'bold').setFontSize(bu.hs).setTextColor(...tx).text(bu.h, tx0, ty); ty += bu.hs * (IL - 1); }
        if (bu.t) { doc.setFont('helvetica', 'bold').setFontSize(bu.fs).setTextColor(...tx); for (const t of bu.tl) { ty += bu.fs; doc.text(t, tx0, ty); ty += bu.fs * (IL - 1); } }
        for (const ln of bu.ls) {
          if (ln.sub !== undefined) { discontinua(tx0, x + cw - 6, ty + 2, bd); ty += 4 + bu.hs; doc.setFont('helvetica', 'bold').setFontSize(bu.hs - 0.3).setTextColor(...tx).text(ln.sub.toUpperCase(), tx0, ty); ty += bu.hs * (IL - 1); continue; }
          let first = true; for (const t of (ln.tl.length ? ln.tl : [''])) { ty += bu.hs; if (first && ln.b) doc.setFont('helvetica', 'bold').setFontSize(bu.hs).setTextColor(...tx).text(ln.b, tx0, ty); doc.setFont('helvetica', 'normal').setFontSize(bu.hs).setTextColor(...tx).text(t, tx0 + ln.pw, ty); ty += bu.hs * (IL - 1); first = false; }
        }
        if (bu.mas) { ty += bu.hs; doc.setFont('helvetica', 'bold').setFontSize(bu.hs).setTextColor(194, 24, 91).text(`+${bu.mas} más (ver plataforma)`, tx0, ty); }
        yy += bu.alto + GAP;
      }
      if (c.mas) doc.setFont('helvetica', 'bold').setFontSize(Lv.fs - 1.5).setTextColor(194, 24, 91).text(`+${c.mas} más (ver plataforma)`, x + 6, yy + 7);
    });
    y += alto;
  }
  // pie: leyenda de colores
  let lx = M; const ly = H - 9; doc.setFontSize(6.5);
  for (const [k, t] of [['nota', 'Nota especial'], ['cum', 'Cumpleaños'], ['est', 'Actividad estudiantes'], ['ref', 'Reforzamiento'], ['tal', 'Taller extraescolar'], ['func', 'Trabajo funcionarios'], ['pie', 'Colaborativo PIE'], ['ext', 'Reunión externa']]) {
    doc.setDrawColor(...K[k][1]).setLineWidth(0.9).rect(lx, ly - 5.5, 7, 6, 'S'); doc.setFont('helvetica', 'normal').setTextColor(92, 106, 128).text(t, lx + 9, ly); lx += 9 + doc.getTextWidth(t) + 10; }
  doc.setTextColor(138, 145, 158).text(txt(`Unidad Técnico-Pedagógica · ${new Date().toLocaleDateString('es-CL')}${ocultos ? ' · semana muy cargada: hay líneas que no caben' : ''}`), W - M, ly, { align: 'right' });
  const nombre = `Calendario_Semanal_${w && w.num ? 'S' + String(w.num).padStart(2, '0') : 'semana'}_${l}.pdf`;
  doc.save(nombre);
  return nombre;
}
