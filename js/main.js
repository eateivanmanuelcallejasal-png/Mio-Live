import { sb, state, cargarSesion, configurado, esVendedora } from './supa.js';
import { $, esc } from './util.js';
import * as auth from './auth.js';
import * as home from './home.js';
import * as catalogo from './catalogo.js';
import * as sala from './sala.js';
import * as perfil from './perfil.js';
import * as vender from './vender.js';
import * as pedidos from './pedidos.js';
import * as puntos from './puntos.js';

const app = $('#app');
let limpiar = null; // función para cerrar canales realtime de la vista anterior
export const setCleanup = fn => { limpiar = fn; };

// ruta -> [vista, requiereLogin]
const rutas = [
  [/^\/?$/, home.vista, false],
  [/^\/bienvenida$/, auth.bienvenida, false],
  [/^\/login$/, a => auth.formulario(a, 'login'), false],
  [/^\/registro$/, a => auth.formulario(a, 'registro'), false],
  [/^\/catalogo(?:\/(mujer|hombre|ninos))?$/, catalogo.vista, false],
  [/^\/prenda\/([\w-]+)$/, catalogo.detalle, false],
  [/^\/tienda\/([\w-]+)$/, catalogo.tienda, false],
  [/^\/sala\/([\w-]+)$/, sala.vista, false],
  [/^\/u\/([\w.]+)$/, perfil.publico, false],
  [/^\/perfil$/, perfil.editar, true],
  [/^\/vender$/, vender.vista, true],
  [/^\/pedidos$/, pedidos.vista, true],
  [/^\/puntos$/, puntos.vista, true],
];

async function router() {
  if (limpiar) { try { limpiar(); } catch {} limpiar = null; }
  const ruta = location.hash.replace(/^#/, '') || '/';
  if (!configurado) {
    app.innerHTML = `<div class="card"><h2>Falta configurar Supabase</h2><p class="mut">Define SUPABASE_URL y SUPABASE_ANON_KEY (ver README.md).</p></div>`;
    return;
  }
  for (const [re, vista, login] of rutas) {
    const m = ruta.match(re);
    if (!m) continue;
    if (login && !state.user) { location.hash = '#/login'; return; }
    if (vender.vista === vista && !esVendedora()) { location.hash = '#/'; return; }
    app.innerHTML = '<div class="splash">Cargando…</div>';
    window.scrollTo(0, 0);
    try { await vista(m[1]); }
    catch (e) { console.error(e); app.innerHTML = `<div class="card"><h2>Ups</h2><p class="mut">${esc(e.message || 'Error inesperado')}</p><a class="btn" href="#/">Volver al inicio</a></div>`; }
    pintarNav(ruta);
    return;
  }
  app.innerHTML = '<div class="card"><h2>Página no encontrada</h2><a class="btn" href="#/">Inicio</a></div>';
  pintarNav(ruta);
}

function pintarNav(ruta) {
  const nav = $('#nav');
  const fuera = ['/bienvenida', '/login', '/registro'].includes(ruta);
  nav.hidden = fuera;
  if (fuera) return;
  const items = [['/', '🏠', 'Inicio'], ['/catalogo', '🛍️', 'Catálogo']];
  if (esVendedora()) items.push(['/vender', '🎥', 'Vender']);
  if (state.user) items.push(['/pedidos', '📦', 'Pedidos']);
  if (state.user && !esVendedora()) items.push(['/puntos', '⭐', 'Puntos']);
  items.push([state.user ? '/perfil' : '/login', '👤', state.user ? 'Perfil' : 'Entrar']);
  nav.innerHTML = items.map(([r, i, t]) => `<a href="#${r}" class="${ruta === r || (r !== '/' && ruta.startsWith(r)) ? 'on' : ''}"><span>${i}</span>${t}</a>`).join('');
}

export async function recargarSesion() { await cargarSesion(); }

sb.auth.onAuthStateChange(async (evento) => {
  if (['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(evento)) {
    await cargarSesion();
    if (evento === 'SIGNED_IN' && /^#\/(login|registro|bienvenida)/.test(location.hash)) location.hash = '#/';
    else if (evento === 'SIGNED_OUT') location.hash = '#/bienvenida';
    else router();
  }
});

window.addEventListener('hashchange', router);
(async () => {
  if (configurado) await cargarSesion();
  if (!state.user && !location.hash) location.hash = '#/bienvenida';
  router();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
