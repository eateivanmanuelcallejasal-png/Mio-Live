-- ============================================================
-- MIO LIVE — schema.sql  (pegar completo en Supabase > SQL Editor)
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- TABLAS ----------
create table if not exists perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  rol text not null default 'compradora' check (rol in ('vendedora','compradora')),
  username text unique,
  nombre text,
  avatar_url text,
  ciudad text,
  direccion text,
  whatsapp text,
  tiktok_url text,
  puntos int not null default 0 check (puntos >= 0),
  creado_en timestamptz not null default now()
);

create table if not exists tiendas (
  id uuid primary key default gen_random_uuid(),
  vendedora_id uuid not null unique references perfiles(id) on delete cascade,
  nombre text not null,
  descripcion text,
  logo_url text,
  categorias text[] default '{}',
  live_url text,
  venta_activa boolean not null default false,
  promedio_resenas numeric(3,2) not null default 0,
  total_ventas int not null default 0
);

create table if not exists prendas (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references tiendas(id) on delete cascade,
  numero int,
  nombre text not null,
  descripcion text,
  seccion text not null check (seccion in ('mujer','hombre','ninos')),
  categoria text,
  talla text,
  color text,
  estado text not null default 'nueva' check (estado in ('nueva','usada_como_nueva')),
  precio numeric(10,2) not null check (precio >= 0),
  calificacion_calidad smallint check (calificacion_calidad between 1 and 5),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 5),
  estado_venta text not null default 'disponible' check (estado_venta in ('disponible','reservada','vendida','oculta')),
  creado_en timestamptz not null default now()
);
create index if not exists prendas_tienda_idx on prendas(tienda_id);
create index if not exists prendas_seccion_idx on prendas(seccion, estado_venta);

create table if not exists ventas_en_vivo (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references tiendas(id) on delete cascade,
  live_url text,
  estado text not null default 'activa' check (estado in ('activa','finalizada')),
  prenda_actual_id uuid references prendas(id) on delete set null,
  inicio timestamptz not null default now(),
  fin timestamptz
);
create unique index if not exists una_venta_activa_por_tienda on ventas_en_vivo(tienda_id) where estado = 'activa';

create table if not exists reclamos (
  id uuid primary key default gen_random_uuid(),
  venta_id uuid not null references ventas_en_vivo(id) on delete cascade,
  prenda_id uuid not null references prendas(id) on delete cascade,
  compradora_id uuid not null references perfiles(id) on delete cascade,
  creado_en timestamptz not null default now(),
  estado text not null default 'espera' check (estado in ('ganador','espera','anulado')),
  unique (prenda_id, compradora_id)
);
-- solo un ganador por prenda (garantiza que dos teléfonos no ganen a la vez)
create unique index if not exists un_ganador_por_prenda on reclamos(prenda_id) where estado = 'ganador';

create table if not exists pedidos (
  id uuid primary key default gen_random_uuid(),
  compradora_id uuid not null references perfiles(id) on delete cascade,
  tienda_id uuid not null references tiendas(id) on delete cascade,
  prenda_id uuid not null references prendas(id) on delete cascade,
  precio_final numeric(10,2) not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','pagado','enviado','vencido','cancelado')),
  vence_en timestamptz not null default (now() + interval '24 hours'),
  creado_en timestamptz not null default now(),
  puntos_acreditados boolean not null default false
);

create table if not exists resenas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references pedidos(id) on delete cascade,
  prenda_id uuid not null references prendas(id) on delete cascade,
  compradora_id uuid not null references perfiles(id) on delete cascade,
  estrellas numeric(2,1) not null check (estrellas between 0.5 and 5 and (estrellas*2) = floor(estrellas*2)),
  texto text,
  foto_url text,
  respuesta_vendedora text,
  creado_en timestamptz not null default now()
);

create table if not exists puntos_movimientos (
  id uuid primary key default gen_random_uuid(),
  compradora_id uuid not null references perfiles(id) on delete cascade,
  tipo text not null check (tipo in ('ganado','canjeado','ajuste')),
  puntos int not null,
  motivo text,
  pedido_id uuid references pedidos(id) on delete set null,
  creado_en timestamptz not null default now()
);
-- evita duplicar puntos por el mismo pedido
create unique index if not exists puntos_un_ganado_por_pedido on puntos_movimientos(pedido_id) where tipo = 'ganado';

create table if not exists recompensas (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid references tiendas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  puntos_requeridos int not null check (puntos_requeridos > 0),
  tipo text not null check (tipo in ('descuento','prenda')),
  valor numeric(10,2) not null default 0,
  activa boolean not null default true
);

create table if not exists ofertas (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references tiendas(id) on delete cascade,
  prenda_id uuid references prendas(id) on delete cascade,
  titulo text not null,
  descuento_porcentaje int check (descuento_porcentaje between 1 and 95),
  precio_oferta numeric(10,2),
  desde timestamptz not null default now(),
  hasta timestamptz not null,
  activa boolean not null default true
);

create table if not exists seguidores (
  compradora_id uuid not null references perfiles(id) on delete cascade,
  tienda_id uuid not null references tiendas(id) on delete cascade,
  primary key (compradora_id, tienda_id)
);

create table if not exists canjes (
  id uuid primary key default gen_random_uuid(),
  compradora_id uuid not null references perfiles(id) on delete cascade,
  recompensa_id uuid not null references recompensas(id) on delete cascade,
  puntos int not null,
  creado_en timestamptz not null default now()
);

-- ---------- PERFIL AUTOMÁTICO AL REGISTRARSE ----------
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into perfiles (id, rol, nombre, username, tiktok_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'rol',''), 'compradora'),
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email,'@',1)),
    nullif(lower(new.raw_user_meta_data->>'username'),''),
    nullif(new.raw_user_meta_data->>'tiktok_url','')
  )
  on conflict (id) do nothing;
  if coalesce(new.raw_user_meta_data->>'rol','compradora') = 'vendedora' then
    insert into tiendas (vendedora_id, nombre)
    values (new.id, coalesce(new.raw_user_meta_data->>'nombre', 'Mi tienda'))
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- impide que una usuaria se cambie rol o puntos desde el cliente
create or replace function proteger_perfil() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and current_user <> 'postgres' then
    new.rol := old.rol;
    new.puntos := old.puntos;
  end if;
  return new;
end $$;
drop trigger if exists proteger_perfil_trg on perfiles;
create trigger proteger_perfil_trg before update on perfiles
for each row execute function proteger_perfil();

-- numeración automática de prendas por tienda
create or replace function numerar_prenda() returns trigger
language plpgsql as $$
begin
  if new.numero is null then
    select coalesce(max(numero),0)+1 into new.numero from prendas where tienda_id = new.tienda_id;
  end if;
  return new;
end $$;
drop trigger if exists numerar_prenda_trg on prendas;
create trigger numerar_prenda_trg before insert on prendas
for each row execute function numerar_prenda();

-- ---------- FUNCIONES RPC ----------
-- Helper: ¿soy dueña de la tienda?
create or replace function es_duena_tienda(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tiendas where id = t and vendedora_id = auth.uid());
$$;

-- Precio vigente de una prenda considerando ofertas activas
create or replace function precio_vigente(p_prenda uuid) returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select min(case when o.precio_oferta is not null then o.precio_oferta
                     else round(p.precio * (1 - o.descuento_porcentaje/100.0), 2) end)
       from ofertas o where o.prenda_id = p.id and o.activa and now() between o.desde and o.hasta),
    p.precio)
  from prendas p where p.id = p_prenda;
$$;

-- Iniciar / finalizar venta en vivo
create or replace function iniciar_venta(p_live_url text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare t uuid; v uuid;
begin
  select id into t from tiendas where vendedora_id = auth.uid();
  if t is null then raise exception 'No tienes tienda'; end if;
  update ventas_en_vivo set estado='finalizada', fin=now() where tienda_id=t and estado='activa';
  insert into ventas_en_vivo (tienda_id, live_url) values (t, p_live_url) returning id into v;
  update tiendas set venta_activa = true, live_url = coalesce(p_live_url, live_url) where id = t;
  return v;
end $$;

create or replace function finalizar_venta() returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from tiendas where vendedora_id = auth.uid();
  update ventas_en_vivo set estado='finalizada', fin=now() where tienda_id=t and estado='activa';
  update tiendas set venta_activa = false where id = t;
end $$;

create or replace function poner_prenda_actual(p_prenda uuid) returns void
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from tiendas where vendedora_id = auth.uid();
  if not exists (select 1 from prendas where id = p_prenda and tienda_id = t) then
    raise exception 'Prenda no válida';
  end if;
  update ventas_en_vivo set prenda_actual_id = p_prenda where tienda_id = t and estado = 'activa';
end $$;

-- ¡MÍO! — atómico: solo una ganadora
create or replace function reclamar_mio(p_venta uuid, p_prenda uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v ventas_en_vivo; p prendas; est text; pos int;
begin
  if auth.uid() is null then raise exception 'Inicia sesión'; end if;
  select * into v from ventas_en_vivo where id = p_venta and estado = 'activa';
  if v.id is null then raise exception 'La venta ya no está activa'; end if;
  -- bloquea la fila de la prenda: serializa reclamos simultáneos
  select * into p from prendas where id = p_prenda and tienda_id = v.tienda_id for update;
  if p.id is null then raise exception 'Prenda no encontrada'; end if;
  if es_duena_tienda(v.tienda_id) then raise exception 'No puedes reclamar tu propia prenda'; end if;
  if p.estado_venta in ('vendida','oculta') then raise exception 'Prenda no disponible'; end if;
  if exists (select 1 from reclamos where prenda_id = p_prenda and compradora_id = auth.uid() and estado <> 'anulado') then
    raise exception 'Ya reclamaste esta prenda';
  end if;

  if p.estado_venta = 'disponible' then
    est := 'ganador';
    update prendas set estado_venta = 'reservada' where id = p_prenda;
    insert into reclamos (venta_id, prenda_id, compradora_id, estado) values (p_venta, p_prenda, auth.uid(), 'ganador');
    insert into pedidos (compradora_id, tienda_id, prenda_id, precio_final)
      values (auth.uid(), v.tienda_id, p_prenda, precio_vigente(p_prenda));
  else
    est := 'espera';
    insert into reclamos (venta_id, prenda_id, compradora_id, estado) values (p_venta, p_prenda, auth.uid(), 'espera');
  end if;
  select count(*) into pos from reclamos where prenda_id = p_prenda and estado = 'espera' and creado_en <= (select creado_en from reclamos where prenda_id=p_prenda and compradora_id=auth.uid());
  return jsonb_build_object('estado', est, 'posicion', case when est='espera' then pos else 0 end);
end $$;

-- Acreditar puntos (1 punto por cada 10 Bs). No duplica.
create or replace function acreditar_puntos(p_pedido uuid) returns int
language plpgsql security definer set search_path = public as $$
declare ped pedidos; pts int;
begin
  select * into ped from pedidos where id = p_pedido for update;
  if ped.id is null then raise exception 'Pedido no existe'; end if;
  if not es_duena_tienda(ped.tienda_id) then raise exception 'Sin permiso'; end if;
  if ped.puntos_acreditados then return 0; end if;
  if ped.estado <> 'pendiente' then raise exception 'Solo se puede marcar pagado un pedido pendiente'; end if;
  pts := floor(ped.precio_final / 10)::int;
  update pedidos set estado = 'pagado', puntos_acreditados = true where id = p_pedido;
  update prendas set estado_venta = 'vendida' where id = ped.prenda_id;
  update tiendas set total_ventas = total_ventas + 1 where id = ped.tienda_id;
  if pts > 0 then
    insert into puntos_movimientos (compradora_id, tipo, puntos, motivo, pedido_id)
      values (ped.compradora_id, 'ganado', pts, 'Compra pagada', ped.id) on conflict do nothing;
    update perfiles set puntos = puntos + pts where id = ped.compradora_id;
  end if;
  return pts;
end $$;

create or replace function marcar_enviado(p_pedido uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update pedidos set estado = 'enviado'
  where id = p_pedido and estado = 'pagado' and es_duena_tienda(tienda_id);
  if not found then raise exception 'No se pudo actualizar'; end if;
end $$;

create or replace function canjear_recompensa(p_recompensa uuid) returns void
language plpgsql security definer set search_path = public as $$
declare r recompensas; pf perfiles;
begin
  select * into r from recompensas where id = p_recompensa and activa;
  if r.id is null then raise exception 'Recompensa no disponible'; end if;
  select * into pf from perfiles where id = auth.uid() for update;
  if pf.puntos < r.puntos_requeridos then raise exception 'Puntos insuficientes'; end if;
  update perfiles set puntos = puntos - r.puntos_requeridos where id = auth.uid();
  insert into puntos_movimientos (compradora_id, tipo, puntos, motivo)
    values (auth.uid(), 'canjeado', -r.puntos_requeridos, 'Canje: ' || r.nombre);
  insert into canjes (compradora_id, recompensa_id, puntos) values (auth.uid(), r.id, r.puntos_requeridos);
end $$;

-- Libera una prenda (pedido vencido/cancelado) y promueve a la siguiente en espera
create or replace function liberar_prenda(p_pedido uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ped pedidos; sig reclamos; p prendas;
begin
  select * into ped from pedidos where id = p_pedido for update;
  if ped.id is null or not es_duena_tienda(ped.tienda_id) then raise exception 'Sin permiso'; end if;
  if ped.estado not in ('pendiente','vencido','cancelado') then raise exception 'El pedido ya no se puede liberar'; end if;
  if not exists (select 1 from reclamos where prenda_id = ped.prenda_id and compradora_id = ped.compradora_id and estado = 'ganador') then
    raise exception 'Esta prenda ya fue liberada';
  end if;
  update pedidos set estado = case when estado = 'cancelado' then 'cancelado' else 'vencido' end where id = p_pedido;
  update reclamos set estado = 'anulado' where prenda_id = ped.prenda_id and compradora_id = ped.compradora_id and estado = 'ganador';
  select * into sig from reclamos where prenda_id = ped.prenda_id and estado = 'espera' order by creado_en asc limit 1 for update;
  if sig.id is not null then
    update reclamos set estado = 'ganador' where id = sig.id;
    select * into p from prendas where id = ped.prenda_id;
    insert into pedidos (compradora_id, tienda_id, prenda_id, precio_final) values (sig.compradora_id, ped.tienda_id, ped.prenda_id, precio_vigente(ped.prenda_id));
    return jsonb_build_object('siguiente', sig.compradora_id);
  end if;
  update prendas set estado_venta = 'disponible' where id = ped.prenda_id;
  return jsonb_build_object('siguiente', null);
end $$;

-- Marca como vencidos los pedidos pendientes pasadas 24 h (se llama al abrir Pedidos)
create or replace function vencer_pedidos() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update pedidos set estado = 'vencido'
  where estado = 'pendiente' and vence_en < now() and es_duena_tienda(tienda_id);
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function responder_resena(p_resena uuid, p_texto text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update resenas r set respuesta_vendedora = left(p_texto, 400)
  where r.id = p_resena and exists (select 1 from prendas p where p.id = r.prenda_id and es_duena_tienda(p.tienda_id));
  if not found then raise exception 'Sin permiso'; end if;
end $$;

-- Promedio de reseñas
create or replace function actualizar_promedio() returns trigger
language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select tienda_id into t from prendas where id = coalesce(new.prenda_id, old.prenda_id);
  update tiendas set promedio_resenas = coalesce((select round(avg(r.estrellas),2) from resenas r join prendas p on p.id = r.prenda_id where p.tienda_id = t),0) where id = t;
  return null;
end $$;
drop trigger if exists resenas_prom_trg on resenas;
create trigger resenas_prom_trg after insert or update or delete on resenas
for each row execute function actualizar_promedio();

-- ---------- RLS ----------
alter table perfiles enable row level security;
alter table tiendas enable row level security;
alter table prendas enable row level security;
alter table ventas_en_vivo enable row level security;
alter table reclamos enable row level security;
alter table pedidos enable row level security;
alter table resenas enable row level security;
alter table puntos_movimientos enable row level security;
alter table recompensas enable row level security;
alter table ofertas enable row level security;
alter table seguidores enable row level security;
alter table canjes enable row level security;

-- perfiles: la fila es legible, pero las columnas privadas (whatsapp, direccion, puntos) NO.
-- Los datos privados se obtienen solo por RPC: mi_perfil, contacto_tienda, datos_envio.
drop policy if exists perfiles_select on perfiles;
create policy perfiles_select on perfiles for select using (true);
drop policy if exists perfiles_update on perfiles;
create policy perfiles_update on perfiles for update using (id = auth.uid()) with check (id = auth.uid());

revoke select on perfiles from anon, authenticated;
grant select (id, rol, username, nombre, avatar_url, ciudad, tiktok_url, creado_en) on perfiles to anon, authenticated;

create or replace function mi_perfil() returns perfiles
language sql stable security definer set search_path = public as $$
  select * from perfiles where id = auth.uid();
$$;

-- WhatsApp público solo de vendedoras (contacto de su tienda)
create or replace function contacto_tienda(p_tienda uuid) returns text
language sql stable security definer set search_path = public as $$
  select p.whatsapp from tiendas t join perfiles p on p.id = t.vendedora_id where t.id = p_tienda;
$$;

-- Datos de envío de la compradora: solo para la vendedora dueña del pedido
create or replace function datos_envio(p_pedido uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare ped pedidos; c perfiles;
begin
  select * into ped from pedidos where id = p_pedido;
  if ped.id is null or not es_duena_tienda(ped.tienda_id) then raise exception 'Sin permiso'; end if;
  select * into c from perfiles where id = ped.compradora_id;
  return jsonb_build_object('nombre', c.nombre, 'whatsapp', c.whatsapp, 'direccion', c.direccion, 'ciudad', c.ciudad);
end $$;

-- tiendas
drop policy if exists tiendas_select on tiendas;
create policy tiendas_select on tiendas for select using (true);
drop policy if exists tiendas_update on tiendas;
create policy tiendas_update on tiendas for update using (vendedora_id = auth.uid()) with check (vendedora_id = auth.uid());

-- prendas: todas ven las no ocultas; la dueña ve y gestiona todas
drop policy if exists prendas_select on prendas;
create policy prendas_select on prendas for select using (estado_venta <> 'oculta' or es_duena_tienda(tienda_id));
drop policy if exists prendas_insert on prendas;
create policy prendas_insert on prendas for insert with check (es_duena_tienda(tienda_id));
drop policy if exists prendas_update on prendas;
create policy prendas_update on prendas for update using (es_duena_tienda(tienda_id)) with check (es_duena_tienda(tienda_id));
drop policy if exists prendas_delete on prendas;
create policy prendas_delete on prendas for delete using (es_duena_tienda(tienda_id));

-- ventas en vivo: públicas para leer; se escriben por RPC
drop policy if exists ventas_select on ventas_en_vivo;
create policy ventas_select on ventas_en_vivo for select using (true);

-- reclamos: los ve la compradora dueña y la vendedora de la tienda; se escriben por RPC
drop policy if exists reclamos_select on reclamos;
create policy reclamos_select on reclamos for select using (
  compradora_id = auth.uid()
  or exists (select 1 from prendas p where p.id = reclamos.prenda_id and es_duena_tienda(p.tienda_id))
);

-- pedidos: solo compradora y vendedora involucradas
drop policy if exists pedidos_select on pedidos;
create policy pedidos_select on pedidos for select using (compradora_id = auth.uid() or es_duena_tienda(tienda_id));
drop policy if exists pedidos_cancel on pedidos;
create policy pedidos_cancel on pedidos for update using (compradora_id = auth.uid() and estado = 'pendiente') with check (compradora_id = auth.uid() and estado = 'cancelado');

-- reseñas: públicas; solo prendas pagadas y por la compradora del pedido
drop policy if exists resenas_select on resenas;
create policy resenas_select on resenas for select using (true);
drop policy if exists resenas_insert on resenas;
create policy resenas_insert on resenas for insert with check (
  compradora_id = auth.uid()
  and exists (select 1 from pedidos p where p.id = pedido_id and p.compradora_id = auth.uid() and p.estado in ('pagado','enviado'))
);

-- puntos y canjes: solo los míos
drop policy if exists puntos_select on puntos_movimientos;
create policy puntos_select on puntos_movimientos for select using (compradora_id = auth.uid());
drop policy if exists canjes_select on canjes;
create policy canjes_select on canjes for select using (compradora_id = auth.uid());

-- recompensas
drop policy if exists recompensas_select on recompensas;
create policy recompensas_select on recompensas for select using (activa or es_duena_tienda(tienda_id));
drop policy if exists recompensas_insert on recompensas;
create policy recompensas_insert on recompensas for insert with check (tienda_id is not null and es_duena_tienda(tienda_id));
drop policy if exists recompensas_update on recompensas;
create policy recompensas_update on recompensas for update using (es_duena_tienda(tienda_id));
drop policy if exists recompensas_delete on recompensas;
create policy recompensas_delete on recompensas for delete using (es_duena_tienda(tienda_id));

-- ofertas
drop policy if exists ofertas_select on ofertas;
create policy ofertas_select on ofertas for select using (true);
drop policy if exists ofertas_insert on ofertas;
create policy ofertas_insert on ofertas for insert with check (es_duena_tienda(tienda_id));
drop policy if exists ofertas_update on ofertas;
create policy ofertas_update on ofertas for update using (es_duena_tienda(tienda_id));
drop policy if exists ofertas_delete on ofertas;
create policy ofertas_delete on ofertas for delete using (es_duena_tienda(tienda_id));

-- seguidores
drop policy if exists seg_select on seguidores;
create policy seg_select on seguidores for select using (compradora_id = auth.uid() or es_duena_tienda(tienda_id));
drop policy if exists seg_insert on seguidores;
create policy seg_insert on seguidores for insert with check (compradora_id = auth.uid());
drop policy if exists seg_delete on seguidores;
create policy seg_delete on seguidores for delete using (compradora_id = auth.uid());

-- ---------- REALTIME ----------
do $$ begin alter publication supabase_realtime add table reclamos; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table ventas_en_vivo; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table tiendas; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table prendas; exception when duplicate_object then null; end $$;

-- ---------- STORAGE ----------
insert into storage.buckets (id, name, public) values
  ('avatars','avatars',true), ('prendas','prendas',true), ('resenas','resenas',true)
on conflict (id) do nothing;

-- lectura pública; escritura solo en la carpeta propia (<uid>/archivo)
drop policy if exists "lectura publica buckets" on storage.objects;
create policy "lectura publica buckets" on storage.objects for select
  using (bucket_id in ('avatars','prendas','resenas'));
drop policy if exists "subir en carpeta propia" on storage.objects;
create policy "subir en carpeta propia" on storage.objects for insert to authenticated
  with check (bucket_id in ('avatars','prendas','resenas') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "actualizar carpeta propia" on storage.objects;
create policy "actualizar carpeta propia" on storage.objects for update to authenticated
  using (bucket_id in ('avatars','prendas','resenas') and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "borrar carpeta propia" on storage.objects;
create policy "borrar carpeta propia" on storage.objects for delete to authenticated
  using (bucket_id in ('avatars','prendas','resenas') and (storage.foldername(name))[1] = auth.uid()::text);
