ALTER TABLE "curso" ADD COLUMN "fk_criador" TEXT;

CREATE INDEX "curso_fk_criador_nome_id_idx" ON "curso"("fk_criador", "nome", "id");

ALTER TABLE "curso" ADD CONSTRAINT "curso_fk_criador_fkey"
  FOREIGN KEY ("fk_criador") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
