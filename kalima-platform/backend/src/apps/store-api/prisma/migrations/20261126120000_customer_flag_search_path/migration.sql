-- The customer-level triggers (20261124100000_platform_changes) read "users"
-- without a schema, so an insert from a connection whose search_path is not
-- the app schema fails with "relation users does not exist" and no order or
-- e-booklet order can be placed. Pin each function to the schema it lives in
-- (the one this migration runs in). Safe to run again.

ALTER FUNCTION "set_purchase_customer_flag"() SET search_path FROM CURRENT;
ALTER FUNCTION "set_e_booklet_purchase_customer_flag"() SET search_path FROM CURRENT;
