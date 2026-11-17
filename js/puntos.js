import { sb, state } from './supa.js';
import { $, esc, conCarga, toast, fecha } from './util.js';
import { recargarSesion } from './main.js';

export async function vista() {
  await recargarSesion();
  const [{ data: rs }, { data: mv }] = await Promise.all([
    sb.from('recompensas').select('*, tiendas(nombre)').eq('activa', true).order('puntos_requeridos'),
    sb.from('puntos_movimientos').select('*').eq('compradora_id', state.user.id).order('creado_en', { ascending: false }).limit(30),
  ]);
  const pts = state.perfil?.puntos ?? 0;
  $('#app').innerHTML = `
    <h1>Mis puntos</h1>
    <div class="card center"><div style="font-size:54px;font-weight:800;color:var(--y)">${pts}</div><p class="mut">Ganas 1 punto por cada Bs 10 pagados</p></div>
    <h2>Canjear</h2>
    ${rs?.length ? rs.map(r => `<div class="card row between"><div><h3>${esc(r.nombre)}</h3>
      <span class="mut">${esc(r.tiendas?.nombre || 'MIO LIVE')} · ${r.tipo === 'descuento' ? 'Descuento' : 'Prenda de regalo'}</span><br><b style="color:var(--y)">${r.puntos_requeridos} pts</b></div>
      <button class="btn sm" data-r="${r.id}" ${pts < r.puntos_requeridos ? 'disabled' : ''}>Canjear</button></div>`).join('') : '<p class="mut">Aún no hay recompensas disponibles.</p>'}
    <h2>Historial</h2>
    ${mv?.length ? mv.map(m => `<div class="claim"><div class="grow">${esc(m.motivo || m.tipo)}<br><span class="mut">${fecha(m.creado_en)}</span></div>
      <b style="color:${m.puntos >= 0 ? 'var(--ok)' : '#ff8a8f'}">${m.puntos > 0 ? '+' : ''}${m.puntos}</b></div>`).join('') : '<p class="mut">Sin movimientos.</p>'}`;
  document.querySelectorAll('[data-r]').forEach(b => b.onclick = () => conCarga(b, async () => {
    const { error } = await sb.rpc('canjear_recompensa', { p_recompensa: b.dataset.r });
    if (error) throw error;
    toast('¡Canje exitoso! Avisa a la vendedora en tu próximo pedido.'); vista();
  }));
}
