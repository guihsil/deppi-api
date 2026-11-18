import { AppError } from "../errors/AppError";
import { storageService } from "./storageDocuments";

function correspondeAoObjeto(caminho: string, chave: string, bucket: string) {
  const esperado = new URL(storageService.getUrlPublica(chave, bucket));
  // O gerador antigo preservava estes delimitadores dentro do nome do arquivo.
  if (caminho === esperado.href.replaceAll("%3F", "?").replaceAll("%23", "#")) return true;
  try {
    const atual = new URL(caminho);
    return atual.origin === esperado.origin && !atual.username && !atual.password &&
      !atual.search && !atual.hash &&
      decodeURIComponent(atual.pathname) === decodeURIComponent(esperado.pathname);
  } catch {
    return false;
  }
}

export function resolverReferenciaDocumento(documento: {
  caminho: string;
  fkInscricao: string;
  nomeArquivo: string;
}) {
  if (!documento.nomeArquivo || /[/\\]/.test(documento.nomeArquivo) || /[/\\]/.test(documento.fkInscricao)) {
    throw new AppError("Referência de armazenamento do documento inválida.", 422);
  }
  const chave = `inscricoes/${documento.fkInscricao}/${documento.nomeArquivo}`;
  const bucket = storageService.getBucketDocumentos();
  if (documento.caminho === chave ||
    correspondeAoObjeto(documento.caminho, chave, bucket) ||
    correspondeAoObjeto(documento.caminho, chave, "covers")) {
    return { chave, bucket };
  }

  throw new AppError("Referência de armazenamento do documento inválida.", 422);
}

export function resolverReferenciaCapa(capa: { path: string; nomeArquivo: string }) {
  if (!capa.nomeArquivo || /[/\\]/.test(capa.nomeArquivo)) {
    throw new AppError("Referência de armazenamento da capa inválida.", 422);
  }
  const chave = `covers/${capa.nomeArquivo}`;
  const bucketImagem = storageService.getBucketImagem();
  const bucketDocumentos = storageService.getBucketDocumentos();
  if (correspondeAoObjeto(capa.path, chave, bucketImagem)) {
    return { chave, bucket: bucketImagem };
  }
  if (correspondeAoObjeto(capa.path, chave, bucketDocumentos) ||
    correspondeAoObjeto(capa.path, chave, "covers")) {
    return { chave, bucket: bucketDocumentos };
  }

  throw new AppError("Referência de armazenamento da capa inválida.", 422);
}
