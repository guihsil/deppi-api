import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import { professorRoutes } from "../src/routes/professor.routes";
import { prisma } from "../src/lib/prisma";
import { professorCursosQuerySchema } from "../src/schemas/professor-cursos.schema";
import { createCourseSchema, updateCourse } from "../src/schemas/course.schema";
import { CourseService } from "../src/services/course.service";

// Prisma delegates expose methods through a proxy; replace and restore directly.
function stub(target: any, method: string, implementation: (...args: any[]) => any) {
  const original = target[method];
  target[method] = implementation;
  return { mock: { restore: () => { target[method] = original; } } };
}

test("validação estrita da paginação", () => {
  assert.deepEqual(professorCursosQuerySchema.parse({}), { page: 1, limit: 10 });
  for (const query of [
    { page: "" }, { page: "0" }, { page: "-1" }, { page: "1.5" },
    { limit: "101" }, { page: ["1", "2"] }, { page: { value: "1" } },
    { fkCriador: "outro" }, { page: "9007199254740991", limit: "100" },
  ]) assert.equal(professorCursosQuerySchema.safeParse(query).success, false);
});

test("HTTP: autenticação, autorização, autoria e contrato", async () => {
  process.env.JWT_SECRET = "test-only-secret";
  let cargos = ["PROFESSOR", "ADMIN"];
  let perfil = true;
  let falha = false;
  const chamadas: any[] = [];
  const usuario = stub(prisma.usuario, "findUnique", async () => ({
    cargos: cargos.map(cargo => ({ cargo })),
  }));
  const professor = stub(prisma.professor, "findUnique", async () => perfil ? { id: "professor-a" } : null);
  const fixture = {
    id: "curso-a", nome: "Curso A", status: "ANDAMENTO", carga_horaria: 40,
    dataInicio: new Date("2026-11-20"), dataFim: new Date("2026-12-20"),
    Instituicao: { id: "instituicao", nome: "IFCE", campus: "Fortaleza" },
    inscricao: ["PENDENTE", "DEFERIDO", "INDEFERIDO", "CANCELADO"].map((status, i) => ({
      id: String(i), data: new Date("2026-11-16"), status,
      aluno: { id: "aluno", matricula: "123", usuario: {
        nome: "Maria", nomeSocial: null, emailInstitucional: "maria@ifce.edu.br",
      } },
    })),
  };
  const find = stub(prisma.curso, "findMany", (args: any) => {
    chamadas.push(args);
    return Promise.resolve(args.skip ? [] : [fixture]);
  });
  const count = stub(prisma.curso, "count", (args: any) => {
    assert.deepEqual(args.where, { fkCriador: "usuario-a" });
    return Promise.resolve(1);
  });
  const transaction = stub(prisma, "$transaction", async (queries: any, options: any) => {
    assert.equal(options.isolationLevel, "RepeatableRead");
    if (falha) throw new Error("segredo interno");
    return Promise.all(queries);
  });
  const app = express();
  app.use(professorRoutes);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as import("node:net").AddressInfo;
  const url = `http://127.0.0.1:${address.port}/professores/me/cursos`;
  const token = jwt.sign({ userId: "usuario-a" }, process.env.JWT_SECRET);
  const request = (query = "", bearer: string | null = token) =>
    fetch(url + query, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {} });
  try {
    assert.equal((await request("", null)).status, 401);
    assert.equal((await request("", "invalido")).status, 401);
    assert.equal((await request("", jwt.sign({ userId: "usuario-a" }, process.env.JWT_SECRET, { expiresIn: -1 }))).status, 401);
    assert.equal((await request("", jwt.sign({}, process.env.JWT_SECRET))).status, 401);
    for (const cargo of ["ALUNO", "ADMIN", "DEPPI"]) {
      cargos = [cargo];
      assert.equal((await request()).status, 403);
    }
    cargos = ["PROFESSOR", "ADMIN"];
    perfil = false;
    assert.equal((await request()).status, 404);
    perfil = true;
    for (const query of ["?page=0", "?page=1&page=2", "?page[x]=1", "?fkCriador=outro"]) {
      assert.equal((await request(query)).status, 400);
    }
    const response = await request();
    assert.equal(response.status, 200);
    const body = await response.json() as any;
    assert.equal(body.data[0].totalInscricoes, 4);
    assert.deepEqual(Object.keys(body.data[0].inscricoes[0].aluno).sort(),
      ["id", "matricula", "nome", "nomeSocial", "emailInstitucional"].sort());
    assert.equal(body.data[0].Instituicao, undefined);
    assert.deepEqual(chamadas[0].where, { fkCriador: "usuario-a" });
    assert.deepEqual(chamadas[0].orderBy, [{ nome: "asc" }, { id: "asc" }]);
    assert.deepEqual(chamadas[0].select.inscricao.select.aluno.select.usuario.select,
      { nome: true, nomeSocial: true, emailInstitucional: true });
    const beyond = await (await request("?page=2")).json() as any;
    assert.deepEqual(beyond.data, []);
    assert.equal(beyond.pagination.total, 1);
    falha = true;
    const erro = await request();
    assert.equal(erro.status, 500);
    assert.deepEqual(await erro.json(), { erro: "Erro ao listar cursos do professor." });
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const spy of [usuario, professor, find, count, transaction]) spy.mock.restore();
  }
});

test("criação usa autor autenticado e schemas não permitem alterar autoria", async () => {
  const input = {
    nome: "Curso", carga_horaria: 20, vagas: 10,
    dataInicio: "2026-11-20", dataFim: "2026-12-20",
    horarioInicio: "08:00:00", horarioFim: "10:00:00",
    fkInstituicao: "11111111-1111-4111-8111-111111111111", fkCriador: "forjado",
  };
  const parsed = createCourseSchema.parse(input);
  assert.equal("fkCriador" in parsed, false);
  assert.equal("fkCriador" in updateCourse.parse({ fkCriador: "forjado" }), false);
  const usuario = stub(prisma.usuario, "findUnique", async () => ({ cargos: [{ cargo: "PROFESSOR" }] }));
  const instituicao = stub(prisma.instituicao, "findUnique", async () => ({ id: input.fkInstituicao }));
  const create = stub(prisma.curso, "create", async (args: any) => {
    assert.equal(args.data.fkCriador, "autor-real");
    assert.equal(args.data.status, "ANALISE");
    return args.data;
  });
  try {
    await new CourseService().createCourse(parsed, { userId: "autor-real" });
  } finally {
    for (const spy of [usuario, instituicao, create]) spy.mock.restore();
  }
});
