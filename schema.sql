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
  status text not null default 'جديد' check (status in ('جديد', 'مقبول', 'قيد التجهيز', 'مع المندوب', 'تم التسليم', 'ملغي')),
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(10,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  payment_method text not null default 'paid_to_store' check (payment_method in ('paid_to_store', 'vodafone_cash', 'instapay', 'cash')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'pending', 'confirmed', 'rejected')),
  payment_reference text,
  address_text text not null,
  contact_phone text not null,
  latitude double precision,
  longitude double precision,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
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

alter table public.profiles enable row level security;
alter table public.merchants enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.notifications enable row level security;

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
create policy "orders visible to participants" on public.orders for select using (auth.uid() = user_id or auth.uid() = courier_id or public.is_admin());
drop policy if exists "customers create orders" on public.orders;
create policy "customers create orders" on public.orders for insert with check (auth.uid() = user_id);
drop policy if exists "couriers update assigned orders" on public.orders;
create policy "couriers update assigned orders" on public.orders for update using (auth.uid() = courier_id or public.is_admin()) with check (auth.uid() = courier_id or public.is_admin());

drop policy if exists "events visible to participants" on public.order_events;
create policy "events visible to participants" on public.order_events for select using (exists(select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or o.courier_id = auth.uid() or public.is_admin())));
drop policy if exists "participants create events" on public.order_events;
create policy "participants create events" on public.order_events for insert with check (auth.uid() = created_by or public.is_admin());

drop policy if exists "own notifications read" on public.notifications;
create policy "own notifications read" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "admin notifications create" on public.notifications;
create policy "admin notifications create" on public.notifications for insert with check (public.is_admin());

create index if not exists orders_user_created_idx on public.orders(user_id, created_at desc);
create index if not exists orders_courier_status_idx on public.orders(courier_id, status);
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
