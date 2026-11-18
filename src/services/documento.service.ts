import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { storageService } from "../storage/storageDocuments";
import { resolverReferenciaDocumento } from "../storage/referenciaArquivo";
import { TIPOS_PERMITIDOS } from "../middleware/upload.middleware";
import { RbacService } from "./rbac.service";
import type { CategoriaDocumento } from "../../generated/prisma/client";

const rbacService = new RbacService();
const PERMISSAO_GERENCIAR_INSCRICAO = "GERENCIAR_INSCRICAO";

interface EnviarDocumentoParams {
  inscricaoId: string;
  usuarioId: string;
  file: Express.Multer.File;
  categoria?: CategoriaDocumento | undefined; 
}

async function verificarPropriedadeOuPermissao(
  inscricaoId: string,
  usuarioId: string,
) {
  const inscricao = await prisma.inscricao.findUnique({
    where: { id: inscricaoId },
    include: { aluno: true },
  });

  if (!inscricao) throw new AppError("Inscrição não encontrada", 404);

  const aluno = await prisma.aluno.findFirst({ where: { fkUsuario: usuarioId } });
  const ehDono = aluno?.id === inscricao.fkAluno;

  if (ehDono) return inscricao;

  const permissoesUsuario = await rbacService.obterPermissoes(usuarioId);
  const podeGerenciar = permissoesUsuario.includes(PERMISSAO_GERENCIAR_INSCRICAO);

  if (!podeGerenciar) {
    throw new AppError("Sem permissão para acessar documentos dessa inscrição", 403);
  }

  return inscricao;
}

export async function enviarDocumento({
  inscricaoId,
  usuarioId,
  file,
  categoria,
}: EnviarDocumentoParams) {
  await verificarPropriedadeOuPermissao(inscricaoId, usuarioId);

  if (!TIPOS_PERMITIDOS.includes(file.mimetype)) {
    throw new AppError("Tipo de arquivo não permitido.", 400);
  }

  const subpasta = `inscricoes/${inscricaoId}`;
  const bucket = storageService.getBucketDocumentos();
  const { nomeArquivo, chave } = await storageService.salvar(
    file.buffer,
    file.originalname,
    subpasta,
    bucket,
    file.mimetype
  );

  try {
    const caminho = (await storageService.assinarURLs([chave], bucket)).get(chave);
    if (!caminho) throw new AppError("Não foi possível gerar o link do documento.", 502);

    const documento = await prisma.documento.create({
      data: {
        nomeOriginal: file.originalname,
        nomeArquivo,
        caminho: chave,
        tipoMime: file.mimetype,
        tamanho: file.size,
        categoria: categoria ?? "OUTRO",
        fkInscricao: inscricaoId,
      },
    });
    return { ...documento, caminho };
  } catch (error) {
    try {
      await storageService.remover(chave, bucket);
    } catch {
      console.error("Falha na limpeza de upload de documento", { inscricaoId, nomeArquivo });
    }
    throw error;
  }
}

export async function listarDocumentosDaInscricao(
  inscricaoId: string,
  usuarioId: string,
) {
  await verificarPropriedadeOuPermissao(inscricaoId, usuarioId);

  const documentos = await prisma.documento.findMany({
    where: { fkInscricao: inscricaoId },
    orderBy: { criadoEm: "desc" },
  });

  const referencias = documentos.map(documento => {
    try {
      return resolverReferenciaDocumento(documento);
    } catch (error) {
      if (!(error instanceof AppError && error.statusCode === 422)) throw error;
      return null;
    }
  });
  const caminhos = referencias.flatMap(referencia => referencia ? [referencia.chave] : []);
  const urls = caminhos.length
    ? await storageService.assinarURLs(caminhos, storageService.getBucketDocumentos())
    : new Map<string, string>();

  return documentos.map((documento, index) => {
    const referencia = referencias[index];
    return { ...documento, caminho: referencia ? urls.get(referencia.chave) ?? null : null };
  });
}

async function buscarDocumento(documentoId: string, usuarioId: string) {
  const documento = await prisma.documento.findUnique({ where: { id: documentoId } });
  if (!documento) throw new AppError("Documento não encontrado", 404);

  await verificarPropriedadeOuPermissao(documento.fkInscricao, usuarioId);
  return documento;
}

export async function obterUrlDocumento(documentoId: string, usuarioId: string) {
  const documento = await buscarDocumento(documentoId, usuarioId);
  const { chave, bucket } = resolverReferenciaDocumento(documento);
  const caminho = (await storageService.assinarURLs([chave], bucket)).get(chave);
  if (!caminho) throw new AppError("Arquivo do documento indisponível.", 404);
  return caminho;
}

export async function removerDocumento(documentoId: string, usuarioId: string) {
  const documento = await buscarDocumento(documentoId, usuarioId);
  const { chave, bucket } = resolverReferenciaDocumento(documento);
  await storageService.remover(chave, bucket);
  await prisma.documento.deleteMany({ where: { id: documentoId } });
}
