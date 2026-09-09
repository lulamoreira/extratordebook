CREATE TABLE public.spec_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'exemplo' CHECK (tipo IN ('exemplo','regra')),
  alvo text NOT NULL DEFAULT 'redacao' CHECK (alvo IN ('extracao','redacao','ambos')),
  chave text NOT NULL,
  item text NOT NULL DEFAULT '',
  nome text NOT NULL DEFAULT '',
  grupo text NOT NULL DEFAULT '',
  arquivo text NOT NULL DEFAULT '',
  formato text NOT NULL DEFAULT '',
  pag_book integer,
  especificacao_ia text,
  especificacao_correta text NOT NULL,
  origem text NOT NULL DEFAULT 'gabarito' CHECK (origem IN ('comparacao_planilha','comparacao_book','gabarito')),
  extraction_id uuid REFERENCES public.extractions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX spec_examples_user_chave_key ON public.spec_examples (user_id, chave);
CREATE INDEX spec_examples_user_tipo_updated_idx ON public.spec_examples (user_id, tipo, updated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.spec_examples TO authenticated;
GRANT ALL ON public.spec_examples TO service_role;

ALTER TABLE public.spec_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own spec examples" ON public.spec_examples FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own spec examples" ON public.spec_examples FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own spec examples" ON public.spec_examples FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own spec examples" ON public.spec_examples FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_spec_examples_updated_at
BEFORE UPDATE ON public.spec_examples
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();