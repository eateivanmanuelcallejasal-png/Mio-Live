import { sb } from './supa.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const bs = n => 'Bs ' + Number(n).toFixed(2).replace(/\.00$/, '');
export const fecha = d => new Date(d).toLocaleString('es-BO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

const MENSAJES = {
  'Invalid login credentials': 'Correo o contraseña incorrectos.',
  'Email not confirmed': 'Primero confirma tu correo (revisa tu bandeja y spam).',
  'User already registered': 'Ese correo ya tiene una cuenta.',
  'Failed to fetch': 'Sin conexión. Revisa tu internet.',
  'duplicate key': 'Ese dato ya existe.',
  'violates row-level security': 'No tienes permiso para hacer eso.',
};
export function errMsg(e) {
  const m = e?.message || String(e);
  for (const k in MENSAJES) if (m.includes(k)) return MENSAJES[k];
  if (m.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.';
  return m;
}

// Ejecuta fn mostrando estado de carga en el botón y errores en español
export async function conCarga(btn, fn) {
  const txt = btn.textContent;
  btn.disabled = true; btn.textContent = 'Cargando…';
  try { return await fn(); }
  catch (e) { toast(errMsg(e), 'err'); }
  finally { btn.disabled = false; btn.textContent = txt; }
}

export const stars = n => {
  n = Number(n) || 0;
  const full = Math.floor(n), half = n - full >= 0.5;
  return `<span class="stars" aria-label="${n} de 5">${'★'.repeat(full)}${half ? '⯪' : ''}${'☆'.repeat(5 - full - (half ? 1 : 0))}</span>`;
};

export function waLink(numero, msg = '') {
  let n = String(numero || '').replace(/\D/g, '');
  if (n.length === 8) n = '591' + n; // Bolivia
  return `https://wa.me/${n}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
}
export function urlSegura(u) {
  if (!u) return '';
  try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return ['http:', 'https:'].includes(x.protocol) ? x.href : ''; }
  catch { return ''; }
}

export const logo = (sm = false) => `<img class="logo-img${sm ? ' sm' : ''}" src="icons/logo.png" alt="MIO LIVE">`;
export const mascota = () => `<svg class="mascot" viewBox="0 0 200 190" aria-hidden="true">
  <path d="M20 100l30-28h100l30 28v6H20z" fill="#e6a35f" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
  <g transform="rotate(-8 100 70)"><rect x="45" y="12" width="110" height="96" rx="10" fill="#FFF200" stroke="#000" stroke-width="4"/>
  <path d="M68 40l22 22M90 40L68 62" stroke="#000" stroke-width="10"/><rect x="112" y="40" width="26" height="26" fill="#000"/></g>
  <ellipse cx="60" cy="112" rx="16" ry="10" fill="#fff" stroke="#000" stroke-width="4"/><ellipse cx="142" cy="112" rx="16" ry="10" fill="#fff" stroke="#000" stroke-width="4"/>
  <path d="M28 104l72 14 72-14-14 70-58 8-58-8z" fill="#e6a35f" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
  <path d="M100 118v64" stroke="#000" stroke-width="3"/></svg>`;

// Redimensiona a máx. 1200px y sube a Storage: <bucket>/<uid>/<uuid>.jpg
export async function subirImagen(bucket, file, uid) {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen.');
  const blob = await new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1200 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => b ? ok(b) : fail(new Error('No se pudo procesar la imagen.')), 'image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => fail(new Error('Imagen no válida.'));
    img.src = URL.createObjectURL(file);
  });
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const { error } = await sb.storage.from(bucket).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000' });
  if (error) throw error;
  return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

export const avatarImg = (url, cls = '') => url
  ? `<img class="avatar ${cls}" src="${esc(url)}" alt="" loading="lazy">`
  : `<span class="avatar ${cls}" style="display:grid;place-items:center;font-size:24px">👤</span>`;
