import { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../lib/prisma"; // Ajuste o caminho se necessário
import { AppError } from "../errors/AppError";
import { Prisma } from "../../generated/prisma/client";
import { 
  criarProfessorSchema, 
  atualizarProfessorSchema, 
  professorDadosContaSchema 
} from "../schemas/professor.schema";

// 1. CREATE - Criar Professor
export const criarProfessor = async (req: Request, res: Response) => {
  try {
    const dados = criarProfessorSchema.parse(req.body);

    const novoProfessor = await prisma.$transaction(async (tx) => {
      const usuario = await tx.usuario.findUnique({
        where: { id: dados.fkUsuario },
        select: { id: true },
      });
      if (!usuario) throw new AppError("Usuário não encontrado", 404);

      const cargoProfessor = await tx.cargo.findFirst({
        where: { cargo: "PROFESSOR" },
        select: { id: true },
      });
      if (!cargoProfessor) {
        throw new AppError("Cargo PROFESSOR não encontrado no sistema", 500);
      }

      const professor = await tx.professor.create({ data: dados });

      await tx.usuario.update({
        where: { id: usuario.id },
        data: { cargos: { connect: { id: cargoProfessor.id } } },
      });

      return professor;
    });

    return res.status(201).json(novoProfessor);
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ erros: error.issues });
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ erro: error.message });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        erro: "Já existe um professor com o SIAPE, e-mail SIAPE ou usuário informado",
      });
    }
    return res.status(500).json({ erro: "Erro ao criar professor" });
  }
};

// 2. READ ALL - Listar Professores
export const listarProfessores = async (req: Request, res: Response) => {
  try {
    const professores = await prisma.professor.findMany({
      include: { usuario: true } // Traz os dados do usuário junto!
    });
    return res.status(200).json(professores);
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao buscar professores" });
  }
};

// 3. READ ONE - Buscar Professor por ID
export const buscarProfessorPorId = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const professor = await prisma.professor.findUnique({
      where: { id },
      include: { usuario: true, alocacoes: true } 
    });

    if (!professor) return res.status(404).json({ erro: "Professor não encontrado" });

    return res.status(200).json(professor);
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao buscar professor" });
  }
};

// 4. UPDATE - Atualizar Professor (Geral)
export const atualizarProfessor = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const dados = atualizarProfessorSchema.parse(req.body);

    const professorAtualizado = await prisma.professor.update({
      where: { id },
      data: dados,
    });

    return res.status(200).json(professorAtualizado);
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ erros: error.issues });
    return res.status(500).json({ erro: "Erro ao atualizar professor" });
  }
};

// 4.1 UPDATE - Atualizar Apenas Dados de Conta
export const atualizarDadosContaProfessor = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    
    // Valida os 9 campos estruturados no schema
    const dados = professorDadosContaSchema.parse(req.body);

    // Atualiza de forma encadeada as tabelas Professor e Usuario
    const professorAtualizado = await prisma.professor.update({
      where: { id },
      data: {
        emailSiape: dados.emailSiape,
        emailNotificacoes: dados.emailNotificacoes,
        emailClassroom: dados.emailClassroom,
        telefonesInstitucionais: dados.telefonesInstitucionais,
        telefonesPessoais: dados.telefonesPessoais,
        emPGD: dados.emPGD,
        usuario: {
          update: {
            nomeSocial: dados.nomeUsual,
            emailInstitucional: dados.emailInstitucional,
            emailSecundario: dados.emailSecundario,
          },
        },
      },
      include: {
        usuario: true, // Retorna os dados do usuário atualizados na resposta
      },
    });

    return res.status(200).json({ mensagem: "Dados de conta atualizados!", professorAtualizado });
  } catch (error) {
    if (error instanceof ZodError) return res.status(400).json({ erros: error.issues });
    return res.status(500).json({ erro: "Erro interno ao atualizar dados de conta" });
  }
};

// 5. DELETE - Deletar Professor
export const deletarProfessor = async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    await prisma.professor.delete({
      where: { id },
    });

    return res.status(204).send(); 
  } catch (error) {
    return res.status(500).json({ erro: "Erro ao deletar professor" });
  }
};