import { sb, state } from './supa.js';
import { $, esc, bs, stars, avatarImg, waLink, urlSegura, toast, conCarga } from './util.js';
import { tarjeta } from './home.js';

export const CATEGORIAS = ['Polera', 'Camisa', 'Blusa', 'Vestido', 'Falda', 'Pantalón', 'Jeans', 'Short', 'Chamarra', 'Abrigo', 'Calzado', 'Accesorios', 'Otro'];

export async function vista(sec) {
  const app = $('#app');
  let seccion = sec || 'mujer';
  app.innerHTML = `
    <h1>Catálogo</h1>
    <div class="tabs" id="secs">
      ${[['mujer','👩 Mujer'],['hombre','👨 Hombre'],['ninos','🧒 Niños']].map(([s, t]) => `<button class="tab ${s === seccion ? 'on' : ''}" data-s="${s}">${t}</button>`).join('')}
    </div>
    <div class="row wrap mt" style="gap:8px">
      <input id="q" placeholder="Buscar…" style="flex:1 1 100%">
      <select id="cat" class="grow"><option value="">Categoría</option>${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select>
      <input id="talla" placeholder="Talla" class="grow">
      <input id="pmax" type="number" min="0" placeholder="Precio máx. Bs" class="grow">
      <select id="ord" class="grow"><option value="n">Más nuevas</option><option value="a">Precio ↑</option><option value="d">Precio ↓</option><option value="c">Mejor calidad</option></select>
    </div>
    <div id="lista" class="grid mt"></div>`;

  async function cargar() {
    let q = sb.from('prendas').select('id,nombre,fotos,precio,estado_venta,calificacion_calidad,talla')
      .eq('seccion', seccion).in('estado_venta', ['disponible', 'reservada']);
    if ($('#cat').value) q = q.eq('categoria', $('#cat').value);
    if ($('#talla').value.trim()) q = q.ilike('talla', $('#talla').value.trim());
    if ($('#pmax').value) q = q.lte('precio', Number($('#pmax').value));
    const t = $('#q').value.trim().replace(/[%,]/g, '');
    if (t) q = q.ilike('nombre', `%${t}%`);
    const o = $('#ord').value;
    q = o === 'a' ? q.order('precio') : o === 'd' ? q.order('precio', { ascending: false }) : o === 'c' ? q.order('calificacion_calidad', { ascending: false, nullsFirst: false }) : q.order('creado_en', { ascending: false });
    const { data, error } = await q.limit(60);
    if (error) { toast(error.message, 'err'); return; }
    $('#lista').innerHTML = data.length ? data.map(p => tarjeta(p,
      `<span class="price">${bs(p.precio)}</span> <span class="mut">${esc(p.talla || '')}</span>`,
      p.estado_venta === 'reservada' ? 'Reservada' : '')).join('') : '<p class="mut" style="grid-column:1/-1">No hay prendas con esos filtros.</p>';
  }
  document.querySelectorAll('#secs .tab').forEach(b => b.onclick = () => {
    seccion = b.dataset.s;
    document.querySelectorAll('#secs .tab').forEach(x => x.classList.toggle('on', x === b));
    cargar();
  });
  ['cat', 'ord'].forEach(id => $('#' + id).onchange = cargar);
  let tm; ['q', 'talla', 'pmax'].forEach(id => $('#' + id).oninput = () => { clearTimeout(tm); tm = setTimeout(cargar, 350); });
  await cargar();
}

export async function detalle(id) {
  const { data: p, error } = await sb.from('prendas').select('*, tiendas(id,nombre,venta_activa,promedio_resenas)').eq('id', id).maybeSingle();
  if (error || !p) { $('#app').innerHTML = '<div class="card">Prenda no encontrada.</div>'; return; }
  const ahora = new Date().toISOString();
  const [{ data: ofs }, { data: res }] = await Promise.all([
    sb.from('ofertas').select('*').eq('prenda_id', id).eq('activa', true).lte('desde', ahora).gte('hasta', ahora),
    sb.from('resenas').select('*, perfiles:compradora_id(username)').eq('prenda_id', id).order('creado_en', { ascending: false }),
  ]);
  const of = ofs?.[0];
  const { data: vv } = await sb.from('ventas_en_vivo').select('id').eq('tienda_id', p.tiendas.id).eq('estado', 'activa').maybeSingle();
  const puedeMio = !!vv && state.perfil?.rol !== 'vendedora' && ['disponible', 'reservada'].includes(p.estado_venta);
  const precioOf = of ? (of.precio_oferta ?? Math.round(p.precio * (1 - of.descuento_porcentaje / 100) * 100) / 100) : null;
  $('#app').innerHTML = `
    <a href="#/catalogo" class="mut">← Volver</a>
    <div class="gallery mt">${(p.fotos?.length ? p.fotos : [null]).map(f => f ? `<img src="${esc(f)}" alt="${esc(p.nombre)}">` : '<div class="ph" style="flex:0 0 100%"></div>').join('')}</div>
    <div class="row between mt"><h1 style="margin:0">${esc(p.nombre)}</h1><span class="status">#${p.numero ?? ''}</span></div>
    <div style="font-size:22px">${precioOf != null ? `<span class="price">${bs(precioOf)}</span><span class="old">${bs(p.precio)}</span>` : `<span class="price">${bs(p.precio)}</span>`}</div>
    ${of ? `<p class="mut">Oferta hasta ${new Date(of.hasta).toLocaleString('es-BO')}</p>` : ''}
    <div class="mt"><span class="pill">${esc(p.estado === 'nueva' ? 'Nueva' : 'Usada como nueva')}</span>${p.talla ? `<span class="pill">Talla ${esc(p.talla)}</span>` : ''}${p.color ? `<span class="pill">${esc(p.color)}</span>` : ''}${p.categoria ? `<span class="pill">${esc(p.categoria)}</span>` : ''}</div>
    <p>Calidad según la vendedora: ${p.calificacion_calidad ? stars(p.calificacion_calidad) : '<span class="mut">sin calificar</span>'}</p>
    <p>${esc(p.descripcion || '')}</p>
    <div class="card row between"><div><h3>${esc(p.tiendas.nombre)}</h3>${stars(p.tiendas.promedio_resenas)}</div><a class="btn sm ghost" href="#/tienda/${p.tiendas.id}">Ver tienda</a></div>
    ${puedeMio ? `<button class="btn mio mt" id="mio">${p.estado_venta === 'reservada' ? 'Ponerme en espera · ¡MÍO!' : '¡MÍO!'}</button>` : ''}
    ${p.tiendas.venta_activa ? `<a class="btn red block mt" href="#/sala/${p.tiendas.id}"><span class="dot" style="background:#fff"></span> Ir al LIVE</a>` : '<p class="mut center">Esta prenda se reclama durante el live de la tienda.</p>'}
    ${p.estado_venta !== 'disponible' ? `<p class="center"><span class="status">${p.estado_venta}</span></p>` : ''}
    <h2>Reseñas</h2>
    ${res?.length ? res.map(r => `<div class="card"><div class="row between">${stars(r.estrellas)}<span class="mut">@${esc(r.perfiles?.username || 'usuaria')}</span></div>
      <p>${esc(r.texto || '')}</p>${r.foto_url ? `<img src="${esc(r.foto_url)}" style="width:100%;border-radius:16px" loading="lazy" alt="">` : ''}
      ${r.respuesta_vendedora ? `<p class="mut" style="border-left:3px solid var(--y);padding-left:10px">Vendedora: ${esc(r.respuesta_vendedora)}</p>` : ''}</div>`).join('') : '<p class="mut">Aún sin reseñas.</p>'}`;
  const mio = $('#mio');
  if (mio) mio.onclick = () => conCarga(mio, async () => {
    if (!state.user) { location.hash = '#/login'; return; }
    const { data, error } = await sb.rpc('reclamar_mio', { p_venta: vv.id, p_prenda: p.id });
    if (error) throw error;
    if (data.estado === 'ganador') { toast('🎉 ¡Es tuyo! Tienes 24 h para pagar. Mira Pedidos.'); location.hash = '#/pedidos'; }
    else toast(`Llegaste tarde. Estás en lista de espera (#${data.posicion}).`, 'err');
  });
}

export async function tienda(id) {
  const { data: t } = await sb.from('tiendas').select('*, perfiles:vendedora_id(username,nombre,tiktok_url)').eq('id', id).maybeSingle();
  if (!t) { $('#app').innerHTML = '<div class="card">Tienda no encontrada.</div>'; return; }
  const [{ data: ps }, sg] = await Promise.all([
    sb.from('prendas').select('id,nombre,fotos,precio,estado_venta').eq('tienda_id', id).in('estado_venta', ['disponible', 'reservada']).order('creado_en', { ascending: false }),
    state.user ? sb.from('seguidores').select('tienda_id').eq('tienda_id', id).eq('compradora_id', state.user.id).maybeSingle() : { data: null },
  ]);
  let sigue = !!sg.data;
  const pf = t.perfiles || {};
  const { data: wa } = await sb.rpc('contacto_tienda', { p_tienda: id });
  pf.whatsapp = wa;
  const tk = urlSegura(pf.tiktok_url), live = urlSegura(t.live_url);
  $('#app').innerHTML = `
    <div class="row">${avatarImg(t.logo_url, 'lg')}<div><h1 style="margin:0">${esc(t.nombre)}</h1><a href="#/u/${esc(pf.username)}">@${esc(pf.username || '')}</a><div>${stars(t.promedio_resenas)} <span class="mut">${t.total_ventas} ventas</span></div></div></div>
    <p>${esc(t.descripcion || '')}</p>
    <div class="row wrap">
      ${t.venta_activa ? `<a class="btn red sm" href="#/sala/${t.id}">🔴 En vivo</a>` : ''}
      ${pf.whatsapp ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${waLink(pf.whatsapp, 'Hola, te escribo desde MIO LIVE')}">WhatsApp</a>` : ''}
      ${tk ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(tk)}">TikTok</a>` : ''}
      ${live ? `<a class="btn sm ghost" target="_blank" rel="noopener" href="${esc(live)}">Link del live</a>` : ''}
      ${state.user && state.perfil?.rol === 'compradora' ? `<button class="btn sm dark" id="seg">${sigue ? '✓ Siguiendo' : '+ Seguir'}</button>` : ''}
    </div>
    <h2>Prendas</h2><div class="grid">${ps?.length ? ps.map(p => tarjeta(p, `<span class="price">${bs(p.precio)}</span>`, p.estado_venta === 'reservada' ? 'Reservada' : '')).join('') : '<p class="mut">Sin prendas.</p>'}</div>`;
  const seg = $('#seg');
  if (seg) seg.onclick = () => conCarga(seg, async () => {
    const r = sigue ? await sb.from('seguidores').delete().eq('tienda_id', id).eq('compradora_id', state.user.id)
      : await sb.from('seguidores').insert({ tienda_id: id, compradora_id: state.user.id });
    if (r.error) throw r.error;
    sigue = !sigue;
  }).then(() => { seg.textContent = sigue ? '✓ Siguiendo' : '+ Seguir'; });
}
