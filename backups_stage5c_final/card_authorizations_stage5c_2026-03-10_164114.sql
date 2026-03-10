--
-- PostgreSQL database dump
--

\restrict asCxMKfpXtmbpwNPnMO1feLsUyTzyFl0EB6tBMJmPT1LWA5vilP7lZSaKdCLCvP

-- Dumped from database version 16.13
-- Dumped by pg_dump version 16.13

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: card_authorizations; Type: TABLE; Schema: public; Owner: app
--

CREATE TABLE public.card_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    space_id uuid NOT NULL,
    provider text NOT NULL,
    provider_auth_id text,
    idempotency_key text NOT NULL,
    amount bigint NOT NULL,
    currency character(3) NOT NULL,
    merchant_name text,
    merchant_mcc text,
    status text DEFAULT 'decisioned'::text NOT NULL,
    decision text NOT NULL,
    decline_reason text,
    risk_status text DEFAULT 'not_requested'::text NOT NULL,
    available_balance_snapshot bigint,
    ledger_hold_id uuid,
    ledger_hold_ref text,
    hold_status text,
    request_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    decisioned_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT card_authorizations_amount_check CHECK ((amount >= 0)),
    CONSTRAINT card_authorizations_decision_check CHECK ((decision = ANY (ARRAY['approve'::text, 'decline'::text]))),
    CONSTRAINT card_authorizations_hold_status_check CHECK (((hold_status IS NULL) OR (hold_status = ANY (ARRAY['active'::text, 'released'::text])))),
    CONSTRAINT card_authorizations_risk_status_check CHECK ((risk_status = ANY (ARRAY['approved'::text, 'declined'::text, 'timeout'::text, 'error'::text, 'not_requested'::text]))),
    CONSTRAINT card_authorizations_status_check CHECK ((status = ANY (ARRAY['received'::text, 'decisioned'::text])))
);


ALTER TABLE public.card_authorizations OWNER TO app;

--
-- Data for Name: card_authorizations; Type: TABLE DATA; Schema: public; Owner: app
--

COPY public.card_authorizations (id, card_id, space_id, provider, provider_auth_id, idempotency_key, amount, currency, merchant_name, merchant_mcc, status, decision, decline_reason, risk_status, available_balance_snapshot, ledger_hold_id, ledger_hold_ref, hold_status, request_payload, decisioned_at, created_at, updated_at) FROM stdin;
eb14e648-399f-4a5a-8f6b-1f6b9f4806b7	41dc3791-c90b-49fd-8d34-247d4cf6151e	3cd1b39f-37d2-405d-aad0-c4758cb95003	processor-x	auth_stage5c_final_001	f3fc12922eeb8b9ebd96737017c0fd4985367e7576379919cb542b79d835902a	1500	USD	ACME STORE	5411	decisioned	approve	\N	approved	500000	\N	\N	\N	{"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "spaceId": null, "currency": "USD", "provider": "processor-x", "rawPayload": {"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "currency": "USD", "provider": "processor-x", "merchantMcc": "5411", "merchantName": "ACME STORE", "providerAuthId": "auth_stage5c_final_001", "providerEventId": "evt_stage5c_final_001"}, "merchantMcc": "5411", "merchantName": "ACME STORE", "idempotencyKey": null, "providerAuthId": "auth_stage5c_final_001", "providerEventId": "evt_stage5c_final_001"}	2026-03-10 14:35:47.249569+00	2026-03-10 14:35:47.249569+00	2026-03-10 14:35:47.249569+00
4fa56d87-23a8-43de-90ca-eac984de7863	41dc3791-c90b-49fd-8d34-247d4cf6151e	3cd1b39f-37d2-405d-aad0-c4758cb95003	processor-x	auth_stage5c_final_003	7b99cc8d85fdde0fbc90aabf9411726ec4a86228fb884a6decb64e31c1f0064b	1500	USD	ACME STORE	5411	decisioned	approve	\N	approved	500000	\N	\N	\N	{"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "spaceId": null, "currency": "USD", "provider": "processor-x", "rawPayload": {"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "currency": "USD", "provider": "processor-x", "merchantMcc": "5411", "merchantName": "ACME STORE", "providerAuthId": "auth_stage5c_final_003", "providerEventId": "evt_stage5c_final_003"}, "merchantMcc": "5411", "merchantName": "ACME STORE", "idempotencyKey": null, "providerAuthId": "auth_stage5c_final_003", "providerEventId": "evt_stage5c_final_003"}	2026-03-10 14:45:36.602229+00	2026-03-10 14:45:36.602229+00	2026-03-10 14:45:36.602229+00
f8fab9f7-a714-4497-8b00-1ed4125ebc07	41dc3791-c90b-49fd-8d34-247d4cf6151e	3cd1b39f-37d2-405d-aad0-c4758cb95003	processor-x	auth_stage5c_final_004	83f32a27af544c0b6705355945f61e3a972c4cc39c8b2aa82c63e3ce308a9511	1500	USD	ACME STORE	5411	decisioned	approve	\N	approved	500000	\N	card_auth:f8fab9f7-a714-4497-8b00-1ed4125ebc07	active	{"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "spaceId": null, "currency": "USD", "provider": "processor-x", "rawPayload": {"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "currency": "USD", "provider": "processor-x", "merchantMcc": "5411", "merchantName": "ACME STORE", "providerAuthId": "auth_stage5c_final_004", "providerEventId": "evt_stage5c_final_004"}, "merchantMcc": "5411", "merchantName": "ACME STORE", "idempotencyKey": null, "providerAuthId": "auth_stage5c_final_004", "providerEventId": "evt_stage5c_final_004"}	2026-03-10 14:50:56.782844+00	2026-03-10 14:50:56.782844+00	2026-03-10 14:50:56.847424+00
ca679994-ae13-4188-b38a-ba3e0608ebf3	41dc3791-c90b-49fd-8d34-247d4cf6151e	3cd1b39f-37d2-405d-aad0-c4758cb95003	processor-x	auth_stage5c_final_005	37a99feeed2b96cfea374d37e20383b979aea40ec631f511c620a98310eea5e2	1500	USD	ACME STORE	5411	decisioned	approve	\N	approved	498500	ae8a1ddb-5b11-43ea-a83b-e8391e50659a	card_auth:ca679994-ae13-4188-b38a-ba3e0608ebf3	active	{"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "spaceId": null, "currency": "USD", "provider": "processor-x", "rawPayload": {"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "currency": "USD", "provider": "processor-x", "merchantMcc": "5411", "merchantName": "ACME STORE", "providerAuthId": "auth_stage5c_final_005", "providerEventId": "evt_stage5c_final_005"}, "merchantMcc": "5411", "merchantName": "ACME STORE", "idempotencyKey": null, "providerAuthId": "auth_stage5c_final_005", "providerEventId": "evt_stage5c_final_005"}	2026-03-10 15:08:00.748108+00	2026-03-10 15:08:00.748108+00	2026-03-10 15:08:00.828972+00
46b5de90-8c27-4afa-9ead-7d0a858d5de5	41dc3791-c90b-49fd-8d34-247d4cf6151e	3cd1b39f-37d2-405d-aad0-c4758cb95003	processor-x	auth_stage5c_final	71250e871329fe5966459281d9fefd43d7b5360550286a307d922d9945d7a925	1500	USD	ACME STORE	5411	decisioned	approve	\N	approved	498500	30b35e9c-0cf5-46c3-ac89-921781b37c3c	card_auth:46b5de90-8c27-4afa-9ead-7d0a858d5de5	active	{"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "spaceId": null, "currency": "USD", "provider": "processor-x", "rawPayload": {"amount": 1500, "cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "currency": "USD", "provider": "processor-x", "merchantMcc": "5411", "merchantName": "ACME STORE", "providerAuthId": "auth_stage5c_final", "providerEventId": "evt_stage5c_final_1773162868"}, "merchantMcc": "5411", "merchantName": "ACME STORE", "idempotencyKey": null, "providerAuthId": "auth_stage5c_final", "providerEventId": "evt_stage5c_final_1773162868"}	2026-03-10 17:14:28.372388+00	2026-03-10 17:14:28.372388+00	2026-03-10 17:14:28.453861+00
\.


--
-- Name: card_authorizations card_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: app
--

ALTER TABLE ONLY public.card_authorizations
    ADD CONSTRAINT card_authorizations_pkey PRIMARY KEY (id);


--
-- Name: idx_card_authorizations_card_id_created_at; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_card_authorizations_card_id_created_at ON public.card_authorizations USING btree (card_id, created_at DESC);


--
-- Name: idx_card_authorizations_created_at; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_card_authorizations_created_at ON public.card_authorizations USING btree (created_at DESC);


--
-- Name: idx_card_authorizations_ledger_hold_id; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_card_authorizations_ledger_hold_id ON public.card_authorizations USING btree (ledger_hold_id);


--
-- Name: idx_card_authorizations_ledger_hold_ref; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_card_authorizations_ledger_hold_ref ON public.card_authorizations USING btree (ledger_hold_ref);


--
-- Name: idx_card_authorizations_space_id_created_at; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_card_authorizations_space_id_created_at ON public.card_authorizations USING btree (space_id, created_at DESC);


--
-- Name: uq_card_authorizations_idempotency_key; Type: INDEX; Schema: public; Owner: app
--

CREATE UNIQUE INDEX uq_card_authorizations_idempotency_key ON public.card_authorizations USING btree (idempotency_key);


--
-- Name: uq_card_authorizations_ledger_hold_ref; Type: INDEX; Schema: public; Owner: app
--

CREATE UNIQUE INDEX uq_card_authorizations_ledger_hold_ref ON public.card_authorizations USING btree (ledger_hold_ref) WHERE (ledger_hold_ref IS NOT NULL);


--
-- Name: uq_card_authorizations_provider_auth; Type: INDEX; Schema: public; Owner: app
--

CREATE UNIQUE INDEX uq_card_authorizations_provider_auth ON public.card_authorizations USING btree (provider, provider_auth_id) WHERE (provider_auth_id IS NOT NULL);


--
-- Name: card_authorizations trg_card_authorizations_updated_at; Type: TRIGGER; Schema: public; Owner: app
--

CREATE TRIGGER trg_card_authorizations_updated_at BEFORE UPDATE ON public.card_authorizations FOR EACH ROW EXECUTE FUNCTION public.set_card_authorizations_updated_at();


--
-- Name: card_authorizations card_authorizations_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: app
--

ALTER TABLE ONLY public.card_authorizations
    ADD CONSTRAINT card_authorizations_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.cards(id);


--
-- PostgreSQL database dump complete
--

\unrestrict asCxMKfpXtmbpwNPnMO1feLsUyTzyFl0EB6tBMJmPT1LWA5vilP7lZSaKdCLCvP

