BEGIN;

-- Roles
INSERT INTO business_roles(role, description) VALUES
  ('OWNER_PRIMARY', 'Primary business owner (full control)'),
  ('OWNER', 'Business owner'),
  ('ADMIN', 'Business admin'),
  ('FINANCE_APPROVER', 'Can approve finance-related actions (future)'),
  ('EMPLOYEE', 'Standard business member')
ON CONFLICT (role) DO UPDATE
  SET description = EXCLUDED.description;

-- Seed example
INSERT INTO businesses(business_id, legal_name, status, created_at)
VALUES ('55555555-5555-5555-5555-555555555555', 'ACME Inc', 'draft', now())
ON CONFLICT (business_id) DO NOTHING;

-- Primary owner
INSERT INTO business_owners(id, business_id, user_id, owner_type, status, created_at)
VALUES (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'primary', 'active', now())
ON CONFLICT DO NOTHING;

-- Admin member
INSERT INTO business_members(id, business_id, user_id, role, status, created_at)
VALUES (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'ADMIN', 'active', now())
ON CONFLICT DO NOTHING;

-- RBAC bindings (source of truth)
INSERT INTO business_role_bindings(id, business_id, user_id, role, created_at)
VALUES
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'OWNER_PRIMARY', now()),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'ADMIN', now())
ON CONFLICT DO NOTHING;

-- Audit seed
INSERT INTO audit_events(event_id, actor_user_id, event_type, entity_type, entity_id, payload, created_at)
VALUES (
  gen_random_uuid(),
  'system',
  'BUSINESS_SEEDED',
  'business',
  '55555555-5555-5555-5555-555555555555',
  jsonb_build_object('legal_name','ACME Inc'),
  now()
)
ON CONFLICT DO NOTHING;

COMMIT;