-- Grant platform-wide read-only admin oversight.
-- This does not remove the user's existing OWNER role.

INSERT INTO public.user_roles (user_id, role)
VALUES ('ddb25aa0-9512-4bf5-b902-63a3a9cca047', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
