--
-- PostgreSQL database dump
--

\restrict 8De5UGsZ7ddKWrOaWc8J6mzSRZhR1SR2SnmfII5SPszBEGwSK26KrhKypsbeqYX

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
-- Name: ledger_postings; Type: TABLE; Schema: public; Owner: app
--

CREATE TABLE public.ledger_postings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    space_id uuid NOT NULL,
    journal_entry_id uuid NOT NULL,
    account_id uuid NOT NULL,
    direction text NOT NULL,
    amount_minor bigint NOT NULL,
    currency character(3) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ledger_postings_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT ledger_postings_direction_check CHECK ((direction = ANY (ARRAY['DEBIT'::text, 'CREDIT'::text])))
);


ALTER TABLE public.ledger_postings OWNER TO app;

--
-- Data for Name: ledger_postings; Type: TABLE DATA; Schema: public; Owner: app
--

COPY public.ledger_postings (id, space_id, journal_entry_id, account_id, direction, amount_minor, currency, created_at) FROM stdin;
15fd7a24-0582-4e63-a50e-d80388855e42	3cd1b39f-37d2-405d-aad0-c4758cb95003	324037fa-b98d-4bba-9be6-0c2f04e303b6	09e81c15-2b3c-48e4-846a-4a56c0d7983a	DEBIT	500000	USD	2026-03-10 14:34:04.64301+00
29b597f1-ef9a-4486-b6a4-a34eab6f887b	3cd1b39f-37d2-405d-aad0-c4758cb95003	324037fa-b98d-4bba-9be6-0c2f04e303b6	775fd388-ed9c-4cd9-a0fa-a660c587a727	CREDIT	500000	USD	2026-03-10 14:34:04.64301+00
\.


--
-- Name: ledger_postings ledger_postings_pkey; Type: CONSTRAINT; Schema: public; Owner: app
--

ALTER TABLE ONLY public.ledger_postings
    ADD CONSTRAINT ledger_postings_pkey PRIMARY KEY (id);


--
-- Name: idx_ledger_postings_je; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_ledger_postings_je ON public.ledger_postings USING btree (journal_entry_id);


--
-- Name: idx_ledger_postings_space_account; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_ledger_postings_space_account ON public.ledger_postings USING btree (space_id, account_id);


--
-- Name: idx_ledger_postings_space_currency; Type: INDEX; Schema: public; Owner: app
--

CREATE INDEX idx_ledger_postings_space_currency ON public.ledger_postings USING btree (space_id, currency);


--
-- Name: ledger_postings ledger_postings_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: app
--

ALTER TABLE ONLY public.ledger_postings
    ADD CONSTRAINT ledger_postings_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.ledger_accounts(id);


--
-- Name: ledger_postings ledger_postings_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: app
--

ALTER TABLE ONLY public.ledger_postings
    ADD CONSTRAINT ledger_postings_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.ledger_journal_entries(id);


--
-- PostgreSQL database dump complete
--

\unrestrict 8De5UGsZ7ddKWrOaWc8J6mzSRZhR1SR2SnmfII5SPszBEGwSK26KrhKypsbeqYX

