# Plano de ajustes da aprovação de cursos

## Objetivo

Corrigir o fluxo de aprovação e alteração de status dos cursos para que a autorização seja baseada nas permissões reais do usuário, os status aceitos sejam válidos e o comportamento de visibilidade dos cursos permaneça consistente.

## Estado da implementação

- Implementado: a atualização valida `status` contra os quatro valores do enum.
- Implementado: usuários com `CRIAR_CURSO` podem atualizar dados do curso, mas somente quem tem `GERENCIAR_CURSO` pode alterar o status.
- Implementado: a autorização é verificada nas permissões atuais do banco, em vez de depender de `cargo` inexistente no objeto recebido pelo serviço.
- Decisões aplicadas: qualquer transição entre status válidos é permitida a quem tem `GERENCIAR_CURSO`; cursos criados por `DEPPI` começam em `ANDAMENTO`, e os demais em `ANALISE`.
- Implementado: as consultas de curso determinam os cargos pelo banco, mantendo para alunos a restrição a cursos em andamento; inscrições também recusam cursos fora de `ANDAMENTO`.
- Verificações concluídas: `npm run typecheck`, validação do enum e `git diff --check`. Testes de integração com banco e permissões reais ainda não foram executados.

## Problema identificado

O fluxo atual usa `PUT /cursos/:id` para atualizar dados do curso e seu status. A rota permite a chamada a quem tenha `CRIAR_CURSO` ou `GERENCIAR_CURSO`, mas há uma inconsistência na autorização:

- O middleware de autenticação coloca `userId`, `roleId` e `permissions` em `req.user`.
- O controller repassa esse objeto como `UsuarioLogado`, cuja interface espera `userId` e `cargo`.
- O serviço verifica `usuarioLogado.cargo === "DEPPI"` para decidir o status inicial e permitir alterações de status. O campo `cargo` não é preenchido pelo middleware.

Assim, mesmo com permissão de gerenciamento, a verificação de `cargo` pode falhar. Além disso, o schema de atualização aceita qualquer texto em `status`, embora o banco aceite somente os valores do enum `StatusCurso`.

## Comportamento atual relevante

- Status existentes: `ANALISE`, `ANDAMENTO`, `CONCLUIDO` e `FECHADO`.
- Ao criar, o serviço tenta definir `ANDAMENTO` para `DEPPI` e `ANALISE` para outros usuários, usando o campo `cargo`.
- A rota de atualização exige `CRIAR_CURSO` ou `GERENCIAR_CURSO`.
- O serviço permite alterar status somente quando `cargo` é `DEPPI`.
- Listagem e busca limitam alunos a cursos `ANDAMENTO`; cursos em análise não devem ser exibidos como disponíveis para inscrição.
- Não existe uma rota específica de aprovação; a alteração é feita pela atualização geral do curso.

## Decisões de implementação aplicadas

1. **Autorizar pela permissão.** `GERENCIAR_CURSO` é necessária para alterar status. A checagem usa as permissões atuais do banco.
2. **Separar edição e alteração de status.** O endpoint permanece `PUT /cursos/:id`; `CRIAR_CURSO` pode editar campos sem status, enquanto status exige `GERENCIAR_CURSO`.
3. **Validar o enum.** `status` aceita somente `ANALISE`, `ANDAMENTO`, `CONCLUIDO` ou `FECHADO`.
4. **Transições sem matriz restritiva.** Qualquer transição entre esses valores é aceita para quem tem `GERENCIAR_CURSO`.
5. **Status inicial.** Cursos criados por usuário com cargo `DEPPI` iniciam em `ANDAMENTO`; os demais iniciam em `ANALISE`. O cargo é consultado no banco.

## Plano de trabalho

### 1. Alinhar tipos e autenticação

- Revisar `UsuarioLogado` e `getUsuarioLogado` para representar de forma correta os dados realmente fornecidos pelo middleware.
- Não confiar em `cargo` ou permissões enviados no corpo da requisição.
- Escolher uma única fonte para autorização de status: preferencialmente a permissão consultada no RBAC já existente (`GERENCIAR_CURSO`) ou uma validação de rota equivalente.
- Evitar duplicar regras divergentes entre middleware, controller e serviço.

### 2. Aplicar autorização diferenciada na atualização

- Preservar a possibilidade de `CRIAR_CURSO` atualizar os campos do curso sem alterar o status.
- Exigir `GERENCIAR_CURSO` para qualquer requisição que inclua `status`.
- Se mantida a rota única, separar claramente a autorização para o campo `status` da autorização geral da rota; uma alternativa é criar uma rota dedicada a status, desde que o contrato com o front-end seja atualizado.
- Retornar `403` quando a pessoa não tiver autorização para alterar status, sem persistir nenhuma parte da requisição.

### 3. Validar o status

- Alterar o schema para validar `status` contra `ANALISE`, `ANDAMENTO`, `CONCLUIDO` e `FECHADO`.
- Rejeitar string vazia, valores desconhecidos e tipos incorretos com `400`.
- Manter `status` opcional nas atualizações que modificam outros campos.

### 4. Transições e criação

- Não há matriz de transição: qualquer status válido pode ser substituído por outro status válido por usuário com `GERENCIAR_CURSO`, inclusive reabrir um curso concluído ou fechado.
- Cursos criados por `DEPPI` iniciam em `ANDAMENTO`; cursos dos demais cargos iniciam em `ANALISE`.

### 5. Manter visibilidade consistente

- Confirmar que cursos em `ANALISE`, `CONCLUIDO` e `FECHADO` não são apresentados a alunos como disponíveis para inscrição.
- Conferir tanto listagem quanto busca por ID e o endpoint de inscrição, para que não seja possível inscrever-se em curso fora de `ANDAMENTO`.
- Preservar a visibilidade administrativa dos cursos, incluindo os que aguardam aprovação.

### 6. Respostas e documentação

- Padronizar `400` para dados/status inválidos, `403` para falta de permissão e `404` para curso inexistente.
- Atualizar a documentação de cursos com o método, payload, permissões e status aceitos.
- Atualizar o front-end para enviar somente transições suportadas e tratar os erros de validação/autorização.

## Arquivos prováveis

- `src/routes/course.routes.ts` — autorização da atualização e, se escolhida, nova rota de status.
- `src/controllers/course.controller.ts` — validação do payload e resposta de erro.
- `src/services/course.service.ts` — regra de autorização, estado atual e transições.
- `src/schemas/course.schema.ts` — enum de status e validação de atualização.
- `src/services/rbac.service.ts` e `src/middleware/rbac.middleware.ts` — reutilização da política de permissões, se necessário.
- `src/services/inscricao.service.ts` — confirmar que inscrições respeitam o status do curso.
- `prisma/seed.ts` — verificar que `GERENCIAR_CURSO` está atribuída a `DEPPI`.

Não é esperada alteração no banco: os status já estão definidos no enum `StatusCurso`.

## Testes e critérios de aceite

- `DEPPI` com `GERENCIAR_CURSO` consegue mudar o status de um curso para qualquer valor válido.
- Professor com apenas `CRIAR_CURSO` consegue editar campos permitidos, mas recebe `403` ao tentar alterar `status`.
- Usuário sem a permissão necessária recebe `403`.
- Status fora do enum retorna `400` sem alterar o curso.
- Curso inexistente retorna `404`.
- Uma requisição que combina campos válidos com status não autorizado não persiste nenhum campo.
- Cursos em `ANALISE`, `CONCLUIDO` ou `FECHADO` não ficam disponíveis para alunos nem aceitam inscrição.
- Curso em `ANDAMENTO` continua visível e elegível à inscrição, respeitadas as demais regras.
- A criação mantém `ANDAMENTO` para `DEPPI` e `ANALISE` para os demais cargos.

## Validação executada

- `npm run typecheck` passou.
- Testes do schema confirmaram os quatro status permitidos, rejeição de status inválido e atualizações sem status.
- `git diff --check` passou.
- A criação/alteração no banco, as permissões consultadas do RBAC e as inscrições foram verificadas por código, mas não testadas em integração com banco.
