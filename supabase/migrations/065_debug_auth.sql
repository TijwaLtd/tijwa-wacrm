-- Debug function to check auth.uid()
CREATE OR REPLACE FUNCTION debug_auth_uid()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN auth.uid();
END;
$$;

-- Give authenticated users execute permission
GRANT EXECUTE ON FUNCTION debug_auth_uid() TO authenticated;
