# Plano de Implementação: Dashboard Administrativo

Conforme as suas especificações, elaborei um plano para consolidar todas as estatísticas solicitadas em um único endpoint, garantindo eficiência nas consultas e facilidade de consumo pelo Frontend.

## 1. Definição do Endpoint

- **Rota sugerida:** `GET /admin/dashboard/summary` (ou `/admin/estatisticas`)
- **Query Params esperados (opcional):** 
  - `cargos`: Pode receber um ou vários cargos (ex: `?cargos=ADMIN&cargos=ALUNO`).

## 2. Estrutura do Payload de Resposta (JSON)

Para facilitar a integração, o endpoint retornará um objeto unificado separado por entidades:

```json
{
  "usuarios": {
    "total": 1500,
    "filtroCargos": 120 // Retornado caso o parâmetro "cargos" seja enviado
  },
  "instituicoes": {
    "total": 5
  },
  "cursos": {
    "total": 25,
    "porStatus": {
      "ANDAMENTO": 10,
      "ANALISE": 5,
      "CONCLUIDO": 8,
      "FECHADO": 2
    },
    "vagas": {
      "totalOfertadas": 1000,
      "totalInscritos": 850,
      "vagasRestantes": 150
    }
  },
  "inscricoes": {
    "total": 850,
    "porStatus": {
      "PENDENTE": 150,
      "DEFERIDO": 500,
      "INDEFERIDO": 150,
      "CANCELADO": 50
    }
  }
}
```

## 3. Lógica de Implementação e Consultas no Prisma

Como estamos utilizando o **Prisma ORM**, podemos fazer essas consultas de forma otimizada. Podemos disparar as requisições ao banco paralelamente utilizando `Promise.all` para diminuir o tempo de resposta do endpoint.

### 3.1. Consulta de Usuários
- **Contagem Geral:** `prisma.usuario.count()`
- **Contagem por Cargo (se passado por Query Param):**
  ```typescript
  const usuariosPorCargo = await prisma.usuario.count({
    where: {
      cargos: {
        some: {
          cargo: { in: cargosArray } // cargosArray = ['ALUNO', 'ADMIN'] etc.
        }
      }
    }
  });
  ```

### 3.2. Consulta de Instituições
- **Contagem Geral:** `prisma.instituicao.count()`

### 3.3. Consulta de Cursos (Quantidade e Situação)
- **Contagem Total:** `prisma.curso.count()`
- **Contagem por Situação:**
  Agruparemos os cursos pela propriedade `status` (`ANDAMENTO`, `ANALISE`, `CONCLUIDO`, `FECHADO`):
  ```typescript
  const cursosPorStatus = await prisma.curso.groupBy({
    by: ['status'],
    _count: true
  });
  ```

### 3.4. Consulta de Inscrições (Quantidade e Status)
- **Contagem Total:** `prisma.inscricao.count()`
- **Contagem por Status:**
  Agruparemos pela propriedade `status` (`PENDENTE`, `DEFERIDO`, `INDEFERIDO`, `CANCELADO`):
  ```typescript
  const inscricoesPorStatus = await prisma.inscricao.groupBy({
    by: ['status'],
    _count: true
  });
  ```

### 3.5. Cálculo de Vagas Restantes
Como o banco de dados armazena apenas o limite total de vagas por curso (`curso.vagas`), precisaremos cruzar essa informação com a quantidade de inscritos em cada curso.
  
**Abordagem Sugerida:**
Buscamos todos os cursos e, via Prisma, já trazemos o número total de inscrições correspondentes a eles filtrando APENAS pelas inscrições com status `DEFERIDO` (pois apenas os deferidos ocupam de fato a vaga).

```typescript
const cursosComVagas = await prisma.curso.findMany({
  select: {
    vagas: true,
    _count: {
      select: { 
        inscricao: {
          where: {
            status: 'DEFERIDO'
          }
        }
      }
    }
  }
});

let totalOfertadas = 0;
let totalInscritosDeferidos = 0;

cursosComVagas.forEach(curso => {
  totalOfertadas += curso.vagas;
  totalInscritosDeferidos += curso._count.inscricao;
});

const vagasRestantes = totalOfertadas - totalInscritosDeferidos;
```
*(Nota: Inscrições PENDENTES, INDEFERIDAS ou CANCELADAS não irão subtrair do total de vagas contabilizadas).*

## 4. Otimização (Próximos Passos na Implementação)

O *Controller* responsável por esse endpoint consolidará os resultados. Para garantir que o painel de administração carregue rapidamente, uniremos as promessas utilizando `Promise.all`:

```typescript
const [
    totalUsuarios,
    totalInstituicoes,
    totalCursos,
    cursosPorStatusQuery,
    totalInscricoes,
    inscricoesPorStatusQuery,
    cursosComVagas
] = await Promise.all([
    // ... chamadas correspondentes do Prisma
]);
```

Em seguida, os dados resultantes serão montados e formatados no JSON esperado e retornados ao cliente.

