-- Bind an authenticated product Payment to the exact passkey-authorized
-- Stellar relayer request. A payment can have only one irreversible request,
-- and a request can advance only one payment timeline.

ALTER TABLE stellar_relayer_requests
  ADD COLUMN payment_id uuid REFERENCES payments(id);

CREATE UNIQUE INDEX stellar_relayer_requests_payment_id_idx
  ON stellar_relayer_requests(payment_id)
  WHERE payment_id IS NOT NULL;
