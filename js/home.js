import { sb, state } from './supa.js';
import { $, esc, bs, logo, avatarImg } from './util.js';
import { setCleanup } from './main.js';

export async function vista() {
  const app = $('#app');
  app.innerHTML = `
    <div class="row between">${logo()}${state.user ? '' : '<a class="btn sm ghost" href="#/login">Entrar</a>'}</div>
    <div class="secs"><a href="#/catalogo/mujer"><span>👩</span>Mujer</a><a href="#/catalogo/hombre"><span>👨</span>Hombre</a><a href="#/catalogo/ninos"><span>🧒</span>Niños</a></div>
    <h2><span class="dot"></span> EN VIVO AHORA</h2><div id="vivo"></div>
    <h2>🔥 Ofertas</h2><div id="ofertas" class="grid"></div>
    <h2>Recién llegadas</h2><div id="nuevas" class="grid"></div>`;

  async function pintarVivo() {
    const { data } = await sb.from('tiendas').select('id,nombre,logo_url,promedio_resenas,vendedora_id,perfiles(username)').eq('venta_activa', true);
    $('#vivo').innerHTML = data?.length ? data.map(t => `
      <a class="livecard" href="#/sala/${t.id}">${avatarImg(t.logo_url)}
        <div class="grow"><h3>${esc(t.nombre)}</h3><span class="mut">@${esc(t.perfiles?.username || '')}</span></div>
        <span class="badge" style="position:static">EN VIVO</span></a>`).join('')
      : '<p class="mut">Nadie está en vivo ahora. ¡Vuelve pronto!</p>';
  }
  await pintarVivo();

  const ahora = new Date().toISOString();
  const { data: ofs } = await sb.from('ofertas')
    .select('*, prendas(id,nombre,fotos,precio,estado_venta)').eq('activa', true).lte('desde', ahora).gte('hasta', ahora).limit(8);
  const ofVis = (ofs || []).filter(o => o.prendas && o.prendas.estado_venta === 'disponible');
  $('#ofertas').innerHTML = ofVis.length ? ofVis.map(o => {
    const p = o.prendas, nuevo = o.precio_oferta ?? p.precio * (1 - (o.descuento_porcentaje || 0) / 100);
    return tarjeta(p, `<span class="price">${bs(nuevo)}</span><span class="old">${bs(p.precio)}</span>`, o.descuento_porcentaje ? `-${o.descuento_porcentaje}%` : 'OFERTA');
  }).join('') : '<p class="mut" style="grid-column:1/-1">Sin ofertas por ahora.</p>';

  const { data: nv } = await sb.from('prendas').select('id,nombre,fotos,precio,estado_venta').eq('estado_venta', 'disponible').order('creado_en', { ascending: false }).limit(6);
  $('#nuevas').innerHTML = nv?.length ? nv.map(p => tarjeta(p, `<span class="price">${bs(p.precio)}</span>`)).join('') : '<p class="mut" style="grid-column:1/-1">Aún no hay prendas.</p>';

  const ch = sb.channel('home-vivo').on('postgres_changes', { event: '*', schema: 'public', table: 'tiendas' }, pintarVivo).subscribe();
  setCleanup(() => sb.removeChannel(ch));
}

export function tarjeta(p, precioHtml, badge = '') {
  return `<a class="pcard" href="#/prenda/${p.id}">
    ${badge ? `<span class="badge">${esc(badge)}</span>` : ''}
    ${p.fotos?.[0] ? `<img src="${esc(p.fotos[0])}" alt="${esc(p.nombre)}" loading="lazy">` : '<div class="ph"></div>'}
    <div class="info"><div>${esc(p.nombre)}</div>${precioHtml}</div></a>`;
}
