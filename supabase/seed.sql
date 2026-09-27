-- Safe starter data for a new Mashwer database.
insert into public.fare_rules (
  name, city, base_fare, price_per_km, price_per_minute,
  minimum_fare, service_fee, cancellation_fee, active
)
select 'التعريفة الأساسية', 'كفر الشيخ', 20, 5, 0.50, 30, 0, 10, true
where not exists (select 1 from public.fare_rules where active = true);
