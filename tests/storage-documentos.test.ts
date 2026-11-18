import assert from "node:assert/strict";
import { test } from "node:test";

process.env.SUPABASE_URL = "https://storage.example.test";
process.env.SUPABASE_SECRET_KEY = "test-only-key";
process.env.SUPABASE_BUCKET_DOCS = "deppi-docs";
process.env.SUPABASE_BUCKET_IMAGE = "deppi-image";

const { prisma } = await import("../src/lib/prisma");
const { AppError } = await import("../src/errors/AppError");
const documentos = await import("../src/services/documento.service");
const { ShowCoverService, UploadCoverService } = await import("../src/services/cover.service");

test("documentos e capas usam o bucket correto, inclusive em referências legadas", async (context) => {
  const { mock } = context;
  function stub<T extends object, K extends keyof T, Args extends unknown[], Result>(
    delegate: T, method: K, implementation: (...args: Args) => Result,
  ) {
    const original = delegate[method];
    const replacement = mock.fn(implementation);
    delegate[method] = replacement as unknown as T[K];
    context.after(() => { delegate[method] = original; });
    return replacement;
  }
  const origem = "https://storage.example.test";
  const publicUrl = `${origem}/storage/v1/object/public`;
  const nomeLegado = "legado-ação 100% #1.pdf";
  const chaveLegada = `inscricoes/inscricao-1/${nomeLegado}`;
  const legado = {
    id: "documento-1",
    fkInscricao: "inscricao-1",
    nomeArquivo: nomeLegado,
    caminho: encodeURI(`${publicUrl}/covers/${chaveLegada}`),
  };
  const semArquivo = {
    ...legado, id: "documento-2", nomeArquivo: "ausente.pdf", caminho: "inscricoes/inscricao-1/ausente.pdf",
  };
  const objetos = new Set([`deppi-docs/${chaveLegada}`, "deppi-docs/covers/legada.png"]);
  const chamadas: string[] = [];
  let rejeitarExclusao = false;
  let falharCriacao = false;
  let caminhoCapa = `${publicUrl}/covers/covers/legada.png`;
  let nomeCapa = "legada.png";

  mock.method(globalThis, "fetch", async (input: string, init: RequestInit) => {
    const url = new URL(input);
    assert.equal(url.origin, origem);
    const recurso = decodeURIComponent(url.pathname).replace("/storage/v1/object/", "");
    chamadas.push(`${init.method} ${recurso}`);

    if (recurso.startsWith("sign/") && init.method === "POST") {
      const bucket = recurso.slice("sign/".length);
      const { paths, expiresIn } = JSON.parse(String(init.body)) as { paths: string[]; expiresIn: number };
      assert.equal(expiresIn, 300);
      return Response.json(paths.map(path => objetos.has(`${bucket}/${path}`)
        ? { path, error: null, signedURL: `/object/sign/${bucket}/${path}?token=temporario` }
        : { path, error: "Object not found", signedURL: null }));
    }

    if (init.method === "POST") {
      objetos.add(recurso);
      return Response.json({ Key: recurso });
    }

    assert.equal(init.method, "DELETE");
    if (rejeitarExclusao) return Response.json({ message: "Storage indisponível" }, { status: 503 });
    const { prefixes } = JSON.parse(String(init.body)) as { prefixes: string[] };
    for (const chave of prefixes) objetos.delete(`${recurso}/${chave}`);
    return Response.json([]);
  });

  stub(prisma.inscricao, "findUnique", async () => ({ fkAluno: "aluno-1" }));
  stub(prisma.aluno, "findFirst", async ({ where }: { where: { fkUsuario: string } }) =>
    where.fkUsuario === "dono" ? { id: "aluno-1" } : null);
  stub(prisma.usuario, "findUnique", async ({ where }: { where: { id: string } }) =>
    where.id === "deppi" ? { cargos: [{ permissoes: [{ permissao: "GERENCIAR_INSCRICAO" }] }] } : null);
  stub(prisma.documento, "findMany", async () => [legado, semArquivo]);
  stub(prisma.documento, "findUnique", async ({ where }: { where: { id: string } }) =>
    where.id === legado.id ? legado : semArquivo);
  const criar = stub(prisma.documento, "create", async ({ data }: { data: { caminho: string; nomeOriginal: string } }) => {
    if (falharCriacao) throw new Error("Banco indisponível");
    return { ...data, id: "novo-documento" };
  });
  const excluir = stub(prisma.documento, "deleteMany", async () => ({ count: 1 }));
  stub(prisma.curso, "findFirst", async () => ({
    Capa: { path: caminhoCapa, nomeArquivo: nomeCapa },
  }));
  stub(prisma.curso, "update", async ({ data }: { data: { Capa: { create: { path: string; nomeArquivo: string; mimeType: string } } } }) => {
    const capa = data.Capa.create;
    caminhoCapa = capa.path;
    nomeCapa = capa.nomeArquivo;
    assert.equal(capa.mimeType, "image/png");
  });

  const [primeiro, segundo] = await documentos.listarDocumentosDaInscricao("inscricao-1", "deppi");
  assert.ok(primeiro?.caminho);
  const linkLegado = new URL(primeiro.caminho);
  assert.equal(decodeURIComponent(linkLegado.pathname), `/storage/v1/object/sign/deppi-docs/${chaveLegada}`);
  assert.equal(linkLegado.searchParams.get("token"), "temporario");
  assert.equal(segundo?.caminho, null);
  assert.equal(await documentos.obterUrlDocumento(legado.id, "dono"), linkLegado.href);
  await assert.rejects(documentos.obterUrlDocumento(semArquivo.id, "dono"), { statusCode: 404 });

  const chamadasAntes = chamadas.length;
  await assert.rejects(documentos.listarDocumentosDaInscricao("inscricao-1", "intruso"), { statusCode: 403 });
  assert.equal(chamadas.length, chamadasAntes);

  const originalname = "renda 100%#2026.pdf";
  const file = {
    originalname, mimetype: "application/pdf", size: 3, buffer: Buffer.from("pdf"),
  } as Express.Multer.File;
  const envio = { inscricaoId: "inscricao-1", usuarioId: "dono", file };
  const novo = await documentos.enviarDocumento(envio);
  const gravado = criar.mock.calls[0]?.arguments[0].data;
  assert.ok(gravado);
  assert.equal(gravado.nomeOriginal, originalname);
  assert.match(gravado.caminho, /^inscricoes\/inscricao-1\/[a-f0-9-]+\.pdf$/);
  assert.equal(new URL(novo.caminho).pathname, `/storage/v1/object/sign/deppi-docs/${gravado.caminho}`);

  falharCriacao = true;
  const antesDoErro = [...objetos];
  await assert.rejects(documentos.enviarDocumento(envio), /Banco indisponível/);
  assert.deepEqual([...objetos], antesDoErro);

  rejeitarExclusao = true;
  await assert.rejects(documentos.removerDocumento(legado.id, "deppi"), { statusCode: 502 });
  assert.equal(excluir.mock.callCount(), 0);
  rejeitarExclusao = false;
  await documentos.removerDocumento(legado.id, "deppi");
  assert.equal(objetos.has(`deppi-docs/${chaveLegada}`), false);
  assert.equal(excluir.mock.callCount(), 1);

  const mostrarCapa = new ShowCoverService();
  assert.match(await mostrarCapa.execute({ cursoID: "curso-1" }), /\/sign\/deppi-docs\/covers\/legada\.png\?/);
  await new UploadCoverService().execute({
    cursoID: "curso-1",
    file: { ...file, originalname: "capa.png", mimetype: "image/png" },
  });
  assert.equal(caminhoCapa, `${publicUrl}/deppi-image/covers/${nomeCapa}`);
  assert.match(await mostrarCapa.execute({ cursoID: "curso-1" }), /\/sign\/deppi-image\/covers\//);

  legado.caminho = legado.caminho.replace(origem, "https://outro.example.test");
  await assert.rejects(documentos.removerDocumento(legado.id, "deppi"), (error: unknown) =>
    error instanceof AppError && error.statusCode === 422);
});
