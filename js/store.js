// Almacén de datos: persistencia local inmediata (RF-5.3) + sincronización por filas con Google Sheets.
const CFG = window.SIG_CONFIG || {};
export const TABLES = ['semanas', 'eventos', 'ausencias', 'funcionarios', 'cursos', 'espacios', 'bloques', 'matriz', 'cumpleanos', 'proyectos', 'tareas', 'reservas', 'suspensiones'];
// Dos formas de conectarse a la Hoja de Google:
//  · App servida por el propio Apps Script (google.script.run): Google identifica la cuenta del colegio; no requiere Google Cloud.
//  · App en GitHub Pages + API_URL y GOOGLE_CLIENT_ID (requiere un ID de cliente OAuth en Google Cloud).
export const modoGAS = !!(window.google && google.script && google.script.run);
export const nube = modoGAS || !!(CFG.API_URL && CFG.GOOGLE_CLIENT_ID);
const llamarGAS = cuerpo => new Promise((ok, no) => google.script.run.withSuccessHandler(r => { try { ok(JSON.parse(r)); } catch (e) { no(e); } }).withFailureHandler(no).api(cuerpo));
const K = 'sigutp:';
const db = {}, idx = {};
let outbox = [], rev = 0, listeners = [], timer = null, syncing = false;
export const estado = { sync: nube ? 'pendiente' : 'local', error: '', rol: nube ? '' : 'admin', email: '', ultima: 0 };

const ls = {
  get(k, d) { try { const v = localStorage.getItem(K + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(K + k, JSON.stringify(v)); return true; } catch (e) { estado.error = 'No se pudo guardar en este dispositivo (almacenamiento lleno o bloqueado).'; return false; } }
};

export function cargarLocal() {
  for (const t of TABLES) { db[t] = ls.get('t:' + t, []); idx[t] = null; }
  outbox = ls.get('outbox', []); rev = ls.get('rev', 0);
  // Primera conexión a la nube: manda la Hoja de Google. Lo acumulado en modo local no se sube (podría pisar datos más nuevos).
  if (nube && !ls.get('nube-ok', false)) { outbox = []; rev = 0; ls.set('outbox', []); ls.set('rev', 0); ls.set('nube-ok', true); }
  // Al abrir, descarga la Hoja completa si la última descarga completa tiene más de 20 minutos: así llegan también las filas
  // agregadas directamente en la planilla (cargas masivas) aunque no se haya notado el cambio. Lo pendiente de subir se conserva.
  if (nube && Date.now() - ls.get('completa', 0) > 12e5) { rev = 0; ls.set('rev', 0); }
}
function index(t) { if (!idx[t]) { idx[t] = new Map(); for (const r of db[t]) idx[t].set(r.id, r); } return idx[t]; }
function persist(t) { ls.set('t:' + t, db[t]); }
function emit() { for (const f of listeners) f(); }
export function onChange(f) { listeners.push(f); }
export const all = t => db[t] || [];
export const get = (t, id) => (id == null || id === '') ? undefined : index(t).get(id);
export const puedeEditar = () => estado.rol === 'admin' || estado.rol === 'editor';
export const esAdmin = () => estado.rol === 'admin';
export function uid(p) { const a = new Uint8Array(6); crypto.getRandomValues(a); return p + '-' + Date.now().toString(36) + Array.from(a, x => x.toString(16).padStart(2, '0')).join('').slice(0, 6); }

function setLocal(t, row) { const m = index(t), old = m.get(row.id); if (old) db[t][db[t].indexOf(old)] = row; else db[t].push(row); m.set(row.id, row); }
function delLocal(t, id) { const m = index(t), old = m.get(id); if (old) { db[t].splice(db[t].indexOf(old), 1); m.delete(id); } }
function encolar(op) { outbox = outbox.filter(o => !(o.t === op.t && o.id === op.id)); outbox.push(op); }
function tras() { ls.set('outbox', outbox); emit(); programar(900); }

export function put(t, row) { if (!puedeEditar()) return; setLocal(t, row); persist(t); encolar({ t, id: row.id, row }); tras(); return row; }
export function del(t, id) { if (!puedeEditar()) return; delLocal(t, id); persist(t); encolar({ t, id, del: 1 }); tras(); }
/** Escritura masiva. reemplazar=true elimina las filas existentes que no vengan en `rows`. */
export function bulk(t, rows, reemplazar) {
  if (!puedeEditar()) return;
  if (reemplazar) { const nuevos = new Set(rows.map(r => r.id)); for (const r of db[t]) if (!nuevos.has(r.id)) encolar({ t, id: r.id, del: 1 }); db[t] = []; idx[t] = null; }
  const pend = new Map(outbox.map((o, i) => [o.t + '|' + o.id, i]));
  for (const row of rows) { setLocal(t, row); const k = t + '|' + row.id; if (pend.has(k)) outbox[pend.get(k)] = { t, id: row.id, row }; else outbox.push({ t, id: row.id, row }); }
  persist(t); tras();
}
export const pendientes = () => outbox.length;

// ---------- autenticación (Google Identity Services) ----------
let token = sessionStorage.getItem(K + 'tok') || '';
function claims(tk) { try { return JSON.parse(decodeURIComponent(escape(atob(tk.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; } }
export function sesionValida() { if (modoGAS) return true; const c = token && claims(token); return !!(c && c.exp * 1000 > Date.now() + 30000); }
export function iniciarGoogle(btn, alEntrar) {
  const go = () => {
    google.accounts.id.initialize({
      client_id: CFG.GOOGLE_CLIENT_ID, auto_select: true, use_fedcm_for_prompt: true,
      callback: r => { token = r.credential; sessionStorage.setItem(K + 'tok', token); estado.email = (claims(token) || {}).email || ''; alEntrar(); }
    });
    if (btn) google.accounts.id.renderButton(btn, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'signin_with', locale: 'es' });
    google.accounts.id.prompt();
  };
  if (window.google && google.accounts) return go();
  const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = go;
  s.onerror = () => { estado.error = 'No se pudo cargar el inicio de sesión de Google (sin conexión).'; emit(); };
  document.head.appendChild(s);
}
export function cerrarSesion(borrarDatos) {
  token = ''; sessionStorage.removeItem(K + 'tok');
  try { google.accounts.id.disableAutoSelect(); } catch { }
  if (borrarDatos) { for (const k of Object.keys(localStorage)) if (k.startsWith(K)) localStorage.removeItem(k); }
  location.reload();
}
if (token) estado.email = (claims(token) || {}).email || '';
estado.rol = nube ? ls.get('rol', '') : 'admin';

// ---------- sincronización ----------
function programar(ms) { if (!nube) return; clearTimeout(timer); timer = setTimeout(sincronizar, ms); }
export async function sincronizar() {
  if (!nube || syncing) return;
  if (!sesionValida()) { estado.sync = 'sesion'; emit(); return; }
  if (!navigator.onLine) { estado.sync = 'offline'; emit(); return; }
  syncing = true; estado.sync = 'sincronizando'; emit();
  try {
    let otra = false;
    do {
      otra = false;
      const lote = outbox.slice(0, 1200);
      // text/plain evita el preflight CORS que Apps Script no responde.
      const j = modoGAS ? await llamarGAS(JSON.stringify({ since: rev, ops: lote }))
        : await (await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token, since: rev, ops: lote }), redirect: 'follow' })).json();
      if (!j.ok && (j.code === 403 || j.code === 400) && lote.length) { // el servidor rechazó los cambios: se descartan y se vuelve a bajar el estado real
        const env = new Set(lote); outbox = outbox.filter(o => !env.has(o)); ls.set('outbox', outbox); rev = 0; ls.set('rev', 0);
        estado.sync = 'error'; estado.error = (j.error || 'Cambios rechazados') + ' Los cambios no autorizados se descartaron.'; setTimeout(sincronizar, 1500); return;
      }
      if (!j.ok) { if (j.code === 401 && !modoGAS) { token = ''; sessionStorage.removeItem(K + 'tok'); estado.sync = 'sesion'; } else { estado.sync = 'error'; } estado.error = j.error || 'Error del servidor'; if (j.code === 403) { estado.rol = ''; ls.set('rol', ''); } return; }
      const enviados = new Set(lote); outbox = outbox.filter(o => !enviados.has(o)); ls.set('outbox', outbox);
      const pend = new Set(outbox.map(o => o.t + '|' + o.id));
      const completo = rev === 0; // descarga completa: lo local que no exista en la nube (y no esté pendiente) se elimina
      for (const t of TABLES) {
        const ch = j.changes[t];
        if (completo) { db[t] = db[t].filter(r => pend.has(t + '|' + r.id)); idx[t] = null; if (!ch) { persist(t); continue; } }
        if (!ch || !ch.length) continue;
        for (const r of ch) { if (pend.has(t + '|' + r.id)) continue; if (r._del) delLocal(t, r.id); else { delete r._del; setLocal(t, r); } }
        persist(t);
      }
      rev = j.rev; ls.set('rev', rev); if (completo) ls.set('completa', Date.now()); estado.rol = j.role; ls.set('rol', j.role); estado.email = j.email || estado.email; if (j.respaldo) estado.respaldo = j.respaldo;
      // la Hoja se editó fuera de la app (a mano o con otra herramienta): se descarga todo de nuevo
      const ext = String(j.externo == null ? '' : j.externo);
      if (ext && ext !== ls.get('externo', '')) { ls.set('externo', ext); if (!completo) { rev = 0; ls.set('rev', 0); otra = true; } }
    } while (outbox.length || otra);
    estado.sync = 'ok'; estado.error = ''; estado.ultima = Date.now();
  } catch (e) { estado.sync = navigator.onLine ? 'error' : 'offline'; estado.error = 'Sin conexión con la nube. Los cambios quedan guardados en este dispositivo.'; }
  finally { syncing = false; emit(); if (nube) { clearTimeout(timer); timer = setTimeout(sincronizar, outbox.length ? 5000 : 40000); } }
}
/** Descarga completa desde la nube (lo pendiente de subir se conserva y se envía). */
export function recargarTodo() { rev = 0; ls.set('rev', 0); return sincronizar(); }
if (nube) {
  window.addEventListener('online', () => sincronizar());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - estado.ultima > 15000) sincronizar(); });
}
