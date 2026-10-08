-- Exercise success, duplicate, stale revision and failure rollback in an
-- exception subtransaction. The user's content/versions/receipts stay unchanged.
DO $$
DECLARE original public.sync_state%ROWTYPE; saved_versions bigint; result jsonb;
BEGIN
 SELECT * INTO original FROM public.sync_state WHERE id='main';
 SELECT count(*) INTO saved_versions FROM public.sync_versions;
 BEGIN
  BEGIN
   PERFORM public.focus_matrix_commit('atomic-check','request-check','commit-check',original.revision,original.content,original.marks,original.updated_at,'检查','desktop',NULL,true);
   RAISE EXCEPTION 'Expected log write failure';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
  IF (SELECT revision FROM public.sync_state WHERE id='main')<>original.revision OR (SELECT count(*) FROM public.sync_versions)<>saved_versions THEN RAISE EXCEPTION 'Failure was not rolled back'; END IF;
  result:=public.focus_matrix_commit('atomic-check','request-check','commit-check',original.revision,original.content,original.marks,original.updated_at,'检查','desktop','[]',true);
  IF result->>'committed'<>'true' THEN RAISE EXCEPTION 'Commit failed'; END IF;
  result:=public.focus_matrix_commit('atomic-check','request-check','commit-check',original.revision,original.content,original.marks,original.updated_at,'检查','desktop','[]',true);
  IF result->>'duplicate'<>'true' THEN RAISE EXCEPTION 'Retry is not idempotent'; END IF;
  result:=public.focus_matrix_commit('atomic-other','request-other','commit-other',original.revision,original.content,original.marks,original.updated_at,'检查','desktop','[]',true);
  IF result->>'committed'<>'false' THEN RAISE EXCEPTION 'Stale revision was accepted'; END IF;
  IF (SELECT count(*) FROM public.sync_versions)<>saved_versions+1 THEN RAISE EXCEPTION 'Version was overwritten or duplicated'; END IF;
  RAISE EXCEPTION USING ERRCODE='ZX001',MESSAGE='Tests passed; roll back all test writes';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
 IF (SELECT revision FROM public.sync_state WHERE id='main')<>original.revision OR (SELECT count(*) FROM public.sync_versions)<>saved_versions OR EXISTS(SELECT 1 FROM public.sync_receipts WHERE id='atomic-check') THEN RAISE EXCEPTION 'Test left changes behind'; END IF;
END $$;
