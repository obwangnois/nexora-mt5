
CREATE TABLE public.positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.broker_accounts(id),
  ticket text NOT NULL CHECK (ticket ~ '^[0-9]{1,20}$'),
  broker_symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('BUY','SELL')),
  volume numeric NOT NULL,
  open_price numeric NOT NULL,
  current_price numeric,
  stop_loss numeric,
  take_profit numeric,
  profit numeric,
  swap numeric,
  magic text,
  comment text,
  origin text NOT NULL CHECK (origin IN ('NEXORA','MANUAL')),
  origin_evidence text NOT NULL,
  order_id uuid REFERENCES public.execution_orders(id),
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','CLOSED')),
  opened_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  close_reason text,
  UNIQUE (account_id, ticket)
);
CREATE INDEX positions_account_state ON public.positions(account_id, state);
GRANT SELECT ON public.positions TO authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own positions read" ON public.positions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin read positions" ON public.positions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.broker_accounts(id),
  position_id uuid REFERENCES public.positions(id),
  ticket text,
  kind text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reconciliation_events_account ON public.reconciliation_events(account_id, created_at DESC);
GRANT SELECT ON public.reconciliation_events TO authenticated;
GRANT ALL ON public.reconciliation_events TO service_role;
ALTER TABLE public.reconciliation_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recon read" ON public.reconciliation_events FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin read recon" ON public.reconciliation_events FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.position_sync_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL UNIQUE REFERENCES public.broker_accounts(id),
  last_seq bigint NOT NULL DEFAULT 0,
  last_snapshot_at timestamptz,
  last_complete_at timestamptz,
  last_status text NOT NULL DEFAULT 'UNKNOWN',
  open_count integer NOT NULL DEFAULT 0
);
GRANT SELECT ON public.position_sync_state TO authenticated;
GRANT ALL ON public.position_sync_state TO service_role;
ALTER TABLE public.position_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sync read" ON public.position_sync_state FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "admin read sync" ON public.position_sync_state FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- Observe → validate → freshness → match → compare → classify → record. Never sends or closes broker orders.
CREATE OR REPLACE FUNCTION public.connector_sync_positions(p_token text, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  t record; acc record; st record; p jsonb; cur record; ord record;
  v_seq bigint := (p_payload->>'seq')::bigint;
  v_complete boolean := COALESCE((p_payload->>'complete')::boolean, false);
  v_connected boolean := COALESCE((p_payload->>'terminal_connected')::boolean, false);
  v_tickets text[] := '{}'; v_tk text; v_origin text; v_evidence text; v_order uuid;
  v_changes int := 0; v_closed int := 0;
BEGIN
  SELECT * INTO t FROM public.connector_tokens WHERE token_hash = encode(digest(p_token,'sha256'),'hex') AND revoked_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'INVALID_TOKEN'); END IF;
  SELECT * INTO acc FROM public.broker_accounts WHERE id = t.account_id;
  IF acc.mt5_login IS DISTINCT FROM p_payload->>'login' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'LOGIN_MISMATCH');
  END IF;
  UPDATE public.connector_tokens SET last_used_at = now() WHERE id = t.id;

  INSERT INTO public.position_sync_state(user_id, account_id) VALUES (t.user_id, t.account_id)
    ON CONFLICT (account_id) DO NOTHING;
  SELECT * INTO st FROM public.position_sync_state WHERE account_id = t.account_id FOR UPDATE;
  IF v_seq IS NULL OR v_seq <= st.last_seq THEN
    RETURN jsonb_build_object('ok', true, 'ignored', 'DUPLICATE_OR_OUT_OF_ORDER');
  END IF;

  -- Incomplete snapshot or disconnected terminal: record, but never infer closures.
  IF NOT v_complete OR NOT v_connected THEN
    UPDATE public.position_sync_state SET last_seq = v_seq, last_snapshot_at = now(), last_status = 'INCOMPLETE' WHERE id = st.id;
    RETURN jsonb_build_object('ok', true, 'status', 'INCOMPLETE');
  END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(COALESCE(p_payload->'positions','[]'::jsonb)) LOOP
    v_tk := p->>'ticket';
    v_tickets := v_tickets || v_tk;
    SELECT * INTO cur FROM public.positions WHERE account_id = t.account_id AND ticket = v_tk;
    IF NOT FOUND THEN
      v_order := NULL; v_origin := 'MANUAL'; v_evidence := 'NO_NEXORA_TAG';
      IF COALESCE(p->>'comment','') LIKE 'NXR:%' THEN
        SELECT id INTO v_order FROM public.execution_orders
          WHERE account_id = t.account_id AND id::text LIKE substr(p->>'comment', 5) || '%'
            AND broker_symbol = p->>'symbol' LIMIT 1;
        IF v_order IS NOT NULL THEN v_origin := 'NEXORA'; v_evidence := 'COMMENT_TAG_MATCHED_ORDER';
        ELSE v_evidence := 'COMMENT_TAG_NO_MATCHING_ORDER'; END IF;
      END IF;
      INSERT INTO public.positions(user_id, account_id, ticket, broker_symbol, direction, volume, open_price, current_price,
        stop_loss, take_profit, profit, swap, magic, comment, origin, origin_evidence, order_id, opened_at)
      VALUES (t.user_id, t.account_id, v_tk, p->>'symbol', p->>'type', (p->>'volume')::numeric, (p->>'price_open')::numeric,
        (p->>'price_current')::numeric, NULLIF((p->>'sl')::numeric,0), NULLIF((p->>'tp')::numeric,0),
        (p->>'profit')::numeric, (p->>'swap')::numeric, p->>'magic', p->>'comment', v_origin, v_evidence, v_order,
        (p->>'time')::timestamptz)
      RETURNING * INTO cur;
      INSERT INTO public.reconciliation_events(user_id, account_id, position_id, ticket, kind, details)
      VALUES (t.user_id, t.account_id, cur.id, v_tk, CASE WHEN v_origin='NEXORA' THEN 'OPENED_LINKED' ELSE 'OPENED_OUTSIDE_NEXORA' END,
        jsonb_build_object('evidence', v_evidence, 'symbol', p->>'symbol', 'volume', p->>'volume'));
      v_changes := v_changes + 1;
    ELSE
      IF cur.state = 'CLOSED' THEN
        INSERT INTO public.reconciliation_events(user_id, account_id, position_id, ticket, kind, details)
        VALUES (t.user_id, t.account_id, cur.id, v_tk, 'REAPPEARED', '{}'::jsonb);
      END IF;
      IF cur.stop_loss IS DISTINCT FROM NULLIF((p->>'sl')::numeric,0) OR cur.take_profit IS DISTINCT FROM NULLIF((p->>'tp')::numeric,0) THEN
        INSERT INTO public.reconciliation_events(user_id, account_id, position_id, ticket, kind, details)
        VALUES (t.user_id, t.account_id, cur.id, v_tk, 'SLTP_CHANGED',
          jsonb_build_object('sl_from', cur.stop_loss, 'sl_to', NULLIF((p->>'sl')::numeric,0), 'tp_from', cur.take_profit, 'tp_to', NULLIF((p->>'tp')::numeric,0)));
        v_changes := v_changes + 1;
      END IF;
      IF cur.volume <> (p->>'volume')::numeric THEN
        INSERT INTO public.reconciliation_events(user_id, account_id, position_id, ticket, kind, details)
        VALUES (t.user_id, t.account_id, cur.id, v_tk, 'VOLUME_CHANGED', jsonb_build_object('from', cur.volume, 'to', (p->>'volume')::numeric));
        v_changes := v_changes + 1;
      END IF;
      UPDATE public.positions SET volume = (p->>'volume')::numeric, current_price = (p->>'price_current')::numeric,
        stop_loss = NULLIF((p->>'sl')::numeric,0), take_profit = NULLIF((p->>'tp')::numeric,0),
        profit = (p->>'profit')::numeric, swap = (p->>'swap')::numeric, last_seen_at = now(),
        state = 'OPEN', closed_at = NULL, close_reason = NULL
      WHERE id = cur.id;
    END IF;
  END LOOP;

  -- Only a complete, connected, in-order snapshot may close positions in the cloud record.
  FOR cur IN SELECT * FROM public.positions WHERE account_id = t.account_id AND state = 'OPEN' AND NOT (ticket = ANY(v_tickets)) LOOP
    UPDATE public.positions SET state = 'CLOSED', closed_at = now(), close_reason = 'NOT_IN_MT5_SNAPSHOT' WHERE id = cur.id;
    INSERT INTO public.reconciliation_events(user_id, account_id, position_id, ticket, kind, details)
    VALUES (t.user_id, t.account_id, cur.id, cur.ticket, 'CLOSED_IN_MT5', jsonb_build_object('last_profit', cur.profit, 'origin', cur.origin));
    v_closed := v_closed + 1;
  END LOOP;

  UPDATE public.position_sync_state SET last_seq = v_seq, last_snapshot_at = now(), last_complete_at = now(),
    last_status = 'COMPLETE', open_count = COALESCE(array_length(v_tickets,1),0) WHERE id = st.id;
  RETURN jsonb_build_object('ok', true, 'status', 'COMPLETE', 'open', COALESCE(array_length(v_tickets,1),0), 'changes', v_changes, 'closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION public.connector_sync_positions(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.connector_sync_positions(text, jsonb) TO service_role;
