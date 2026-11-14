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
const COL = { blue: [47, 107, 255], violet: [124, 92, 255], green: [31, 170, 60], pink: [255, 61, 139], amber: [245, 158, 11], gray: [138, 145, 158] };
const TINTE = { blue: [234, 240, 255], violet: [240, 236, 255], green: [229, 246, 233], pink: [255, 233, 241], amber: [255, 244, 219], gray: [240, 241, 244] };

// Diseño de UNA hoja carta apaisada: semana (mañana/tarde) en tarjetas, cumpleaños y rutina semanal en líneas compactas.
// Se prueba de la presentación más holgada a la más compacta; si ni así cabe, se recortan las celdas más largas ("+N más").
export async function pdfSemana(l) {
  const JsPDF = await jspdf(), doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 22, LBL = 54, GAP = 2.5, PAD = 3.5, cw = (W - 2 * M - LBL) / 5, BOT = H - 22, IW = cw - 2 * PAD - 6;
  const w = L.semanaDe(l), sem = L.etiquetaSemana(w), rangoTxt = `${L.fechaCorta(l)} al ${L.fechaCorta(L.addDias(l, 4))} de ${l.slice(0, 4)}`, dias = [0, 1, 2, 3, 4].map(i => L.addDias(l, i));

  // ---- contenido ----
  const evItem = e => { const h = L.horaVisible(e); return { k: 'ev', h: h ? txt(h.txt) + (h.varios ? ' (varios)' : '') : '', t: txt(e.titulo), n: [txt([e.cursos, L.nombreEspacio(e.espacio_id)].filter(Boolean).join(' · '))].concat(String(e.nota || '').split('\n').map(txt)).filter(Boolean), c: L.AREAS[e.area] || 'blue' }; };
  const RC = { TALLER_ACLE: 'amber', REFORZAMIENTO: 'green', REUNION_FIJA: 'gray' };
  const corto = t => txt(t).replace(/^talleres?\s+(de\s+)?/i, '').replace(/^reforzamiento\s+/i, 'Ref. ');
  const filas = [];
  for (const [j, n, h] of [['MANANA', 'Mañana', '08:00-13:45'], ['TARDE', 'Tarde', '14:00-19:00']])
    filas.push({ label: n, sub: h, cells: dias.map(f => L.eventosDe(f).filter(e => j === 'MANANA' ? e.jornada !== 'TARDE' : e.jornada === 'TARDE').map(evItem)) });
  const cum = L.cumplesEntre(l, L.addDias(l, 6));
  if (cum.length) filas.push({ label: 'Cumpleaños', sub: '', linea: true, cells: dias.map((f, i) => cum.filter(c => i === 4 ? c.fecha >= f : c.fecha === f).map(c => ({ k: 'ln', t: txt(c.nombre) + (L.dow(c.fecha) > 5 ? ` (${L.DIAS[L.dow(c.fecha)].slice(0, 3).toLowerCase()} ${+c.dia})` : ''), c: 'pink' }))) });
  const rut = dias.map(f => L.rutinaDe(f).map(m => ({ k: 'ln', b: m.ini, t: corto(m.titulo), c: RC[m.categoria] })));
  if (rut.some(c => c.length)) filas.push({ label: 'Rutina semanal', sub: '', linea: true, cells: rut });

  // ---- medición ----
  const recorta = (ls, max, ancho) => { if (ls.length <= max) return ls; const r = ls.slice(0, max); let u = r[max - 1]; while (u.length > 1 && doc.getTextWidth(u + '...') > ancho) u = u.slice(0, -1); r[max - 1] = u.replace(/\s+$/, '') + '...'; return r; };
  const medir = (it, Lv) => {
    const fs = Lv.fs, hs = fs - 1.5;
    if (it.k === 'ln') { const rs = fs - 1; doc.setFont('helvetica', 'normal').setFontSize(rs); const pre = it.b ? it.b + '  ' : ''; it.pw = it.b ? (doc.setFont('helvetica', 'bold'), doc.getTextWidth(pre)) : 0; doc.setFont('helvetica', 'normal'); it.tl = recorta(doc.splitTextToSize(it.t, IW - it.pw), Lv.rl, IW - it.pw); it.rs = rs; it.alto = it.tl.length * rs * 1.2 + 1.2; return; }
    doc.setFont('helvetica', 'bold').setFontSize(fs); it.tl = recorta(doc.splitTextToSize(it.t, IW), Lv.tm, IW);
    doc.setFont('helvetica', 'normal').setFontSize(hs); it.nl = Lv.nm && it.n.length ? recorta(doc.splitTextToSize(it.n.join('\n'), IW), Lv.nm, IW) : [];
    it.fs = fs; it.hs = hs; it.alto = 2 * PAD + (it.h ? hs * 1.2 : 0) + it.tl.length * fs * 1.12 + it.nl.length * hs * 1.15;
  };
  const altoCelda = (c, extra) => c.reduce((s, it) => s + it.alto + (it.k === 'ev' ? GAP : 0), 0) + (extra || 0);
  const altoFila = f => Math.max(f.linea ? 14 : 28, ...f.cells.map((c, i) => altoCelda(c, f.mas && f.mas[i] ? f.masH : 0))) + 4;

  // ---- encabezado fijo ----
  const info = [['Foco', w && w.foco], ['Consejo (lunes)', w && w.consejo_tema], ['Reunión lineal (miércoles)', w && w.lineal_cursos]].filter(x => x[1]);
  const TOP = 50 + (info.length ? 15 : 0) + 18, DISP = BOT - TOP;
  const NIV = []; for (const fs of [8.5, 8, 7.5, 7, 6.5, 6]) NIV.push({ fs, nm: fs >= 7 ? 4 : 2, tm: 3, rl: 2 }); NIV.push({ fs: 6, nm: 1, tm: 2, rl: 1 }, { fs: 5.5, nm: 0, tm: 2, rl: 1 });
  let Lv; for (Lv of NIV) { for (const f of filas) for (const c of f.cells) for (const it of c) medir(it, Lv); if (filas.reduce((s, f) => s + altoFila(f), 0) <= DISP) break; }
  // último recurso: quitar elementos de la celda más alta hasta que todo quepa
  let ocultos = 0;
  for (let guard = 0; filas.reduce((s, f) => s + altoFila(f), 0) > DISP && guard < 500; guard++) {
    let best = null; for (const f of filas) f.cells.forEach((c, i) => { const h = altoCelda(c); if (c.length > 1 && (!best || h > best.h)) best = { f, i, h }; });
    if (!best) break; const { f, i } = best; f.mas = f.mas || [0, 0, 0, 0, 0]; f.masH = (Lv.fs - 1.5) * 1.4; f.cells[i].pop(); f.mas[i]++; ocultos++;
  }

  // ---- dibujo ----
  doc.setFillColor(22, 24, 29).roundedRect(M, 16, W - 2 * M, 28, 7, 7, 'F');
  doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(13.5).text(txt(`CALENDARIO SEMANAL  ·  ${sem}`), M + 11, 34.5);
  doc.setFont('helvetica', 'normal').setFontSize(9.5).text(txt(rangoTxt), W - M - 11, 29.5, { align: 'right' });
  doc.setFontSize(7.5).text(txt(CFG.COLEGIO || ''), W - M - 11, 39.5, { align: 'right' });
  let y = 50;
  if (info.length) { const iw = (W - 2 * M) / info.length;
    info.forEach(([k, v], i) => { const x = M + i * iw + 2; doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(107, 114, 128); const kw = doc.getTextWidth(txt(k).toUpperCase() + ':  '); doc.text(txt(k).toUpperCase() + ':', x, y + 9); doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(22, 24, 29); doc.text(recorta(doc.splitTextToSize(txt(v), iw - kw - 8), 1, iw - kw - 8)[0], x + kw, y + 9); });
    y += 15; }
  doc.setFont('helvetica', 'bold').setFontSize(9);
  dias.forEach((f, i) => { const x = M + LBL + i * cw; doc.setFillColor(238, 240, 243).roundedRect(x + 1, y, cw - 2, 15, 4, 4, 'F'); doc.setTextColor(22, 24, 29).text(txt(`${L.DIAS[i + 1]} ${+f.slice(8)}`), x + cw / 2, y + 10.5, { align: 'center' }); });
  y += 18;
  for (const f of filas) {
    const alto = altoFila(f);
    doc.setFillColor(...(f.linea ? [92, 99, 112] : [22, 24, 29])).roundedRect(M, y, LBL - 4, alto - 2, 4, 4, 'F');
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(f.linea ? 7.5 : 8.5);
    const ls = doc.splitTextToSize(txt(f.label), LBL - 9); ls.forEach((t, k) => doc.text(t, M + (LBL - 4) / 2, y + 11 + k * 9, { align: 'center' }));
    if (f.sub) doc.setFont('helvetica', 'normal').setFontSize(6).text(f.sub, M + (LBL - 4) / 2, y + 13 + ls.length * 9, { align: 'center' });
    f.cells.forEach((c, i) => {
      const x = M + LBL + i * cw; let yy = y + 1;
      if (i) doc.setDrawColor(228, 230, 234).setLineWidth(0.5).line(x, y, x, y + alto - 3);
      for (const it of c) {
        if (it.k === 'ln') {
          doc.setFillColor(...COL[it.c]).rect(x + 3, yy + 1, 1.8, it.alto - 2.2, 'F'); let ty = yy + it.rs;
          if (it.b) doc.setFont('helvetica', 'bold').setFontSize(it.rs).setTextColor(70, 76, 88).text(it.b, x + 7, ty);
          doc.setFont('helvetica', 'normal').setFontSize(it.rs).setTextColor(40, 44, 52); for (const t of it.tl) { doc.text(t, x + 7 + it.pw, ty); ty += it.rs * 1.2; }
        } else {
          doc.setFillColor(...TINTE[it.c]).roundedRect(x + 2, yy, cw - 4, it.alto, 2.5, 2.5, 'F'); doc.setFillColor(...COL[it.c]).rect(x + 2, yy + 1.5, 2, it.alto - 3, 'F');
          let ty = yy + PAD; const tx = x + PAD + 4;
          if (it.h) { ty += it.hs; doc.setFont('helvetica', 'bold').setFontSize(it.hs).setTextColor(84, 90, 102).text(it.h, tx, ty); ty += it.hs * 0.2; }
          doc.setFont('helvetica', 'bold').setFontSize(it.fs).setTextColor(22, 24, 29); for (const t of it.tl) { ty += it.fs; doc.text(t, tx, ty); ty += it.fs * 0.12; }
          doc.setFont('helvetica', 'normal').setFontSize(it.hs).setTextColor(84, 90, 102); for (const t of it.nl) { ty += it.hs; doc.text(t, tx, ty); ty += it.hs * 0.15; }
        }
        yy += it.alto + (it.k === 'ev' ? GAP : 0);
      }
      if (f.mas && f.mas[i]) doc.setFont('helvetica', 'bold').setFontSize(Lv.fs - 1.5).setTextColor(194, 24, 91).text(`+${f.mas[i]} más (ver plataforma)`, x + 7, yy + Lv.fs - 1);
    });
    y += alto;
  }
  // pie: leyenda de colores
  let lx = M; const ly = H - 11; doc.setFontSize(6.5);
  const ley = (t, c) => { doc.setFillColor(...COL[c]).rect(lx, ly - 5, 5, 5, 'F'); doc.setFont('helvetica', 'normal').setTextColor(107, 114, 128).text(t, lx + 7, ly); lx += 7 + doc.getTextWidth(t) + 9; };
  const tit = t => { doc.setFont('helvetica', 'bold').setTextColor(107, 114, 128).text(t, lx, ly); lx += doc.getTextWidth(t) + 5; };
  tit('Eventos:'); for (const [a, c] of Object.entries(L.AREAS)) ley(a === 'Direccion' ? 'Dirección' : a, c);
  lx += 6; tit('Rutina:'); ley('Reuniones', 'gray'); ley('Talleres ACLE', 'amber'); ley('Reforzamientos', 'green');
  doc.setFont('helvetica', 'normal').setTextColor(138, 145, 158).text(txt(`Unidad Técnico-Pedagógica · ${new Date().toLocaleDateString('es-CL')}${ocultos ? ' · semana muy cargada: hay actividades que no caben' : ''}`), W - M, ly, { align: 'right' });
  const nombre = `Calendario_Semanal_${w && w.num ? 'S' + String(w.num).padStart(2, '0') : 'semana'}_${l}.pdf`;
  doc.save(nombre);
  return nombre;
}
