ALTER TABLE public.extractions DROP CONSTRAINT IF EXISTS extractions_cliente_check;
ALTER TABLE public.extractions ADD CONSTRAINT extractions_cliente_check CHECK (cliente IN ('natura','rommanel','montreal'));
ALTER TABLE public.spec_examples DROP CONSTRAINT IF EXISTS spec_examples_cliente_check;
ALTER TABLE public.spec_examples ADD CONSTRAINT spec_examples_cliente_check CHECK (cliente IN ('natura','rommanel','montreal'));
ALTER TABLE public.spec_examples ADD COLUMN semeado boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.spec_examples.semeado IS 'true = copiado de outro cliente como ponto de partida; serve só de exemplo de estilo, nunca dispara reuso literal';
INSERT INTO public.spec_examples (user_id, cliente, tipo, alvo, chave, item, nome, grupo, arquivo, formato, pag_book, especificacao_ia, especificacao_correta, origem, semeado)
SELECT user_id, 'montreal', tipo, alvo, chave, item, nome, grupo, arquivo, formato, pag_book, NULL, especificacao_correta, origem, true
FROM public.spec_examples WHERE cliente = 'rommanel'
ON CONFLICT (user_id, cliente, chave) DO NOTHING;