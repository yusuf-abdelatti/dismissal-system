-- Automatic daily reset per nursery, driven by nurseries.daily_reset_hour /
-- nurseries.timezone. Applied directly via `supabase db query --linked` when
-- built; recorded here for history/reproducibility.

create extension if not exists pg_cron;

create or replace function auto_reset_nurseries()
returns void as $$
declare
  n record;
  local_ts timestamp;
begin
  for n in select * from nurseries where is_active loop
    local_ts := now() at time zone n.timezone;

    if extract(hour from local_ts)::int = n.daily_reset_hour
       and (n.last_reset_date is null or n.last_reset_date < local_ts::date) then

      update pickup_requests
      set status = 'cleared'
      where nursery_id = n.id
        and status not in ('delivered', 'cleared');

      update nurseries set last_reset_date = local_ts::date where id = n.id;
    end if;
  end loop;
end;
$$ language plpgsql security definer;

select cron.schedule('auto-reset-nurseries', '*/15 * * * *', 'select auto_reset_nurseries()');
