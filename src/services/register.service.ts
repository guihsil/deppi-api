import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { CadastroInput } from "../schemas/cadastro.schema";
import { Prisma } from "../../generated/prisma/client";

type CadastroAlunoInput = Extract<CadastroInput, { cargo: "ALUNO" }>;
type CadastroProfessorInput = Extract<CadastroInput, { cargo: "PROFESSOR" }>;

function normalizeCPF(cpf: string): string {
  return cpf.replace(/[.\-]/g, "");
}

function createSCode(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `${year}${random}`;
}

async function verifySCode(data: CadastroAlunoInput): Promise<string> {
  let matricula = data.matricula ?? createSCode();
  let verifyMatricula = await prisma.aluno.findUnique({
    where: { matricula },
  });
  while (verifyMatricula) {
    matricula = createSCode();
    verifyMatricula = await prisma.aluno.findUnique({
      where: { matricula },
    });
  }
  return matricula;
}

async function createUserImpl(data: CadastroInput) {
  const cpfNormalizado = normalizeCPF(data.cpf);

  const email = await prisma.usuario.findUnique({
    where: { emailInstitucional: data.email },
  });
  const cpf = await prisma.identidade.findUnique({
    where: { cpf: cpfNormalizado },
  });
  const rg = await prisma.identidade.findUnique({
    where: { rg: data.rg },
  });

  if (email) throw new AppError("Email já cadastrado", 409);
  if (cpf) throw new AppError("CPF já cadastrado", 409);
  if (rg) throw new AppError("RG já cadastrado", 409);
  if (data.cargo === "PROFESSOR") {
    const professorExistente = await prisma.professor.findUnique({
      where: { siape: data.siape },
      select: { id: true },
    });
    if (professorExistente) throw new AppError("SIAPE já cadastrado", 409);
  }

  // Criptografa a senha do usuário
  const hashPassword = await bcrypt.hash(data.senha, 10);

  try {
    return await prisma.$transaction(async (tx) => {
      const identidade = await tx.identidade.create({
        data: {
          rg: data.rg,
          cpf: cpfNormalizado,
          orgaoEmissor: data.orgaoEmissor,
          estado: data.estado.toUpperCase(),
          dataExpedicao: new Date(data.dataEmissao),
        },
      });

      const cargo = await tx.cargo.findFirst({
        where: { cargo: data.cargo },
      });
      if (!cargo) {
        throw new AppError(`Cargo ${data.cargo} não encontrado no sistema`, 500);
      }

      const endereco = await tx.endereco.create({
        data: data.endereco,
      });

      const usuario = await tx.usuario.create({
        data: {
          nome: data.nome,
          nomeSocial: data.nomeSocial ?? null,
          dataNasc: new Date(data.dataNasc),
          naturalidade: data.naturalidade,
          emailInstitucional: data.email,
          emailSecundario: "",
          senha: hashPassword,
          nomeMae: data.nomeMae,
          nomePai: data.nomePai,
          sexo: data.sexo,
          raca: data.raca,
          identidade: { connect: { id: identidade.id } },
          endereco: { connect: { id: endereco.id } },
          cargos: { connect: { id: cargo.id } },
        },
      });

      const tituloEleitor = await tx.tituloEleitor.create({
        data: {
          numero: data.tituloNumero,
          zonaEleitoral: data.zonaEleitoral,
          secaoEleitoral: data.secaoEleitoral,
          UF: data.ufTitulo.toUpperCase(),
          fkUsuario: usuario.id,
        },
      });

      if (data.cargo === "ALUNO") {
        const matricula = data.matricula ?? (await verifySCode(data));
        const aluno = await tx.aluno.create({
          data: {
            matricula,
            fkUsuario: usuario.id,
          },
        });

        return { usuario, aluno, identidade, tituloEleitor };
      }

      const professor = await tx.professor.create({
        data: {
          siape: data.siape,
          fkUsuario: usuario.id,
        },
      });

      return { usuario, professor, identidade, tituloEleitor };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = Array.isArray(error.meta?.target)
        ? error.meta.target.join(",")
        : String(error.meta?.target ?? "");

      if (target.includes("siape")) {
        throw new AppError("SIAPE já cadastrado", 409);
      }

      throw new AppError("Um ou mais dados informados já estão cadastrados", 409);
    }

    throw error;
  }
}

type CreateUserResult = Awaited<ReturnType<typeof createUserImpl>>;
type CreateUserAlunoResult = Extract<CreateUserResult, { aluno: unknown }>;
type CreateUserProfessorResult = Extract<CreateUserResult, { professor: unknown }>;

export function createUser(
  data: CadastroAlunoInput,
): Promise<CreateUserAlunoResult>;
export function createUser(
  data: CadastroProfessorInput,
): Promise<CreateUserProfessorResult>;
export function createUser(data: CadastroInput): Promise<CreateUserResult>;
export function createUser(data: CadastroInput): Promise<CreateUserResult> {
  return createUserImpl(data);
}