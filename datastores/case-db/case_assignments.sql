create table if not exists case_assignments (
  id uuid primary key,
  case_id uuid not null references cases(id) on delete cascade,

  assignee_type varchar(32) not null check (
    assignee_type in ('user', 'queue', 'team')
  ),
  assignee_id varchar(128) not null,

  assigned_by uuid not null,
  assigned_reason varchar(256) null,

  active boolean not null default true,

  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz null,

  idempotency_key varchar(128) not null,
  correlation_id varchar(128) null,
  request_id varchar(128) null,

  created_at timestamptz not null default now(),

  constraint uq_case_assignments_idempotency unique (idempotency_key),

  constraint chk_case_assignments_active_window check (
    (active = true and unassigned_at is null)
    or
    (active = false and unassigned_at is not null)
  )
);

create unique index if not exists uq_case_assignments_one_active
  on case_assignments (case_id)
  where active = true;

create index if not exists idx_case_assignments_assignee
  on case_assignments (assignee_type, assignee_id, active, assigned_at desc);

create index if not exists idx_case_assignments_case_history
  on case_assignments (case_id, assigned_at desc);

alter table cases
  drop constraint if exists fk_cases_current_assignment;

alter table cases
  add constraint fk_cases_current_assignment
  foreign key (current_assignment_id)
  references case_assignments(id);
