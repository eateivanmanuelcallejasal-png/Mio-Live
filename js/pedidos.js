import { sb, state, esVendedora } from './supa.js';
import { $, esc, bs, stars, conCarga, toast, subirImagen, fecha, waLink } from './util.js';

const ETIQUETA = { pendiente: 'Pendiente de pago', pagado: 'Pagado', enviado: 'Enviado', vencido: 'Vencido', cancelado: 'Cancelado' };

export async function vista() {
  if (esVendedora()) { await sb.rpc('vencer_pedidos'); return vendedora(); }
  return compradora();
}

function restante(vence) {
  const ms = new Date(vence) - Date.now();
  if (ms <= 0) return 'Plazo vencido';
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms % 3.6e6 / 6e4);
  return `Te quedan ${h} h ${m} min para pagar`;
}

/* ---------- COMPRADORA ---------- */
async function compradora() {
  const { data: ps } = await sb.from('pedidos')
    .select('*, prendas(id,nombre,fotos), tiendas(id,nombre), resenas(id,estrellas)').eq('compradora_id', state.user.id).order('creado_en', { ascending: false });
  $('#app').innerHTML = `<h1>Mis pedidos</h1>
    ${ps?.length ? ps.map(p => `<div class="card" data-id="${p.id}">
      <div class="row">${p.prendas?.fotos?.[0] ? `<img class="avatar" style="border-radius:14px;width:72px;height:72px" src="${esc(p.prendas.fotos[0])}" alt="">` : ''}
      <div class="grow"><h3>${esc(p.prendas?.nombre || '')}</h3><span class="mut">${esc(p.tiendas?.nombre || '')}</span><br><span class="price">${bs(p.precio_final)}</span></div>
      <span class="status ${p.estado}">${ETIQUETA[p.estado]}</span></div>
      ${p.estado === 'pendiente' ? `<p class="mut mt">⏳ ${restante(p.vence_en)}. La vendedora te escribirá por WhatsApp con los datos de pago.</p>
        <button class="btn sm ghost" data-cancel="${p.id}">Cancelar pedido</button>` : ''}
      ${['pagado', 'enviado'].includes(p.estado) ? (p.resenas?.length ? `<p class="mut mt">Tu reseña: ${stars(p.resenas[0].estrellas)}</p>` : `<button class="btn sm mt" data-resena="${p.id}">⭐ Dejar reseña</button><div class="resena-box"></div>`) : ''}
    </div>`).join('') : '<p class="mut">Aún no tienes pedidos. ¡Entra a un live y di MÍO!</p>'}`;

  document.querySelectorAll('[data-cancel]').forEach(b => b.onclick = () => {
    if (!confirm('¿Cancelar este pedido? La prenda quedará libre.')) return;
    conCarga(b, async () => {
      const { error } = await sb.from('pedidos').update({ estado: 'cancelado' }).eq('id', b.dataset.cancel);
      if (error) throw error;
      toast('Pedido cancelado. La vendedora podrá liberar la prenda.'); vista();
    });
  });
  document.querySelectorAll('[data-resena]').forEach(b => b.onclick = () => {
    const ped = ps.find(x => x.id === b.dataset.resena);
    const box = b.nextElementSibling;
    b.classList.add('hide');
    box.innerHTML = `<form class="mt"><label>Calificación</label><select name="e">${[5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5].map(n => `<option value="${n}">${n} ★</option>`).join('')}</select>
      <label>Comentario</label><textarea name="t" maxlength="400"></textarea>
      <label>Foto (opcional)</label><input name="f" type="file" accept="image/*">
      <button class="btn block mt">Enviar reseña</button></form>`;
    const f = box.querySelector('form');
    f.onsubmit = ev => {
      ev.preventDefault();
      conCarga(f.querySelector('button'), async () => {
        const file = f.f.files[0];
        const foto_url = file ? await subirImagen('resenas', file, state.user.id) : null;
        const { error } = await sb.from('resenas').insert({ pedido_id: ped.id, prenda_id: ped.prenda_id, compradora_id: state.user.id,
          estrellas: Number(f.e.value), texto: f.t.value.trim() || null, foto_url });
        if (error) throw error; toast('¡Gracias por tu reseña!'); vista();
      });
    };
  });
}

/* ---------- VENDEDORA ---------- */
async function vendedora() {
  let filtro = 'pendiente';
  const { data: ps } = await sb.from('pedidos')
    .select('*, prendas(id,nombre,fotos,numero), perfiles:compradora_id(username,nombre), resenas(id,estrellas,texto,respuesta_vendedora)')
    .eq('tienda_id', state.tienda.id).order('creado_en', { ascending: false });
  const todos = ps || [];

  function pintar() {
    const lista = todos.filter(p => filtro === 'todos' || p.estado === filtro || (filtro === 'pendiente' && p.estado === 'vencido'));
    $('#app').innerHTML = `<h1>Pedidos recibidos</h1>
      <div class="tabs" id="fs">${['pendiente', 'pagado', 'enviado', 'todos'].map(k => `<button class="tab ${k === filtro ? 'on' : ''}" data-f="${k}">${k === 'pendiente' ? 'Por cobrar' : k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
      <div class="mt">${lista.length ? lista.map(p => `<div class="card">
        <div class="row between"><div><h3>#${p.prendas?.numero} ${esc(p.prendas?.nombre || '')}</h3><span class="mut">@${esc(p.perfiles?.username || '')} · ${fecha(p.creado_en)}</span></div><span class="status ${p.estado}">${ETIQUETA[p.estado]}</span></div>
        <p><span class="price">${bs(p.precio_final)}</span> ${p.estado === 'pendiente' ? `<span class="mut">· ${restante(p.vence_en)}</span>` : ''}</p>
        <div class="row wrap">
          ${['pendiente', 'vencido'].includes(p.estado) ? `<button class="btn sm" data-cobrar="${p.id}">💬 Cobrar por WhatsApp</button>` : ''}
          ${p.estado === 'pendiente' ? `<button class="btn sm ok" data-pagado="${p.id}">✓ Marcar pagado</button>` : ''}
          ${['pendiente', 'vencido', 'cancelado'].includes(p.estado) && !(p.estado === 'cancelado' && false) ? `<button class="btn sm dark" data-liberar="${p.id}">Liberar prenda</button>` : ''}
          ${p.estado === 'pagado' ? `<button class="btn sm" data-enviado="${p.id}">📦 Marcar enviado</button>` : ''}
          ${['pagado', 'enviado'].includes(p.estado) ? `<button class="btn sm ghost" data-etiqueta="${p.id}">Copiar etiqueta de envío</button>` : ''}
        </div>
        ${p.resenas?.[0] ? `<div class="mt">${stars(p.resenas[0].estrellas)} <span class="mut">${esc(p.resenas[0].texto || '')}</span>
          ${p.resenas[0].respuesta_vendedora ? `<p class="mut">Tu respuesta: ${esc(p.resenas[0].respuesta_vendedora)}</p>` : `<button class="btn sm dark" data-resp="${p.resenas[0].id}">Responder</button>`}</div>` : ''}
      </div>`).join('') : '<p class="mut">No hay pedidos aquí.</p>'}</div>`;

    document.querySelectorAll('#fs .tab').forEach(b => b.onclick = () => { filtro = b.dataset.f; pintar(); });
    const por = id => todos.find(x => x.id === id);

    // Datos privados de la compradora: solo accesibles a la vendedora del pedido (RPC)
    const datos = async id => { const { data, error } = await sb.rpc('datos_envio', { p_pedido: id }); if (error) throw error; return data; };

    document.querySelectorAll('[data-cobrar]').forEach(b => b.onclick = () => conCarga(b, async () => {
      const p = por(b.dataset.cobrar), d = await datos(p.id);
      if (!d.whatsapp) throw new Error('La compradora no registró su WhatsApp.');
      const msg = `Hola ${d.nombre || ''} 👋 Soy de ${state.tienda.nombre} (MIO LIVE).\n¡Ganaste la prenda #${p.prendas.numero} "${p.prendas.nombre}"!\nTotal a pagar: ${bs(p.precio_final)}\nTienes 24 horas para pagar (hasta ${fecha(p.vence_en)}). Te paso mis datos de pago por aquí 💛`;
      window.open(waLink(d.whatsapp, msg), '_blank', 'noopener');
    }));
    document.querySelectorAll('[data-pagado]').forEach(b => b.onclick = () => conCarga(b, async () => {
      const { data, error } = await sb.rpc('acreditar_puntos', { p_pedido: b.dataset.pagado });
      if (error) throw error;
      toast(`Pedido pagado. Puntos acreditados: ${data}`); vista();
    }));
    document.querySelectorAll('[data-enviado]').forEach(b => b.onclick = () => conCarga(b, async () => {
      const { error } = await sb.rpc('marcar_enviado', { p_pedido: b.dataset.enviado }); if (error) throw error; vista();
    }));
    document.querySelectorAll('[data-liberar]').forEach(b => b.onclick = () => {
      if (!confirm('¿Liberar la prenda? Pasará a la siguiente en lista de espera, o volverá a estar disponible.')) return;
      conCarga(b, async () => {
        const { data, error } = await sb.rpc('liberar_prenda', { p_pedido: b.dataset.liberar });
        if (error) throw error;
        toast(data.siguiente ? 'Prenda asignada a la siguiente en espera' : 'Prenda disponible otra vez'); vista();
      });
    });
    document.querySelectorAll('[data-etiqueta]').forEach(b => b.onclick = () => conCarga(b, async () => {
      const p = por(b.dataset.etiqueta), d = await datos(p.id);
      const txt = `ENVÍO — ${state.tienda.nombre}\nPara: ${d.nombre || ''} (@${p.perfiles?.username || ''})\nTeléfono: ${d.whatsapp || '-'}\nCiudad: ${d.ciudad || '-'}\nDirección: ${d.direccion || '-'}\nContenido: #${p.prendas.numero} ${p.prendas.nombre}`;
      await navigator.clipboard.writeText(txt); toast('Etiqueta copiada');
    }));
    document.querySelectorAll('[data-resp]').forEach(b => b.onclick = () => {
      const t = prompt('Tu respuesta a la reseña:'); if (!t?.trim()) return;
      conCarga(b, async () => {
        const { error } = await sb.rpc('responder_resena', { p_resena: b.dataset.resp, p_texto: t.trim() });
        if (error) throw error; vista();
      });
    });
  }
  pintar();
}
