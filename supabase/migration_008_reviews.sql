-- Customer reviews collected on /reviews (an unlisted page linked from review-request emails).
-- Reviews start as 'pending' so nothing is ever shown publicly without approval.
-- Photos live in the private `review-photos` Storage bucket under <review id>/<n>.<ext>;
-- the API writes with the service role key, so no public RLS policies are needed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  rating             smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title              text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  body               text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000),
  display_name       text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  email              text NOT NULL,
  order_number       text,
  photo_paths        text[] NOT NULL DEFAULT '{}',
  -- True when the email matches a paid order in public.preorders.
  verified_purchase  boolean NOT NULL DEFAULT false,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON public.reviews (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_email ON public.reviews (lower(email));

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-photos', 'review-photos', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

COMMIT;
