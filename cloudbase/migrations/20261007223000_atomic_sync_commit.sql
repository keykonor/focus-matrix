-- One RPC transaction commits content, immutable version, edit log and receipt.
CREATE OR REPLACE FUNCTION public.focus_matrix_commit(
 p_receipt_id text, p_request_id text, p_commit_id text,
 p_expected_revision bigint, p_content text, p_marks text, p_updated_at bigint,
 p_actor text, p_source text, p_changes text, p_changed boolean
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public AS $$
DECLARE current_revision bigint; next_revision bigint;
BEGIN
 SELECT revision INTO current_revision FROM public.sync_state WHERE id='main' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sync state is missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.sync_receipts WHERE id=p_receipt_id AND request_id=p_request_id) THEN
  RETURN jsonb_build_object('committed',true,'duplicate',true);
 END IF;
 IF current_revision<>p_expected_revision THEN RETURN jsonb_build_object('committed',false); END IF;
 next_revision:=current_revision;
 IF p_changed THEN
  next_revision:=current_revision+1;
  UPDATE public.sync_state SET content=p_content,revision=next_revision,updated_at=p_updated_at,marks=p_marks,last_commit=p_commit_id WHERE id='main';
  INSERT INTO public.sync_versions(revision,content,updated_at) VALUES(next_revision,p_content,p_updated_at);
  INSERT INTO public.sync_changes(id,revision,actor,source,"at",changes) VALUES(p_commit_id,next_revision,p_actor,p_source,p_updated_at,p_changes);
  UPDATE public.shared_plans SET content=p_content,updated_at=p_updated_at WHERE id='main';
 END IF;
 INSERT INTO public.sync_receipts(id,request_id,revision) VALUES(p_receipt_id,p_request_id,next_revision)
 ON CONFLICT(id) DO UPDATE SET request_id=EXCLUDED.request_id,revision=EXCLUDED.revision;
 RETURN jsonb_build_object('committed',true,'duplicate',false);
END $$;
REVOKE ALL ON FUNCTION public.focus_matrix_commit(text,text,text,bigint,text,text,bigint,text,text,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.focus_matrix_commit(text,text,text,bigint,text,text,bigint,text,text,text,boolean) TO service_role;
NOTIFY pgrst, 'reload schema';
