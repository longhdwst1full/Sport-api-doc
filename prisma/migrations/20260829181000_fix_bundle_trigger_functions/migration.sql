DROP TRIGGER "bundle_items_not_nested" ON "bundle_items";
DROP TRIGGER "product_bundles_not_nested" ON "product_bundles";
DROP FUNCTION "validate_bundle_not_nested"();

CREATE FUNCTION "validate_bundle_item_not_nested"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_bundles pb
    WHERE pb.bundle_variant_id = NEW.component_variant_id
  ) THEN
    RAISE EXCEPTION 'nested bundles are not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION "validate_bundle_variant_not_component"() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bundle_items bi
    WHERE bi.component_variant_id = NEW.bundle_variant_id
  ) THEN
    RAISE EXCEPTION 'nested bundles are not allowed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "bundle_items_not_nested"
BEFORE INSERT OR UPDATE ON "bundle_items"
FOR EACH ROW EXECUTE FUNCTION "validate_bundle_item_not_nested"();

CREATE TRIGGER "product_bundles_not_nested"
BEFORE INSERT OR UPDATE ON "product_bundles"
FOR EACH ROW EXECUTE FUNCTION "validate_bundle_variant_not_component"();
