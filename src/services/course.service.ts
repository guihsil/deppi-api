import { StatusCurso } from '../../generated/prisma/client';
import { prisma } from '../lib/prisma';
import { CreateCourseInput, UpdateCourseInput } from '../schemas/course.schema';
import { AppError } from '../errors/AppError';
import { RbacService } from './rbac.service';

export interface UsuarioLogado {
  userId: string;
}

const rbacService = new RbacService();

function ehAlunoSemAcessoAdministrativo(cargos: string[]) {
  const ehAluno = cargos.includes('ALUNO');
  const temAcessoAdministrativo = cargos.some((cargo) =>
    ['PROFESSOR', 'DEPPI', 'ADMIN'].includes(cargo)
  );

  if (!ehAluno && !temAcessoAdministrativo) {
    throw new AppError("Usuário sem perfil autorizado para consultar cursos.", 403);
  }

  return ehAluno && !temAcessoAdministrativo;
}

function validarVagas(vagas: number) {
  if (vagas <= 0) throw new Error("O curso deve ter pelo menos 1 vaga.");
}

function validarCargaHoraria(ch: number) {
  if (ch <= 0) throw new Error("A carga horária deve ser maior que zero. ");
}

export class CourseService {
  async createCourse(dadosCurso: CreateCourseInput, usuarioLogado: UsuarioLogado) {
    validarVagas(dadosCurso.vagas);
    validarCargaHoraria(dadosCurso.carga_horaria);

    const cargosUsuario = await rbacService.obterCargos(usuarioLogado.userId);
    const instituicaoExiste = await prisma.instituicao.findUnique({
      where: { id: dadosCurso.fkInstituicao }
    });
    
    if (!instituicaoExiste) {
      throw new AppError("Instituição não encontrada.", 404);
    }

    const status: StatusCurso = cargosUsuario.includes('DEPPI') ? 'ANDAMENTO' : 'ANALISE';

    return await prisma.curso.create({
      data: {
        nome: dadosCurso.nome,
        carga_horaria: dadosCurso.carga_horaria,
        vagas: dadosCurso.vagas,
        dataInicio: dadosCurso.dataInicio,
        dataFim: dadosCurso.dataFim,
        horarioInicio: dadosCurso.horarioInicio,
        horarioFim: dadosCurso.horarioFim,
        fkInstituicao: dadosCurso.fkInstituicao,
        status,
      },
      include: { Instituicao: true }
    });
  }

  async readCourses(usuarioLogado: UsuarioLogado) {
    const cargosUsuario = await rbacService.obterCargos(usuarioLogado.userId);
    const alunoSemPermissaoDeGestao = ehAlunoSemAcessoAdministrativo(cargosUsuario);
    const filtroStatus = alunoSemPermissaoDeGestao
      ? { status: 'ANDAMENTO' as StatusCurso }
      : {};

    const cursos = await prisma.curso.findMany({
      where: filtroStatus,
      include: {
        Instituicao: true,
        inscricao: { select: { id: true } }
      }
    });

    return cursos.map((curso) => ({
      ...curso,
      vagasOcupadas: curso.inscricao.length,
      vagasDisponiveis: curso.vagas - curso.inscricao.length,
      inscricao: undefined 
    }));
  }

  async readCourseById(id: string, usuarioLogado: UsuarioLogado) {
    const cargosUsuario = await rbacService.obterCargos(usuarioLogado.userId);
    const alunoSemPermissaoDeGestao = ehAlunoSemAcessoAdministrativo(cargosUsuario);
    const curso = await prisma.curso.findUnique({
      where: { id },
      include: {
        Instituicao: true,
        inscricao: { select: { id: true } }
      }
    });

    if (!curso) throw new AppError("Curso não encontrado.", 404);

    if (alunoSemPermissaoDeGestao && curso.status !== 'ANDAMENTO') {
      throw new AppError("Este curso não está disponível para visualização.", 403);
    }

    return {
      ...curso,
      vagasOcupadas: curso.inscricao.length,
      vagasDisponiveis: curso.vagas - curso.inscricao.length,
      inscricao: undefined
    };
  }

  async updateCourse(
    id: string,
    dadosAtualizados: UpdateCourseInput,
    usuarioLogado: UsuarioLogado
  ) {
    const cursoExiste = await prisma.curso.findUnique({
      where: { id },
      include: { inscricao: { select: { id: true } } }
    });


    if (!cursoExiste) throw new AppError("Curso não encontrado.", 404);

    if (dadosAtualizados.vagas !== undefined) {
      validarVagas(dadosAtualizados.vagas);
      const inscricoesAtivas = cursoExiste.inscricao.length;
      if (dadosAtualizados.vagas < inscricoesAtivas) {
        throw new Error(`Não é possível reduzir as vagas para ${dadosAtualizados.vagas}. Já existem ${inscricoesAtivas} inscrições.`);
      }
    }

    if (dadosAtualizados.carga_horaria !== undefined) validarCargaHoraria(dadosAtualizados.carga_horaria);

    if (dadosAtualizados.status !== undefined) {
      const permissoesUsuario = await rbacService.obterPermissoes(usuarioLogado.userId);
      if (!permissoesUsuario.includes('GERENCIAR_CURSO')) {
        throw new AppError("Você não tem permissão para alterar o status do curso.", 403);
      }
    }

    return await prisma.curso.update({
      where: { id },
      data: dadosAtualizados,
      include: { Instituicao: true }
    });
  }

  async deleteCourse(id: string) {
    const cursoExiste = await prisma.curso.findUnique({
      where: { id },
      include: { inscricao: { select: { id: true } } }
    });

    if (!cursoExiste) throw new AppError("Curso não encontrado.", 404);

    if (cursoExiste.inscricao.length > 0) {
      throw new Error("Não é possível deletar um curso que já possui inscrições.");
    }

    return await prisma.curso.delete({ where: { id } });
  }
}