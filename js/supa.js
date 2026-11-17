import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.MIO_CONFIG || {};
export const configurado = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY);

export const sb = createClient(cfg.SUPABASE_URL || 'https://placeholder.supabase.co', cfg.SUPABASE_ANON_KEY || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Estado global de la sesión
export const state = { user: null, perfil: null, tienda: null };

export async function cargarSesion() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user || null;
  state.perfil = null; state.tienda = null;
  if (state.user) {
    const { data: p } = await sb.rpc('mi_perfil');
    state.perfil = p && p.id ? p : null;
    if (p?.rol === 'vendedora') {
      const { data: t } = await sb.from('tiendas').select('*').eq('vendedora_id', state.user.id).maybeSingle();
      state.tienda = t;
    }
  }
}
export const esVendedora = () => state.perfil?.rol === 'vendedora';
