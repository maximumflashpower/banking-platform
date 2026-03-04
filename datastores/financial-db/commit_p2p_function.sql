CREATE OR REPLACE FUNCTION commit_p2p(
  source_space UUID,
  target_space UUID,
  p_amount NUMERIC,
  p_currency TEXT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO ledger_postings (space_id, amount, currency)
  VALUES (source_space, -p_amount, p_currency);

  INSERT INTO ledger_postings (space_id, amount, currency)
  VALUES (target_space, p_amount, p_currency);

  IF (
    SELECT SUM(amount) FROM ledger_postings
    WHERE currency = p_currency
      AND space_id IN (source_space, target_space)
  ) != 0 THEN
    RAISE EXCEPTION 'Ledger not balanced';
  END IF;
END;
$$ LANGUAGE plpgsql;