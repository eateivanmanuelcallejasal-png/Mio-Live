import { sb, state, esVendedora } from './supa.js';
import { $, esc, bs, stars, avatarImg, urlSegura, waLink, toast, conCarga } from './util.js';
import { setCleanup } from './main.js';

// Sala de venta en vivo de una tienda: ¡MÍO! en tiempo real
export async function vista(tiendaId) {
  const app = $('#app');
  const { data: t } = await sb.from('tiendas').select('*, perfiles:vendedora_id(username,tiktok_url)').eq('id', tiendaId).maybeSingle();
  if (!t) { app.innerHTML = '<div class="card">Tienda no encontrada.</div>'; return; }
  const { data: wa } = await sb.rpc('contacto_tienda', { p_tienda: tiendaId });
  if (t.perfiles) t.perfiles.whatsapp = wa;
  const soyDueña = state.tienda?.id === t.id;
  let venta = null, prendas = [], reclamos = [], misReclamos = {};

  async function cargarVenta() {
    const { data } = await sb.from('ventas_en_vivo').select('*').eq('tienda_id', tiendaId).eq('estado', 'activa').maybeSingle();
    venta = data;
  }
  async function cargarPrendas() {
    const { data } = await sb.from('prendas').select('*').eq('tienda_id', tiendaId).in('estado_venta', ['disponible', 'reservada']).order('numero');
    prendas = data || [];
  }
  async function cargarReclamos() {
    if (!venta || !state.user) { reclamos = []; misReclamos = {}; return; }
    // RLS: la vendedora ve todos; la compradora solo los suyos
    const { data } = await sb.from('reclamos').select('*, perfiles:compradora_id(username,nombre)').eq('venta_id', venta.id).neq('estado', 'anulado').order('creado_en');
    reclamos = data || [];
    misReclamos = {};
    reclamos.filter(r => r.compradora_id === state.user.id).forEach(r => misReclamos[r.prenda_id] = r);
  }

  function pintar() {
    const live = urlSegura(venta?.live_url || t.live_url);
    const pf = t.perfiles || {};
    const actual = venta?.prenda_actual_id;
    const orden = [...prendas].sort((a, b) => (b.id === actual) - (a.id === actual));
    app.innerHTML = `
      <a href="#/" class="mut">← Inicio</a>
      <div class="row mt">${avatarImg(t.logo_url)}<div class="grow"><h1 style="margin:0;font-size:22px">${esc(t.nombre)}</h1>
        ${venta ? '<span class="badge" style="position:static"><span class="dot" style="background:#fff"></span> EN VIVO</span>' : '<span class="status">Sin venta activa</span>'}</div>
        <a class="btn sm ghost" href="#/tienda/${t.id}">Tienda</a></div>
      <div class="row wrap mt">
        ${live ? `<a class="btn red sm" target="_blank" rel="noopener" href="${esc(live)}">▶ Abrir el live</a>` : ''}
        ${pf.tiktok_url && urlSegura(pf.tiktok_url) ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${esc(urlSegura(pf.tiktok_url))}">TikTok</a>` : ''}
        ${pf.whatsapp ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="${waLink(pf.whatsapp, 'Hola, te escribo desde MIO LIVE')}">WhatsApp</a>` : ''}
      </div>
      ${!venta ? '<div class="card center mt"><p>Esta tienda no está en vivo ahora.</p></div>' : ''}
      <h2>Prendas del live</h2>
      ${orden.length ? orden.map(p => tarjetaPrenda(p, p.id === actual)).join('') : '<p class="mut">La vendedora aún no publicó prendas disponibles.</p>'}`;

    app.querySelectorAll('[data-mio]').forEach(b => b.onclick = () => conCarga(b, async () => {
      if (!state.user) { location.hash = '#/login'; return; }
      const { data, error } = await sb.rpc('reclamar_mio', { p_venta: venta.id, p_prenda: b.dataset.mio });
      if (error) throw error;
      if (data.estado === 'ganador') toast('🎉 ¡Es tuyo! Tienes 24 h para pagar. Mira Pedidos.');
      else toast(`Llegaste tarde. Estás en lista de espera (#${data.posicion}).`, 'err');
      await cargarReclamos(); await cargarPrendas(); pintar();
    }));
    app.querySelectorAll('[data-actual]').forEach(b => b.onclick = () => conCarga(b, async () => {
      const { error } = await sb.rpc('poner_prenda_actual', { p_prenda: b.dataset.actual });
      if (error) throw error;
      await cargarVenta(); pintar();
    }));
  }

  function tarjetaPrenda(p, esActual) {
    const mi = misReclamos[p.id];
    const lista = reclamos.filter(r => r.prenda_id === p.id);
    let accion = '';
    if (soyDueña) {
      accion = `${esActual ? '<span class="badge g" style="position:static">En pantalla</span>' : `<button class="btn sm dark" data-actual="${p.id}">Poner en pantalla</button>`}
        ${lista.length ? `<div class="mt">${lista.map((r, i) => `<div class="claim ${r.estado === 'ganador' ? 'win' : ''}"><span class="n">${i + 1}</span>
          <div class="grow">@${esc(r.perfiles?.username || '')}</div><span class="status">${r.estado}</span></div>`).join('')}</div>` : '<p class="mut">Sin reclamos todavía.</p>'}`;
    } else if (!venta) accion = '';
    else if (mi) accion = mi.estado === 'ganador' ? '<a class="btn ok block" href="#/pedidos">🎉 ¡Ganaste! Ver pedido</a>' : '<div class="btn dark block" style="cursor:default">En lista de espera</div>';
    else if (p.estado_venta === 'reservada') accion = '<button class="btn mio" data-mio="' + p.id + '" style="background:#333;border-color:#333;color:#fff;font-size:18px">Ya reservada — ponerme en espera</button>';
    else accion = `<button class="btn mio" data-mio="${p.id}">¡MÍO!</button>`;
    return `<div class="card${esActual ? ' ycard' : ''}">
      <div class="row">${p.fotos?.[0] ? `<img class="avatar" style="border-radius:14px;width:84px;height:84px" src="${esc(p.fotos[0])}" alt="">` : ''}
        <div class="grow"><span class="status">#${p.numero}</span><h3>${esc(p.nombre)}</h3><span class="price">${bs(p.precio)}</span>
        <div class="mut">${esc(p.talla ? 'Talla ' + p.talla : '')} ${p.calificacion_calidad ? stars(p.calificacion_calidad) : ''}</div></div></div>
      <div class="mt">${accion}</div></div>`;
  }

  await Promise.all([cargarVenta(), cargarPrendas()]);
  await cargarReclamos();
  pintar();

  // Realtime: prendas, venta y reclamos de esta tienda
  let pendiente = null;
  const refrescar = () => { clearTimeout(pendiente); pendiente = setTimeout(async () => { await cargarVenta(); await cargarPrendas(); await cargarReclamos(); pintar(); }, 150); };
  const ch = sb.channel('sala-' + tiendaId)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'prendas', filter: `tienda_id=eq.${tiendaId}` }, refrescar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ventas_en_vivo', filter: `tienda_id=eq.${tiendaId}` }, refrescar)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'reclamos' }, refrescar)
    .subscribe();
  setCleanup(() => { clearTimeout(pendiente); sb.removeChannel(ch); });
}
