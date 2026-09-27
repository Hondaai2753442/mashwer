-- Mashwer passenger rides MVP.
-- This migration is additive: merchant orders remain in public.orders.
-- No SMS or ride OTP is used in this flow.

create table if not exists public.fare_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  base_fare numeric(10,2) not null default 0 check (base_fare >= 0),
  price_per_km numeric(10,2) not null default 0 check (price_per_km >= 0),
  price_per_minute numeric(10,2) not null default 0 check (price_per_minute >= 0),
  minimum_fare numeric(10,2) not null default 0 check (minimum_fare >= 0),
  service_fee numeric(10,2) not null default 0 check (service_fee >= 0),
  cancellation_fee numeric(10,2) not null default 0 check (cancellation_fee >= 0),
  active boolean not null default true,
  effective_from timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.ride_requests (
  id uuid primary key default gen_random_uuid(),
  passenger_id uuid not null references public.profiles(id) on delete restrict,
  driver_id uuid references public.profiles(id) on delete set null,
  fare_rule_id uuid references public.fare_rules(id) on delete restrict,
  status text not null default 'searching' check (status in (
    'searching', 'driver_assigned', 'driver_arriving', 'driver_arrived',
    'in_progress', 'completed', 'cancelled', 'no_driver', 'expired'
  )),
  pickup_address text not null,
  pickup_latitude double precision not null check (pickup_latitude between -90 and 90),
  pickup_longitude double precision not null check (pickup_longitude between -180 and 180),
  destination_address text not null,
  destination_latitude double precision not null check (destination_latitude between -90 and 90),
  destination_longitude double precision not null check (destination_longitude between -180 and 180),
  estimated_distance_km numeric(10,3) not null check (estimated_distance_km >= 0),
  estimated_duration_minutes numeric(10,2) not null default 0 check (estimated_duration_minutes >= 0),
  actual_distance_km numeric(10,3) check (actual_distance_km >= 0),
  actual_duration_minutes numeric(10,2) check (actual_duration_minutes >= 0),
  quoted_fare numeric(10,2) not null check (quoted_fare >= 0),
  final_fare numeric(10,2) check (final_fare >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'vodafone_cash', 'instapay', 'fawry', 'card')),
  payment_status text not null default 'not_required' check (payment_status in ('not_required', 'pending', 'confirmed', 'rejected')),
  payment_reference text,
  notes text,
  requested_at timestamptz not null default now(),
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ride_requests drop constraint if exists ride_requests_payment_method_check;
alter table public.ride_requests add constraint ride_requests_payment_method_check check (payment_method in ('cash', 'vodafone_cash', 'instapay', 'fawry', 'card'));

create table if not exists public.ride_offers (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.ride_requests(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'offered' check (status in ('offered', 'accepted', 'declined', 'expired', 'cancelled')),
  offered_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 seconds'),
  responded_at timestamptz,
  unique (ride_id, driver_id)
);

create table if not exists public.ride_locations (
  id bigint generated always as identity primary key,
  ride_id uuid not null references public.ride_requests(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy_meters double precision,
  recorded_at timestamptz not null default now()
);

create table if not exists public.ride_events (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.ride_requests(id) on delete cascade,
  status text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  note text,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now()
);

create index if not exists fare_rules_active_idx on public.fare_rules(active, city, effective_from desc);
create index if not exists ride_requests_passenger_idx on public.ride_requests(passenger_id, created_at desc);
create index if not exists ride_requests_driver_idx on public.ride_requests(driver_id, status, created_at desc);
create index if not exists ride_requests_search_idx on public.ride_requests(status, requested_at desc);
create index if not exists ride_offers_driver_idx on public.ride_offers(driver_id, status, expires_at);
create index if not exists ride_locations_latest_idx on public.ride_locations(ride_id, recorded_at desc);
create index if not exists ride_events_ride_idx on public.ride_events(ride_id, created_at desc);

alter table public.fare_rules enable row level security;
alter table public.ride_requests enable row level security;
alter table public.ride_offers enable row level security;
alter table public.ride_locations enable row level security;
alter table public.ride_events enable row level security;

drop policy if exists "fare rules public read" on public.fare_rules;
create policy "fare rules public read" on public.fare_rules
  for select using (active = true or public.is_admin());

drop policy if exists "fare rules admin manage" on public.fare_rules;
create policy "fare rules admin manage" on public.fare_rules
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ride participants read" on public.ride_requests;
create policy "ride participants read" on public.ride_requests
  for select using (passenger_id = auth.uid() or driver_id = auth.uid() or public.is_admin());

drop policy if exists "passengers create rides" on public.ride_requests;
create policy "passengers create rides" on public.ride_requests
  for insert with check (passenger_id = auth.uid());

drop policy if exists "ride offer participants read" on public.ride_offers;
create policy "ride offer participants read" on public.ride_offers
  for select using (driver_id = auth.uid() or public.is_admin() or exists (
    select 1 from public.ride_requests r
    where r.id = ride_id and r.passenger_id = auth.uid()
  ));

drop policy if exists "ride locations participants read" on public.ride_locations;
create policy "ride locations participants read" on public.ride_locations
  for select using (driver_id = auth.uid() or public.is_admin() or exists (
    select 1 from public.ride_requests r
    where r.id = ride_id and r.passenger_id = auth.uid()
  ));

drop policy if exists "ride locations driver insert" on public.ride_locations;
create policy "ride locations driver insert" on public.ride_locations
  for insert with check (driver_id = auth.uid());

drop policy if exists "ride events participants read" on public.ride_events;
create policy "ride events participants read" on public.ride_events
  for select using (actor_id = auth.uid() or public.is_admin() or exists (
    select 1 from public.ride_requests r
    where r.id = ride_id and (r.passenger_id = auth.uid() or r.driver_id = auth.uid())
  ));

create or replace function public.passenger_fare_quote(
  fare_rule_id_value uuid,
  distance_km_value numeric,
  duration_minutes_value numeric
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  rule_row public.fare_rules%rowtype;
  calculated numeric(10,2);
begin
  select * into rule_row
  from public.fare_rules
  where id = fare_rule_id_value and active = true;
  if rule_row.id is null then raise exception 'تعريفة الرحلة غير متاحة'; end if;
  if distance_km_value < 0 or duration_minutes_value < 0 then raise exception 'بيانات المسافة غير صحيحة'; end if;
  calculated := greatest(
    rule_row.minimum_fare,
    rule_row.base_fare
      + (rule_row.price_per_km * distance_km_value)
      + (rule_row.price_per_minute * duration_minutes_value)
      + rule_row.service_fee
  );
  return jsonb_build_object(
    'fare_rule_id', rule_row.id,
    'distance_km', round(distance_km_value, 3),
    'duration_minutes', round(duration_minutes_value, 2),
    'quoted_fare', calculated,
    'currency', 'EGP'
  );
end;
$$;

grant execute on function public.passenger_fare_quote(uuid, numeric, numeric) to authenticated;

create or replace function public.create_passenger_ride(
  pickup_address_value text,
  pickup_latitude_value double precision,
  pickup_longitude_value double precision,
  destination_address_value text,
  destination_latitude_value double precision,
  destination_longitude_value double precision,
  estimated_distance_km_value numeric,
  estimated_duration_minutes_value numeric,
  fare_rule_id_value uuid,
  payment_method_value text,
  payment_reference_value text default null,
  notes_value text default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  rule_row public.fare_rules%rowtype;
  quoted numeric(10,2);
  new_ride public.ride_requests%rowtype;
begin
  if actor_id is null or not exists (select 1 from public.profiles where id = actor_id and role = 'customer') then
    raise exception 'العميل فقط يستطيع طلب رحلة';
  end if;
  if coalesce(trim(pickup_address_value), '') = '' or coalesce(trim(destination_address_value), '') = '' then
    raise exception 'نقطة الانطلاق والوجهة مطلوبتان';
  end if;
  if payment_method_value not in ('cash', 'vodafone_cash', 'instapay', 'fawry', 'card') then
    raise exception 'طريقة الدفع غير صحيحة';
  end if;
  if payment_method_value = 'fawry' then
    raise exception 'Fawry قيد التحديث حاليًا';
  end if;
  if payment_method_value <> 'cash' and coalesce(trim(payment_reference_value), '') = '' then
    raise exception 'رقم عملية الدفع مطلوب';
  end if;
  select * into rule_row from public.fare_rules where id = fare_rule_id_value and active = true;
  if rule_row.id is null then raise exception 'تعريفة الرحلة غير متاحة'; end if;
  quoted := greatest(
    rule_row.minimum_fare,
    rule_row.base_fare
      + (rule_row.price_per_km * estimated_distance_km_value)
      + (rule_row.price_per_minute * estimated_duration_minutes_value)
      + rule_row.service_fee
  );
  insert into public.ride_requests (
    passenger_id, fare_rule_id, pickup_address, pickup_latitude, pickup_longitude,
    destination_address, destination_latitude, destination_longitude,
    estimated_distance_km, estimated_duration_minutes, quoted_fare,
    payment_method, payment_status, payment_reference, notes
  ) values (
    actor_id, rule_row.id, trim(pickup_address_value), pickup_latitude_value, pickup_longitude_value,
    trim(destination_address_value), destination_latitude_value, destination_longitude_value,
    estimated_distance_km_value, estimated_duration_minutes_value, quoted,
    payment_method_value, case when payment_method_value = 'cash' then 'not_required' else 'pending' end,
    nullif(trim(payment_reference_value), ''), nullif(trim(notes_value), '')
  ) returning * into new_ride;
  insert into public.ride_events (ride_id, status, actor_id, note)
  values (new_ride.id, 'searching', actor_id, 'تم إنشاء طلب رحلة أفراد');
  return to_jsonb(new_ride);
end;
$$;

grant execute on function public.create_passenger_ride(text, double precision, double precision, text, double precision, double precision, numeric, numeric, uuid, text, text, text) to authenticated;

create or replace function public.accept_ride_offer(ride_id_value uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  ride_row public.ride_requests%rowtype;
  offer_row public.ride_offers%rowtype;
begin
  select * into offer_row
  from public.ride_offers
  where ride_id = ride_id_value and driver_id = actor_id and status = 'offered' and expires_at > now()
  for update;
  if offer_row.id is null then raise exception 'العرض غير متاح أو انتهت صلاحيته'; end if;
  select * into ride_row from public.ride_requests where id = ride_id_value for update;
  if ride_row.id is null or ride_row.status <> 'searching' or ride_row.driver_id is not null then
    raise exception 'الرحلة تم حجزها أو لم تعد متاحة';
  end if;
  if not exists (select 1 from public.profiles where id = actor_id and role = 'courier' and approved = true and available = true) then
    raise exception 'المندوب غير متاح أو غير معتمد';
  end if;
  update public.ride_requests
  set driver_id = actor_id, status = 'driver_assigned', assigned_at = now(), updated_at = now()
  where id = ride_id_value;
  update public.ride_offers set status = case when id = offer_row.id then 'accepted' else 'cancelled' end, responded_at = now()
  where ride_id = ride_id_value and status = 'offered';
  insert into public.ride_events (ride_id, status, actor_id, note)
  values (ride_id_value, 'driver_assigned', actor_id, 'تم قبول عرض الرحلة');
  return (select to_jsonb(r) from public.ride_requests r where r.id = ride_id_value);
end;
$$;

grant execute on function public.accept_ride_offer(uuid) to authenticated;
