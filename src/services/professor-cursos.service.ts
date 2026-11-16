import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { RbacService } from "./rbac.service";
import type { ProfessorCursosQuery } from "../schemas/professor-cursos.schema";

const rbacService = new RbacService();

export async function listarCursosDoProfessor(
  usuarioId: string,
  { page, limit }: ProfessorCursosQuery,
) {
  const cargos = await rbacService.obterCargos(usuarioId);
  if (!cargos.includes("PROFESSOR")) {
    throw new AppError("Usuário sem cargo PROFESSOR.", 403);
  }
  const professor = await prisma.professor.findUnique({
    where: { fkUsuario: usuarioId },
    select: { id: true },
  });
  if (!professor) throw new AppError("Perfil de professor não encontrado.", 404);

  const where = { fkCriador: usuarioId };
  const [cursos, total] = await prisma.$transaction([
    prisma.curso.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: [{ nome: "asc" }, { id: "asc" }],
      select: {
        id: true, nome: true, status: true, carga_horaria: true,
        dataInicio: true, dataFim: true,
        Instituicao: { select: { id: true, nome: true, campus: true } },
        inscricao: {
          orderBy: [{ data: "desc" }, { id: "desc" }],
          select: {
            id: true, data: true, status: true,
            aluno: {
              select: {
                id: true, matricula: true,
                usuario: {
                  select: { nome: true, nomeSocial: true, emailInstitucional: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.curso.count({ where }),
  ], { isolationLevel: "RepeatableRead" });

  return {
    data: cursos.map(({ Instituicao, inscricao, ...curso }) => ({
      ...curso,
      instituicao: Instituicao,
      totalInscricoes: inscricao.length,
      inscricoes: inscricao.map(({ aluno, ...inscricao }) => ({
        ...inscricao,
        aluno: { id: aluno.id, matricula: aluno.matricula, ...aluno.usuario },
      })),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
