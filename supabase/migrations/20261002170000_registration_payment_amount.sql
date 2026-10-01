-- Keep the amount requested at RSVP time for payment verification and history.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(10, 2);

UPDATE public.registrations AS r
SET payment_amount = GREATEST(COALESCE(e.price, 0), 0) * GREATEST(COALESCE(r.attendees_count, 1), 1)
FROM public.events AS e
WHERE e.event_id = r.event_id
  AND r.payment_amount IS NULL
  AND COALESCE(e.price, 0) > 0;
