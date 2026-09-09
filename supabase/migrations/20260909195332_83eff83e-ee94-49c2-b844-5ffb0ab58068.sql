ALTER TABLE public.extractions
  ADD COLUMN cliente text NOT NULL DEFAULT 'natura'
  CHECK (cliente IN ('natura','rommanel'));

ALTER TABLE public.spec_examples
  ADD COLUMN cliente text NOT NULL DEFAULT 'natura'
  CHECK (cliente IN ('natura','rommanel'));

DROP INDEX IF EXISTS public.spec_examples_user_chave_key;
ALTER TABLE public.spec_examples DROP CONSTRAINT IF EXISTS spec_examples_user_chave_key;

CREATE UNIQUE INDEX spec_examples_user_cliente_chave_key
  ON public.spec_examples (user_id, cliente, chave);

CREATE INDEX IF NOT EXISTS extractions_user_cliente_created_idx
  ON public.extractions (user_id, cliente, created_at DESC);

CREATE INDEX IF NOT EXISTS spec_examples_user_cliente_tipo_updated_idx
  ON public.spec_examples (user_id, cliente, tipo, updated_at DESC);