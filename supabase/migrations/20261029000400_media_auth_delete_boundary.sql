-- Deleting an Auth identity clears uploader_id through its FK. That bookkeeping
-- change must not queue a catalog-validation trigger under the restricted Auth
-- role. All fields that could affect a product image still validate normally.
drop trigger catalog_media_valid on app.media_assets;
create constraint trigger catalog_media_valid
after update on app.media_assets deferrable initially deferred
for each row when (
  (old.storage_kind, old.object_key, old.mime_type, old.width, old.height,
   old.status, old.verified_at) is distinct from
  (new.storage_kind, new.object_key, new.mime_type, new.width, new.height,
   new.status, new.verified_at)
)
execute function private.catalog_validate_change();
