import { sb } from './supa.js';
import { $, esc, conCarga, toast, logo, mascota, errMsg, urlSegura } from './util.js';

const app = $('#app');

export function bienvenida() {
  app.innerHTML = `
  <div class="welcome center">
    <span class="deco" style="width:190px;height:190px;background:var(--y);top:-65px;left:-55px"></span>
    <span class="deco" style="width:170px;height:170px;background:#fff;top:-45px;right:-65px"></span>
    <span class="deco" style="width:42px;height:42px;background:#fff;top:150px;left:-4px"></span>
    <span class="deco" style="width:42px;height:42px;background:var(--y);top:100px;right:72px"></span>
    <div class="wz">
      ${logo()}
      <h1 class="big">¡Vende en vivo,<br>gana con <span class="y">¡Mío!</span></h1>
      <p class="tag">Conecta, vende y haz crecer tu negocio.</p>
      <a class="btn block mt" href="#/registro">Soy Clienta</a>
      <a class="btn ghost block mt" href="#/registro" onclick="sessionStorage.setItem('rol','vendedora')">Soy Vendedora</a>
      <a class="mut" style="display:inline-block;margin-top:14px;min-height:44px;line-height:44px" href="#/login">Ya tengo cuenta</a>
      <div style="margin-top:6px">${mascota()}</div>
    </div>
  </div>`;
}

export function formulario(_, modo) {
  const reg = modo === 'registro';
  app.innerHTML = `
  <div style="padding-top:8px">
    ${mascota()}
    <h1 class="center">${reg ? 'Crear Cuenta' : 'Iniciar sesión'}</h1>
    <form id="f" novalidate>
      ${reg ? `
      <div class="row" style="gap:8px">
        <button type="button" class="tab on grow" data-rol="compradora">Quiero comprar</button>
        <button type="button" class="tab grow" data-rol="vendedora">Quiero vender</button>
      </div>
      <label for="nombre">Nombre</label><input id="nombre" autocomplete="name" placeholder="Tu nombre" required>
      <label for="username">Usuario (@)</label><input id="username" autocapitalize="none" autocomplete="username" placeholder="mi_usuario" pattern="[a-z0-9_.]{3,20}" required>` : ''}
      <label for="email">Correo</label><input id="email" type="email" autocomplete="email" placeholder="tu@correo.com" required>
      <label for="pass">Contraseña</label><input id="pass" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="Mínimo 6 caracteres" required>
      ${reg ? `<div id="tkbox" class="hide"><label for="tiktok">Enlace de tu perfil de TikTok</label><input id="tiktok" type="url" placeholder="https://www.tiktok.com/@tu_usuario"></div>` : ''}
      <div class="err" id="err" role="alert"></div>
      <button class="btn block" id="go">${reg ? 'Registrarse' : 'Entrar'}</button>
    </form>
    <div class="center mut" style="margin:14px 0">o</div>
    <button class="btn ghost block" id="google">Continuar con Google</button>
    ${reg ? `<button class="btn ghost block mt" id="tk">Continuar con TikTok (vincular perfil)</button>` : ''}
    <p class="center mt">${reg ? '¿Ya tienes una cuenta? <a href="#/login">Inicia sesión</a>' : '¿No tienes cuenta? <a href="#/registro">Regístrate</a>'}</p>
  </div>`;

  let rol = 'compradora';
  if (reg && sessionStorage.getItem('rol') === 'vendedora') { sessionStorage.removeItem('rol'); rol = 'vendedora'; app.querySelectorAll('[data-rol]').forEach(x => x.classList.toggle('on', x.dataset.rol === rol)); }
  app.querySelectorAll('[data-rol]').forEach(b => b.onclick = () => {
    rol = b.dataset.rol;
    app.querySelectorAll('[data-rol]').forEach(x => x.classList.toggle('on', x === b));
  });
  if (reg) $('#tk').onclick = () => { $('#tkbox').classList.remove('hide'); $('#tiktok').focus(); };

  $('#google').onclick = e => conCarga(e.target, async () => {
    const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
    if (error) throw new Error('Google aún no está activado en este proyecto. Usa correo y contraseña.');
  });

  $('#f').onsubmit = ev => {
    ev.preventDefault();
    const err = $('#err'); err.textContent = '';
    const email = $('#email').value.trim(), password = $('#pass').value;
    if (!email || !password) { err.textContent = 'Completa correo y contraseña.'; return; }
    conCarga($('#go'), async () => {
      if (!reg) {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return;
      }
      const nombre = $('#nombre').value.trim();
      const username = $('#username').value.trim().toLowerCase().replace(/^@/, '');
      if (nombre.length < 2) { err.textContent = 'Escribe tu nombre.'; return; }
      if (!/^[a-z0-9_.]{3,20}$/.test(username)) { err.textContent = 'Usuario: 3 a 20 caracteres (letras minúsculas, números, _ o .).'; return; }
      if (password.length < 6) { err.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }
      const { data: ocupado } = await sb.from('perfiles').select('id').eq('username', username).maybeSingle();
      if (ocupado) { err.textContent = 'Ese usuario ya está en uso. Elige otro.'; return; }
      const tiktok_url = urlSegura($('#tiktok')?.value.trim());
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { emailRedirectTo: location.origin, data: { rol, nombre, username, tiktok_url } },
      });
      if (error) throw error;
      if (!data.session) {
        app.innerHTML = `<div class="center" style="padding-top:40px">${mascota()}<h1>¡Revisa tu correo!</h1>
          <p class="mut">Te enviamos un enlace de confirmación a <b>${esc(email)}</b>. Ábrelo y luego inicia sesión. Revisa también spam.</p>
          <a class="btn mt" href="#/login">Ir a iniciar sesión</a></div>`;
      } else toast('¡Cuenta creada!');
    });
  };
}
