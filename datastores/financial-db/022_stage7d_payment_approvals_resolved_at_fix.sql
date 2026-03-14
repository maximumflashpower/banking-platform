CREATE OR REPLACE FUNCTION payment_approvals_recompute_and_resolve(p_approval_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_approval record;
  v_approvals_count integer := 0;
  v_rejections_count integer := 0;
BEGIN
  SELECT
    pa.id,
    pa.status,
    pa.required_approvals,
    pa.rejection_mode
  INTO v_approval
  FROM payment_approvals pa
  WHERE pa.id = p_approval_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE v.vote = 'approve'),
    COUNT(*) FILTER (WHERE v.vote = 'reject')
  INTO v_approvals_count, v_rejections_count
  FROM payment_approval_votes v
  WHERE v.approval_id = p_approval_id;

  UPDATE payment_approvals
  SET
    approvals_count = COALESCE(v_approvals_count, 0),
    rejections_count = COALESCE(v_rejections_count, 0),
    updated_at = now()
  WHERE id = p_approval_id;

  IF COALESCE(v_approvals_count, 0) >= v_approval.required_approvals THEN
    UPDATE payment_approvals
    SET status='approved', resolved_at=now()
    WHERE id = p_approval_id
      AND status='pending';
    RETURN;
  END IF;

  IF v_approval.rejection_mode = 'any' AND COALESCE(v_rejections_count, 0) > 0 THEN
    UPDATE payment_approvals
    SET status='rejected', resolved_at=now(), resolution_reason='rejected_by_any'
    WHERE id = p_approval_id
      AND status='pending';
    RETURN;
  END IF;

  IF v_approval.rejection_mode = 'majority' AND COALESCE(v_rejections_count, 0) >= v_approval.required_approvals THEN
    UPDATE payment_approvals
    SET status='rejected', resolved_at=now(), resolution_reason='rejected_by_majority'
    WHERE id = p_approval_id
      AND status='pending';
    RETURN;
  END IF;

  UPDATE payment_approvals
  SET resolved_at = NULL
  WHERE id = p_approval_id
    AND status = 'pending';
END;
$$;