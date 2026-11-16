import { z } from "zod";

function inteiroPositivo(max: number) {
  return z.string().regex(/^[0-9]+$/).transform(Number)
    .pipe(z.number().int().min(1).max(max));
}

export const professorCursosQuerySchema = z.strictObject({
  page: inteiroPositivo(Number.MAX_SAFE_INTEGER).default(1),
  limit: inteiroPositivo(100).default(10),
}).refine(({ page, limit }) => Number.isSafeInteger((page - 1) * limit), {
  message: "Paginação fora dos limites suportados",
});

export type ProfessorCursosQuery = z.infer<typeof professorCursosQuerySchema>;
