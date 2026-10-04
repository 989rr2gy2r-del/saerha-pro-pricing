-- Security hardening: the legacy bulk-import helper is not used by the current app.
-- Keep the function available for controlled backend use, but do not expose it
-- through the PostgREST RPC surface to public or signed-in browser clients.
REVOKE EXECUTE ON FUNCTION public.saerha_import_products_batch(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.saerha_import_products_batch(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.saerha_import_products_batch(jsonb) FROM authenticated;
