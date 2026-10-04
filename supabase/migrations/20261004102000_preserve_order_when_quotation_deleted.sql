drop trigger if exists quotation_delete_order_cleanup on public.quotations;

drop function if exists public.delete_order_when_quotation_deleted();
