
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "api": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "account_recovery_limit":
{ Args: { "p_bucket_hash": string }; Returns: Json
                           },
"account_recovery_status":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"admin_catalog_page":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: Json
                           },
"admin_commerce_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_complaints":
{ Args: { "p_limit"?: number,"p_page"?: number,"p_search"?: string,"p_status"?: string }; Returns: Json
                           },
"admin_delete_brand":
{ Args: { "p_expected_version": number,"p_id": string }; Returns: undefined
                           },
"admin_delete_coupon":
{ Args: { "p_expected_version": number,"p_id": string }; Returns: undefined
                           },
"admin_delete_olfactory_family":
{ Args: { "p_code": string,"p_expected_version": number }; Returns: undefined
                           },
"admin_delete_product":
{ Args: { "p_expected_version": number,"p_id": string }; Returns: undefined
                           },
"admin_device_list":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_device_register":
{ Args: { "p_label": string,"p_token_hash": string }; Returns: Json
                           },
"admin_device_resume":
{ Args: { "p_token": string }; Returns: Json
                           },
"admin_device_revoke":
{ Args: { "p_device_id": string }; Returns: Json
                           },
"admin_home_document":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_import_products":
{ Args: { "p_records": Json }; Returns: Json
                           },
"admin_media_aliases":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_media_detail":
{ Args: { "p_asset_id": string }; Returns: Json
                           },
"admin_media_library":
{ Args: { "p_page"?: number,"p_page_size"?: number,"p_query"?: string,"p_section"?: string,"p_state"?: string }; Returns: Json
                           },
"admin_media_metadata":
{ Args: { "p_alt": string,"p_asset_id": string,"p_expected_version": number,"p_name": string,"p_section": string }; Returns: Json
                           },
"admin_media_retire":
{ Args: { "p_asset_id": string,"p_expected_version": number }; Returns: Json
                           },
"admin_notifications":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"admin_olfactory_families":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_orders":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: Json
                           },
"admin_push_device":
{ Args: { "p_device_id": string,"p_environment": string }; Returns: Json
                           },
"admin_push_subscribe":
{ Args: { "p_device_id": string,"p_device_label": string,"p_environment": string,"p_subscription": Json }; Returns: Json
                           },
"admin_push_test":
{ Args: { "p_device_id": string,"p_environment": string }; Returns: Json
                           },
"admin_push_unsubscribe":
{ Args: { "p_device_id": string,"p_environment": string }; Returns: Json
                           },
"admin_read_notifications":
{ Args: { "p_all"?: boolean,"p_ids"?: (string)[] }; Returns: Json
                           },
"admin_register_brands":
{ Args: { "p_names": Json }; Returns: Json
                           },
"admin_save_brand":
{ Args: { "p_brand": Json,"p_expected_version"?: number }; Returns: Json
                           },
"admin_save_catalog_settings":
{ Args: { "p_complements_enabled": boolean,"p_expected_version"?: number,"p_featured_brand_id"?: string }; Returns: Json
                           },
"admin_save_coupon":
{ Args: { "p_coupon": Json,"p_expected_version"?: number }; Returns: Json
                           },
"admin_save_features":
{ Args: { "p_complements_enabled": boolean,"p_expected_version": number }; Returns: Json
                           },
"admin_save_home":
{ Args: { "p_complements_enabled": boolean,"p_content": Json,"p_expected_settings_version": number,"p_expected_version": number,"p_featured_brand_id"?: string,"p_media": Json }; Returns: Json
                           },
"admin_save_media_alias":
{ Args: { "p_asset_id": string,"p_expected_version": number,"p_path": string }; Returns: Json
                           },
"admin_save_offer":
{ Args: { "p_expected_version": number,"p_offer": Json,"p_product_id": string }; Returns: Json
                           },
"admin_save_olfactory_family":
{ Args: { "p_active"?: boolean,"p_code"?: string,"p_expected_version"?: number,"p_label": string }; Returns: Json
                           },
"admin_save_order_delivery":
{ Args: { "p_address": Json,"p_alternate_recipient": Json,"p_contact_phone": string,"p_expected_version": number,"p_reference": string }; Returns: Json
                           },
"admin_save_product":
{ Args: { "p_expected_version"?: number,"p_record": Json }; Returns: Json
                           },
"admin_save_shipping":
{ Args: { "p_expected_version": number,"p_shipping": Json }; Returns: Json
                           },
"admin_save_site_media":
{ Args: { "p_alt": string,"p_asset_id": string,"p_expected_version": number,"p_slot": string }; Returns: Json
                           },
"admin_save_site_settings":
{ Args: { "p_data": Json,"p_expected_version": number }; Returns: Json
                           },
"admin_set_order_statuses":
{ Args: { "p_changes": Json,"p_delivery_confirmed": boolean,"p_operation_id": string,"p_source": string,"p_status": string }; Returns: Json
                           },
"admin_set_stock":
{ Args: { "p_expected_version": number,"p_stock": number,"p_variant_id": string }; Returns: Json
                           },
"admin_site_media_document":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"admin_update_complaint":
{ Args: { "p_delivered_at"?: string,"p_delivery_evidence"?: string,"p_expected_version": number,"p_id": string,"p_response"?: string,"p_response_channel"?: string,"p_status": string }; Returns: Json
                           },
"catalog_brand_previews":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"catalog_brands":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"catalog_browse":
{ Args: { "p_page_size"?: number,"p_query"?: Json }; Returns: Json
                           },
"catalog_home_context":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"catalog_olfactory_families":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"catalog_product":
{ Args: { "p_slug": string }; Returns: Json
                           },
"catalog_product_context":
{ Args: { "p_slug": string }; Returns: Json
                           },
"catalog_products":
{ Args: { "p_limit"?: number,"p_offset"?: number }; Returns: Json
                           },
"catalog_products_by_ids":
{ Args: { "p_product_ids"?: (string)[],"p_variant_ids"?: (string)[] }; Returns: Json
                           },
"catalog_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"check_admin_push_delivery":
{ Args: { "p_delivery_id": string,"p_lease_id": string }; Returns: Json
                           },
"checkout_quote":
{ Args: { "p_code"?: string,"p_delivery_method": string,"p_department": string,"p_district": string,"p_lines": Json,"p_province": string }; Returns: Json
                           },
"claim_account_recovery":
{ Args: { "p_claim_id": string,"p_code_hash": string,"p_email": string }; Returns: Json
                           },
"claim_admin_push":
{ Args: { "p_delivery_id"?: string,"p_environment": string,"p_limit"?: number }; Returns: Json
                           },
"commerce_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"consume_email_change_attempt":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"create_complaint":
{ Args: { "p_client_hash": string,"p_input": Json,"p_operation_id": string,"p_receipt_secret": string }; Returns: Json
                           },
"create_simulated_order":
{ Args: { "p_checkout": Json,"p_operation_id": string,"p_tracking_token": string,"p_user_id"?: string }; Returns: Json
                           },
"current_actor":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"customer_favorites":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"customer_orders":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"customer_product_review":
{ Args: { "p_product_id": string }; Returns: Json
                           },
"finish_admin_push":
{ Args: { "p_delivery_id": string,"p_error_code"?: string,"p_http_status"?: number,"p_lease_id": string,"p_result": string,"p_retry_after"?: number }; Returns: Json
                           },
"get_address":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"get_profile":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"home_document":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"media_gc_claim":
{ Args: { "p_limit"?: number }; Returns: Json
                           },
"media_gc_failure":
{ Args: { "p_asset_id": string,"p_claim_id": string,"p_code": string }; Returns: undefined
                           },
"media_gc_finalize":
{ Args: { "p_asset_id": string,"p_claim_id": string }; Returns: undefined
                           },
"media_gc_recheck":
{ Args: { "p_asset_id": string,"p_claim_id": string }; Returns: boolean
                           },
"media_public_asset":
{ Args: { "p_asset_id": string }; Returns: Json
                           },
"media_upload_complete":
{ Args: { "p_actor_id": string,"p_asset_id": string,"p_metadata": Json }; Returns: Json
                           },
"media_upload_complete_svg":
{ Args: { "p_actor_id": string,"p_asset_id": string,"p_manifest": Json }; Returns: Json
                           },
"media_upload_complete_video":
{ Args: { "p_actor_id": string,"p_asset_id": string,"p_manifest": Json }; Returns: Json
                           },
"media_upload_prepare":
{ Args: { "p_actor_id": string,"p_asset_id": string,"p_metadata": Json }; Returns: Json
                           },
"media_upload_prepare_svg":
{ Args: { "p_actor_id": string,"p_asset_id": string,"p_manifest": Json }; Returns: Json
                           },
"media_upload_prepare_video":
{ Args: { "p_actor_id": string,"p_asset_id": string,"p_manifest": Json }; Returns: Json
                           },
"media_upload_reserve":
{ Args: { "p_operation_id": string,"p_purpose": string }; Returns: Json
                           },
"media_upload_status":
{ Args: { "p_operation_id": string }; Returns: Json
                           },
"order_tracking":
{ Args: { "p_reference": string,"p_token"?: string }; Returns: Json
                           },
"product_reviews":
{ Args: { "p_order"?: string,"p_page"?: number,"p_product_id": string,"p_rating"?: number }; Returns: Json
                           },
"public_media_aliases":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"release_account_recovery_claim":
{ Args: { "p_claim_id": string,"p_user_id": string }; Returns: boolean
                           },
"remove_address":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"save_account_recovery_code":
{ Args: { "p_claim_id"?: string,"p_code_hash": string,"p_user_id": string }; Returns: Json
                           },
"save_address":
{ Args: { "p_department": string,"p_district": string,"p_label": string,"p_latitude"?: number,"p_longitude"?: number,"p_province": string,"p_recipient": string,"p_reference"?: string,"p_street": string }; Returns: Json
                           },
"set_customer_favorite":
{ Args: { "p_expected_version": number,"p_product_id": string,"p_selected": boolean }; Returns: Json
                           },
"site_media_document":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"site_settings":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"submit_product_review":
{ Args: { "p_comment": string,"p_product_id": string,"p_rating": number,"p_size_ml"?: number,"p_title": string }; Returns: Json
                           },
"update_profile":
{ Args: { "p_first_name": string,"p_last_name": string,"p_phone": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"app": {
          Tables: {
            "addresses": {
                  Row: {
                    "created_at": string,"department": string,"district": string,"id": string,"label": string,"latitude": number | null,"longitude": number | null,"province": string,"recipient": string,"reference": string,"street": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"department": string,"district": string,"id"?: string,"label": string,"latitude"?: number | null,"longitude"?: number | null,"province": string,"recipient": string,"reference"?: string,"street": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"department"?: string,"district"?: string,"id"?: string,"label"?: string,"latitude"?: number | null,"longitude"?: number | null,"province"?: string,"recipient"?: string,"reference"?: string,"street"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"admin_notifications": {
                  Row: {
                    "created_at": string,"fanned_out": boolean,"id": string,"kind": string,"order_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"fanned_out"?: boolean,"id"?: string,"kind": string,"order_id": string
                  }
                  Update: {
                    "created_at"?: string,"fanned_out"?: boolean,"id"?: string,"kind"?: string,"order_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_notifications_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"brands": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"name_key": string | null,"slug": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name": string,"name_key"?: never,"slug": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"name_key"?: never,"slug"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [

                  ]
                },"commerce_locations": {
                  Row: {
                    "department": string,"department_label": string,"district": string,"district_label": string,"province": string,"province_label": string
                  }
                  ComputedFields: never
                  Insert: {
                    "department": string,"department_label": string,"district": string,"district_label": string,"province": string,"province_label": string
                  }
                  Update: {
                    "department"?: string,"department_label"?: string,"district"?: string,"district_label"?: string,"province"?: string,"province_label"?: string
                  }
                  Relationships: [

                  ]
                },"complaints": {
                  Row: {
                    "delivery_evidence": string,"demonstration": boolean,"id": string,"input": NonNullable<Json>,"input_hash": string,"operation_id": string,"provider": NonNullable<Json>,"receipt_hash": string,"reference": string,"response": string,"response_channel": string,"response_delivered_at": string | null,"status": string,"submitted_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "delivery_evidence"?: string,"demonstration": boolean,"id"?: string,"input": NonNullable<Json>,"input_hash": string,"operation_id": string,"provider": NonNullable<Json>,"receipt_hash": string,"reference": string,"response"?: string,"response_channel"?: string,"response_delivered_at"?: string | null,"status"?: string,"submitted_at"?: string,"version"?: number
                  }
                  Update: {
                    "delivery_evidence"?: string,"demonstration"?: boolean,"id"?: string,"input"?: NonNullable<Json>,"input_hash"?: string,"operation_id"?: string,"provider"?: NonNullable<Json>,"receipt_hash"?: string,"reference"?: string,"response"?: string,"response_channel"?: string,"response_delivered_at"?: string | null,"status"?: string,"submitted_at"?: string,"version"?: number
                  }
                  Relationships: [

                  ]
                },"coupons": {
                  Row: {
                    "code": string,"created_at": string,"discount_type": string,"enabled": boolean,"ends_at": string | null,"id": string,"minimum_cents": number,"starts_at": string | null,"updated_at": string,"usage_limit": number | null,"used": number,"value": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"discount_type": string,"enabled": boolean,"ends_at"?: string | null,"id"?: string,"minimum_cents": number,"starts_at"?: string | null,"updated_at"?: string,"usage_limit"?: number | null,"used"?: number,"value": number,"version"?: number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"discount_type"?: string,"enabled"?: boolean,"ends_at"?: string | null,"id"?: string,"minimum_cents"?: number,"starts_at"?: string | null,"updated_at"?: string,"usage_limit"?: number | null,"used"?: number,"value"?: number,"version"?: number
                  }
                  Relationships: [

                  ]
                },"customer_favorites": {
                  Row: {
                    "created_at": string,"product_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"product_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"product_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_favorites_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "customer_favorites_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "favorite_lists"
      referencedColumns: ["user_id"]
    }
                  ]
                },"favorite_lists": {
                  Row: {
                    "updated_at": string,"user_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "updated_at"?: string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [

                  ]
                },"home_document": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"media": NonNullable<Json>,"singleton": boolean,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"created_at"?: string,"media": NonNullable<Json>,"singleton"?: boolean,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"media"?: NonNullable<Json>,"singleton"?: boolean,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [

                  ]
                },"home_media": {
                  Row: {
                    "media_id": string,"singleton": boolean,"slot": (string)[]
                  }
                  ComputedFields: never
                  Insert: {
                    "media_id": string,"singleton"?: boolean,"slot": (string)[]
                  }
                  Update: {
                    "media_id"?: string,"singleton"?: boolean,"slot"?: (string)[]
                  }
                  Relationships: [
                    {
      foreignKeyName: "home_media_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "home_media_singleton_fkey"
      columns: ["singleton"]
isOneToOne: false
      referencedRelation: "home_document"
      referencedColumns: ["singleton"]
    }
                  ]
                },"media_assets": {
                  Row: {
                    "byte_size": number | null,"created_at": string,"deleted_at": string | null,"deletion_claim_id": string | null,"deletion_lease_until": string | null,"duration_ms": number | null,"height": number | null,"id": string,"mime_type": string | null,"object_key": string | null,"operation_id": string | null,"prepared_metadata": Json | null,"purpose": string | null,"retire_after": string | null,"sha256": string | null,"status": string,"storage_kind": string,"updated_at": string,"uploader_id": string | null,"verified_at": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "byte_size"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"deletion_claim_id"?: string | null,"deletion_lease_until"?: string | null,"duration_ms"?: number | null,"height"?: number | null,"id"?: string,"mime_type"?: string | null,"object_key"?: string | null,"operation_id"?: string | null,"prepared_metadata"?: Json | null,"purpose"?: string | null,"retire_after"?: string | null,"sha256"?: string | null,"status"?: string,"storage_kind"?: string,"updated_at"?: string,"uploader_id"?: string | null,"verified_at"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "byte_size"?: number | null,"created_at"?: string,"deleted_at"?: string | null,"deletion_claim_id"?: string | null,"deletion_lease_until"?: string | null,"duration_ms"?: number | null,"height"?: number | null,"id"?: string,"mime_type"?: string | null,"object_key"?: string | null,"operation_id"?: string | null,"prepared_metadata"?: Json | null,"purpose"?: string | null,"retire_after"?: string | null,"sha256"?: string | null,"status"?: string,"storage_kind"?: string,"updated_at"?: string,"uploader_id"?: string | null,"verified_at"?: string | null,"width"?: number | null
                  }
                  Relationships: [

                  ]
                },"media_builtin_aliases": {
                  Row: {
                    "asset_id": string | null,"height": number,"kind": string,"name": string,"path": string,"section": string,"updated_at": string,"updated_by": string | null,"version": number,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id"?: string | null,"height": number,"kind": string,"name": string,"path": string,"section": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"width": number
                  }
                  Update: {
                    "asset_id"?: string | null,"height"?: number,"kind"?: string,"name"?: string,"path"?: string,"section"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_builtin_aliases_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    }
                  ]
                },"media_library": {
                  Row: {
                    "alt": string,"asset_id": string,"label": string,"search_document": unknown,"section": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string,"asset_id": string,"label": string,"search_document"?: never,"section": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "alt"?: string,"asset_id"?: string,"label"?: string,"search_document"?: never,"section"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_library_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: true
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    }
                  ]
                },"media_renditions": {
                  Row: {
                    "asset_id": string,"byte_size": number,"height": number,"mime_type": string,"object_key": string,"sha256": string,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "asset_id": string,"byte_size": number,"height": number,"mime_type": string,"object_key": string,"sha256": string,"width": number
                  }
                  Update: {
                    "asset_id"?: string,"byte_size"?: number,"height"?: number,"mime_type"?: string,"object_key"?: string,"sha256"?: string,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_renditions_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    }
                  ]
                },"olfactory_families": {
                  Row: {
                    "active": boolean,"aliases": (string)[],"aroma_label": string,"code": string,"label": string,"name_key": string | null,"sort_order": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"aliases"?: (string)[],"aroma_label": string,"code": string,"label": string,"name_key"?: never,"sort_order"?: number,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"aliases"?: (string)[],"aroma_label"?: string,"code"?: string,"label"?: string,"name_key"?: never,"sort_order"?: number,"version"?: number
                  }
                  Relationships: [

                  ]
                },"order_delivery_history": {
                  Row: {
                    "actor_id": string,"changed_at": string,"id": string,"new_delivery": NonNullable<Json>,"order_id": string,"previous_delivery": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"changed_at"?: string,"id"?: string,"new_delivery": NonNullable<Json>,"order_id": string,"previous_delivery": NonNullable<Json>
                  }
                  Update: {
                    "actor_id"?: string,"changed_at"?: string,"id"?: string,"new_delivery"?: NonNullable<Json>,"order_id"?: string,"previous_delivery"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_delivery_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"order_items": {
                  Row: {
                    "brand_name": string,"image_source": string,"media_id": string | null,"merchant_sku": string | null,"ml": number | null,"order_id": string,"original_unit_price_cents": number,"position": number,"product_code": string,"product_id": string | null,"product_name": string,"product_slug": string,"quantity": number,"unit_price_cents": number,"variant_id": string | null,"variant_label": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "brand_name": string,"image_source": string,"media_id"?: string | null,"merchant_sku"?: string | null,"ml"?: number | null,"order_id": string,"original_unit_price_cents": number,"position": number,"product_code": string,"product_id"?: string | null,"product_name": string,"product_slug": string,"quantity": number,"unit_price_cents": number,"variant_id"?: string | null,"variant_label"?: string | null
                  }
                  Update: {
                    "brand_name"?: string,"image_source"?: string,"media_id"?: string | null,"merchant_sku"?: string | null,"ml"?: number | null,"order_id"?: string,"original_unit_price_cents"?: number,"position"?: number,"product_code"?: string,"product_id"?: string | null,"product_name"?: string,"product_slug"?: string,"quantity"?: number,"unit_price_cents"?: number,"variant_id"?: string | null,"variant_label"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_items_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "order_items_variant_id_fkey"
      columns: ["variant_id"]
isOneToOne: false
      referencedRelation: "product_variants"
      referencedColumns: ["id"]
    }
                  ]
                },"order_status_history": {
                  Row: {
                    "actor_id": string,"actor_name": string,"changed_at": string,"from_status": string,"id": string,"operation_id": string,"order_id": string,"source": string,"to_status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"actor_name": string,"changed_at"?: string,"from_status": string,"id"?: string,"operation_id": string,"order_id": string,"source": string,"to_status": string
                  }
                  Update: {
                    "actor_id"?: string,"actor_name"?: string,"changed_at"?: string,"from_status"?: string,"id"?: string,"operation_id"?: string,"order_id"?: string,"source"?: string,"to_status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "order_status_history_order_id_fkey"
      columns: ["order_id"]
isOneToOne: false
      referencedRelation: "orders"
      referencedColumns: ["id"]
    }
                  ]
                },"orders": {
                  Row: {
                    "address_reference": string,"alternate_recipient_dni": string | null,"alternate_recipient_name": string | null,"delivery_method": string,"department": string,"discount_cents": number,"district": string,"email": string,"first_name": string,"id": string,"last_name": string,"mode": string,"operation_id": string,"payment_provider": string,"payment_status": string,"payment_verified_at": string | null,"phone": string,"placed_at": string,"product_discount_cents": number,"promotion_code": string | null,"province": string,"reference": string,"request_hash": string,"shipping_cents": number,"shipping_estimate": string,"simulation": boolean,"status": string,"street": string,"subtotal_cents": number,"total_cents": number,"tracking_hash": string,"updated_at": string,"user_id": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "address_reference"?: string,"alternate_recipient_dni"?: string | null,"alternate_recipient_name"?: string | null,"delivery_method": string,"department": string,"discount_cents": number,"district": string,"email": string,"first_name": string,"id"?: string,"last_name": string,"mode": string,"operation_id": string,"payment_provider"?: string,"payment_status"?: string,"payment_verified_at"?: string | null,"phone": string,"placed_at"?: string,"product_discount_cents": number,"promotion_code"?: string | null,"province": string,"reference": string,"request_hash": string,"shipping_cents": number,"shipping_estimate": string,"simulation"?: boolean,"status"?: string,"street": string,"subtotal_cents": number,"total_cents": number,"tracking_hash": string,"updated_at"?: string,"user_id"?: string | null,"version"?: number
                  }
                  Update: {
                    "address_reference"?: string,"alternate_recipient_dni"?: string | null,"alternate_recipient_name"?: string | null,"delivery_method"?: string,"department"?: string,"discount_cents"?: number,"district"?: string,"email"?: string,"first_name"?: string,"id"?: string,"last_name"?: string,"mode"?: string,"operation_id"?: string,"payment_provider"?: string,"payment_status"?: string,"payment_verified_at"?: string | null,"phone"?: string,"placed_at"?: string,"product_discount_cents"?: number,"promotion_code"?: string | null,"province"?: string,"reference"?: string,"request_hash"?: string,"shipping_cents"?: number,"shipping_estimate"?: string,"simulation"?: boolean,"status"?: string,"street"?: string,"subtotal_cents"?: number,"total_cents"?: number,"tracking_hash"?: string,"updated_at"?: string,"user_id"?: string | null,"version"?: number
                  }
                  Relationships: [

                  ]
                },"product_images": {
                  Row: {
                    "framing": string,"media_id": string,"position": number,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "framing"?: string,"media_id": string,"position": number,"product_id": string
                  }
                  Update: {
                    "framing"?: string,"media_id"?: string,"position"?: number,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_images_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_images_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_notes": {
                  Row: {
                    "label": string,"phase": string,"position": number,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "label": string,"phase": string,"position": number,"product_id": string
                  }
                  Update: {
                    "label"?: string,"phase"?: string,"position"?: number,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_notes_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_offers": {
                  Row: {
                    "created_at": string,"discount_type": string,"enabled": boolean,"ends_at": string | null,"product_id": string,"starts_at": string | null,"updated_at": string,"value": number,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"discount_type": string,"enabled"?: boolean,"ends_at"?: string | null,"product_id": string,"starts_at"?: string | null,"updated_at"?: string,"value": number,"version"?: number
                  }
                  Update: {
                    "created_at"?: string,"discount_type"?: string,"enabled"?: boolean,"ends_at"?: string | null,"product_id"?: string,"starts_at"?: string | null,"updated_at"?: string,"value"?: number,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_offers_product_id_fkey"
      columns: ["product_id"]
isOneToOne: true
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_olfactory_families": {
                  Row: {
                    "family_code": string,"position": number,"product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "family_code": string,"position"?: number,"product_id": string
                  }
                  Update: {
                    "family_code"?: string,"position"?: number,"product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_olfactory_families_family_code_fkey"
      columns: ["family_code"]
isOneToOne: false
      referencedRelation: "olfactory_families"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "product_olfactory_families_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_recommendations": {
                  Row: {
                    "position": number,"product_id": string,"recommended_product_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "position": number,"product_id": string,"recommended_product_id": string
                  }
                  Update: {
                    "position"?: number,"product_id"?: string,"recommended_product_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_recommendations_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "product_recommendations_recommended_product_id_fkey"
      columns: ["recommended_product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_reviews": {
                  Row: {
                    "author_display": string,"comment": string,"created_at": string,"id": string,"product_id": string,"published": boolean,"rating": number,"size_ml": number | null,"title": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_display": string,"comment": string,"created_at"?: string,"id"?: string,"product_id": string,"published"?: boolean,"rating": number,"size_ml"?: number | null,"title": string,"user_id": string
                  }
                  Update: {
                    "author_display"?: string,"comment"?: string,"created_at"?: string,"id"?: string,"product_id"?: string,"published"?: boolean,"rating"?: number,"size_ml"?: number | null,"title"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_reviews_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"product_variants": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"label": string | null,"legacy_id": string | null,"merchant_sku": string | null,"ml": number | null,"presentation_key": string | null,"price_cents": number,"product_id": string,"stock": number,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"label"?: string | null,"legacy_id"?: string | null,"merchant_sku"?: string | null,"ml"?: number | null,"presentation_key"?: never,"price_cents"?: number,"product_id": string,"stock"?: number,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"label"?: string | null,"legacy_id"?: string | null,"merchant_sku"?: string | null,"ml"?: number | null,"presentation_key"?: never,"price_cents"?: number,"product_id"?: string,"stock"?: number,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "product_variants_product_id_fkey"
      columns: ["product_id"]
isOneToOne: false
      referencedRelation: "products"
      referencedColumns: ["id"]
    }
                  ]
                },"products": {
                  Row: {
                    "active": boolean,"aromatic_profile": string,"brand_id": string | null,"created_at": string,"description": string,"display_rank": number,"gender": string | null,"id": string,"intensity_level": number | null,"legacy_id": string | null,"low_stock_threshold": number,"name": string,"newest_rank": number,"occasion": string,"olfactory_media_id": string | null,"product_code": number,"product_type": string,"season": string,"short_description": string,"slug": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"aromatic_profile"?: string,"brand_id"?: string | null,"created_at"?: string,"description": string,"display_rank"?: number,"gender"?: string | null,"id"?: string,"intensity_level"?: number | null,"legacy_id"?: string | null,"low_stock_threshold"?: number,"name": string,"newest_rank"?: number,"occasion"?: string,"olfactory_media_id"?: string | null,"product_code"?: number,"product_type"?: string,"season"?: string,"short_description": string,"slug": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "active"?: boolean,"aromatic_profile"?: string,"brand_id"?: string | null,"created_at"?: string,"description"?: string,"display_rank"?: number,"gender"?: string | null,"id"?: string,"intensity_level"?: number | null,"legacy_id"?: string | null,"low_stock_threshold"?: number,"name"?: string,"newest_rank"?: number,"occasion"?: string,"olfactory_media_id"?: string | null,"product_code"?: number,"product_type"?: string,"season"?: string,"short_description"?: string,"slug"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "products_brand_id_fkey"
      columns: ["brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "products_olfactory_media_id_fkey"
      columns: ["olfactory_media_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"first_name": string,"last_name": string,"phone": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"first_name"?: string,"last_name"?: string,"phone"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"first_name"?: string,"last_name"?: string,"phone"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"shipping_settings": {
                  Row: {
                    "free_threshold_cents": number,"national_courier_fee_cents": number,"national_estimate": string,"province_shipping_enabled": boolean,"singleton": boolean,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "free_threshold_cents": number,"national_courier_fee_cents": number,"national_estimate": string,"province_shipping_enabled"?: boolean,"singleton"?: boolean,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "free_threshold_cents"?: number,"national_courier_fee_cents"?: number,"national_estimate"?: string,"province_shipping_enabled"?: boolean,"singleton"?: boolean,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [

                  ]
                },"shipping_zones": {
                  Row: {
                    "active": boolean,"courier_fee_cents": number,"department": string,"district": string | null,"estimate": string,"id": string,"motorizado_fee_cents": number | null,"name": string,"province": string | null,"singleton": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "active": boolean,"courier_fee_cents": number,"department": string,"district"?: string | null,"estimate": string,"id": string,"motorizado_fee_cents"?: number | null,"name": string,"province"?: string | null,"singleton"?: boolean
                  }
                  Update: {
                    "active"?: boolean,"courier_fee_cents"?: number,"department"?: string,"district"?: string | null,"estimate"?: string,"id"?: string,"motorizado_fee_cents"?: number | null,"name"?: string,"province"?: string | null,"singleton"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "shipping_zones_singleton_fkey"
      columns: ["singleton"]
isOneToOne: false
      referencedRelation: "shipping_settings"
      referencedColumns: ["singleton"]
    }
                  ]
                },"site_media_slots": {
                  Row: {
                    "alt": string,"asset_id": string | null,"slot": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string,"asset_id"?: string | null,"slot": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "alt"?: string,"asset_id"?: string | null,"slot"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_media_slots_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "media_assets"
      referencedColumns: ["id"]
    }
                  ]
                },"site_settings": {
                  Row: {
                    "data": NonNullable<Json>,"singleton": boolean,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "data": NonNullable<Json>,"singleton"?: boolean,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "data"?: NonNullable<Json>,"singleton"?: boolean,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [

                  ]
                },"store_settings": {
                  Row: {
                    "complements_enabled": boolean,"created_at": string,"featured_brand_id": string | null,"singleton": boolean,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "complements_enabled"?: boolean,"created_at"?: string,"featured_brand_id"?: string | null,"singleton"?: boolean,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "complements_enabled"?: boolean,"created_at"?: string,"featured_brand_id"?: string | null,"singleton"?: boolean,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "store_settings_featured_brand_id_fkey"
      columns: ["featured_brand_id"]
isOneToOne: false
      referencedRelation: "brands"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"private": {
          Tables: {
            "account_recovery_codes": {
                  Row: {
                    "claim_id": string | null,"code_hash": string,"consumed_at": string | null,"created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "claim_id"?: string | null,"code_hash": string,"consumed_at"?: string | null,"created_at"?: string,"user_id": string
                  }
                  Update: {
                    "claim_id"?: string | null,"code_hash"?: string,"consumed_at"?: string | null,"created_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"account_recovery_limits": {
                  Row: {
                    "attempt_count": number,"bucket_hash": string,"window_started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count": number,"bucket_hash": string,"window_started_at": string
                  }
                  Update: {
                    "attempt_count"?: number,"bucket_hash"?: string,"window_started_at"?: string
                  }
                  Relationships: [

                  ]
                },"admin_memberships": {
                  Row: {
                    "active": boolean,"granted_at": string,"granted_by": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"granted_at"?: string,"granted_by"?: string | null,"user_id": string
                  }
                  Update: {
                    "active"?: boolean,"granted_at"?: string,"granted_by"?: string | null,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"admin_notification_reads": {
                  Row: {
                    "notification_id": string,"read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "notification_id": string,"read_at"?: string,"user_id": string
                  }
                  Update: {
                    "notification_id"?: string,"read_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"admin_push_deliveries": {
                  Row: {
                    "accepted_at": string | null,"attempts": number,"created_at": string,"expires_at": string,"id": string,"kind": string,"last_error_code": string | null,"last_http_status": number | null,"lease_id": string | null,"lease_subscription_version": number | null,"lease_until": string | null,"next_attempt_at": string,"notification_id": string | null,"status": string,"subscription_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"attempts"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind": string,"last_error_code"?: string | null,"last_http_status"?: number | null,"lease_id"?: string | null,"lease_subscription_version"?: number | null,"lease_until"?: string | null,"next_attempt_at"?: string,"notification_id"?: string | null,"status"?: string,"subscription_id": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"attempts"?: number,"created_at"?: string,"expires_at"?: string,"id"?: string,"kind"?: string,"last_error_code"?: string | null,"last_http_status"?: number | null,"lease_id"?: string | null,"lease_subscription_version"?: number | null,"lease_until"?: string | null,"next_attempt_at"?: string,"notification_id"?: string | null,"status"?: string,"subscription_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_push_deliveries_subscription_id_fkey"
      columns: ["subscription_id"]
isOneToOne: false
      referencedRelation: "admin_push_subscriptions"
      referencedColumns: ["id"]
    }
                  ]
                },"admin_push_subscriptions": {
                  Row: {
                    "auth": string,"created_at": string,"device_id": string,"device_label": string,"enabled": boolean,"enabled_at": string,"endpoint": string,"endpoint_hash": string,"environment": string,"id": string,"last_error_code": string | null,"last_test_at": string | null,"p256dh": string,"updated_at": string,"user_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "auth": string,"created_at"?: string,"device_id": string,"device_label": string,"enabled"?: boolean,"enabled_at"?: string,"endpoint": string,"endpoint_hash": string,"environment": string,"id"?: string,"last_error_code"?: string | null,"last_test_at"?: string | null,"p256dh": string,"updated_at"?: string,"user_id": string,"version"?: number
                  }
                  Update: {
                    "auth"?: string,"created_at"?: string,"device_id"?: string,"device_label"?: string,"enabled"?: boolean,"enabled_at"?: string,"endpoint"?: string,"endpoint_hash"?: string,"environment"?: string,"id"?: string,"last_error_code"?: string | null,"last_test_at"?: string | null,"p256dh"?: string,"updated_at"?: string,"user_id"?: string,"version"?: number
                  }
                  Relationships: [

                  ]
                },"admin_trusted_device_limits": {
                  Row: {
                    "action": string,"attempt_count": number,"user_id": string,"window_started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"attempt_count": number,"user_id": string,"window_started_at": string
                  }
                  Update: {
                    "action"?: string,"attempt_count"?: number,"user_id"?: string,"window_started_at"?: string
                  }
                  Relationships: [

                  ]
                },"admin_trusted_devices": {
                  Row: {
                    "created_at": string,"created_by": string,"credential_hash": string,"expires_at": string,"factor_id": string,"id": string,"label": string,"last_used_at": string | null,"revoke_reason": string | null,"revoked_at": string | null,"revoked_by": string | null,"token_hash": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at": string,"created_by": string,"credential_hash": string,"expires_at": string,"factor_id": string,"id"?: string,"label": string,"last_used_at"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"token_hash": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"credential_hash"?: string,"expires_at"?: string,"factor_id"?: string,"id"?: string,"label"?: string,"last_used_at"?: string | null,"revoke_reason"?: string | null,"revoked_at"?: string | null,"revoked_by"?: string | null,"token_hash"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"admin_trusted_sessions": {
                  Row: {
                    "authorized_by_resume": boolean,"created_at": string,"device_id": string,"expires_at": string,"session_id": string,"user_id": string,"verified_claims_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "authorized_by_resume"?: boolean,"created_at": string,"device_id": string,"expires_at": string,"session_id": string,"user_id": string,"verified_claims_hash": string
                  }
                  Update: {
                    "authorized_by_resume"?: boolean,"created_at"?: string,"device_id"?: string,"expires_at"?: string,"session_id"?: string,"user_id"?: string,"verified_claims_hash"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "admin_trusted_sessions_device_id_fkey"
      columns: ["device_id"]
isOneToOne: false
      referencedRelation: "admin_trusted_devices"
      referencedColumns: ["id"]
    }
                  ]
                },"auth_email_change_attempts": {
                  Row: {
                    "attempt_count": number,"user_id": string,"window_started_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempt_count": number,"user_id": string,"window_started_at": string
                  }
                  Update: {
                    "attempt_count"?: number,"user_id"?: string,"window_started_at"?: string
                  }
                  Relationships: [

                  ]
                },"complaint_history": {
                  Row: {
                    "actor_id": string | null,"changed_at": string,"complaint_id": string,"id": number,"next_status": string,"previous_status": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"changed_at"?: string,"complaint_id": string,"id"?: never,"next_status": string,"previous_status"?: string | null
                  }
                  Update: {
                    "actor_id"?: string | null,"changed_at"?: string,"complaint_id"?: string,"id"?: never,"next_status"?: string,"previous_status"?: string | null
                  }
                  Relationships: [

                  ]
                },"complaint_limits": {
                  Row: {
                    "attempts": number,"identifier": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts": number,"identifier": string,"window_start": string
                  }
                  Update: {
                    "attempts"?: number,"identifier"?: string,"window_start"?: string
                  }
                  Relationships: [

                  ]
                },"media_lifecycle_events": {
                  Row: {
                    "actor_id": string | null,"asset_id": string,"claim_id": string | null,"code": string | null,"event_type": string,"id": number,"occurred_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"asset_id": string,"claim_id"?: string | null,"code"?: string | null,"event_type": string,"id"?: never,"occurred_at"?: string
                  }
                  Update: {
                    "actor_id"?: string | null,"asset_id"?: string,"claim_id"?: string | null,"code"?: string | null,"event_type"?: string,"id"?: never,"occurred_at"?: string
                  }
                  Relationships: [

                  ]
                },"media_upload_limits": {
                  Row: {
                    "attempts": number,"user_id": string,"window_start": string
                  }
                  ComputedFields: never
                  Insert: {
                    "attempts": number,"user_id": string,"window_start": string
                  }
                  Update: {
                    "attempts"?: number,"user_id"?: string,"window_start"?: string
                  }
                  Relationships: [

                  ]
                },"order_status_operations": {
                  Row: {
                    "actor_id": string,"created_at": string,"operation_id": string,"request_hash": string,"result": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id": string,"created_at"?: string,"operation_id": string,"request_hash": string,"result": NonNullable<Json>
                  }
                  Update: {
                    "actor_id"?: string,"created_at"?: string,"operation_id"?: string,"request_hash"?: string,"result"?: NonNullable<Json>
                  }
                  Relationships: [

                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_device_rate":
{ Args: { "p_action": string,"p_user_id": string }; Returns: boolean
                           },
"admin_device_session":
{ Args: Record<PropertyKey, never>; Returns: {
              "assurance": string,"credential_hash": string,"factor_id": string,"password_verified": boolean,"session_id": string,"totp_recent": boolean,"user_id": string,"verified_claims_hash": string
            }[]
                           },
"admin_device_trusted_until":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"admin_product_document":
{ Args: { "p_product_id": string }; Returns: Json
                           },
"catalog_flush_constraints":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"catalog_name_key":
{ Args: { "p_value": string }; Returns: string
                           },
"catalog_next_variant_sku":
{ Args: { "p_reserved": Json }; Returns: string
                           },
"catalog_prepare_variant_skus":
{ Args: { "p_records": Json }; Returns: Json
                           },
"catalog_price_cents":
{ Args: { "p_at": string,"p_enabled": boolean,"p_ends_at": string,"p_price": number,"p_starts_at": string,"p_type": string,"p_value": number }; Returns: number
                           },
"catalog_product_document":
{ Args: { "p_product_id": string }; Returns: Json
                           },
"catalog_product_is_published":
{ Args: { "p_product": Omit<Database["app"]['Tables']["products"]['Row'], Database["app"]['Tables']["products"]['ComputedFields']> }; Returns: boolean
                           },
"catalog_public_document":
{ Args: { "p_product_id": string }; Returns: Json
                           },
"catalog_ready_image":
{ Args: { "p_reference": string }; Returns: string
                           },
"catalog_ready_image_for":
{ Args: { "p_purpose": string,"p_reference": string }; Returns: string
                           },
"catalog_sales_units":
{ Args: Record<PropertyKey, never>; Returns: {
              "product_id": string,"units": number
            }[]
                           },
"catalog_save_product_prepared":
{ Args: { "p_expected_version": number,"p_import_prepared": boolean,"p_record": Json }; Returns: Json
                           },
"catalog_validate_family_selection":
{ Args: { "p_codes": Json,"p_product_id": string }; Returns: undefined
                           },
"catalog_validate_product":
{ Args: { "p_product_id": string }; Returns: undefined
                           },
"catalog_write_offer":
{ Args: { "p_offer": Json,"p_product_id": string }; Returns: undefined
                           },
"commerce_capital":
{ Args: { "p_department": string,"p_province": string }; Returns: boolean
                           },
"commerce_hash":
{ Args: { "p_value": string }; Returns: string
                           },
"commerce_integer":
{ Args: { "p_max": number,"p_min"?: number,"p_value": Json }; Returns: number
                           },
"commerce_location":
{ Args: { "p_department": string,"p_district": string,"p_province": string }; Returns: boolean
                           },
"commerce_text":
{ Args: { "p_max": number,"p_min"?: number,"p_value": Json }; Returns: string
                           },
"complaint_document":
{ Args: { "p_history"?: boolean,"p_id": string }; Returns: Json
                           },
"complaint_text":
{ Args: { "p_empty"?: boolean,"p_max": number,"p_value": Json }; Returns: string
                           },
"coupon_document":
{ Args: { "p_id": string }; Returns: Json
                           },
"coupon_quote":
{ Args: { "p_code": string,"p_has_offers": boolean,"p_subtotal": number }; Returns: Json
                           },
"current_user_membership":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"favorite_product_is_published":
{ Args: { "p_product_id": string }; Returns: boolean
                           },
"hero_upgrade":
{ Args: { "p_hero": Json }; Returns: Json
                           },
"hero_validate":
{ Args: { "p_hero": Json }; Returns: undefined
                           },
"home_document_projection":
{ Args: { "p_admin"?: boolean }; Returns: Json
                           },
"home_object":
{ Args: { "p_optional"?: (string)[],"p_required": (string)[],"p_value": Json }; Returns: undefined
                           },
"home_reference":
{ Args: { "p_value": Json }; Returns: string
                           },
"home_references":
{ Args: { "p_content": Json,"p_media": Json }; Returns: {
              "media_id": string,"purpose": string,"slot": (string)[]
            }[]
                           },
"home_stable_key":
{ Args: { "p_key": string }; Returns: boolean
                           },
"home_text":
{ Args: { "p_empty"?: boolean,"p_lines"?: number,"p_max": number,"p_value": Json }; Returns: undefined
                           },
"home_validate":
{ Args: { "p_content": Json,"p_media": Json }; Returns: undefined
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"media_default_label":
{ Args: { "p_id": string,"p_purpose": string }; Returns: string
                           },
"media_default_section":
{ Args: { "p_purpose": string }; Returns: string
                           },
"media_document":
{ Args: { "p_id": string }; Returns: Json
                           },
"media_has_references":
{ Args: { "p_id": string }; Returns: boolean
                           },
"media_image_dimensions_valid":
{ Args: { "p_height": number,"p_purpose": string,"p_width": number }; Returns: boolean
                           },
"media_library_json":
{ Args: { "p_library": Omit<Database["app"]['Tables']["media_library"]['Row'], Database["app"]['Tables']["media_library"]['ComputedFields']>,"p_media": Omit<Database["app"]['Tables']["media_assets"]['Row'], Database["app"]['Tables']["media_assets"]['ComputedFields']>,"p_uses": number,"p_variants": Json }; Returns: Json
                           },
"media_library_record":
{ Args: { "p_id": string }; Returns: Json
                           },
"media_placement_compatible":
{ Args: { "p_height": number,"p_mime": string,"p_purpose": string,"p_width": number }; Returns: boolean
                           },
"media_source":
{ Args: { "p_key": string,"p_storage": string }; Returns: string
                           },
"media_usages":
{ Args: { "p_ids"?: (string)[] }; Returns: {
              "asset_id": string,"key": string,"label": string,"section": string
            }[]
                           },
"olfactory_aliases_valid":
{ Args: { "p_values": (string)[] }; Returns: boolean
                           },
"olfactory_family_document":
{ Args: { "p_admin"?: boolean,"p_code": string }; Returns: Json
                           },
"olfactory_slug":
{ Args: { "p_value": string }; Returns: string
                           },
"order_document":
{ Args: { "p_id": string }; Returns: Json
                           },
"order_history_document":
{ Args: { "p_ids": (string)[] }; Returns: Json
                           },
"order_lines_document":
{ Args: { "p_id": string }; Returns: Json
                           },
"push_validate_environment":
{ Args: { "p_environment": string }; Returns: undefined
                           },
"request_assurance":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"request_user_id":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"require_catalog_admin":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"review_content_allowed":
{ Args: { "p_text": string }; Returns: boolean
                           },
"review_document":
{ Args: { "p_review": Omit<Database["app"]['Tables']["product_reviews"]['Row'], Database["app"]['Tables']["product_reviews"]['ComputedFields']> }; Returns: Json
                           },
"review_size_available":
{ Args: { "p_product_id": string,"p_size": number }; Returns: boolean
                           },
"shipping_document":
{ Args: { "p_admin"?: boolean }; Returns: Json
                           },
"shipping_quote":
{ Args: { "p_department": string,"p_district": string,"p_method": string,"p_province": string,"p_subtotal": number }; Returns: Json
                           },
"site_image_compatible":
{ Args: { "p_height": number,"p_mime": string,"p_slot": string,"p_width": number }; Returns: boolean
                           },
"site_media_projection":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"validate_complaint":
{ Args: { "p_input": Json }; Returns: undefined
                           },
"validate_site_settings":
{ Args: { "p_data": Json }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "api": {
          Enums: {

          }
        },"app": {
          Enums: {

          }
        },"private": {
          Enums: {

          }
        },"public": {
          Enums: {

          }
        }
} as const
