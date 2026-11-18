import { open } from "node:fs/promises";
import { parseArgs } from "node:util";
import { prisma } from "../src/lib/prisma";
import { supabase } from "../src/lib/supabase";
import { AppError } from "../src/errors/AppError";
import { resolverReferenciaDocumento } from "../src/storage/referenciaArquivo";
import { storageService } from "../src/storage/storageDocuments";

async function conciliar() {
  const { values } = parseArgs({
    options: {
      apply: { type: "boolean", default: false },
      report: { type: "string" },
    },
  });
  if (!values.report) {
    throw new AppError("Uso: tsx scripts/conciliar-documentos.ts --report <arquivo.jsonl> [--apply]");
  }

  const bucket = storageService.getBucketDocumentos();
  const { data: configuracao, error } = await supabase.storage.getBucket(bucket);
  if (error || !configuracao) {
    const status = error?.status ? ` (HTTP ${error.status})` : "";
    throw new AppError(`Não foi possível consultar o bucket de documentos${status}.`);
  }

  const relatorio = await open(values.report, "wx", 0o600);
  const totais: Record<string, number> = {};

  async function registrar(dados: Record<string, string>) {
    await relatorio.appendFile(JSON.stringify(dados) + "\n");
    await relatorio.sync();
    if (dados.resultado) totais[dados.resultado] = (totais[dados.resultado] ?? 0) + 1;
  }

  try {
    await registrar({ modo: values.apply ? "aplicacao" : "simulacao", bucket, publico: String(configuracao.public) });
    let ultimoId: string | undefined;
    while (true) {
      const lote = await prisma.documento.findMany({
        where: ultimoId === undefined ? {} : { id: { gt: ultimoId } },
        select: { id: true, caminho: true, nomeArquivo: true, fkInscricao: true },
        orderBy: { id: "asc" },
        take: 100,
      });
      if (lote.length === 0) break;

      for (const documento of lote) {
        ultimoId = documento.id;
        const registro = { id: documento.id, anterior: documento.caminho };
        let referencia: ReturnType<typeof resolverReferenciaDocumento>;
        try {
          referencia = resolverReferenciaDocumento(documento);
        } catch (erro) {
          if (!(erro instanceof AppError && erro.statusCode === 422)) throw erro;
          await registrar({ ...registro, resultado: "referencia_nao_confirmada" });
          continue;
        }

        if (!(await storageService.existe(referencia.chave, referencia.bucket))) {
          await registrar({ ...registro, resultado: "objeto_ausente" });
          continue;
        }
        if (documento.caminho === referencia.chave) {
          await registrar({ ...registro, resultado: "ja_correto" });
          continue;
        }

        const proximo = referencia.chave;
        if (!values.apply) {
          await registrar({ ...registro, proximo, resultado: "correcao_confirmada" });
          continue;
        }

        await registrar({ ...registro, proximo, resultado: "atualizacao_planejada" });
        const { count } = await prisma.documento.updateMany({
          where: { id: documento.id, caminho: documento.caminho },
          data: { caminho: proximo },
        });
        await registrar({ ...registro, proximo, resultado: count ? "corrigido" : "alteracao_concorrente" });
      }
    }
    console.log({ bucket, publico: configuracao.public, modo: values.apply ? "aplicacao" : "simulacao", totais });
  } finally {
    await relatorio.close();
  }
}

conciliar()
  .catch(erro => {
    console.error(erro instanceof AppError ? erro.message : "Conciliação interrompida. Confira os argumentos, o acesso ao banco/Storage e o relatório parcial.");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
