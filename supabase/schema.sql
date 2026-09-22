-- مشاوير: قاعدة البيانات الأساسية لمصر
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone text unique not null,
  full_name text not null default 'عميل مشاوير',
  role text not null default 'customer' check (role in ('customer', 'courier', 'admin')),
  approved boolean not null default true,
  pin_hash text,
  pin_salt text,
  pin_attempts integer not null default 0,
  pin_locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.merchants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('مطاعم', 'بقالة', 'صيدلية', 'طرود')),
  description text,
  phone text,
  address_text text,
  latitude double precision,
  longitude double precision,
  delivery_mode text not null default 'fixed' check (delivery_mode in ('fixed', 'percentage', 'zone')),
  delivery_value numeric(10,2) not null default 18,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null references public.merchants(id) on delete cascade,
  name text not null,
  description text,
  category text,
  price numeric(10,2) not null check (price >= 0),
  image_url text,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  courier_id uuid references public.profiles(id) on delete set null,
  merchant_id uuid not null references public.merchants(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'searching_driver', 'assigned', 'driver_accepted', 'heading_to_pickup', 'arrived_pickup', 'picked_up', 'delivering', 'arrived_destination', 'delivered', 'cancelled', 'rejected', 'failed')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text not null default 'paid_to_store' check (payment_method in ('paid_to_store', 'vodafone_cash', 'instapay', 'cash')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'pending', 'confirmed', 'rejected')),
  payment_reference text,
  address_text text not null,
  contact_phone text not null,
  pickup_address_text text,
  pickup_latitude double precision,
  pickup_longitude double precision,
  latitude double precision,
  longitude double precision,
  notes text,
  assigned_at timestamptz,
  accepted_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orders add column if not exists pickup_address_text text;
alter table public.orders add column if not exists pickup_latitude double precision;
alter table public.orders add column if not exists pickup_longitude double precision;
alter table public.orders add column if not exists assigned_at timestamptz;
alter table public.orders add column if not exists accepted_at timestamptz;
alter table public.orders add column if not exists delivered_at timestamptz;
alter table public.orders drop constraint if exists orders_status_check;
update public.orders set status = case status
  when 'جديد' then 'pending'
  when 'مقبول' then 'driver_accepted'
  when 'قيد التجهيز' then 'heading_to_pickup'
  when 'مع المندوب' then 'delivering'
  when 'تم التسليم' then 'delivered'
  when 'ملغي' then 'cancelled'
  else status
end
where status in ('جديد', 'مقبول', 'قيد التجهيز', 'مع المندوب', 'تم التسليم', 'ملغي');
alter table public.orders add constraint orders_status_check check (status in ('pending', 'confirmed', 'searching_driver', 'assigned', 'driver_accepted', 'heading_to_pickup', 'arrived_pickup', 'picked_up', 'delivering', 'arrived_destination', 'delivered', 'cancelled', 'rejected', 'failed'));
alter table public.orders alter column status set default 'pending';

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null check (status in ('pending', 'confirmed', 'searching_driver', 'assigned', 'driver_accepted', 'heading_to_pickup', 'arrived_pickup', 'picked_up', 'delivering', 'arrived_destination', 'delivered', 'cancelled', 'rejected', 'failed')),
  changed_by uuid references public.profiles(id) on delete set null,
  latitude double precision,
  longitude double precision,
  notes text,
  changed_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  kind text not null default 'order',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications add column if not exists order_id uuid references public.orders(id) on delete cascade;
alter table public.notifications add column if not exists type text not null default 'order';

create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  latitude double precision not null,
  longitude double precision not null,
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if coalesce(new.phone, new.raw_user_meta_data ->> 'phone') is null then
    return new;
  end if;
  insert into public.profiles (id, phone, full_name, role, approved)
  values (
    new.id,
    coalesce(new.phone, new.raw_user_meta_data ->> 'phone'),
    coalesce(new.raw_user_meta_data ->> 'full_name', 'عميل مشاوير'),
     case when new.raw_user_meta_data ->> 'role' = 'courier' then 'courier' else 'customer' end,
     case when new.raw_user_meta_data ->> 'role' = 'courier' then false else true end
   )
  on conflict (id) do update set phone = excluded.phone, full_name = excluded.full_name, role = excluded.role, approved = excluded.approved;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.order_status_can_follow(previous_status text, next_status text)
returns boolean
language sql
immutable
as $$
  select case previous_status
    when 'pending' then next_status in ('confirmed', 'searching_driver', 'cancelled')
    when 'confirmed' then next_status in ('searching_driver', 'assigned', 'cancelled')
    when 'searching_driver' then next_status in ('assigned', 'rejected', 'cancelled')
    when 'assigned' then next_status in ('driver_accepted', 'rejected', 'cancelled')
    when 'driver_accepted' then next_status in ('heading_to_pickup', 'cancelled')
    when 'heading_to_pickup' then next_status = 'arrived_pickup'
    when 'arrived_pickup' then next_status = 'picked_up'
    when 'picked_up' then next_status = 'delivering'
    when 'delivering' then next_status = 'arrived_destination'
    when 'arrived_destination' then next_status = 'delivered'
    else false
  end;
$$;

create or replace function public.order_status_message(next_status text)
returns text
language sql
immutable
as $$
  select case next_status
    when 'pending' then 'تم إنشاء الطلب.'
    when 'confirmed' then 'تم تأكيد الطلب.'
    when 'searching_driver' then 'جاري البحث عن مندوب.'
    when 'assigned' then 'تم تعيين مندوب لطلبك.'
    when 'driver_accepted' then 'المندوب قبل الطلب.'
    when 'heading_to_pickup' then 'المندوب في طريقه للاستلام.'
    when 'arrived_pickup' then 'وصل المندوب إلى موقع الاستلام.'
    when 'picked_up' then 'تم استلام الطلب.'
    when 'delivering' then 'المندوب في الطريق إليك.'
    when 'arrived_destination' then 'وصل المندوب إلى موقع التسليم.'
    when 'delivered' then 'تم تسليم الطلب بنجاح.'
    when 'cancelled' then 'تم إلغاء الطلب.'
    when 'rejected' then 'تم رفض إسناد الطلب.'
    when 'failed' then 'تعذر إكمال الطلب.'
    else 'تم تحديث الطلب.'
  end;
$$;

create or replace function public.seed_order_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  admin_id uuid;
begin
  insert into public.order_status_history (order_id, status, changed_by, notes)
  values (new.id, new.status, new.user_id, 'تم إنشاء الطلب');
  for admin_id in select id from public.profiles where role = 'admin' loop
    insert into public.notifications (user_id, order_id, type, title, body)
    values (admin_id, new.id, 'order_created', 'طلب جديد', 'تم إنشاء طلب جديد ويحتاج إلى متابعة.');
  end loop;
  return new;
end;
$$;

drop trigger if exists on_order_created on public.orders;
create trigger on_order_created
after insert on public.orders
for each row execute procedure public.seed_order_history();

create or replace function public.assign_order(order_id_value uuid, courier_id_value uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  courier_row public.profiles%rowtype;
  updated_order public.orders%rowtype;
begin
  if not public.is_admin() then
    raise exception 'غير مصرح: تعيين الطلبات للإدارة فقط';
  end if;
  select * into order_row from public.orders where id = order_id_value for update;
  if order_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if order_row.status in ('delivered', 'cancelled', 'failed') then raise exception 'لا يمكن توجيه طلب مغلق'; end if;
  if courier_id_value is not null then
    select * into courier_row from public.profiles where id = courier_id_value and role = 'courier' and approved = true;
    if courier_row.id is null then raise exception 'المندوب غير موجود أو غير معتمد'; end if;
  end if;
  update public.orders
  set courier_id = courier_id_value,
      status = case when courier_id_value is null then 'searching_driver' else 'assigned' end,
      assigned_at = case when courier_id_value is null then null else now() end,
      updated_at = now()
  where id = order_id_value
  returning * into updated_order;
  insert into public.order_status_history (order_id, status, changed_by, notes)
  values (updated_order.id, updated_order.status, auth.uid(), case when courier_id_value is null then 'تم إلغاء إسناد الطلب' else 'تم تعيين الطلب للمندوب' end);
  if courier_id_value is not null then
    insert into public.notifications (user_id, order_id, type, title, body)
    values (courier_id_value, updated_order.id, 'order_assigned', 'طلب جديد', 'تم إسناد طلب جديد إليك.');
  end if;
  insert into public.notifications (user_id, order_id, type, title, body)
  values (updated_order.user_id, updated_order.id, 'order_assigned', 'تحديث الطلب', public.order_status_message(updated_order.status));
  return to_jsonb(updated_order);
end;
$$;

create or replace function public.advance_order(order_id_value uuid, next_status_value text, note_value text default null, latitude_value double precision default null, longitude_value double precision default null)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  updated_order public.orders%rowtype;
  actor_role text;
  actor_id uuid := auth.uid();
  message text;
begin
  select role into actor_role from public.profiles where id = actor_id;
  if actor_role is null then raise exception 'الحساب غير موجود'; end if;
  if next_status_value not in ('pending', 'confirmed', 'searching_driver', 'assigned', 'driver_accepted', 'heading_to_pickup', 'arrived_pickup', 'picked_up', 'delivering', 'arrived_destination', 'delivered', 'cancelled', 'rejected', 'failed') then
    raise exception 'حالة الطلب غير صحيحة';
  end if;
  select * into order_row from public.orders where id = order_id_value for update;
  if order_row.id is null then raise exception 'الطلب غير موجود'; end if;
  if actor_role = 'customer' and order_row.user_id <> actor_id then raise exception 'لا يمكنك تعديل هذا الطلب'; end if;
  if actor_role = 'courier' and (order_row.courier_id <> actor_id or order_row.status in ('delivered', 'cancelled', 'failed')) then raise exception 'الطلب غير مسند إليك'; end if;
  if actor_role = 'customer' and next_status_value <> 'cancelled' then raise exception 'العميل يستطيع إلغاء الطلب فقط'; end if;
  if actor_role <> 'admin' and not public.order_status_can_follow(order_row.status, next_status_value) then raise exception 'الانتقال بين هذه الحالات غير مسموح'; end if;
  if actor_role = 'admin' and next_status_value = order_row.status then raise exception 'الحالة لم تتغير'; end if;
  update public.orders
  set status = next_status_value,
      courier_id = case when next_status_value = 'rejected' then null else courier_id end,
      accepted_at = case when next_status_value = 'driver_accepted' then now() else accepted_at end,
      delivered_at = case when next_status_value = 'delivered' then now() else delivered_at end,
      updated_at = now()
  where id = order_id_value
  returning * into updated_order;
  insert into public.order_status_history (order_id, status, changed_by, latitude, longitude, notes)
  values (updated_order.id, updated_order.status, actor_id, latitude_value, longitude_value, note_value);
  message := public.order_status_message(updated_order.status);
  insert into public.notifications (user_id, order_id, type, title, body)
  values (updated_order.user_id, updated_order.id, 'order_status', 'تحديث الطلب', message);
  if updated_order.courier_id is not null and updated_order.courier_id <> actor_id then
    insert into public.notifications (user_id, order_id, type, title, body)
    values (updated_order.courier_id, updated_order.id, 'order_status', 'تحديث الطلب', message);
  end if;
  return to_jsonb(updated_order);
end;
$$;

grant execute on function public.assign_order(uuid, uuid) to authenticated;
grant execute on function public.advance_order(uuid, text, text, double precision, double precision) to authenticated;

create or replace function public.order_courier_summary(order_id_value uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  order_row public.orders%rowtype;
  courier_row public.profiles%rowtype;
begin
  select * into order_row from public.orders where id = order_id_value;
  if order_row.id is null or (order_row.user_id is distinct from auth.uid() and order_row.courier_id is distinct from auth.uid() and not public.is_admin()) then
    raise exception 'غير مصرح بعرض بيانات هذا المندوب';
  end if;
  if order_row.courier_id is null then return '{}'::jsonb; end if;
  select * into courier_row from public.profiles where id = order_row.courier_id;
  return jsonb_build_object('id', courier_row.id, 'full_name', courier_row.full_name, 'phone', courier_row.phone);
end;
$$;

grant execute on function public.order_courier_summary(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.merchants enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.order_status_history enable row level security;
alter table public.notifications enable row level security;
alter table public.driver_locations enable row level security;

drop policy if exists "profiles own or admin read" on public.profiles;
create policy "profiles own or admin read" on public.profiles for select using (auth.uid() = id or public.is_admin());
drop policy if exists "profiles admin manage" on public.profiles;
create policy "profiles admin manage" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "active merchants public read" on public.merchants;
create policy "active merchants public read" on public.merchants for select using (active = true or public.is_admin());
drop policy if exists "admin merchants manage" on public.merchants;
create policy "admin merchants manage" on public.merchants for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "available products public read" on public.products;
create policy "available products public read" on public.products for select using (available = true or public.is_admin());
drop policy if exists "admin products manage" on public.products;
create policy "admin products manage" on public.products for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "orders visible to participants" on public.orders;
create policy "orders visible to participants" on public.orders for select using (
  auth.uid() = user_id
  or auth.uid() = courier_id
  or public.is_admin()
);
drop policy if exists "customers create orders" on public.orders;
create policy "customers create orders" on public.orders for insert with check (auth.uid() = user_id);
drop policy if exists "couriers update assigned orders" on public.orders;
drop policy if exists "admin update orders" on public.orders;

drop policy if exists "events visible to participants" on public.order_events;
create policy "events visible to participants" on public.order_events for select using (exists(select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or o.courier_id = auth.uid() or public.is_admin())));
drop policy if exists "participants create events" on public.order_events;
drop policy if exists "participants create events" on public.order_events;

drop policy if exists "history visible to participants" on public.order_status_history;
create policy "history visible to participants" on public.order_status_history for select using (exists(select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or o.courier_id = auth.uid() or public.is_admin())));

drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications update" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "admin notifications create" on public.notifications;
drop policy if exists "admin notifications create" on public.notifications;

drop policy if exists "couriers manage own location" on public.driver_locations;
create policy "couriers manage own location" on public.driver_locations for all using (auth.uid() = driver_id) with check (auth.uid() = driver_id);
drop policy if exists "participants read driver location" on public.driver_locations;
create policy "participants read driver location" on public.driver_locations for select using (auth.uid() = driver_id or public.is_admin() or exists(select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_courier_status_idx on public.orders(courier_id, status);
create index if not exists order_status_history_order_idx on public.order_status_history(order_id, changed_at desc);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists products_merchant_idx on public.products(merchant_id);

create or replace function public.set_pin(pin_value text)
returns jsonb
language plpgsql
security definer set search_path = public, auth, extensions
as $$
begin
  if auth.uid() is null or pin_value !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'error', 'PIN يجب أن يكون 6 أرقام.');
  end if;
  update public.profiles
  set pin_hash = extensions.crypt(pin_value, extensions.gen_salt('bf')), pin_salt = 'bcrypt', pin_attempts = 0, pin_locked_until = null, updated_at = now()
  where id = auth.uid();
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function public.recover_password(phone_value text, pin_value text, new_password text)
returns jsonb
language plpgsql
security definer set search_path = public, auth, extensions
as $$
declare
  profile_row public.profiles%rowtype;
  attempts integer;
begin
  select * into profile_row from public.profiles where phone = phone_value;
  if profile_row.id is null or length(new_password) < 6 or pin_value !~ '^\d{6}$' then
    return jsonb_build_object('ok', false, 'error', 'بيانات الاسترجاع غير صحيحة.');
  end if;
  if profile_row.pin_locked_until is not null and profile_row.pin_locked_until > now() then
    return jsonb_build_object('ok', false, 'error', 'تم إيقاف المحاولات مؤقتًا. حاول بعد قليل.');
  end if;
  if profile_row.pin_hash is null or extensions.crypt(pin_value, profile_row.pin_hash) <> profile_row.pin_hash then
    attempts := coalesce(profile_row.pin_attempts, 0) + 1;
    update public.profiles set pin_attempts = attempts, pin_locked_until = case when attempts >= 5 then now() + interval '15 minutes' else null end where id = profile_row.id;
    return jsonb_build_object('ok', false, 'error', case when attempts >= 5 then 'محاولات كثيرة. حاول بعد 15 دقيقة.' else 'رقم الهاتف أو PIN غير صحيح.' end);
  end if;
  update auth.users set encrypted_password = extensions.crypt(new_password, extensions.gen_salt('bf')), updated_at = now() where id = profile_row.id;
  update public.profiles set pin_attempts = 0, pin_locked_until = null, updated_at = now() where id = profile_row.id;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.set_pin(text) to authenticated;
grant execute on function public.recover_password(text, text, text) to anon, authenticated;

alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.notifications;

-- بعد إنشاء حساب المدير، نفّذ هذا السطر مرة واحدة من SQL Editor:
-- update public.profiles set role = 'admin' where phone = '+20XXXXXXXXXX';
