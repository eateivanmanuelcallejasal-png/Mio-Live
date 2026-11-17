import { sb, state, esVendedora } from './supa.js';
import { $, esc, conCarga, toast, subirImagen, avatarImg, urlSegura, waLink, stars } from './util.js';
import { recargarSesion } from './main.js';

export function editar() {
  const p = state.perfil;
  if (!p) { $('#app').innerHTML = '<div class="card">No se pudo cargar tu perfil. Cierra sesión y vuelve a entrar.</div>'; return; }
  $('#app').innerHTML = `
    <h1>Mi perfil</h1>
    <div class="center"><div id="av">${avatarImg(p.avatar_url, 'lg')}</div>
      <label for="foto" class="btn sm ghost mt" style="cursor:pointer">Cambiar foto / logo</label>
      <input id="foto" type="file" accept="image/*" class="hide"></div>
    <form id="f">
      <label for="username">Usuario (@)</label><input id="username" value="${esc(p.username || '')}" pattern="[a-z0-9_.]{3,20}" autocapitalize="none" required>
      <label for="nombre">Nombre</label><input id="nombre" value="${esc(p.nombre || '')}" required>
      <label for="ciudad">Ciudad</label><input id="ciudad" value="${esc(p.ciudad || '')}">
      <label for="direccion">${esVendedora() ? 'Dirección de despacho' : 'Dirección de envío'}</label><input id="direccion" value="${esc(p.direccion || '')}">
      <label for="whatsapp">WhatsApp (con código, ej. 591 7XXXXXXX)</label><input id="whatsapp" type="tel" value="${esc(p.whatsapp || '')}">
      <label for="tiktok">Enlace de TikTok</label><input id="tiktok" type="url" value="${esc(p.tiktok_url || '')}" placeholder="https://www.tiktok.com/@usuario">
      <button class="btn block mt" id="guardar">Guardar cambios</button>
    </form>
    <a class="btn ghost block mt" href="#/u/${esc(p.username || '')}">Ver mi perfil público</a>
    <button class="btn dark block mt" id="salir">Cerrar sesión</button>`;

  $('#foto').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    conCarga($('#guardar'), async () => {
      const url = await subirImagen('avatars', f, state.user.id);
      const { error } = await sb.from('perfiles').update({ avatar_url: url }).eq('id', state.user.id);
      if (error) throw error;
      if (esVendedora()) await sb.from('tiendas').update({ logo_url: url }).eq('vendedora_id', state.user.id);
      await recargarSesion();
      $('#av').innerHTML = avatarImg(url, 'lg');
      toast('Foto actualizada');
    });
  };
  $('#f').onsubmit = ev => {
    ev.preventDefault();
    conCarga($('#guardar'), async () => {
      const username = $('#username').value.trim().toLowerCase().replace(/^@/, '');
      if (!/^[a-z0-9_.]{3,20}$/.test(username)) throw new Error('Usuario: 3 a 20 caracteres (minúsculas, números, _ o .).');
      const tk = $('#tiktok').value.trim();
      if (tk && !urlSegura(tk)) throw new Error('El enlace de TikTok no es válido.');
      const { error } = await sb.from('perfiles').update({
        username, nombre: $('#nombre').value.trim(), ciudad: $('#ciudad').value.trim(),
        direccion: $('#direccion').value.trim(), whatsapp: $('#whatsapp').value.trim(), tiktok_url: tk ? urlSegura(tk) : null,
      }).eq('id', state.user.id);
      if (error) throw new Error(error.message.includes('duplicate') ? 'Ese usuario ya está en uso.' : error.message);
      await recargarSesion();
      toast('Perfil guardado');
    });
  };
  $('#salir').onclick = async () => { await sb.auth.signOut(); };
}

export async function publico(username) {
  const { data: p } = await sb.from('perfiles').select('id,rol,username,nombre,avatar_url,ciudad,tiktok_url').eq('username', username.toLowerCase()).maybeSingle();
  if (!p) { $('#app').innerHTML = '<div class="card">Usuaria no encontrada.</div>'; return; }
  let t = null;
  if (p.rol === 'vendedora') ({ data: t } = await sb.from('tiendas').select('id,nombre,promedio_resenas,total_ventas,venta_activa').eq('vendedora_id', p.id).maybeSingle());
  const tk = urlSegura(p.tiktok_url);
  if (t) { const { data: wa } = await sb.rpc('contacto_tienda', { p_tienda: t.id }); p.whatsapp = wa; }
  $('#app').innerHTML = `
    <div class="center">${avatarImg(p.avatar_url, 'lg')}<h1 style="margin-bottom:0">${esc(p.nombre || '')}</h1><p class="mut">@${esc(p.username)} ${p.ciudad ? '· ' + esc(p.ciudad) : ''}</p></div>
    ${t ? `<div class="card center"><h3>${esc(t.nombre)}</h3>${stars(t.promedio_resenas)} <span class="mut">${t.total_ventas} ventas</span><br>
      <a class="btn mt" href="#/${t.venta_activa ? 'sala' : 'tienda'}/${t.id}">${t.venta_activa ? '🔴 Ir al live' : 'Ver tienda'}</a></div>` : ''}
    <div class="row wrap" style="justify-content:center">
      ${t && p.whatsapp ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink(p.whatsapp, 'Hola, te escribo desde MIO LIVE')}">WhatsApp</a>` : ''}
      ${tk ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(tk)}">TikTok</a>` : ''}
    </div>`;
}
