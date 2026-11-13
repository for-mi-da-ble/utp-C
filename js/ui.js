// Utilidades de interfaz: escape, modales DOM (sin alert/confirm: iframe-safe), toasts y arrastre táctil.
export const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>', right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', arrow: '<svg viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>',
  user: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>', check: '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>', mail: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 8l9 6 9-6"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
  cloud: '<svg viewBox="0 0 24 24"><path d="M7 18a4 4 0 010-8 6 6 0 0111.5 1.5A3.5 3.5 0 0118 18z"/></svg>', alert: '<svg viewBox="0 0 24 24"><path d="M12 4l9 16H3zM12 10v4M12 17v.5"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9H4z"/></svg>', week: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M9 5v14M15 5v14"/></svg>',
  grid: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
};
export const ic = n => `<span class="ic">${ICON[n] || ''}</span>`;

let toastT;
export function toast(msg, tipo, accion) { // accion = [etiqueta, data-a]: botón dentro del aviso (p. ej. Deshacer)
  const t = $('#toast'); t.textContent = msg; if (accion) { const b = document.createElement('button'); b.textContent = accion[0]; b.dataset.a = accion[1]; t.appendChild(b); }
  t.className = 'toast show ' + (tipo || '') + (accion ? ' act' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.className = 'toast', accion ? 7000 : 3800); }

/** Modal genérico. `body` es HTML ya escapado. Devuelve el elemento; se cierra con cerrarModal(). */
export function modal(titulo, body, pie, ancho) {
  cerrarModal();
  const r = $('#modal-root');
  r.innerHTML = `<div class="ovl" data-a="cerrar-ovl"><div class="modal ${ancho || ''}" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
    <div class="mhead"><h2>${esc(titulo)}</h2><button class="ibtn" data-a="cerrar" aria-label="Cerrar">${ic('x')}</button></div>
    <div class="mbody">${body}</div>${pie ? `<div class="mfoot">${pie}</div>` : ''}</div></div>`;
  const f = r.querySelector('input:not([type=hidden]),select,textarea'); if (f && matchMedia('(pointer:fine)').matches) f.focus();
  return r.firstElementChild;
}
export function cerrarModal() { $('#modal-root').innerHTML = ''; }

/** Campos de formulario declarativos. */
export function campos(fs, val) {
  return fs.map(f => {
    const v = val[f.k] == null ? '' : val[f.k], a = `name="${f.k}" id="f_${f.k}" ${f.req ? 'required' : ''}`;
    let c;
    if (f.type === 'select') c = `<select ${a}>${f.options.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return o.group ? `<optgroup label="${esc(o.group)}">${o.items.map(([x, y]) => `<option value="${esc(x)}" ${String(x) === String(v) ? 'selected' : ''}>${esc(y)}</option>`).join('')}</optgroup>` : `<option value="${esc(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${esc(ol)}</option>`; }).join('')}</select>`;
    else if (f.type === 'seg') c = `<div class="seg">${f.options.map(([ov, ol]) => `<label><input type="radio" name="${f.k}" value="${esc(ov)}" ${String(ov) === String(v) ? 'checked' : ''}><span>${esc(ol)}</span></label>`).join('')}</div>`;
    else if (f.type === 'textarea') c = `<textarea ${a} rows="3" maxlength="1500">${esc(v)}</textarea>`;
    else c = `<input ${a} type="${f.type || 'text'}" value="${esc(v)}" maxlength="${f.max || 200}" ${f.list ? `list="${f.list}"` : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''} autocomplete="off">`;
    return `<div class="fld ${f.w || ''}"><label for="f_${f.k}">${esc(f.label)}</label>${c}${f.hint ? `<small>${esc(f.hint)}</small>` : ''}</div>`;
  }).join('');
}
export function leerForm(root) { const o = {}; for (const el of root.querySelectorAll('[name]')) { if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; } else o[el.name] = el.value.trim(); } return o; }

/** Arrastrar y soltar con Pointer Events: funciona con mouse y con dedo (pulsación larga). */
export function initDrag(onDrop) {
  let st = null, ghost = null, over = null, tragar = false;
  const fin = () => { if (st) clearTimeout(st.t); if (ghost) ghost.remove(); if (over) over.classList.remove('dropover'); if (st && st.el) st.el.classList.remove('dragging'); document.body.classList.remove('arrastrando'); st = ghost = over = null; };
  const start = () => {
    st.active = true; st.el.classList.add('dragging'); document.body.classList.add('arrastrando');
    ghost = st.el.cloneNode(true); ghost.classList.add('ghost'); ghost.style.width = st.el.offsetWidth + 'px'; document.body.appendChild(ghost); pos(st.x, st.y);
    if (st.touch && navigator.vibrate) navigator.vibrate(12);
  };
  const pos = (x, y) => { ghost.style.transform = `translate(${x + 10}px,${y + 10}px)`; };
  const destino = (x, y) => { ghost.style.display = 'none'; const el = document.elementFromPoint(x, y); ghost.style.display = ''; return el && el.closest('[data-drop]'); };
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-drag]'); if (!el || e.button) return;
    st = { el, x: e.clientX, y: e.clientY, touch: e.pointerType !== 'mouse', active: false };
    if (st.touch) st.t = setTimeout(() => st && start(), 380);
  });
  document.addEventListener('pointermove', e => {
    if (!st) return;
    if (!st.active) { if (Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { if (st.touch) fin(); else start(); } if (!st || !st.active) return; }
    pos(e.clientX, e.clientY);
    const d = destino(e.clientX, e.clientY); if (d !== over) { if (over) over.classList.remove('dropover'); over = d; if (over) over.classList.add('dropover'); }
  });
  document.addEventListener('touchmove', e => { if (st && st.active) e.preventDefault(); }, { passive: false });
  document.addEventListener('pointerup', e => {
    if (!st) return; const s = st, d = s.active && destino(e.clientX, e.clientY); const activo = s.active; fin();
    if (activo) { tragar = true; setTimeout(() => tragar = false, 60); if (d) onDrop(s.el.dataset.drag, d.dataset.drop); }
  });
  document.addEventListener('pointercancel', fin);
  document.addEventListener('click', e => { if (tragar) { e.stopPropagation(); e.preventDefault(); tragar = false; } }, true);
  document.addEventListener('contextmenu', e => { if (st && st.touch) e.preventDefault(); });
}
export async function copiar(texto, html) {
  try {
    if (html && window.ClipboardItem) await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([texto], { type: 'text/plain' }) })]);
    else await navigator.clipboard.writeText(texto);
    toast('Copiado al portapapeles', 'ok');
  } catch { // dentro de algunos iframes el portapapeles está bloqueado: se selecciona el texto para copiar a mano
    const ta = document.querySelector('.mbody textarea'); if (ta) { ta.focus(); ta.select(); try { document.execCommand('copy'); toast('Copiado', 'ok'); return; } catch { } }
    toast('Selecciona el texto y cópialo manualmente');
  }
}
