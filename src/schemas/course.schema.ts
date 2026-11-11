import { z } from "zod";

const dataCursoSchema = z
  .union([z.iso.date(), z.iso.datetime()])
  .transform((data) => new Date(data));

const horarioCursoSchema = z
  .iso.time()
  .transform((horario) => new Date(`1970-01-01T${horario}Z`));

export const createCourseSchema = z.object({
  nome: z.string().min(1, "Nome do curso é obrigatório"),
  carga_horaria: z.number().int().positive("Carga horária deve ser maior que zero"),
  vagas: z.number().int().positive("O curso deve ter pelo menos 1 vaga"),
  dataInicio: dataCursoSchema,
  dataFim: dataCursoSchema,
  horarioInicio: horarioCursoSchema,
  horarioFim: horarioCursoSchema,
  fkInstituicao: z.string().uuid("Instituição inválida"),
});

export const updateCourse = z.object({
  nome: z.string().min(1).optional(),
  carga_horaria: z.number().int().positive().optional(),
  vagas: z.number().int().positive().optional(),
  dataInicio: dataCursoSchema.optional(),
  dataFim: dataCursoSchema.optional(),
  horarioInicio: horarioCursoSchema.optional(),
  horarioFim: horarioCursoSchema.optional(),
  status: z.string().optional(),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourse>