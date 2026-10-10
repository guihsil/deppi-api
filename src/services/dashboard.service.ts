import { prisma } from "../lib/prisma";

export async function getDashboardSummary(cargosParams?: string[]) {
  const [
    totalUsuariosGeral,
    totalUsuariosFiltro,
    totalInstituicoes,
    totalCursos,
    cursosPorStatusQuery,
    totalInscricoes,
    inscricoesPorStatusQuery,
    cursosComVagas
  ] = await Promise.all([
    prisma.usuario.count(),
    cargosParams && cargosParams.length > 0
      ? prisma.usuario.count({
          where: {
            cargos: {
              some: {
                cargo: { in: cargosParams as any[] }
              }
            }
          }
        })
      : Promise.resolve(null),
    prisma.instituicao.count(),
    prisma.curso.count(),
    prisma.curso.groupBy({
      by: ['status'],
      _count: true
    }),
    prisma.inscricao.count(),
    prisma.inscricao.groupBy({
      by: ['status'],
      _count: true
    }),
    prisma.curso.findMany({
      select: {
        vagas: true,
        _count: {
          select: { 
            inscricao: {
              where: {
                status: 'DEFERIDO'
              }
            }
          }
        }
      }
    })
  ]);

  let totalOfertadas = 0;
  let totalInscritosDeferidos = 0;

  cursosComVagas.forEach(curso => {
    totalOfertadas += curso.vagas;
    totalInscritosDeferidos += curso._count.inscricao;
  });

  const vagasRestantes = totalOfertadas - totalInscritosDeferidos;

  return {
    usuarios: {
      total: totalUsuariosGeral,
      ...(cargosParams && cargosParams.length > 0 ? { filtroCargos: totalUsuariosFiltro } : {})
    },
    instituicoes: {
      total: totalInstituicoes
    },
    cursos: {
      total: totalCursos,
      porStatus: cursosPorStatusQuery.reduce((acc, curr) => {
        acc[curr.status] = curr._count;
        return acc;
      }, {} as Record<string, number>),
      vagas: {
        totalOfertadas,
        totalInscritosDeferidos,
        vagasRestantes
      }
    },
    inscricoes: {
      total: totalInscricoes,
      porStatus: inscricoesPorStatusQuery.reduce((acc, curr) => {
        acc[curr.status] = curr._count;
        return acc;
      }, {} as Record<string, number>)
    }
  };
}

