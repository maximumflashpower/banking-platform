--
-- PostgreSQL database dump
--

\restrict cqKLuseVqePEfJLPK1TalxxCuprRognjZgICz1MSyo8R6JKN8rEFyhNmJ79lxni

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
-- Name: ledger_holds; Type: TABLE; Schema: public; Owner: app
--

CREATE TABLE public.ledger_holds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    space_id uuid NOT NULL,
    hold_ref text NOT NULL,
    external_ref text,
    amount bigint NOT NULL,
    currency character(3) NOT NULL,
    status text NOT NULL,
    reason text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    released_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_holds_amount_check CHECK ((amount > 0)),
    CONSTRAINT ledger_holds_status_check CHECK ((status = ANY (ARRAY['active'::text, 'released'::text])))
);


ALTER TABLE public.ledger_holds OWNER TO app;

--
-- Data for Name: ledger_holds; Type: TABLE DATA; Schema: public; Owner: app
--

COPY public.ledger_holds (id, account_id, space_id, hold_ref, external_ref, amount, currency, status, reason, metadata, released_at, created_at, updated_at) FROM stdin;
58cd92a8-c4bf-46d7-b0ef-a4c754b20d93	09e81c15-2b3c-48e4-846a-4a56c0d7983a	3cd1b39f-37d2-405d-aad0-c4758cb95003	card_auth:f8fab9f7-a714-4497-8b00-1ed4125ebc07	auth_stage5c_final_004	1500	USD	active	card_authorization	{"cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "provider": "processor-x", "providerAuthId": "auth_stage5c_final_004", "authorizationId": "f8fab9f7-a714-4497-8b00-1ed4125ebc07"}	\N	2026-03-10 14:50:56.817908+00	2026-03-10 14:50:56.817908+00
ae8a1ddb-5b11-43ea-a83b-e8391e50659a	09e81c15-2b3c-48e4-846a-4a56c0d7983a	3cd1b39f-37d2-405d-aad0-c4758cb95003	card_auth:ca679994-ae13-4188-b38a-ba3e0608ebf3	auth_stage5c_final_005	1500	USD	released	card_authorization	{"cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "provider": "processor-x", "providerAuthId": "auth_stage5c_final_005", "release_reason": "manual_release", "authorizationId": "ca679994-ae13-4188-b38a-ba3e0608ebf3"}	2026-03-10 15:10:09.480762+00	2026-03-10 15:08:00.795803+00	2026-03-10 15:10:09.480762+00
30b35e9c-0cf5-46c3-ac89-921781b37c3c	09e81c15-2b3c-48e4-846a-4a56c0d7983a	3cd1b39f-37d2-405d-aad0-c4758cb95003	card_auth:46b5de90-8c27-4afa-9ead-7d0a858d5de5	auth_stage5c_final	1500	USD	released	card_authorization	{"cardId": "41dc3791-c90b-49fd-8d34-247d4cf6151e", "provider": "processor-x", "providerAuthId": "auth_stage5c_final", "release_reason": "manual_release", "authorizationId": "46b5de90-8c27-4afa-9ead-7d0a858d5de5"}	2026-03-10 17:14:28.577056+00	2026-03-10 17:14:28.431043+00	2026-03-10 17:14:28.577056+00
\.


--
-- Name: ledger_holds ledger_holds_hold_ref_key; Type: CONSTRAINT; Schema: public; Owner: app
--

ALTER TABLE ONLY public.ledger_holds
    ADD CONSTRAINT ledger_holds_hold_ref_key UNIQUE (hold_ref);


--
-- Name: ledger_holds ledger_holds_pkey; Type: CONSTRAINT; Schema: public; Owner: app
--

ALTER TABLE ONLY public.ledger_holds
    ADD CONSTRAINT ledger_holds_pkey PRIMARY KEY (id);


--
-- Name: idx_ledger_holds_account_id; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_ledger_holds_account_id ON public.ledger_holds USING btree (account_id);


--
-- Name: idx_ledger_holds_account_status; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_ledger_holds_account_status ON public.ledger_holds USING btree (account_id, status);


--
-- Name: idx_ledger_holds_space_id; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_ledger_holds_space_id ON public.ledger_holds USING btree (space_id);


--
-- Name: idx_ledger_holds_status; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_ledger_holds_status ON public.ledger_holds USING btree (status);


--
-- PostgreSQL database dump complete
--

\unrestrict cqKLuseVqePEfJLPK1TalxxCuprRognjZgICz1MSyo8R6JKN8rEFyhNmJ79lxni

