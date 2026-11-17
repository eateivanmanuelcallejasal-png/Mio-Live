import { sb, state } from './supa.js';
import { $, esc, bs, stars, conCarga, toast, subirImagen, fecha, urlSegura, avatarImg } from './util.js';
import { CATEGORIAS } from './catalogo.js';
import { recargarSesion } from './main.js';

const SECS = ['mujer', 'hombre', 'ninos'];
const NOMBRE_SEC = { mujer: 'Mujer', hombre: 'Hombre', ninos: 'Niños' };
let tabActual = 'live';

export async function vista() {
  const t = state.tienda;
  if (!t) { $('#app').innerHTML = '<div class="card">No se encontró tu tienda.</div>'; return; }
  $('#app').innerHTML = `
    <h1>Mi tienda</h1>
    <div class="tabs" id="tabs">
      ${[['live', '🔴 En vivo'], ['prendas', 'Prendas'], ['ofertas', 'Ofertas'], ['recomp', 'Recompensas'], ['tienda', 'Tienda']].map(([k, n]) => `<button class="tab ${k === tabActual ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}
    </div>
    <div id="panel" class="mt"></div>`;
  document.querySelectorAll('#tabs .tab').forEach(b => b.onclick = () => { tabActual = b.dataset.t; vista(); });
  await ({ live: pLive, prendas: pPrendas, ofertas: pOfertas, recomp: pRecomp, tienda: pTienda }[tabActual])($('#panel'));
}

/* ---------- EN VIVO ---------- */
async function pLive(el) {
  const { data: v } = await sb.from('ventas_en_vivo').select('*').eq('tienda_id', state.tienda.id).eq('estado', 'activa').maybeSingle();
  el.innerHTML = v ? `
    <div class="card" style="border:2px solid var(--red)"><h3><span class="dot"></span> Venta activa</h3>
      <p class="mut">Desde ${fecha(v.inicio)}. Tus compradoras ya pueden reclamar.</p>
      <a class="btn red block" href="#/sala/${state.tienda.id}">Abrir sala en vivo</a>
      <button class="btn dark block mt" id="fin">Finalizar venta</button></div>`
    : `<div class="card"><h3>Iniciar venta en vivo</h3>
      <label for="liveurl">Link de tu live (TikTok)</label><input id="liveurl" type="url" value="${esc(state.tienda.live_url || state.perfil.tiktok_url || '')}" placeholder="https://www.tiktok.com/@usuario/live">
      <button class="btn red block mt" id="ini">🔴 Iniciar venta activa</button>
      <p class="mut">Tu tienda aparecerá en “EN VIVO AHORA”.</p></div>`;
  const ini = $('#ini'), fin = $('#fin');
  if (ini) ini.onclick = () => conCarga(ini, async () => {
    const u = $('#liveurl').value.trim();
    if (u && !urlSegura(u)) throw new Error('El link del live no es válido.');
    const { error } = await sb.rpc('iniciar_venta', { p_live_url: u ? urlSegura(u) : null });
    if (error) throw error;
    await recargarSesion(); toast('¡Estás en vivo!'); vista();
  });
  if (fin) fin.onclick = () => conCarga(fin, async () => {
    const { error } = await sb.rpc('finalizar_venta'); if (error) throw error;
    await recargarSesion(); toast('Venta finalizada'); vista();
  });
}

/* ---------- PRENDAS ---------- */
async function pPrendas(el) {
  const { data: ps } = await sb.from('prendas').select('*').eq('tienda_id', state.tienda.id).order('numero', { ascending: false });
  el.innerHTML = `
    <button class="btn block" id="nueva">+ Publicar prenda</button>
    <form id="form" class="card mt hide">
      <label for="nombre">Nombre</label><input id="nombre" required maxlength="80">
      <label for="desc">Descripción</label><textarea id="desc" maxlength="500"></textarea>
      <div class="row" style="gap:8px"><div class="grow"><label for="sec">Sección</label><select id="sec">${SECS.map(s => `<option value="${s}">${NOMBRE_SEC[s]}</option>`).join('')}</select></div>
      <div class="grow"><label for="cat">Categoría</label><select id="cat">${CATEGORIAS.map(c => `<option>${c}</option>`).join('')}</select></div></div>
      <div class="row" style="gap:8px"><div class="grow"><label for="talla">Talla</label><input id="talla"></div><div class="grow"><label for="color">Color</label><input id="color"></div></div>
      <div class="row" style="gap:8px"><div class="grow"><label for="estado">Estado</label><select id="estado"><option value="nueva">Nueva</option><option value="usada_como_nueva">Usada como nueva</option></select></div>
      <div class="grow"><label for="precio">Precio (Bs)</label><input id="precio" type="number" min="0" step="0.5" required></div></div>
      <label for="cal">Calidad (la pones tú)</label><select id="cal">${[5, 4, 3, 2, 1].map(n => `<option value="${n}">${'★'.repeat(n)} (${n})</option>`).join('')}</select>
      <label for="fotos">Fotos (hasta 5)</label><input id="fotos" type="file" accept="image/*" multiple>
      <div class="thumbs mt" id="prev"></div>
      <button class="btn block mt" id="pub">Publicar</button></form>
    <h2>Mis prendas (${ps?.length || 0})</h2>
    ${ps?.length ? ps.map(p => `<div class="card row">
      ${p.fotos?.[0] ? `<img class="avatar" style="border-radius:14px;width:72px;height:72px" src="${esc(p.fotos[0])}" alt="">` : ''}
      <div class="grow"><span class="status">#${p.numero}</span> <span class="status">${p.estado_venta}</span><h3>${esc(p.nombre)}</h3><span class="price">${bs(p.precio)}</span> ${p.calificacion_calidad ? stars(p.calificacion_calidad) : ''}</div>
      <div><button class="btn sm dark" data-ocultar="${p.id}" data-v="${p.estado_venta}">${p.estado_venta === 'oculta' ? 'Mostrar' : 'Ocultar'}</button>
      <button class="btn sm ghost mt" data-borrar="${p.id}">Borrar</button></div></div>`).join('') : '<p class="mut">Aún no publicaste prendas.</p>'}`;

  $('#nueva').onclick = () => $('#form').classList.toggle('hide');
  $('#fotos').onchange = e => {
    const fs = [...e.target.files];
    if (fs.length > 5) { toast('Máximo 5 fotos. Se usarán las primeras 5.', 'err'); }
    $('#prev').innerHTML = fs.slice(0, 5).map(f => `<img src="${URL.createObjectURL(f)}" alt="">`).join('');
  };
  $('#form').onsubmit = ev => {
    ev.preventDefault();
    conCarga($('#pub'), async () => {
      const files = [...$('#fotos').files].slice(0, 5);
      if (!files.length) throw new Error('Sube al menos una foto.');
      const fotos = [];
      for (const f of files) fotos.push(await subirImagen('prendas', f, state.user.id));
      const { error } = await sb.from('prendas').insert({
        tienda_id: state.tienda.id, nombre: $('#nombre').value.trim(), descripcion: $('#desc').value.trim(),
        seccion: $('#sec').value, categoria: $('#cat').value, talla: $('#talla').value.trim(), color: $('#color').value.trim(),
        estado: $('#estado').value, precio: Number($('#precio').value), calificacion_calidad: Number($('#cal').value), fotos,
      });
      if (error) throw error;
      toast('Prenda publicada'); vista();
    });
  };
  el.querySelectorAll('[data-ocultar]').forEach(b => b.onclick = () => conCarga(b, async () => {
    if (!['disponible', 'oculta'].includes(b.dataset.v)) throw new Error('Solo puedes ocultar prendas disponibles.');
    const { error } = await sb.from('prendas').update({ estado_venta: b.dataset.v === 'oculta' ? 'disponible' : 'oculta' }).eq('id', b.dataset.ocultar);
    if (error) throw error; vista();
  }));
  el.querySelectorAll('[data-borrar]').forEach(b => b.onclick = () => {
    if (!confirm('¿Borrar esta prenda?')) return;
    conCarga(b, async () => {
      const { error } = await sb.from('prendas').delete().eq('id', b.dataset.borrar);
      if (error) throw new Error('No se puede borrar: tiene pedidos o reclamos. Mejor ocúltala.');
      vista();
    });
  });
}

/* ---------- OFERTAS ---------- */
async function pOfertas(el) {
  const [{ data: ps }, { data: of }] = await Promise.all([
    sb.from('prendas').select('id,nombre,precio').eq('tienda_id', state.tienda.id).eq('estado_venta', 'disponible'),
    sb.from('ofertas').select('*, prendas(nombre)').eq('tienda_id', state.tienda.id).order('hasta', { ascending: false }),
  ]);
  const ahora = Date.now();
  el.innerHTML = `
    <form id="f" class="card">
      <h3>Nueva oferta</h3>
      <label for="titulo">Título</label><input id="titulo" placeholder="Ej: ¡Feria de jeans!" required>
      <label for="prenda">Prenda</label><select id="prenda" required>${(ps || []).map(p => `<option value="${p.id}">${esc(p.nombre)} — ${bs(p.precio)}</option>`).join('')}</select>
      <div class="row" style="gap:8px"><div class="grow"><label for="pct">Descuento %</label><input id="pct" type="number" min="1" max="95" required></div>
      <div class="grow"><label for="hasta">Vence</label><input id="hasta" type="datetime-local" required></div></div>
      <button class="btn block mt" id="go">Publicar oferta</button></form>
    <h2>Mis ofertas</h2>
    ${of?.length ? of.map(o => {
      const vig = o.activa && new Date(o.hasta) > ahora;
      return `<div class="card row between"><div><h3>${esc(o.titulo)}</h3><span class="mut">${esc(o.prendas?.nombre || '')} · -${o.descuento_porcentaje}% · hasta ${fecha(o.hasta)}</span></div>
      <div><span class="status ${vig ? 'pagado' : 'vencido'}">${vig ? 'Vigente' : 'Vencida'}</span>${vig ? `<br><button class="btn sm ghost mt" data-off="${o.id}">Quitar</button>` : ''}</div></div>`;
    }).join('') : '<p class="mut">Sin ofertas.</p>'}`;
  $('#f').onsubmit = ev => {
    ev.preventDefault();
    conCarga($('#go'), async () => {
      const hasta = new Date($('#hasta').value);
      if (isNaN(hasta) || hasta <= new Date()) throw new Error('La fecha de vencimiento debe ser futura.');
      if (!$('#prenda').value) throw new Error('Primero publica una prenda disponible.');
      const { error } = await sb.from('ofertas').insert({
        tienda_id: state.tienda.id, prenda_id: $('#prenda').value, titulo: $('#titulo').value.trim(),
        descuento_porcentaje: Number($('#pct').value), hasta: hasta.toISOString(),
      });
      if (error) throw error; toast('Oferta publicada'); vista();
    });
  };
  el.querySelectorAll('[data-off]').forEach(b => b.onclick = () => conCarga(b, async () => {
    const { error } = await sb.from('ofertas').update({ activa: false }).eq('id', b.dataset.off); if (error) throw error; vista();
  }));
}

/* ---------- RECOMPENSAS ---------- */
async function pRecomp(el) {
  const { data: rs } = await sb.from('recompensas').select('*').eq('tienda_id', state.tienda.id).order('puntos_requeridos');
  el.innerHTML = `
    <form id="f" class="card"><h3>Nueva recompensa</h3>
      <p class="mut">Las compradoras ganan 1 punto por cada Bs 10 pagados.</p>
      <label for="nombre">Nombre</label><input id="nombre" placeholder="Ej: 10% de descuento" required>
      <div class="row" style="gap:8px"><div class="grow"><label for="tipo">Tipo</label><select id="tipo"><option value="descuento">Descuento (Bs)</option><option value="prenda">Prenda de regalo</option></select></div>
      <div class="grow"><label for="pts">Puntos</label><input id="pts" type="number" min="1" required></div></div>
      <label for="valor">Valor (Bs de descuento o de la prenda)</label><input id="valor" type="number" min="0" step="0.5" value="0">
      <label for="d">Descripción</label><input id="d">
      <button class="btn block mt" id="go">Crear</button></form>
    <h2>Mis recompensas</h2>
    ${rs?.length ? rs.map(r => `<div class="card row between"><div><h3>${esc(r.nombre)}</h3><span class="mut">${r.puntos_requeridos} pts · ${r.tipo}</span></div>
      <button class="btn sm ghost" data-del="${r.id}">Quitar</button></div>`).join('') : '<p class="mut">Sin recompensas.</p>'}`;
  $('#f').onsubmit = ev => {
    ev.preventDefault();
    conCarga($('#go'), async () => {
      const { error } = await sb.from('recompensas').insert({ tienda_id: state.tienda.id, nombre: $('#nombre').value.trim(), tipo: $('#tipo').value,
        puntos_requeridos: Number($('#pts').value), valor: Number($('#valor').value || 0), descripcion: $('#d').value.trim() });
      if (error) throw error; vista();
    });
  };
  el.querySelectorAll('[data-del]').forEach(b => b.onclick = () => conCarga(b, async () => {
    const { error } = await sb.from('recompensas').delete().eq('id', b.dataset.del);
    if (error) throw new Error('No se puede borrar una recompensa ya canjeada.'); vista();
  }));
}

/* ---------- DATOS DE LA TIENDA ---------- */
function pTienda(el) {
  const t = state.tienda;
  el.innerHTML = `<form id="f" class="card">
    <div class="center">${avatarImg(t.logo_url, 'lg')}<p class="mut">Cambia el logo en <a href="#/perfil">Mi perfil</a></p></div>
    <label for="nombre">Nombre de la tienda</label><input id="nombre" value="${esc(t.nombre)}" required>
    <label for="desc">Descripción</label><textarea id="desc">${esc(t.descripcion || '')}</textarea>
    <label for="cats">Categorías (separadas por coma)</label><input id="cats" value="${esc((t.categorias || []).join(', '))}">
    <label for="live">Link del live</label><input id="live" type="url" value="${esc(t.live_url || '')}">
    <button class="btn block mt" id="go">Guardar</button></form>`;
  $('#f').onsubmit = ev => {
    ev.preventDefault();
    conCarga($('#go'), async () => {
      const live = $('#live').value.trim();
      if (live && !urlSegura(live)) throw new Error('El link del live no es válido.');
      const { error } = await sb.from('tiendas').update({ nombre: $('#nombre').value.trim(), descripcion: $('#desc').value.trim(),
        categorias: $('#cats').value.split(',').map(s => s.trim()).filter(Boolean), live_url: live ? urlSegura(live) : null }).eq('id', t.id);
      if (error) throw error; await recargarSesion(); toast('Tienda guardada');
    });
  };
}
