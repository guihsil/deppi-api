import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { AppError } from "../errors/AppError";
import { supabase } from "../lib/supabase";

const BUCKET_IMAGEM = process.env.SUPABASE_BUCKET_IMAGE || "deppi-image";
const BUCKET_DOCS = process.env.SUPABASE_BUCKET_DOCS || "deppi-docs";
const URL_TTL_SECONDS = 300;

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function objetoAusente(error: { statusCode?: string }) {
  const code = "code" in error ? error.code : error.statusCode;
  return code === "NoSuchKey" || code === "NoSuchObject";
}

export const storageService = {
  async salvar(
    buffer: Buffer,
    nomeOriginal: string,
    subpasta: string,
    bucket: string,
    contentType?: string,
  ) {
    const extensao = extname(nomeOriginal);
    const nomeArquivo = randomUUID() + (/^\.[a-z0-9]{1,10}$/i.test(extensao) ? extensao : "");
    const chave = `${subpasta}/${nomeArquivo}`;

    const { error } = await supabase.storage.from(bucket).upload(chave, buffer, { contentType });
    if (error) throw new AppError("Não foi possível enviar o arquivo ao Storage.", 502);

    return { nomeArquivo, chave };
  },

  async remover(chave: string, bucket: string) {
    const { error } = await supabase.storage.from(bucket).remove([chave]);
    if (error && !objetoAusente(error)) {
      throw new AppError("Não foi possível excluir o arquivo do Storage.", 502);
    }
  },

  async existe(chave: string, bucket: string) {
    // O SDK usa a chave diretamente na URL de metadados.
    const { error } = await supabase.storage.from(bucket).info(encodeKey(chave));
    if (!error) return true;
    if (error.status === 404 || objetoAusente(error)) return false;
    throw new AppError("Não foi possível verificar o arquivo no Storage.", 502);
  },

  async assinarURLs(chaves: string[], bucket: string) {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrls(chaves, URL_TTL_SECONDS);
    if (error || !data) throw new AppError("Não foi possível gerar os links dos arquivos.", 502);

    const urls = new Map<string, string>();
    for (const item of data) {
      if (item.error || !item.path || !item.signedURL) continue;
      // A API devolve a query após a chave. Preserve o token e codifique a chave
      // por segmento para suportar caracteres reservados em registros legados.
      const queryIndex = item.signedURL.lastIndexOf("?token=");
      if (queryIndex < 0) continue;
      const url = new URL(this.getUrlPublica(item.path, bucket));
      url.pathname = url.pathname.replace("/object/public/", "/object/sign/");
      url.search = item.signedURL.slice(queryIndex);
      urls.set(item.path, url.href);
    }
    return urls;
  },

  getUrlPublica(chave: string, bucket: string) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(chave);
    // getPublicUrl usa encodeURI, que preserva ? e #.
    return data.publicUrl.replaceAll("?", "%3F").replaceAll("#", "%23");
  },

  getBucketImagem() {
    return BUCKET_IMAGEM;
  },

  getBucketDocumentos() {
    return BUCKET_DOCS;
  },
};
