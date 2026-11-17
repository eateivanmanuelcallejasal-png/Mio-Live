# MIO LIVE

App web móvil (PWA) para vender ropa en vivo por TikTok en Bolivia. Frontend en HTML + JS (módulos ES, sin build) y backend en Supabase (Auth, Postgres, Storage, Realtime, RPC).

## Estructura

```
index.html  styles.css  manifest.json  sw.js  config.js  build.js  netlify.toml
icons/icon.svg
js/  main.js (rutas)  supa.js  util.js  auth.js  home.js  catalogo.js
     sala.js (¡MÍO! en tiempo real)  perfil.js  vender.js  pedidos.js  puntos.js
schema.sql   ← pegar en Supabase
```

## Pasos

### 1. Crear el proyecto en Supabase
1. Entra a [supabase.com](https://supabase.com) → **New project**.
2. En **Project Settings → API** copia la **Project URL** y la clave **anon public**. (Nunca uses la `service_role` en la app.)

### 2. Cargar la base de datos
1. **SQL Editor → New query**, pega todo `schema.sql` y pulsa **Run**.
2. Crea tablas, triggers, funciones RPC (`reclamar_mio`, `acreditar_puntos`, `canjear_recompensa`, `liberar_prenda`, …), políticas RLS, Realtime y los buckets `avatars`, `prendas`, `resenas`.
3. Verifica en **Storage** que existen los 3 buckets y en **Database → Replication** que `reclamos`, `prendas`, `ventas_en_vivo` y `tiendas` están en `supabase_realtime`.

### 3. Correo de confirmación
**Authentication → Providers → Email**: deja activo *Confirm email*.
**Authentication → URL Configuration**: pon como *Site URL* la URL de tu sitio en Netlify (y agrégala en *Redirect URLs*). Para pruebas rápidas puedes desactivar la confirmación, pero reactívala en producción.
Google (opcional): **Providers → Google** con tus credenciales; el botón ya está en la app.

**Importante (error del correo / localhost:3000):** si el enlace del correo te lleva a `localhost:3000`, el *Site URL* sigue en localhost. Cámbialo por tu URL de Netlify. Si al registrarte da error de envío, Supabase limita los correos gratis: desactiva *Confirm email* para probar o configura un SMTP propio (p. ej. Resend).

### 4. Variables de entorno en Netlify
En **Site configuration → Environment variables** crea:

| Variable | Valor |
|---|---|
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | clave anon public |

`netlify.toml` ejecuta `node build.js` en cada deploy, que genera `config.js` con esas variables. Las claves no están escritas en el código.

### 5. Desplegar
Sube la carpeta a Git y conéctala al sitio de Netlify existente (build command `node build.js`, publish directory `.`), o arrastra la carpeta si ya generaste `config.js` a mano. Luego **Deploy site**.

Desarrollo local: pon tu URL y anon key en `config.js` (no lo subas con claves) y sirve la carpeta con `npx serve .`.

### 6. Probar
1. Regístrate como **vendedora** → Perfil: sube logo, @usuario, WhatsApp, TikTok.
2. **Vender → Prendas**: publica una prenda (hasta 5 fotos, calidad 1–5).
3. **Vender → En vivo**: inicia la venta. Aparece en “EN VIVO AHORA”.
4. Con otras dos cuentas compradoras, abre la sala y pulsa **¡MÍO!** a la vez: gana una y la otra queda en lista de espera (el bloqueo `FOR UPDATE` + índice único garantizan una sola ganadora).
5. **Pedidos** (vendedora): *Cobrar por WhatsApp* → *Marcar pagado* (acredita 1 punto por cada Bs 10, sin duplicar) → *Marcar enviado*.

## Seguridad
- RLS activo en todas las tablas. Los datos privados (`whatsapp`, `direccion`, `puntos`) no son legibles por otras usuarias: se obtienen solo por RPC (`mi_perfil`, `datos_envio` para la vendedora del pedido, `contacto_tienda` solo para vendedoras).
- Rol y puntos no se pueden cambiar desde el cliente (trigger + RPC).
- Fotos: lectura pública; solo se puede escribir en la carpeta propia `<bucket>/<tu-uid>/`.

## Notas
- Pago manual: la vendedora cobra por WhatsApp y marca el pedido como pagado.
- Los pedidos pendientes pasan a *vencido* tras 24 h (se actualiza cuando la vendedora abre Pedidos) y se pueden **liberar**: la prenda pasa a la siguiente en espera o vuelve a estar disponible.
- Las ofertas de una prenda se aplican al precio del pedido si están vigentes cuando se reclama.
- Las recompensas se canjean por puntos; la entrega del descuento o regalo la coordina la vendedora.
- Íconos de la PWA: se incluye un SVG; para iOS puedes añadir PNG 192/512.

## Para una versión futura
- Pasarela de pago (QR bancario / tarjeta) con conciliación automática.
- Notificaciones push (¡ganaste!, pedido por vencer, tienda en vivo).
- Panel de administración (moderación, reportes, soporte).
- Editar prendas existentes (hoy se publican, ocultan o borran), tarea programada que venza pedidos sin abrir la app, cupones aplicados al checkout.
