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

export async function pdfSemana(l) {
  const JsPDF = await jspdf(), doc = new JsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter', compress: true });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 26, LBL = 62, GAP = 3, PAD = 4, cw = (W - 2 * M - LBL) / 5, BOT = H - 24;
  const w = L.semanaDe(l), sem = L.etiquetaSemana(w), rangoTxt = `${L.fechaCorta(l)} al ${L.fechaCorta(L.addDias(l, 4))} de ${l.slice(0, 4)}`;

  // ---- contenido: filas (etiqueta + 5 celdas con ítems) ----
  const evItem = e => ({ h: txt(String(e.hora || '').replace('-', ' - ')), t: txt(e.titulo), n: [txt([e.cursos, L.nombreEspacio(e.espacio_id)].filter(Boolean).join(' · '))].concat(String(e.nota || '').split('\n').map(txt)).filter(Boolean), c: L.AREAS[e.area] || 'blue' });
  const filas = [];
  for (const [j, n, h] of [['MANANA', 'Mañana', '08:00 - 13:45'], ['TARDE', 'Tarde', '14:00 - 19:00']])
    filas.push({ label: n, sub: h, sec: 'sem', cells: [0, 1, 2, 3, 4].map(i => L.eventosDe(L.addDias(l, i)).filter(e => j === 'MANANA' ? e.jornada !== 'TARDE' : e.jornada === 'TARDE').map(evItem)) });
  const cum = L.cumplesEntre(l, L.addDias(l, 6));
  if (cum.length) filas.push({ label: 'Cumpleaños', sub: '', sec: 'sem', cells: [0, 1, 2, 3, 4].map(i => cum.filter(c => i === 4 ? c.fecha >= L.addDias(l, 4) : c.fecha === L.addDias(l, i)).map(c => ({ h: '', t: txt(c.nombre) + (L.dow(c.fecha) > 5 ? ` (${L.DIAS[L.dow(c.fecha)].toLowerCase()} ${+c.dia})` : ''), n: [], c: 'pink' }))) });
  for (const [cat, nom, c] of [['TALLER_ACLE', 'Talleres ACLE', 'amber'], ['REFORZAMIENTO', 'Reforzam.', 'green'], ['REUNION_FIJA', 'Reuniones fijas', 'gray']]) {
    const m = all('matriz').filter(x => x.categoria === cat); if (!m.length) continue;
    filas.push({ label: nom, sub: '', sec: 'fija', cells: [1, 2, 3, 4, 5].map(d => m.filter(x => +x.dia === d).sort((a, b) => L.tmin(a.ini) - L.tmin(b.ini)).map(x => ({ h: `${x.ini} - ${x.fin}`, t: txt(x.titulo), n: [txt(L.nombreEspacio(x.sala_id))].filter(Boolean), c }))) });
  }

  // ---- medición ----
  const medir = (fs, sec) => { for (const f of filas) if (f.sec === sec) for (const cel of f.cells) for (const it of cel) {
    it.fs = fs; doc.setFont('helvetica', 'bold').setFontSize(fs); it.tl = doc.splitTextToSize(it.t, cw - 2 * PAD - 5);
    doc.setFont('helvetica', 'normal').setFontSize(fs - 1.5); it.nl = it.n.length ? doc.splitTextToSize(it.n.join('\n'), cw - 2 * PAD - 5) : [];
    it.alto = (it.h ? (fs - 1.5) * 1.2 : 0) + it.tl.length * fs * 1.15 + it.nl.length * (fs - 1.5) * 1.18 + 2 * PAD - 1; } };
  const altoFila = f => Math.max(18, ...f.cells.map(c => c.reduce((s, it) => s + it.alto + GAP, 0))) + 4;
  // Cada sección (semana / matriz permanente) reduce su letra hasta caber en una página; si aun así no cabe, continúa en la siguiente.
  const ajustar = (sec, disp) => { for (let fs = 9; ; fs -= 0.5) { medir(fs, sec); if (fs <= 6.5 || filas.filter(f => f.sec === sec).reduce((s, f) => s + altoFila(f), 0) <= disp) return; } };
  ajustar('sem', BOT - 118); ajustar('fija', BOT - 86);

  // ---- dibujo ----
  let y = 0, pag = 0;
  const encabezado = (titulo) => {
    if (pag++) doc.addPage();
    doc.setFillColor(22, 24, 29).roundedRect(M, 20, W - 2 * M, 34, 8, 8, 'F');
    doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(15).text(txt(`CALENDARIO SEMANAL  ·  ${sem}`), M + 12, 42);
    doc.setFont('helvetica', 'normal').setFontSize(10).text(txt(`${rangoTxt}${titulo ? '  ·  ' + titulo : ''}`), W - M - 12, 36, { align: 'right' });
    doc.setFontSize(8).text(txt(CFG.COLEGIO || ''), W - M - 12, 47, { align: 'right' });
    y = 62;
  };
  const cabeceraDias = () => {
    doc.setFont('helvetica', 'bold').setFontSize(9.5);
    for (let i = 0; i < 5; i++) { const x = M + LBL + i * cw, f = L.addDias(l, i); doc.setFillColor(238, 240, 243).roundedRect(x + 1, y, cw - 2, 17, 4, 4, 'F'); doc.setTextColor(22, 24, 29).text(txt(`${L.DIAS[i + 1]} ${+f.slice(8)}`), x + cw / 2, y + 11.8, { align: 'center' }); }
    y += 21;
  };
  const dibujarItem = (it, x, yy) => {
    doc.setFillColor(...TINTE[it.c]).roundedRect(x + 2, yy, cw - 4, it.alto, 3, 3, 'F'); doc.setFillColor(...COL[it.c]).rect(x + 2, yy + 1.5, 2.2, it.alto - 3, 'F');
    let ty = yy + PAD; const tx = x + PAD + 4;
    const fs = it.fs;
    if (it.h) { ty += (fs - 1.5); doc.setFont('helvetica', 'bold').setFontSize(fs - 1.5).setTextColor(90, 96, 108).text(it.h, tx, ty); ty += (fs - 1.5) * 0.2; }
    doc.setFont('helvetica', 'bold').setFontSize(fs).setTextColor(22, 24, 29); for (const ln of it.tl) { ty += fs; doc.text(ln, tx, ty); ty += fs * 0.15; }
    doc.setFont('helvetica', 'normal').setFontSize(fs - 1.5).setTextColor(90, 96, 108); for (const ln of it.nl) { ty += (fs - 1.5); doc.text(ln, tx, ty); ty += (fs - 1.5) * 0.18; }
  };
  const etiqueta = (f, alto, cont) => {
    doc.setFillColor(22, 24, 29).roundedRect(M, y, LBL - 4, alto - 2, 4, 4, 'F'); doc.setTextColor(255).setFont('helvetica', 'bold').setFontSize(8.5);
    const ls = doc.splitTextToSize(txt(f.label) + (cont ? ' (cont.)' : ''), LBL - 8); ls.forEach((s, i) => doc.text(s, M + (LBL - 4) / 2, y + 13 + i * 9.5, { align: 'center' }));
    if (f.sub) doc.setFont('helvetica', 'normal').setFontSize(6.2).text(f.sub, M + (LBL - 4) / 2, y + 15 + ls.length * 9.5, { align: 'center' });
  };

  encabezado('');
  // foco / consejo / reunión lineal
  const info = [['Foco de la semana', w && w.foco], ['Consejo de profesores (lunes)', w && w.consejo_tema], ['Reunión lineal (miércoles)', w && w.lineal_cursos]].filter(x => x[1]);
  if (info.length) { const iw = (W - 2 * M) / info.length; let ih = 0;
    info.forEach(([k, v], i) => { doc.setFont('helvetica', 'bold').setFontSize(7).setTextColor(107, 114, 128).text(txt(k).toUpperCase(), M + i * iw + 2, y + 8); doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(22, 24, 29); const ls = doc.splitTextToSize(txt(v), iw - 10).slice(0, 2); ls.forEach((s, n) => doc.text(s, M + i * iw + 2, y + 19 + n * 11)); ih = Math.max(ih, 12 + ls.length * 11); });
    y += ih + 4; }
  cabeceraDias();
  let sec = 'sem';
  for (const f of filas) {
    if (f.sec !== sec) { // la matriz permanente va en bloque propio
      sec = f.sec; const total = filas.filter(x => x.sec === 'fija').reduce((s, x) => s + altoFila(x), 0);
      if (y + 34 + total > BOT) { encabezado('Matriz permanente'); cabeceraDias(); }
      else { y += 6; doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(107, 114, 128).text('ACTIVIDADES PERMANENTES DE CADA SEMANA', M, y + 7); y += 12; }
    }
    const rest = f.cells.map(c => c.slice()); let cont = false;
    for (;;) { // una fila puede continuar en la página siguiente si no cabe completa
      const disp = BOT - y, toma = rest.map(c => { let h = 0, n = 0; while (n < c.length && h + c[n].alto + GAP <= disp - 2) { h += c[n].alto + GAP; n++; } return n; });
      const queda = rest.some((c, i) => toma[i] < c.length), nada = rest.every((c, i) => !toma[i]) && rest.some(c => c.length);
      if (nada && y > 100) { encabezado(f.sec === 'fija' ? 'Matriz permanente' : 'continuación'); cabeceraDias(); cont = true; continue; }
      if (nada) rest.forEach((c, i) => { if (c.length) toma[i] = 1; }); // ítem más alto que la página: se dibuja igual
      const alto = Math.max(18, ...rest.map((c, i) => c.slice(0, toma[i]).reduce((s, it) => s + it.alto + GAP, 0))) + 2;
      etiqueta(f, alto, cont);
      rest.forEach((c, i) => { let yy = y; const x = M + LBL + i * cw; doc.setDrawColor(230, 232, 236).setLineWidth(0.5).line(x, y, x, y + alto - 2); for (const it of c.splice(0, toma[i])) { dibujarItem(it, x, yy); yy += it.alto + GAP; } });
      y += alto + 2;
      if (!queda) break;
      encabezado(f.sec === 'fija' ? 'Matriz permanente' : 'continuación'); cabeceraDias(); cont = true;
    }
  }
  const n = doc.getNumberOfPages(), hoy = new Date().toLocaleDateString('es-CL');
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont('helvetica', 'normal').setFontSize(7).setTextColor(138, 145, 158).text(txt(`Unidad Técnico-Pedagógica · generado el ${hoy}`), M, H - 12); doc.text(`Página ${i} de ${n}`, W - M, H - 12, { align: 'right' }); }
  const nombre = `Calendario_Semanal_${w && w.num ? 'S' + String(w.num).padStart(2, '0') : 'semana'}_${l}.pdf`;
  doc.save(nombre);
  return nombre;
}
