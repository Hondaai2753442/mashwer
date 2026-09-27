-- Production hardening for passenger rides.
-- Run after supabase/schema.sql and supabase/passenger_rides.sql.

alter table public.notifications
  add column if not exists ride_id uuid references public.ride_requests(id) on delete cascade;

alter table public.ride_offers
  add column if not exists distance_km numeric(10,3);

alter table public.ride_offers
  alter column expires_at set default (now() + interval '60 seconds');

create index if not exists ride_offers_ride_status_idx
  on public.ride_offers(ride_id, status, expires_at);

create or replace function public.haversine_km(
  latitude_a double precision,
  longitude_a double precision,
  latitude_b double precision,
  longitude_b double precision
)
returns double precision
language sql
immutable
as $$
  select 6371.0088 * 2 * asin(sqrt(
    power(sin(radians(latitude_b - latitude_a) / 2), 2)
    + cos(radians(latitude_a)) * cos(radians(latitude_b))
      * power(sin(radians(longitude_b - longitude_a) / 2), 2)
  ));
$$;

drop policy if exists "ride participants read" on public.ride_requests;
create policy "ride participants read" on public.ride_requests
  for select using (
    passenger_id = auth.uid()
    or driver_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.ride_offers offer
      where offer.ride_id = public.ride_requests.id
        and offer.driver_id = auth.uid()
    )
  );

drop policy if exists "passengers create rides" on public.ride_requests;

drop policy if exists "ride offer participants read" on public.ride_offers;
create policy "ride offer participants read" on public.ride_offers
  for select using (
    driver_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "ride locations driver insert" on public.ride_locations;
drop policy if exists "ride locations participants read" on public.ride_locations;
create policy "ride locations participants read" on public.ride_locations
  for select using (
    driver_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.ride_requests ride
      where ride.id = public.ride_locations.ride_id
        and (ride.passenger_id = auth.uid() or ride.driver_id = auth.uid())
    )
  );

drop policy if exists "ride events participants read" on public.ride_events;
create policy "ride events participants read" on public.ride_events
  for select using (
    actor_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.ride_requests ride
      where ride.id = public.ride_events.ride_id
        and (ride.passenger_id = auth.uid() or ride.driver_id = auth.uid())
    )
  );

create or replace function public.dispatch_ride_offers(ride_id_value uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  ride_row public.ride_requests%rowtype;
  inserted_count integer := 0;
begin
  select * into ride_row
  from public.ride_requests
  where id = ride_id_value
  for update;

  if ride_row.id is null or ride_row.status <> 'searching' then
    return 0;
  end if;

  insert into public.ride_offers (ride_id, driver_id, distance_km)
  select ride_row.id, candidates.driver_id, candidates.distance_km
  from (
    select profile.id as driver_id,
           public.haversine_km(
             ride_row.pickup_latitude,
             ride_row.pickup_longitude,
             location.latitude,
             location.longitude
           ) as distance_km
    from public.profiles profile
    join public.driver_locations location on location.driver_id = profile.id
    where profile.role = 'courier'
      and profile.approved = true
      and profile.available = true
      and location.updated_at > now() - interval '10 minutes'
      and public.haversine_km(
        ride_row.pickup_latitude,
        ride_row.pickup_longitude,
        location.latitude,
        location.longitude
      ) <= 20
      and not exists (
        select 1 from public.ride_requests active_ride
        where active_ride.driver_id = profile.id
          and active_ride.status in ('driver_assigned', 'driver_arriving', 'driver_arrived', 'in_progress')
      )
      and not exists (
        select 1 from public.orders active_order
        where active_order.courier_id = profile.id
          and active_order.status in ('assigned', 'driver_accepted', 'heading_to_pickup', 'arrived_pickup', 'picked_up', 'delivering', 'arrived_destination')
      )
    order by distance_km asc
    limit 12
  ) candidates
  on conflict (ride_id, driver_id) do nothing;

  get diagnostics inserted_count = row_count;

  insert into public.notifications (user_id, ride_id, type, title, body)
  select offer.driver_id, offer.ride_id, 'ride_offer', 'رحلة جديدة قريبة', 'يوجد طلب مشوار قريب منك. افتح العروض للقبول أو الرفض.'
  from public.ride_offers offer
  where offer.ride_id = ride_id_value
    and offer.status = 'offered'
    and offer.offered_at > now() - interval '3 seconds';

  return inserted_count;
end;
$$;

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
  if actor_id is null or not exists (
    select 1 from public.profiles where id = actor_id and role = 'customer'
  ) then
    raise exception 'العميل فقط يستطيع طلب رحلة';
  end if;
  if coalesce(trim(pickup_address_value), '') = ''
     or coalesce(trim(destination_address_value), '') = '' then
    raise exception 'نقطة الانطلاق والوجهة مطلوبتان';
  end if;
  if estimated_distance_km_value <= 0 or estimated_distance_km_value > 1000
     or estimated_duration_minutes_value < 0 then
    raise exception 'بيانات المسافة أو الوقت غير صحيحة';
  end if;
  if payment_method_value not in ('cash', 'vodafone_cash', 'instapay') then
    raise exception 'طريقة الدفع غير صحيحة';
  end if;
  if payment_method_value <> 'cash'
     and coalesce(trim(payment_reference_value), '') = '' then
    raise exception 'رقم عملية الدفع مطلوب';
  end if;

  select * into rule_row
  from public.fare_rules
  where id = fare_rule_id_value and active = true;
  if rule_row.id is null then raise exception 'تعريفة الرحلة غير متاحة'; end if;

  quoted := greatest(
    rule_row.minimum_fare,
    rule_row.base_fare
      + rule_row.price_per_km * estimated_distance_km_value
      + rule_row.price_per_minute * estimated_duration_minutes_value
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
    round(estimated_distance_km_value, 3), round(estimated_duration_minutes_value, 2), quoted,
    payment_method_value,
    case when payment_method_value = 'cash' then 'not_required' else 'pending' end,
    nullif(trim(payment_reference_value), ''), nullif(trim(notes_value), '')
  ) returning * into new_ride;

  insert into public.ride_events (ride_id, status, actor_id, note)
  values (new_ride.id, 'searching', actor_id, 'تم إنشاء طلب رحلة أفراد');
  perform public.dispatch_ride_offers(new_ride.id);
  return to_jsonb(new_ride);
end;
$$;

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
  select * into ride_row
  from public.ride_requests
  where id = ride_id_value
  for update;
  if ride_row.id is null or ride_row.status <> 'searching' or ride_row.driver_id is not null then
    raise exception 'الرحلة تم حجزها أو لم تعد متاحة';
  end if;

  select * into offer_row
  from public.ride_offers
  where ride_id = ride_id_value and driver_id = actor_id
    and status = 'offered' and expires_at > now()
  for update;
  if offer_row.id is null then raise exception 'العرض غير متاح أو انتهت صلاحيته'; end if;
  if not exists (
    select 1 from public.profiles
    where id = actor_id and role = 'courier' and approved = true and available = true
  ) then
    raise exception 'المندوب غير متاح أو غير معتمد';
  end if;

  update public.ride_requests
  set driver_id = actor_id, status = 'driver_assigned', assigned_at = now(), updated_at = now()
  where id = ride_id_value;
  update public.ride_offers
  set status = case when id = offer_row.id then 'accepted' else 'cancelled' end,
      responded_at = now()
  where ride_id = ride_id_value and status = 'offered';
  insert into public.ride_events (ride_id, status, actor_id, note)
  values (ride_id_value, 'driver_assigned', actor_id, 'تم قبول عرض الرحلة');
  insert into public.notifications (user_id, ride_id, type, title, body)
  values (ride_row.passenger_id, ride_id_value, 'ride_status', 'تم قبول الرحلة', 'قبل المندوب رحلتك وسيبدأ التحرك إليك.');
  return (select to_jsonb(ride) from public.ride_requests ride where ride.id = ride_id_value);
end;
$$;

create or replace function public.decline_ride_offer(ride_id_value uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  update public.ride_offers
  set status = 'declined', responded_at = now()
  where ride_id = ride_id_value and driver_id = auth.uid() and status = 'offered';
  return found;
end;
$$;

create or replace function public.expire_ride_offers()
returns integer
language plpgsql
security definer set search_path = public
as $$
declare affected integer;
begin
  update public.ride_offers
  set status = 'expired', responded_at = coalesce(responded_at, now())
  where status = 'offered' and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.ride_status_can_follow(previous_status text, next_status text)
returns boolean
language sql
immutable
as $$
  select case previous_status
    when 'searching' then next_status in ('cancelled')
    when 'driver_assigned' then next_status in ('driver_arriving', 'cancelled')
    when 'driver_arriving' then next_status in ('driver_arrived', 'cancelled')
    when 'driver_arrived' then next_status in ('in_progress', 'cancelled')
    when 'in_progress' then next_status in ('completed', 'cancelled')
    else false
  end;
$$;

create or replace function public.advance_passenger_ride(
  ride_id_value uuid,
  next_status_value text,
  note_value text default null,
  latitude_value double precision default null,
  longitude_value double precision default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  actor_role text;
  ride_row public.ride_requests%rowtype;
  updated_ride public.ride_requests%rowtype;
  message text;
begin
  select role into actor_role from public.profiles where id = actor_id;
  if actor_id is null or actor_role is null or actor_role not in ('customer', 'courier', 'admin') then
    raise exception 'الحساب غير صالح لتحديث الرحلة';
  end if;
  select * into ride_row from public.ride_requests where id = ride_id_value for update;
  if ride_row.id is null then raise exception 'الرحلة غير موجودة'; end if;
  if next_status_value not in ('searching', 'driver_assigned', 'driver_arriving', 'driver_arrived', 'in_progress', 'completed', 'cancelled', 'no_driver', 'expired') then
    raise exception 'حالة الرحلة غير صحيحة';
  end if;
  if actor_role = 'customer' and ride_row.passenger_id <> actor_id then
    raise exception 'لا يمكنك تعديل هذه الرحلة';
  end if;
  if actor_role = 'courier' and (ride_row.driver_id <> actor_id or not exists (select 1 from public.profiles where id = actor_id and approved = true)) then
    raise exception 'الرحلة غير مسندة إليك';
  end if;
  if actor_role = 'customer' and next_status_value <> 'cancelled' then
    raise exception 'المستخدم يستطيع إلغاء الرحلة فقط';
  end if;
  if actor_role <> 'admin' and not public.ride_status_can_follow(ride_row.status, next_status_value) then
    raise exception 'الانتقال بين حالات الرحلة غير مسموح';
  end if;
  if ride_row.status in ('completed', 'cancelled', 'no_driver', 'expired') then
    raise exception 'الرحلة مغلقة';
  end if;

  update public.ride_requests
  set status = next_status_value,
      started_at = case when next_status_value = 'in_progress' then coalesce(started_at, now()) else started_at end,
      completed_at = case when next_status_value = 'completed' then now() else completed_at end,
      cancelled_at = case when next_status_value = 'cancelled' then now() else cancelled_at end,
      final_fare = case when next_status_value = 'completed' then coalesce(final_fare, quoted_fare) else final_fare end,
      cancellation_reason = case when next_status_value = 'cancelled' then nullif(trim(note_value), '') else cancellation_reason end,
      updated_at = now()
  where id = ride_id_value
  returning * into updated_ride;

  insert into public.ride_events (ride_id, status, actor_id, note, latitude, longitude)
  values (ride_id_value, next_status_value, actor_id, note_value, latitude_value, longitude_value);
  message := case next_status_value
    when 'driver_arriving' then 'المندوب في طريقه إليك.'
    when 'driver_arrived' then 'وصل المندوب إلى نقطة الانطلاق.'
    when 'in_progress' then 'بدأت الرحلة.'
    when 'completed' then 'اكتملت الرحلة بنجاح.'
    when 'cancelled' then 'تم إلغاء الرحلة.'
    else 'تم تحديث حالة الرحلة.'
  end;
  insert into public.notifications (user_id, ride_id, type, title, body)
  values (updated_ride.passenger_id, updated_ride.id, 'ride_status', 'تحديث الرحلة', message);
  if updated_ride.driver_id is not null and updated_ride.driver_id <> actor_id then
    insert into public.notifications (user_id, ride_id, type, title, body)
    values (updated_ride.driver_id, updated_ride.id, 'ride_status', 'تحديث الرحلة', message);
  end if;
  return to_jsonb(updated_ride);
end;
$$;

create or replace function public.update_driver_presence(
  latitude_value double precision,
  longitude_value double precision
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare row_data public.driver_locations%rowtype;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'courier' and approved = true) then
    raise exception 'المندوب غير معتمد';
  end if;
  insert into public.driver_locations (driver_id, order_id, latitude, longitude, updated_at)
  values (auth.uid(), null, latitude_value, longitude_value, now())
  on conflict (driver_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    updated_at = now();
  select * into row_data from public.driver_locations where driver_id = auth.uid();
  return jsonb_build_object('driver_id', row_data.driver_id, 'latitude', row_data.latitude, 'longitude', row_data.longitude, 'updated_at', row_data.updated_at);
end;
$$;

create or replace function public.update_ride_location(
  ride_id_value uuid,
  latitude_value double precision,
  longitude_value double precision,
  accuracy_value double precision default null
)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare ride_row public.ride_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'يجب تسجيل الدخول أولًا'; end if;
  select * into ride_row from public.ride_requests where id = ride_id_value;
  if ride_row.id is null or ride_row.driver_id <> auth.uid() or ride_row.status not in ('driver_assigned', 'driver_arriving', 'driver_arrived', 'in_progress') then
    raise exception 'لا يمكن تحديث موقع هذه الرحلة';
  end if;
  insert into public.ride_locations (ride_id, driver_id, latitude, longitude, accuracy_meters)
  values (ride_id_value, auth.uid(), latitude_value, longitude_value, accuracy_value);
  insert into public.driver_locations (driver_id, order_id, latitude, longitude, updated_at)
  values (auth.uid(), null, latitude_value, longitude_value, now())
  on conflict (driver_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, updated_at = now();
  return jsonb_build_object('ride_id', ride_id_value, 'latitude', latitude_value, 'longitude', longitude_value);
end;
$$;

grant execute on function public.dispatch_ride_offers(uuid) to authenticated;
grant execute on function public.accept_ride_offer(uuid) to authenticated;
grant execute on function public.decline_ride_offer(uuid) to authenticated;
grant execute on function public.expire_ride_offers() to authenticated;
grant execute on function public.advance_passenger_ride(uuid, text, text, double precision, double precision) to authenticated;
grant execute on function public.update_driver_presence(double precision, double precision) to authenticated;
grant execute on function public.update_ride_location(uuid, double precision, double precision, double precision) to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_requests') then
    alter publication supabase_realtime add table public.ride_requests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_offers') then
    alter publication supabase_realtime add table public.ride_offers;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'ride_locations') then
    alter publication supabase_realtime add table public.ride_locations;
  end if;
end;
$$;
