import { AppError } from "../errors/AppError";
import { supabase } from "../lib/supabase";
import crypto from "crypto";

const BUCKET_IMAGEM = process.env.SUPABASE_BUCKET_IMAGEM || "deppi-image";
const BUCKET_DOCS = process.env.SUPABASE_BUCKET_DOCS || "deppi-docs";

export const storageService = {
  async salvar(
    buffer: Buffer, 
    nomeOriginal: string, 
    subpasta: string,
    bucket: string = BUCKET_DOCS,
    contentType?: string,
  ){
    const nomeArquivo = `${crypto.randomUUID()}-${nomeOriginal}`;
    const caminho = `${subpasta}/${nomeArquivo}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(caminho, buffer, {
        contentType: contentType,
      });

    if (error) {
      throw new AppError(error.message);
    }

    const { data } = supabase.storage
      .from("covers")
      .getPublicUrl(caminho);
    
    return { 
      nomeArquivo, 
      caminho: data.publicUrl, 
      bucket, 
      caminhoStorage: caminho
    };
  },

  async remover(
    caminhoOuUrl: string,
    bucket: string = BUCKET_DOCS
  ) {
    let caminhoStorage = caminhoOuUrl;

    if (caminhoOuUrl.startsWith("http://") || caminhoOuUrl.startsWith("https://")) {
      const marker = `/storage/v1/object/public/${bucket}/`;

      if (!caminhoOuUrl.includes(marker)) {
        throw new AppError("A URL do arquivo não pertence ao bucket informado.");
      }

      const partes = caminhoOuUrl.split(marker);
      if (!partes[1]) {
        throw new AppError("Não foi possível identificar o caminho do arquivo no Supabase.");
      }

      caminhoStorage = decodeURIComponent(partes[1]);
    }

    const { error } = await supabase.storage
      .from(bucket)
      .remove([caminhoStorage]);

    if (error) {
      throw new AppError(`Erro ao remover arquivo: ${error.message}`);
    }
  },

  getUrlPublica(
    caminhoStorage: string,
    bucket: string = BUCKET_DOCS,
  ) {
    const { data } = supabase.storage
      .from(bucket)
      .getPublicUrl(caminhoStorage)

    return data.publicUrl;
  },

  getBucketImagem() {
    return BUCKET_IMAGEM;
  },

  getBucketDocumentos() {
    return BUCKET_DOCS;
  }

};