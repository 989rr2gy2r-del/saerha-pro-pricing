create or replace function public.delete_order_when_quotation_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.order_id is not null then
    delete from public.orders
    where id = old.order_id;
  end if;

  return old;
end;
$$;

revoke execute on function public.delete_order_when_quotation_deleted() from public;
revoke execute on function public.delete_order_when_quotation_deleted() from anon;
revoke execute on function public.delete_order_when_quotation_deleted() from authenticated;

drop trigger if exists quotation_delete_order_cleanup on public.quotations;

create trigger quotation_delete_order_cleanup
after delete on public.quotations
for each row
execute function public.delete_order_when_quotation_deleted();