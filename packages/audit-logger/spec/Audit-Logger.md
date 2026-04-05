# 📘 Guia Completo de Implementação — `@internal/audit-logger`

### Da Especificação ao MVP — Uma Jornada Educacional para Desenvolvedores

> **Autor:** Caio Emanuel  
> **Base:** spec-v4-final.md  
> **Estrutura:** Monorepo como lib interna plug-and-play  
> **Runtime:** Node.js v20+ | JavaScript puro + JSDoc | PostgreSQL

---

## 📑 Sumário

1. [Fundamentos que Você Precisa Dominar](#1-fundamentos-que-você-precisa-dominar)
2. [Estrutura Monorepo — O Projeto Como Biblioteca Interna](#2-estrutura-monorepo)
3. [JSDoc — Como Comentar Todo o Código](#3-jsdoc-guia-completo)
4. [MVP — Versão 1.0 (Core Funcional)](#4-mvp-versão-10)
5. [Versão 1.1 — Buffer e Batch Processing](#5-versão-11---buffer-e-batch-processing)
6. [Versão 1.2 — Fallback e Resiliência](#6-versão-12---fallback-e-resiliência)
7. [Versão 1.3 — Sanitização e Segurança](#7-versão-13---sanitização-e-segurança)
8. [Versão 2.0 — Agregação e Anomalias](#8-versão-20---agregação-e-anomalias)
9. [Versão 3.0 — Full Production (spec-v4 completa)](#9-versão-30---full-production)
10. [Checklist de Entrega por Versão](#10-checklist-por-versão)

---

# 1. Fundamentos que Você Precisa Dominar

> 🎯 **Mentalidade de sênior:** Antes de escrever uma linha de código, entenda **por que** cada decisão foi tomada. Código sem contexto é código sem manutenção.

---

## 1.1 Clean Architecture — Por que Usamos Camadas?

**O que é:** Uma forma de organizar código onde as regras de negócio ficam isoladas de detalhes técnicos (banco de dados, HTTP, arquivos).

**Por que importa aqui:** Se amanhã migrarmos do PostgreSQL para MongoDB, só mudamos a camada de infrastructure — o domínio e a aplicação continuam **exatamente iguais**.

```
Regra de ouro: dependências apontam sempre para dentro.
Domínio não conhece Express. Aplicação não conhece PostgreSQL.
```

**Estude antes de implementar:**

- [Clean Architecture — Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- Conceito de **Ports & Adapters** (Hexagonal Architecture)
- O que é uma **Interface** (contrato) versus uma **Implementação**

**As 4 camadas do projeto:**

| Camada         | Pasta                 | Responsabilidade        | Conhece quem?        |
| -------------- | --------------------- | ----------------------- | -------------------- |
| Domain         | `src/domain/`         | Regras de negócio puras | Ninguém              |
| Application    | `src/application/`    | Orquestra casos de uso  | Domain               |
| Infrastructure | `src/infrastructure/` | Banco, arquivos, rede   | Application + Domain |
| Adapters       | `src/adapters/`       | Express, Fastify        | Application          |

---

## 1.2 Padrão Fire-and-Forget

**O que é:** Disparar uma operação assíncrona sem esperar ela terminar.

**Por que é crítico aqui:** O middleware de auditoria **nunca pode atrasar uma requisição HTTP**. O usuário não pode esperar 50ms extras porque você quer salvar um log.

```javascript
// ❌ ERRADO — bloqueia a requisição
res.on("finish", async () => {
  await saveLog(data); // ← usuário espera isso terminar
  next();
});

// ✅ CORRETO — fire-and-forget
res.on("finish", () => {
  saveLog(data).catch((err) => console.error(err)); // ← dispara e esquece
  // next() já foi chamado antes, usuário já recebeu resposta
});
```

**Estude antes de implementar:**

- Event Loop do Node.js (como `async` funciona)
- `Promise.catch()` vs `try/catch` em código assíncrono
- Por que `.catch()` é obrigatório em fire-and-forget (evitar `UnhandledPromiseRejection`)

---

## 1.3 EventEmitter — O Coração do Buffer

**O que é:** Sistema nativo do Node.js para comunicação entre partes do código via eventos.

**Por que usamos aqui:** O `AuditBuffer` acumula logs e, quando cheio (500 items) ou após 1 segundo, **emite um evento `'flush'`**. O `BatchWorker` escuta esse evento e persiste no banco.

```javascript
const EventEmitter = require("node:events");

class AuditBuffer extends EventEmitter {
  add(log) {
    this._items.push(log);
    if (this._items.length >= 500) {
      this.emit("flush", this._items.splice(0)); // ← dispara evento
    }
  }
}

// Em outro lugar:
buffer.on("flush", (batch) => {
  worker.processBatch(batch); // ← reage ao evento
});
```

**Estude antes de implementar:**

- `node:events` — `EventEmitter`, `.on()`, `.emit()`, `.once()`
- Observer Pattern (o padrão de design por trás dos eventos)
- Por que `splice(0)` cria uma cópia e limpa o array original ao mesmo tempo

---

## 1.4 PostgreSQL Particionamento por Intervalo (Range Partitioning)

**O que é:** Uma tabela grande dividida em "fatias" menores (partições) por um critério (aqui: data).

**Por que usamos aqui:** Com milhões de logs, uma tabela única ficaria lenta. Com partições diárias, uma query em "logs de hoje" varre apenas a partição do dia — **partition pruning** automático do PostgreSQL.

```sql
-- Tabela mãe (não armazena dados diretamente)
CREATE TABLE audit_logs (
  id BIGSERIAL,
  timestamp TIMESTAMP NOT NULL,
  ...
  PRIMARY KEY (id, timestamp)   -- ← timestamp OBRIGATÓRIO na PK quando particionado
) PARTITION BY RANGE (timestamp);

-- Partição filha (aqui ficam os dados reais)
CREATE TABLE audit_logs_2026_03_30
PARTITION OF audit_logs
FOR VALUES FROM ('2026-03-30') TO ('2026-03-31');
```

**Estude antes de implementar:**

- PostgreSQL Partitioning (docs oficiais)
- Por que a PK precisa incluir a coluna de partição
- `PARTITION BY RANGE` vs `PARTITION BY LIST` vs `PARTITION BY HASH`
- `DROP TABLE` em partição é O(1) — muito mais rápido que `DELETE`

---

## 1.5 Singleton Pattern — Uma Única Conexão com o Banco

**O que é:** Garantir que uma classe seja instanciada apenas uma vez durante toda a vida da aplicação.

**Por que usamos aqui:** Conexões com banco são caras. Se cada request criasse uma nova conexão, a aplicação explodiria. O `PostgreSQLConnection` usa um pool de conexões compartilhado.

```javascript
// Singleton via módulo Node.js (a forma mais simples e segura)
// PostgreSQLConnection.js
let _instance = null;

class PostgreSQLConnection {
  static getInstance() {
    if (!_instance) {
      _instance = new PostgreSQLConnection();
    }
    return _instance;
  }
}

module.exports = PostgreSQLConnection;
// O require() do Node.js já cacheia o módulo — mesma instância sempre
```

**Estude antes de implementar:**

- Por que `require()` do Node.js é um singleton por natureza (module cache)
- Connection Pool: `pg` (node-postgres) — `min`, `max`, `idleTimeoutMillis`
- Diferença entre criar uma `Connection` e pegar uma do `Pool`

---

## 1.6 UUID v4 — Identificadores Únicos Distribuídos

**O que é:** Um identificador de 128 bits gerado aleatoriamente, praticamente impossível de colidir.

**Por que usamos aqui:** Cada requisição HTTP recebe um `request_id` único. Em sistemas distribuídos, esse ID permite rastrear uma requisição entre múltiplos serviços (correlation ID).

```javascript
// Node.js v20+ tem crypto.randomUUID() nativo — sem dependência!
const { randomUUID } = require("node:crypto");

const requestId = randomUUID();
// → "550e8400-e29b-41d4-a716-446655440000"
```

**Estude antes de implementar:**

- RFC 4122 — o padrão UUID
- Por que `crypto.randomUUID()` é preferível a `uuid` package no Node.js v20+
- Formato: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` (o "4" identifica v4)

---

## 1.7 SHA-256 — Anonimização de Identidade

**O que é:** Função de hash criptográfica que transforma qualquer dado em 64 caracteres hexadecimais de forma determinística e irreversível.

**Por que usamos aqui:** O `anonymous_id` é `SHA256(ip + userAgent)`. Isso permite detectar padrões de um mesmo usuário anônimo sem armazenar dados pessoais diretamente (compliance LGPD/GDPR).

```javascript
const { createHash } = require("node:crypto");

function generateAnonymousId(ip, userAgent) {
  return createHash("sha256").update(`${ip}${userAgent}`).digest("hex"); // → 64 caracteres hexadecimais
}
```

**Estude antes de implementar:**

- Diferença entre hash e criptografia (hash é unidirecional)
- Por que SHA-256 é preferível a MD5 (colisões conhecidas em MD5)
- LGPD/GDPR: por que anonimizar dados de usuário em logs

---

## 1.8 JSONB no PostgreSQL — Payloads Flexíveis

**O que é:** Tipo de dado do PostgreSQL que armazena JSON em formato binário comprimido e indexável.

**Por que usamos aqui:** Os campos `body`, `headers` e `response_body` têm estrutura variável (cada API retorna coisas diferentes). JSONB permite armazenar qualquer estrutura **e ainda fazer queries dentro do JSON**.

```sql
-- Armazenar
INSERT INTO audit_logs (body) VALUES ('{"email": "user@example.com"}'::jsonb);

-- Queries dentro do JSONB
SELECT * FROM audit_logs WHERE body->>'email' = 'user@example.com';
SELECT * FROM audit_logs WHERE (body->'user'->>'id') IS NOT NULL;
```

**Estude antes de implementar:**

- `JSON` vs `JSONB` no PostgreSQL (JSONB é indexável e mais eficiente)
- Operadores: `->` (retorna JSON), `->>` (retorna text), `#>` (path)
- GIN index em JSONB para buscas rápidas dentro do payload

---

# 2. Estrutura Monorepo

> 🎯 **O projeto é uma biblioteca interna.** Outros serviços da sua organização vão instalá-lo como dependência local e usá-lo como plug-and-play.

---

## 2.1 O que é um Monorepo?

**Definição:** Um único repositório Git que contém múltiplos pacotes (packages) independentes, compartilhando tooling (ESLint, Vitest, Prettier) mas com seus próprios `package.json`.

**Por que aqui:** O `audit-logger` precisa funcionar como uma **lib interna** (`@internal/audit-logger`) que qualquer serviço da empresa pode instalar. Com monorepo, o código fica junto, mas o consumo é como um pacote externo.

**Estude antes de implementar:**

- NPM Workspaces (nativo no npm v7+)
- Conceito de `workspace:*` no `package.json`
- Por que `@internal/` como namespace de pacotes privados

---

## 2.2 Estrutura Completa do Monorepo

```
audit-monorepo/                     ← Raiz do repositório
│
├── package.json                    ← Configuração root (workspaces)
├── .nvmrc                          ← Versão do Node.js (20)
├── .eslintrc.js                    ← ESLint compartilhado
├── .prettierrc                     ← Prettier compartilhado
├── vitest.workspace.js             ← Vitest workspace config
│
├── packages/
│   └── audit-logger/               ← O pacote principal
│       ├── package.json            ← "name": "@internal/audit-logger"
│       ├── index.js                ← Facade pública (entry point)
│       ├── audit.config.js         ← Configuração padrão
│       ├── .env.example            ← Variáveis de ambiente documentadas
│       │
│       └── src/
│           ├── domain/
│           │   ├── entities/
│           │   │   └── AuditLog.js
│           │   ├── services/
│           │   │   ├── SeverityClassifier.js
│           │   │   ├── IpExtractor.js
│           │   │   ├── UserIdExtractor.js
│           │   │   └── AnonymousIdGenerator.js
│           │   └── exceptions/
│           │       └── InvalidAuditLogError.js
│           │
│           ├── application/
│           │   ├── useCases/
│           │   │   └── SaveAuditLogUseCase.js
│           │   ├── buffer/
│           │   │   └── AuditBuffer.js
│           │   └── ports/
│           │       └── IAuditLogRepository.js
│           │
│           ├── adapters/
│           │   ├── middlewares/
│           │   │   ├── ExpressMiddleware.js
│           │   │   └── FastifyMiddleware.js
│           │   └── extractors/
│           │       └── RequestDataExtractor.js
│           │
│           ├── infrastructure/
│           │   ├── database/
│           │   │   ├── PostgreSQLConnection.js
│           │   │   ├── AuditLogRepository.js
│           │   │   ├── PartitionManager.js
│           │   │   └── BatchWorker.js
│           │   ├── aggregation/
│           │   │   ├── DailySummaryJob.js
│           │   │   ├── MonthlySummaryJob.js
│           │   │   ├── AnomalyDetector.js
│           │   │   └── RetentionManager.js
│           │   ├── fallback/
│           │   │   └── FallbackRepository.js
│           │   └── logger/
│           │       └── WinstonLogger.js
│           │
│           └── utils/
│               ├── DataSanitizer.js
│               ├── PayloadTruncator.js
│               ├── FieldLimitConstants.js
│               └── constants.js
│
└── examples/                       ← Projetos de exemplo que consomem o pacote
    ├── express-example/
    │   ├── package.json            ← "dependencies": { "@internal/audit-logger": "workspace:*" }
    │   └── server.js
    └── fastify-example/
        ├── package.json
        └── server.js
```

---

## 2.3 Arquivos de Configuração do Monorepo

### `package.json` (raiz)

```json
{
  "name": "audit-monorepo",
  "private": true,
  "workspaces": ["packages/*", "examples/*"],
  "scripts": {
    "test": "vitest run --workspace vitest.workspace.js",
    "test:watch": "vitest --workspace vitest.workspace.js",
    "lint": "eslint packages/*/src/**/*.js",
    "build": "echo 'JS puro, sem build necessário'"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "devDependencies": {
    "eslint": "^8.57.0",
    "prettier": "^3.0.0",
    "vitest": "^1.0.0"
  }
}
```

### `packages/audit-logger/package.json`

```json
{
  "name": "@internal/audit-logger",
  "version": "1.0.0",
  "description": "Middleware de auditoria HTTP plug-and-play para Node.js",
  "main": "index.js",
  "exports": {
    ".": "./index.js",
    "./express": "./src/adapters/middlewares/ExpressMiddleware.js",
    "./fastify": "./src/adapters/middlewares/FastifyMiddleware.js"
  },
  "engines": {
    "node": ">=20.0.0"
  },
  "dependencies": {
    "pg": "^8.11.0",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "vitest": "workspace:*",
    "express": "^4.18.0"
  },
  "scripts": {
    "test": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### `vitest.workspace.js` (raiz)

```javascript
// Como o Vitest sabe quais pacotes testar no monorepo
import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["packages/*/vitest.config.js"]);
```

### Como um serviço consome o pacote

```json
// examples/express-example/package.json
{
  "name": "express-example",
  "dependencies": {
    "@internal/audit-logger": "workspace:*",
    "express": "^4.18.0"
  }
}
```

```javascript
// examples/express-example/server.js
const express = require("express");
const { Audit } = require("@internal/audit-logger"); // ← importa como lib!

const app = express();

async function main() {
  await Audit.initialize({ databaseUrl: process.env.DATABASE_URL });
  app.use(Audit.expressMiddleware());
  app.listen(3000);
}

main();
```

---

# 3. JSDoc — Guia Completo

> 🎯 **Por que JSDoc?** Em JavaScript puro (sem TypeScript), o JSDoc é a única forma de ter **autocomplete, type checking e documentação** no seu editor. A spec-v4 exige JS puro com JSDoc — então vamos dominar isso.

---

## 3.1 O que é JSDoc?

JSDoc é um sistema de comentários estruturados que seu editor (VS Code, WebStorm) consegue interpretar para fornecer:

- Autocomplete com tipos
- Warnings quando você passa o tipo errado
- Documentação inline ao passar o mouse sobre funções
- Geração automática de documentação HTML

**Configuração no VS Code:** Crie `jsconfig.json` na raiz do pacote:

```json
{
  "compilerOptions": {
    "checkJs": true,
    "strict": false,
    "target": "ES2022",
    "module": "CommonJS"
  },
  "include": ["src/**/*.js", "index.js"]
}
```

---

## 3.2 Anatomia de um Comentário JSDoc

```javascript
/**
 * ← Começa com barra + dois asteriscos
 * ← Cada linha começa com asterisco
 * ← Termina com asterisco + barra
 */
```

**Regra de ouro:** Todo arquivo, classe, função e parâmetro complexo deve ter JSDoc.

---

## 3.3 Tags JSDoc Mais Importantes

### `@param` — Documentar Parâmetros

```javascript
/**
 * Calcula a severidade baseada no status HTTP.
 *
 * @param {number} statusCode - Código de status HTTP (100-599)
 * @returns {string} Severidade: 'INFO', 'WARN' ou 'ERROR'
 */
function classify(statusCode) { ... }

// Com objeto complexo:
/**
 * @param {Object} options - Opções de configuração
 * @param {number} options.maxBatchSize - Tamanho máximo do batch
 * @param {number} options.flushInterval - Intervalo de flush em ms
 * @param {boolean} [options.enabled=true] - Se a auditoria está ativa (opcional)
 */
function configure(options) { ... }

// Com array:
/**
 * @param {AuditLog[]} logs - Lista de logs para persistir
 */
async function saveBatch(logs) { ... }
```

### `@typedef` — Definir Tipos Reutilizáveis

```javascript
/**
 * Representa um log de auditoria completo.
 *
 * @typedef {Object} AuditLog
 * @property {string} request_id - UUID v4 único por requisição
 * @property {string} ip - IP do cliente (nunca null, usa 'UNKNOWN')
 * @property {string} url - URL da requisição (max 2048 bytes)
 * @property {string} method - Método HTTP em maiúsculas
 * @property {number} statusCode - Status HTTP (100-599)
 * @property {'INFO'|'WARN'|'ERROR'} severity - Severidade derivada do status
 * @property {Object|null} [body] - Body da requisição (sanitizado)
 * @property {number} [duration_ms] - Latência em milissegundos
 * @property {Date} timestamp - Momento da requisição (UTC)
 */
```

### `@throws` — Documentar Exceções

```javascript
/**
 * Cria e valida um novo AuditLog.
 *
 * @param {Object} data - Dados brutos da requisição
 * @returns {AuditLog} Log validado e com campos auto-gerados
 * @throws {InvalidAuditLogError} Se statusCode inválido ou URL vazia
 */
function create(data) { ... }
```

### `@class` e `@constructor`

```javascript
/**
 * Buffer em memória para acúmulo de logs de auditoria.
 * Emite evento 'flush' quando atinge capacidade ou timeout.
 *
 * @class
 * @extends EventEmitter
 * @fires AuditBuffer#flush
 *
 * @example
 * const buffer = new AuditBuffer({ maxSize: 500, flushInterval: 1000 });
 * buffer.on('flush', (batch) => console.log(batch.length));
 * buffer.add(auditLog);
 */
class AuditBuffer extends EventEmitter {
  /**
   * @constructor
   * @param {Object} options
   * @param {number} [options.maxSize=500] - Logs antes do flush por volume
   * @param {number} [options.flushInterval=1000] - Milissegundos antes do flush por tempo
   */
  constructor(options = {}) { ... }
}
```

### `@event` — Documentar Eventos Emitidos

```javascript
/**
 * Evento emitido quando o buffer está cheio ou o timeout expira.
 *
 * @event AuditBuffer#flush
 * @type {AuditLog[]}
 */
```

### `@private`, `@protected`, `@public`

```javascript
class AuditBuffer {
  /**
   * Array interno de logs aguardando flush.
   * @private
   * @type {AuditLog[]}
   */
  _items = [];

  /**
   * Timer de flush por tempo.
   * @private
   * @type {NodeJS.Timeout|null}
   */
  _timer = null;

  /**
   * Adiciona um log ao buffer.
   * @public
   * @param {AuditLog} log
   */
  add(log) { ... }
}
```

### `@module` — Documentar um Arquivo Inteiro

```javascript
/**
 * @module SeverityClassifier
 * @description Classifica logs de auditoria em INFO, WARN ou ERROR
 * baseado no código de status HTTP. Segue RFC 7231.
 */
```

### `@example` — Exemplos de Uso

```javascript
/**
 * Extrai o IP real do cliente considerando proxies.
 *
 * @param {import('express').Request} req - Requisição Express
 * @returns {string} IP do cliente ou 'UNKNOWN'
 *
 * @example
 * // Sem proxy:
 * extractIp(req); // → "203.0.113.42"
 *
 * // Com proxy (X-Forwarded-For):
 * // req.headers['x-forwarded-for'] = '203.0.113.42, 10.0.0.1'
 * extractIp(req); // → "203.0.113.42" (primeiro da lista)
 *
 * // IP desconhecido:
 * extractIp(req); // → "UNKNOWN"
 */
function extractIp(req) { ... }
```

### `@type` — Tipar Variáveis

```javascript
/** @type {Map<string, number>} */
const requestCountByIp = new Map();

/** @type {NodeJS.Timeout|null} */
let flushTimer = null;

/** @type {boolean} */
let inFallbackMode = false;
```

### Importar Tipos de Outros Módulos

```javascript
/**
 * @param {import('../domain/entities/AuditLog').AuditLog} log
 * @param {import('pg').Pool} pool
 */
async function save(log, pool) { ... }
```

---

## 3.4 Template de Arquivo Completo com JSDoc

```javascript
/**
 * @fileoverview Classificador de severidade para logs de auditoria.
 *
 * Determina a severidade (INFO/WARN/ERROR) baseado no código de status HTTP.
 * Segue a convenção da spec-v4: 2xx/3xx = INFO, 4xx = WARN, 5xx = ERROR.
 *
 * @module SeverityClassifier
 * @author Time de Plataforma
 * @version 1.0.0
 * @since 2026-03-30
 */

"use strict";

/**
 * @typedef {'INFO'|'WARN'|'ERROR'} Severity
 */

/**
 * Classifica um status HTTP em nível de severidade de auditoria.
 *
 * @param {number} statusCode - Código de status HTTP (100-599)
 * @returns {Severity} Nível de severidade correspondente
 * @throws {TypeError} Se statusCode não for um inteiro válido
 *
 * @example
 * classify(200); // → 'INFO'
 * classify(404); // → 'WARN'
 * classify(500); // → 'ERROR'
 */
function classify(statusCode) {
  if (!Number.isInteger(statusCode)) {
    throw new TypeError(`statusCode deve ser inteiro, recebido: ${statusCode}`);
  }

  if (statusCode >= 100 && statusCode <= 399) return "INFO";
  if (statusCode >= 400 && statusCode <= 499) return "WARN";
  if (statusCode >= 500 && statusCode <= 599) return "ERROR";

  throw new TypeError(
    `statusCode fora do intervalo válido (100-599): ${statusCode}`,
  );
}

module.exports = { classify };
```

---

# 4. MVP — Versão 1.0

> 🎯 **Objetivo do MVP:** Funcionar de ponta a ponta. Uma requisição HTTP é interceptada, um log é criado e salvo no banco de dados. Sem batch, sem fallback, sem sanitização avançada. Simples, funcional, testável.

---

## 4.1 O que o MVP Inclui

| Funcionalidade                                                 | Incluído | Versão |
| -------------------------------------------------------------- | -------- | ------ |
| Middleware Express (intercepção)                               | ✅       | 1.0    |
| Extração de dados da requisição                                | ✅       | 1.0    |
| Entidade AuditLog com validação básica                         | ✅       | 1.0    |
| Classificação de severidade                                    | ✅       | 1.0    |
| Persistência direta no PostgreSQL (sem batch)                  | ✅       | 1.0    |
| Auto-migração da tabela (sem partições)                        | ✅       | 1.0    |
| Fire-and-forget no middleware                                  | ✅       | 1.0    |
| Facade pública (`Audit.initialize`, `Audit.expressMiddleware`) | ✅       | 1.0    |
| JSDoc em todos os arquivos                                     | ✅       | 1.0    |
| Testes unitários básicos                                       | ✅       | 1.0    |

---

## 4.2 O que o MVP NÃO Inclui (Próximas Versões)

| Funcionalidade                   | Versão |
| -------------------------------- | ------ |
| Buffer e batch insert            | 1.1    |
| Fallback para arquivo JSON       | 1.2    |
| Sanitização de dados sensíveis   | 1.3    |
| Particionamento PostgreSQL       | 1.3    |
| Middleware Fastify               | 1.3    |
| Agregação diária e mensal        | 2.0    |
| Detecção de anomalias            | 2.0    |
| Retenção automática de partições | 3.0    |
| Graceful shutdown completo       | 3.0    |

---

## 4.3 Dependências do MVP

**O que você precisa instalar:**

```bash
# Dentro de packages/audit-logger/
npm install pg        # Driver PostgreSQL para Node.js
npm install winston   # Logger estruturado (não use console.log em lib)
```

**Por que `pg` e não `pg-promise` ou `knex`?**

- `pg` é o driver oficial, sem abstração desnecessária
- Queries parametrizadas nativas (prevenção de SQL injection)
- A spec-v4 menciona explicitamente "parameterized queries"

**Por que `winston` para logging interno da lib?**

- Uma lib **não deve usar `console.log`** — ela não sabe para onde o output vai
- Winston permite que o consumidor configure o destino dos logs
- Separação entre "logs de auditoria" (o produto) e "logs da lib" (infraestrutura)

---

## 4.4 Implementação Passo a Passo

### PASSO 1: Exceptions

**O que você precisa saber:**

- Como criar classes de erro customizadas em JavaScript
- Por que `Error.captureStackTrace` é importante para debugging

```javascript
// src/domain/exceptions/InvalidAuditLogError.js

/**
 * @fileoverview Erro lançado quando dados de um AuditLog são inválidos.
 * @module InvalidAuditLogError
 */

"use strict";

/**
 * Erro de domínio para AuditLog com dados inválidos.
 * Estende Error nativo para manter stack trace e instanceof.
 *
 * @class
 * @extends Error
 *
 * @example
 * throw new InvalidAuditLogError('statusCode deve ser inteiro', { statusCode: 99.5 });
 */
class InvalidAuditLogError extends Error {
  /**
   * @constructor
   * @param {string} message - Descrição do erro
   * @param {Object} [context={}] - Dados contextuais para debugging
   */
  constructor(message, context = {}) {
    super(message);

    /** @type {string} Nome da classe de erro */
    this.name = "InvalidAuditLogError";

    /** @type {Object} Contexto adicional do erro */
    this.context = context;

    // Garante stack trace correto no V8 (Node.js)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, InvalidAuditLogError);
    }
  }
}

module.exports = { InvalidAuditLogError };
```

---

### PASSO 2: Domain Services

**O que você precisa saber:**

- Services de domínio são funções puras (input → output, sem side effects)
- Não acessam banco, não fazem HTTP, não escrevem arquivos

#### `SeverityClassifier.js`

```javascript
// src/domain/services/SeverityClassifier.js

/**
 * @fileoverview Classifica a severidade de logs baseado no status HTTP.
 * @module SeverityClassifier
 */

"use strict";

/**
 * @typedef {'INFO'|'WARN'|'ERROR'} Severity
 */

/**
 * Tabela de mapeamento: range de status → severidade.
 * Extraída como constante para facilitar testes e modificações.
 *
 * @constant {Array<{min: number, max: number, severity: Severity}>}
 * @private
 */
const SEVERITY_RANGES = [
  { min: 100, max: 399, severity: "INFO" },
  { min: 400, max: 499, severity: "WARN" },
  { min: 500, max: 599, severity: "ERROR" },
];

/**
 * Determina a severidade de auditoria para um código de status HTTP.
 *
 * Regras (da spec-v4):
 * - 100–399 → INFO  (sucesso e redirecionamentos)
 * - 400–499 → WARN  (erros do cliente)
 * - 500–599 → ERROR (erros do servidor)
 *
 * @param {number} statusCode - Código de status HTTP (100-599, inteiro)
 * @returns {Severity} Severidade correspondente
 * @throws {import('../exceptions/InvalidAuditLogError').InvalidAuditLogError}
 *   Se statusCode não for inteiro ou estiver fora do range 100-599
 *
 * @example
 * classify(200);  // → 'INFO'
 * classify(301);  // → 'INFO'
 * classify(400);  // → 'WARN'
 * classify(401);  // → 'WARN'
 * classify(500);  // → 'ERROR'
 * classify(503);  // → 'ERROR'
 */
function classify(statusCode) {
  const {
    InvalidAuditLogError,
  } = require("../exceptions/InvalidAuditLogError");

  if (!Number.isInteger(statusCode)) {
    throw new InvalidAuditLogError("statusCode deve ser um inteiro", {
      received: statusCode,
      type: typeof statusCode,
    });
  }

  const range = SEVERITY_RANGES.find(
    (r) => statusCode >= r.min && statusCode <= r.max,
  );

  if (!range) {
    throw new InvalidAuditLogError(
      "statusCode fora do intervalo válido (100-599)",
      { received: statusCode },
    );
  }

  return range.severity;
}

module.exports = { classify };
```

#### `IpExtractor.js`

**O que você precisa saber:**

- Proxies reversos (nginx, AWS ALB) adicionam `X-Forwarded-For`
- O IP real do cliente fica no **primeiro** da lista em `X-Forwarded-For`
- `req.socket.remoteAddress` é o IP de quem se conectou (pode ser o proxy)

```javascript
// src/domain/services/IpExtractor.js

/**
 * @fileoverview Extrai o IP real do cliente de uma requisição HTTP.
 * @module IpExtractor
 */

"use strict";

/**
 * Fallback quando o IP não pode ser determinado.
 * @constant {string}
 */
const UNKNOWN_IP = "UNKNOWN";

/**
 * Extrai o endereço IP do cliente real de uma requisição HTTP.
 *
 * Ordem de prioridade (spec-v4):
 * 1. `X-Forwarded-For` header (primeiro IP da lista, sem espaços)
 * 2. `X-Real-IP` header (nginx proxy)
 * 3. `req.socket.remoteAddress` (conexão direta)
 * 4. 'UNKNOWN' (fallback seguro)
 *
 * @param {import('express').Request} req - Objeto de requisição Express/Node.js
 * @returns {string} IP do cliente ou 'UNKNOWN' (nunca null/undefined)
 *
 * @example
 * // Sem proxy (conexão direta):
 * extractIp(req); // → "203.0.113.42"
 *
 * // Com proxy reverso (X-Forwarded-For):
 * // X-Forwarded-For: "203.0.113.42, 10.0.0.1, 172.16.0.5"
 * extractIp(req); // → "203.0.113.42"
 */
function extractIp(req) {
  // Prioridade 1: X-Forwarded-For (proxy chain)
  const forwarded = req.headers?.["x-forwarded-for"];
  if (forwarded && typeof forwarded === "string") {
    // "203.0.113.42, 10.0.0.1" → ["203.0.113.42", "10.0.0.1"] → "203.0.113.42"
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  // Prioridade 2: X-Real-IP (nginx)
  const realIp = req.headers?.["x-real-ip"];
  if (realIp && typeof realIp === "string" && realIp.trim()) {
    return realIp.trim();
  }

  // Prioridade 3: Socket (conexão direta)
  const socketIp = req.socket?.remoteAddress;
  if (socketIp && typeof socketIp === "string" && socketIp.trim()) {
    return socketIp;
  }

  // Fallback seguro
  return UNKNOWN_IP;
}

module.exports = { extractIp, UNKNOWN_IP };
```

#### `AnonymousIdGenerator.js`

```javascript
// src/domain/services/AnonymousIdGenerator.js

/**
 * @fileoverview Gera identificador anônimo para rastreamento sem PII.
 * @module AnonymousIdGenerator
 */

"use strict";

const { createHash } = require("node:crypto");

/**
 * Gera um ID anônimo e determinístico combinando IP e User-Agent.
 *
 * Por que SHA-256?
 * - Determinístico: mesma entrada → mesmo hash (detecta padrões)
 * - Irreversível: não é possível recuperar IP/UA do hash (privacidade)
 * - 64 chars hex: único o suficiente para distinção prática
 *
 * Compliance: usado para detectar padrões sem armazenar PII diretamente.
 * Segue LGPD Art. 5 — dados anonimizados não são dados pessoais.
 *
 * @param {string} ip - Endereço IP do cliente
 * @param {string} [userAgent=''] - User-Agent header da requisição
 * @returns {string} Hash SHA-256 de 64 caracteres hexadecimais
 *
 * @example
 * generate('203.0.113.42', 'Mozilla/5.0...');
 * // → "a1b2c3d4e5f6..." (64 chars, sempre o mesmo para mesma entrada)
 *
 * generate('UNKNOWN', '');
 * // → "5e884898..." (ainda funciona com fallbacks)
 */
function generate(ip, userAgent = "") {
  return createHash("sha256").update(`${ip}${userAgent}`).digest("hex");
}

module.exports = { generate };
```

---

### PASSO 3: Entidade AuditLog

**O que você precisa saber:**

- Entidades de domínio encapsulam **regras de negócio**, não apenas dados
- O construtor deve **validar** e **derivar** campos automaticamente
- `Object.freeze()` torna o objeto imutável (boas práticas em domínio)
- `crypto.randomUUID()` é nativo no Node.js 20+ (sem dependência)

```javascript
// src/domain/entities/AuditLog.js

/**
 * @fileoverview Entidade de domínio para logs de auditoria HTTP.
 *
 * Esta é a peça central do domínio. Representa um evento de auditoria
 * completo e validado. Todos os campos obrigatórios são verificados
 * no construtor — nenhum AuditLog inválido pode existir.
 *
 * @module AuditLog
 */

"use strict";

const { randomUUID } = require("node:crypto");
const { classify } = require("../services/SeverityClassifier");
const { generate } = require("../services/AnonymousIdGenerator");
const { InvalidAuditLogError } = require("../exceptions/InvalidAuditLogError");

/**
 * Métodos HTTP permitidos pela spec-v4.
 * @constant {Set<string>}
 * @private
 */
const ALLOWED_METHODS = new Set([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]);

/**
 * Limite de tamanho da URL em bytes (spec-v4: 2048).
 * @constant {number}
 * @private
 */
const MAX_URL_BYTES = 2048;

/**
 * Janela de tempo no passado para rejeitar timestamps muito antigos (31 dias em ms).
 * @constant {number}
 * @private
 */
const MAX_PAST_MS = 31 * 24 * 60 * 60 * 1000;

/**
 * Janela de tolerância para timestamps no futuro (12 horas em ms, clock skew).
 * @constant {number}
 * @private
 */
const MAX_FUTURE_MS = 12 * 60 * 60 * 1000;

/**
 * Representa um log de auditoria HTTP validado e imutável.
 *
 * Campos auto-gerados se não fornecidos:
 * - `request_id`: UUID v4 aleatório
 * - `anonymous_id`: SHA256(ip + userAgent)
 * - `severity`: derivado do statusCode
 * - `timestamp`: Date.now() se não fornecido
 *
 * @class
 *
 * @example
 * const log = new AuditLog({
 *   ip: '203.0.113.42',
 *   url: '/api/users',
 *   method: 'GET',
 *   statusCode: 200,
 *   timestamp: new Date()
 * });
 * console.log(log.severity); // → 'INFO'
 * console.log(log.request_id); // → 'uuid-v4-gerado'
 */
class AuditLog {
  /**
   * @constructor
   * @param {Object} data - Dados brutos da requisição HTTP
   * @param {string} data.ip - IP do cliente (obrigatório)
   * @param {string} data.url - URL da requisição (obrigatório, max 2048 bytes)
   * @param {string} data.method - Método HTTP em maiúsculas (obrigatório)
   * @param {number} data.statusCode - Status HTTP 100-599, inteiro (obrigatório)
   * @param {Date|string} data.timestamp - Momento da requisição UTC (obrigatório)
   * @param {string} [data.request_id] - UUID v4 (auto-gerado se ausente)
   * @param {string} [data.userId] - ID do usuário autenticado
   * @param {Object|null} [data.body] - Body da requisição (sanitizado)
   * @param {Object|null} [data.headers] - Headers filtrados pela whitelist
   * @param {Object|null} [data.response_body] - Body da resposta
   * @param {number} [data.duration_ms] - Latência em milissegundos
   * @param {string} [data.user_agent] - User-Agent header
   * @param {number} [data.schema_version=4] - Versão do schema
   *
   * @throws {InvalidAuditLogError} Se qualquer campo obrigatório for inválido
   */
  constructor(data) {
    // ── Validações obrigatórias ──────────────────────────────────────────────
    this._validateIp(data.ip);
    this._validateUrl(data.url);
    this._validateMethod(data.method);
    this._validateTimestamp(data.timestamp);
    // statusCode é validado dentro de classify()

    // ── Campos obrigatórios ──────────────────────────────────────────────────
    /** @type {string} IP do cliente */
    this.ip = data.ip;

    /** @type {string} URL da requisição */
    this.url = data.url;

    /** @type {string} Método HTTP */
    this.method = data.method.toUpperCase();

    /** @type {number} Status HTTP */
    this.statusCode = data.statusCode;

    /** @type {Date} Timestamp da requisição (UTC) */
    this.timestamp =
      data.timestamp instanceof Date
        ? data.timestamp
        : new Date(data.timestamp);

    // ── Campos auto-gerados ──────────────────────────────────────────────────
    /** @type {string} UUID v4 único por requisição */
    this.request_id = data.request_id ?? randomUUID();

    /** @type {'INFO'|'WARN'|'ERROR'} Severidade derivada do statusCode */
    this.severity = classify(data.statusCode);

    /** @type {string} SHA256(ip + userAgent) para anonimização */
    this.anonymous_id = generate(data.ip, data.user_agent ?? "");

    // ── Campos opcionais ─────────────────────────────────────────────────────
    /** @type {string|undefined} ID do usuário autenticado */
    this.userId = data.userId;

    /** @type {Object|null|undefined} Body da requisição */
    this.body = data.body ?? null;

    /** @type {Object|null|undefined} Headers da requisição */
    this.headers = data.headers ?? null;

    /** @type {Object|null|undefined} Body da resposta */
    this.response_body = data.response_body ?? null;

    /** @type {number|undefined} Latência em ms */
    this.duration_ms = data.duration_ms;

    /** @type {string|undefined} User-Agent */
    this.user_agent = data.user_agent;

    /** @type {number} Versão do schema */
    this.schema_version = data.schema_version ?? 4;

    // Torna o objeto imutável — logs não devem ser modificados após criação
    Object.freeze(this);
  }

  /**
   * Valida o campo IP.
   * @private
   * @param {*} ip
   * @throws {InvalidAuditLogError}
   */
  _validateIp(ip) {
    if (!ip || typeof ip !== "string" || ip.trim().length === 0) {
      throw new InvalidAuditLogError(
        "ip é obrigatório e deve ser uma string não-vazia",
        { received: ip },
      );
    }
  }

  /**
   * Valida a URL (não-vazia, max 2048 bytes).
   * @private
   * @param {*} url
   * @throws {InvalidAuditLogError}
   */
  _validateUrl(url) {
    if (!url || typeof url !== "string" || url.trim().length === 0) {
      throw new InvalidAuditLogError("url é obrigatória", { received: url });
    }

    const byteLength = Buffer.byteLength(url, "utf8");
    if (byteLength > MAX_URL_BYTES) {
      throw new InvalidAuditLogError(`url excede ${MAX_URL_BYTES} bytes`, {
        byteLength,
        url: url.substring(0, 50) + "...",
      });
    }
  }

  /**
   * Valida o método HTTP contra a lista permitida.
   * @private
   * @param {*} method
   * @throws {InvalidAuditLogError}
   */
  _validateMethod(method) {
    if (!method || typeof method !== "string") {
      throw new InvalidAuditLogError("method é obrigatório", {
        received: method,
      });
    }

    const upper = method.toUpperCase();
    if (!ALLOWED_METHODS.has(upper)) {
      throw new InvalidAuditLogError(`method inválido: ${method}`, {
        allowed: [...ALLOWED_METHODS],
      });
    }
  }

  /**
   * Valida o timestamp: deve ser Date válido, não muito no futuro nem passado.
   * @private
   * @param {*} timestamp
   * @throws {InvalidAuditLogError}
   */
  _validateTimestamp(timestamp) {
    if (!timestamp) {
      throw new InvalidAuditLogError("timestamp é obrigatório");
    }

    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);

    if (isNaN(ts.getTime())) {
      throw new InvalidAuditLogError("timestamp inválido", {
        received: timestamp,
      });
    }

    const now = Date.now();
    const diff = ts.getTime() - now;

    if (diff > MAX_FUTURE_MS) {
      throw new InvalidAuditLogError(
        "timestamp mais de 12h no futuro (possível erro de clock)",
        { timestamp: ts.toISOString() },
      );
    }

    if (now - ts.getTime() > MAX_PAST_MS) {
      throw new InvalidAuditLogError("timestamp mais de 31 dias no passado", {
        timestamp: ts.toISOString(),
      });
    }
  }
}

module.exports = { AuditLog };
```

---

### PASSO 4: Interface do Repositório (Port)

**O que você precisa saber:**

- Em JavaScript puro não existe `interface` como em TypeScript
- Simulamos interfaces com classes que lançam erros nos métodos (documentação + runtime check)
- Isso força implementações a sobrescrever os métodos obrigatórios

```javascript
// src/application/ports/IAuditLogRepository.js

/**
 * @fileoverview Interface (Port) para persistência de logs de auditoria.
 *
 * CONCEITO — Port & Adapter:
 * Esta "interface" define o contrato que qualquer repositório deve seguir.
 * A camada de Application conhece apenas este contrato — não sabe se é
 * PostgreSQL, MongoDB, arquivo JSON, etc. Isso é Dependency Inversion.
 *
 * Implementações (Adapters):
 * - AuditLogRepository (PostgreSQL) — caminho feliz
 * - FallbackRepository (JSON Lines) — quando banco falha
 *
 * @module IAuditLogRepository
 */

"use strict";

/**
 * Interface abstrata para repositório de AuditLog.
 * Implemente esta classe para criar novos backends de persistência.
 *
 * @abstract
 * @class
 */
class IAuditLogRepository {
  /**
   * Persiste um único log de auditoria.
   *
   * @abstract
   * @param {import('../../domain/entities/AuditLog').AuditLog} log
   * @returns {Promise<void>}
   * @throws {Error} Sempre (não implementado na classe base)
   */
  async save(log) {
    throw new Error("IAuditLogRepository.save() não implementado");
  }

  /**
   * Persiste um batch de logs de auditoria de forma eficiente.
   *
   * @abstract
   * @param {import('../../domain/entities/AuditLog').AuditLog[]} logs
   * @returns {Promise<void>}
   * @throws {Error} Sempre (não implementado na classe base)
   */
  async saveBatch(logs) {
    throw new Error("IAuditLogRepository.saveBatch() não implementado");
  }

  /**
   * Verifica se a conexão com o backend está ativa.
   *
   * @abstract
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    throw new Error("IAuditLogRepository.isHealthy() não implementado");
  }

  /**
   * Fecha a conexão e libera recursos.
   *
   * @abstract
   * @returns {Promise<void>}
   */
  async close() {
    throw new Error("IAuditLogRepository.close() não implementado");
  }
}

module.exports = { IAuditLogRepository };
```

---

### PASSO 5: Infraestrutura — Conexão PostgreSQL

**O que você precisa saber:**

- `pg.Pool` gerencia um pool de conexões (não crie novas conexões por request!)
- `pool.query()` pega uma conexão do pool, executa, devolve automaticamente
- Queries parametrizadas (`$1, $2, ...`) previnem SQL injection — **sempre use!**
- `process.env` é a forma de ler variáveis de ambiente em Node.js

```javascript
// src/infrastructure/database/PostgreSQLConnection.js

/**
 * @fileoverview Singleton de conexão com PostgreSQL usando pool de conexões.
 *
 * Por que Singleton?
 * - Um pool de conexões é caro para criar
 * - Toda a aplicação deve compartilhar o mesmo pool
 * - Node.js module cache garante uma única instância por processo
 *
 * @module PostgreSQLConnection
 */

"use strict";

const { Pool } = require("pg");

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} [connectionString] - Connection string completa
 * @property {string} [host] - Host do banco
 * @property {number} [port=5432] - Porta do banco
 * @property {string} [database] - Nome do banco
 * @property {string} [user] - Usuário
 * @property {string} [password] - Senha
 * @property {number} [min=5] - Conexões mínimas no pool
 * @property {number} [max=20] - Conexões máximas no pool
 * @property {number} [connectionTimeoutMillis=5000] - Timeout de conexão
 * @property {number} [query_timeout=10000] - Timeout de query
 */

/**
 * Instância singleton do pool (módulo-nível).
 * @type {Pool|null}
 * @private
 */
let _pool = null;

/**
 * Inicializa o pool de conexões PostgreSQL.
 * Deve ser chamado uma única vez durante a inicialização da aplicação.
 *
 * @param {DatabaseConfig} config - Configuração da conexão
 * @returns {Pool} Pool de conexões inicializado
 *
 * @example
 * const pool = initializePool({
 *   connectionString: process.env.DATABASE_URL,
 *   min: 5,
 *   max: 20
 * });
 */
function initializePool(config) {
  if (_pool) {
    return _pool; // Já inicializado — retorna o existente
  }

  _pool = new Pool({
    connectionString: config.connectionString,
    host: config.host,
    port: config.port ?? 5432,
    database: config.database,
    user: config.user,
    password: config.password,
    min: config.min ?? 5,
    max: config.max ?? 20,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
    query_timeout: config.query_timeout ?? 10000,
    // Importante: desabilita SSL em desenvolvimento, habilita em produção
    ssl: config.ssl ?? false,
  });

  // Escuta erros do pool (conexões que caem em idle)
  _pool.on("error", (err) => {
    process.stderr.write(`[audit-logger] Pool error: ${err.message}\n`);
  });

  return _pool;
}

/**
 * Retorna o pool de conexões atual.
 * Lança erro se `initializePool` não foi chamado antes.
 *
 * @returns {Pool} Pool ativo
 * @throws {Error} Se o pool não foi inicializado
 */
function getPool() {
  if (!_pool) {
    throw new Error(
      "[audit-logger] Pool não inicializado. Chame Audit.initialize() primeiro.",
    );
  }
  return _pool;
}

/**
 * Fecha todas as conexões do pool e reseta o singleton.
 * Deve ser chamado no graceful shutdown da aplicação.
 *
 * @returns {Promise<void>}
 */
async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

/**
 * Testa se a conexão com o banco está ativa.
 *
 * @returns {Promise<boolean>} true se conectado, false caso contrário
 */
async function testConnection() {
  try {
    const pool = getPool();
    const result = await pool.query("SELECT 1 AS ok");
    return result.rows[0].ok === 1;
  } catch {
    return false;
  }
}

module.exports = { initializePool, getPool, closePool, testConnection };
```

---

### PASSO 6: Auto-migração da Tabela

**O que você precisa saber:**

- `CREATE TABLE IF NOT EXISTS` é idempotente — pode ser executado múltiplas vezes
- Em produção, use migrations com Flyway ou Liquibase — aqui usamos auto-migration por simplicidade do MVP
- `BIGSERIAL` é `BIGINT + SEQUENCE` — auto-increment para IDs grandes
- `JSONB` armazena JSON em binário comprimido (mais rápido que `JSON` text)

```javascript
// src/infrastructure/database/MigrationRunner.js

/**
 * @fileoverview Executa auto-migração da tabela de auditoria no PostgreSQL.
 *
 * Em produção real, use uma ferramenta de migration (Flyway, Liquibase, node-pg-migrate).
 * Aqui usamos auto-migration para simplificar o MVP e ambientes de desenvolvimento.
 *
 * @module MigrationRunner
 */

"use strict";

const { getPool } = require("./PostgreSQLConnection");

/**
 * SQL de criação da tabela principal (sem particionamento no MVP).
 * O particionamento é adicionado na v1.3.
 *
 * @constant {string}
 * @private
 */
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS audit_logs (
    -- Identificadores
    id          BIGSERIAL PRIMARY KEY,
    request_id  UUID        NOT NULL UNIQUE,
    anonymous_id CHAR(64)   NOT NULL,

    -- Dados da requisição
    ip          VARCHAR(45) NOT NULL,
    user_id     VARCHAR(255),
    url         VARCHAR(2048) NOT NULL,
    method      VARCHAR(10)   NOT NULL,
    status_code INTEGER       NOT NULL,
    severity    VARCHAR(10)   NOT NULL,

    -- Payloads (JSONB para flexibilidade e performance)
    body          JSONB,
    headers       JSONB,
    response_body JSONB,

    -- Performance e metadados
    duration_ms   INTEGER,
    user_agent    VARCHAR(512),
    schema_version INTEGER NOT NULL DEFAULT 4,

    -- Timestamps (sempre UTC)
    timestamp   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

/**
 * Índices para queries frequentes (spec-v4).
 * Separados do CREATE TABLE para poder ser executados independentemente.
 * @constant {string[]}
 * @private
 */
const CREATE_INDEXES_SQL = [
  `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
   ON audit_logs (timestamp DESC);`,

  `CREATE INDEX IF NOT EXISTS idx_audit_logs_ip
   ON audit_logs (ip);`,

  `CREATE INDEX IF NOT EXISTS idx_audit_logs_status_code
   ON audit_logs (status_code);`,
];

/**
 * Executa as migrações necessárias para o funcionamento do audit-logger.
 * É seguro executar múltiplas vezes (idempotente via IF NOT EXISTS).
 *
 * @returns {Promise<void>}
 * @throws {Error} Se a conexão com o banco falhar
 *
 * @example
 * // Na inicialização da aplicação:
 * await runMigrations();
 * console.log('Tabela de auditoria pronta');
 */
async function runMigrations() {
  const pool = getPool();

  // Cria a tabela (idempotente)
  await pool.query(CREATE_TABLE_SQL);

  // Cria os índices (idempotente)
  for (const indexSql of CREATE_INDEXES_SQL) {
    await pool.query(indexSql);
  }
}

module.exports = { runMigrations };
```

---

### PASSO 7: Repositório PostgreSQL (MVP — Insert Direto)

**O que você precisa saber:**

- Queries parametrizadas: `$1, $2, $3...` são placeholders — `pg` substitui com segurança
- `JSON.stringify(obj)` converte objeto para string JSON (necessário para JSONB via `pg`)
- `pool.query(sql, values)` executa e devolve a conexão automaticamente

```javascript
// src/infrastructure/database/AuditLogRepository.js

/**
 * @fileoverview Repositório de AuditLog com PostgreSQL.
 * Implementa IAuditLogRepository usando pg (node-postgres).
 *
 * MVP: insert direto (sem batch).
 * v1.1: batch insert com buffer.
 *
 * @module AuditLogRepository
 */

"use strict";

const {
  IAuditLogRepository,
} = require("../../application/ports/IAuditLogRepository");
const { getPool } = require("./PostgreSQLConnection");

/**
 * SQL de insert de um único log.
 * Usa ON CONFLICT DO NOTHING para idempotência (retry seguro).
 * @constant {string}
 * @private
 */
const INSERT_SQL = `
  INSERT INTO audit_logs (
    request_id, anonymous_id, ip, user_id, url, method,
    status_code, severity, body, headers, response_body,
    duration_ms, user_agent, schema_version, timestamp
  ) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10, $11,
    $12, $13, $14, $15
  )
  ON CONFLICT (request_id) DO NOTHING;
`;

/**
 * Repositório de persistência de AuditLog no PostgreSQL.
 * @class
 * @implements {IAuditLogRepository}
 */
class AuditLogRepository extends IAuditLogRepository {
  /**
   * Persiste um único AuditLog no banco de dados.
   *
   * Note: JSONB requer que objetos JavaScript sejam passados como string JSON
   * para o driver pg (ele faz o cast automaticamente quando recebe string).
   *
   * @param {import('../../domain/entities/AuditLog').AuditLog} log
   * @returns {Promise<void>}
   * @throws {Error} Se a query falhar
   */
  async save(log) {
    const pool = getPool();

    await pool.query(INSERT_SQL, [
      log.request_id, // $1  UUID
      log.anonymous_id, // $2  CHAR(64)
      log.ip, // $3  VARCHAR(45)
      log.userId ?? null, // $4  VARCHAR(255)
      log.url, // $5  VARCHAR(2048)
      log.method, // $6  VARCHAR(10)
      log.statusCode, // $7  INTEGER
      log.severity, // $8  VARCHAR(10)
      log.body ? JSON.stringify(log.body) : null, // $9  JSONB
      log.headers ? JSON.stringify(log.headers) : null, // $10 JSONB
      log.response_body ? JSON.stringify(log.response_body) : null, // $11 JSONB
      log.duration_ms ?? null, // $12 INTEGER
      log.user_agent ?? null, // $13 VARCHAR(512)
      log.schema_version, // $14 INTEGER
      log.timestamp, // $15 TIMESTAMP
    ]);
  }

  /**
   * Verifica saúde da conexão com o banco.
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      const pool = getPool();
      await pool.query("SELECT 1");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fecha o pool de conexões.
   * @returns {Promise<void>}
   */
  async close() {
    const { closePool } = require("./PostgreSQLConnection");
    await closePool();
  }
}

module.exports = { AuditLogRepository };
```

---

### PASSO 8: Use Case — SaveAuditLogUseCase

**O que você precisa saber:**

- Use Cases orquestram o fluxo: recebe dados brutos → cria entidade → persiste
- A camada de Application não deve conhecer detalhes de HTTP ou banco — apenas interfaces
- `try/catch` aqui garante que erros não se propagam para o middleware

```javascript
// src/application/useCases/SaveAuditLogUseCase.js

/**
 * @fileoverview Caso de uso: salvar um log de auditoria.
 *
 * Orquestra: criação da entidade → validação → persistência.
 * No MVP, persiste diretamente. Na v1.1, adiciona ao buffer.
 *
 * @module SaveAuditLogUseCase
 */

"use strict";

const { AuditLog } = require("../../domain/entities/AuditLog");

/**
 * Caso de uso responsável por salvar um log de auditoria.
 * @class
 */
class SaveAuditLogUseCase {
  /**
   * @constructor
   * @param {import('../ports/IAuditLogRepository').IAuditLogRepository} repository
   *   Repositório de persistência (injetado — Dependency Injection)
   */
  constructor(repository) {
    /** @private */
    this._repository = repository;
  }

  /**
   * Executa o salvamento de um log de auditoria.
   *
   * Fluxo:
   * 1. Cria a entidade AuditLog (valida e deriva campos)
   * 2. Persiste via repositório injetado
   * 3. Captura erros (fire-and-forget — não propaga para middleware)
   *
   * @param {Object} rawData - Dados brutos da requisição HTTP
   * @returns {Promise<void>} Resolve sempre (erros são logados, não propagados)
   *
   * @example
   * const useCase = new SaveAuditLogUseCase(repository);
   * await useCase.execute({
   *   ip: '203.0.113.42',
   *   url: '/api/users',
   *   method: 'GET',
   *   statusCode: 200,
   *   timestamp: new Date()
   * });
   */
  async execute(rawData) {
    try {
      const auditLog = new AuditLog(rawData);
      await this._repository.save(auditLog);
    } catch (err) {
      // Log interno da lib — nunca propaga para o middleware
      process.stderr.write(
        `[audit-logger] Falha ao salvar log: ${err.message}\n`,
      );
    }
  }
}

module.exports = { SaveAuditLogUseCase };
```

---

### PASSO 9: Extrator de Dados da Requisição

**O que você precisa saber:**

- `res.on('finish')` dispara **depois** que a resposta foi enviada ao cliente
- `Date.now()` retorna milissegundos desde epoch — use para medir latência
- Headers HTTP são case-insensitive — sempre normalize para lowercase

```javascript
// src/adapters/extractors/RequestDataExtractor.js

/**
 * @fileoverview Extrai dados relevantes de uma requisição/resposta HTTP.
 *
 * Responsabilidade única: transformar os objetos req/res do Node.js
 * em um objeto plano com os dados necessários para criar um AuditLog.
 *
 * @module RequestDataExtractor
 */

"use strict";

const { extractIp } = require("../../domain/services/IpExtractor");

/**
 * Headers que devem ser capturados (whitelist da spec-v4).
 * Headers sensíveis (Authorization, Cookie) são explicitamente excluídos.
 * @constant {Set<string>}
 * @private
 */
const ALLOWED_HEADERS = new Set([
  "user-agent",
  "accept",
  "accept-language",
  "accept-encoding",
  "content-type",
  "content-length",
  "x-request-id",
  "x-correlation-id",
  "x-forwarded-for",
  "x-real-ip",
  "origin",
  "referer",
]);

/**
 * Métodos HTTP que podem ter body (spec-v4).
 * @constant {Set<string>}
 * @private
 */
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * Extrai e normaliza dados de uma requisição HTTP Express.
 *
 * @param {import('express').Request} req - Objeto Request do Express
 * @param {import('express').Response} res - Objeto Response do Express
 * @param {number} startTime - Timestamp de início (Date.now())
 * @returns {Object} Dados normalizados para criar AuditLog
 */
function extract(req, res, startTime) {
  const method = (req.method ?? "GET").toUpperCase();
  const duration_ms = Date.now() - startTime;

  // Filtra headers pela whitelist e normaliza para lowercase
  const headers = extractHeaders(req.headers);

  // Body apenas para métodos que o suportam e content-type JSON
  const body = shouldCaptureBody(method, req) ? (req.body ?? null) : null;

  return {
    ip: extractIp(req),
    url: req.originalUrl ?? req.url ?? "/",
    method,
    statusCode: res.statusCode ?? 200,
    timestamp: new Date(startTime), // UTC implícito em Node.js
    duration_ms,
    user_agent: req.headers?.["user-agent"],
    headers: Object.keys(headers).length > 0 ? headers : null,
    body,
    // userId: injetado pelo middleware de autenticação da aplicação
    userId: extractUserId(req),
    // request_id: do header ou gerado pelo middleware
    request_id: req._auditRequestId,
  };
}

/**
 * Extrai apenas os headers da whitelist, normalizados para lowercase.
 *
 * @param {Object} rawHeaders - Headers brutos da requisição
 * @returns {Object} Headers filtrados
 * @private
 */
function extractHeaders(rawHeaders) {
  if (!rawHeaders || typeof rawHeaders !== "object") return {};

  return Object.entries(rawHeaders).reduce((acc, [key, value]) => {
    const normalized = key.toLowerCase();
    if (ALLOWED_HEADERS.has(normalized)) {
      acc[normalized] = value;
    }
    return acc;
  }, {});
}

/**
 * Determina se o body deve ser capturado.
 * Critérios: método com body + content-type JSON.
 *
 * @param {string} method - Método HTTP normalizado
 * @param {import('express').Request} req - Requisição
 * @returns {boolean}
 * @private
 */
function shouldCaptureBody(method, req) {
  if (!BODY_METHODS.has(method)) return false;

  const contentType = req.headers?.["content-type"] ?? "";
  return contentType.includes("application/json");
}

/**
 * Extrai o ID do usuário autenticado com fallback.
 *
 * Ordem de prioridade (spec-v4):
 * 1. Header X-User-ID (setado por API Gateway)
 * 2. req.user.id (passport.js, JWT middleware)
 * 3. req.locals.userId (custom middleware)
 * 4. undefined
 *
 * @param {import('express').Request} req
 * @returns {string|undefined}
 * @private
 */
function extractUserId(req) {
  return (
    req.headers?.["x-user-id"] ??
    req.user?.id ??
    req.locals?.userId ??
    undefined
  );
}

module.exports = { extract };
```

---

### PASSO 10: Middleware Express

**O que você precisa saber:**

- Middleware Express tem assinatura `(req, res, next)` — sempre chame `next()`
- `res.on('finish')` é o hook do Node.js HTTP que dispara após response enviada
- `_startTime` com underscore é convenção para propriedades "internas" adicionadas ao req
- O middleware **não deve jamais** falhar silenciosamente sem chamar `next()`

```javascript
// src/adapters/middlewares/ExpressMiddleware.js

/**
 * @fileoverview Middleware Express para captura automática de auditoria HTTP.
 *
 * ARQUITETURA FIRE-AND-FORGET:
 * 1. Intercepta a requisição (registra startTime + requestId)
 * 2. Chama next() IMEDIATAMENTE (não bloqueia)
 * 3. Escuta res.on('finish') para capturar dados pós-resposta
 * 4. Envia para SaveAuditLogUseCase de forma assíncrona (sem await)
 *
 * O cliente NUNCA espera pelo processo de auditoria.
 *
 * @module ExpressMiddleware
 */

"use strict";

const { randomUUID } = require("node:crypto");
const { extract } = require("../extractors/RequestDataExtractor");

/**
 * Cria o middleware Express de auditoria.
 *
 * @param {import('../../application/useCases/SaveAuditLogUseCase').SaveAuditLogUseCase} useCase
 *   Caso de uso para salvar logs (injetado)
 * @param {Object} [options={}] - Opções do middleware
 * @param {boolean} [options.enabled=true] - Habilita/desabilita o middleware
 * @param {string[]} [options.excludePaths=[]] - Caminhos a ignorar (ex: ['/health'])
 * @returns {import('express').RequestHandler} Middleware Express
 *
 * @example
 * const middleware = createExpressMiddleware(saveAuditLogUseCase);
 * app.use(middleware);
 */
function createExpressMiddleware(useCase, options = {}) {
  const { enabled = true, excludePaths = [] } = options;

  /**
   * Middleware Express de auditoria.
   *
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return function auditMiddleware(req, res, next) {
    // Middleware desabilitado — pass-through
    if (!enabled) {
      return next();
    }

    // Rotas excluídas (health check, metrics, etc.)
    if (excludePaths.includes(req.path)) {
      return next();
    }

    // Registra o momento exato de início da requisição
    req._startTime = Date.now();

    // Usa X-Request-ID do header se disponível, senão gera novo UUID
    req._auditRequestId = req.headers["x-request-id"] ?? randomUUID();

    // Injeta o request ID na resposta (facilita correlação client-side)
    res.setHeader("X-Request-ID", req._auditRequestId);

    // Escuta o evento 'finish' — dispara quando res.end() é chamado
    // IMPORTANTE: neste ponto, o cliente JÁ recebeu a resposta
    res.on("finish", () => {
      // Extrai os dados APÓS a resposta (temos status_code, duration_ms etc.)
      const rawData = extract(req, res, req._startTime);

      // FIRE-AND-FORGET: não usamos await — não bloqueia nada
      // O .catch() é obrigatório para evitar UnhandledPromiseRejection
      useCase.execute(rawData).catch((err) => {
        process.stderr.write(
          `[audit-logger] Middleware error: ${err.message}\n`,
        );
      });
    });

    // Chama next() ANTES de qualquer operação assíncrona
    // A requisição continua para o próximo middleware/handler
    next();
  };
}

module.exports = { createExpressMiddleware };
```

---

### PASSO 11: Facade Pública — `index.js`

**O que você precisa saber:**

- **Facade Pattern:** Um único ponto de entrada que esconde a complexidade interna
- Consumidores do pacote (`@internal/audit-logger`) devem precisar de apenas 3 linhas para usar
- `Audit.initialize()` monta toda a injeção de dependência internamente

```javascript
// packages/audit-logger/index.js

/**
 * @fileoverview Facade pública do @internal/audit-logger.
 *
 * Ponto de entrada único do pacote. Exporta a API simplificada
 * que consumidores usam para integrar auditoria em suas aplicações.
 *
 * USO (plug-and-play):
 * @example
 * const { Audit } = require('@internal/audit-logger');
 *
 * await Audit.initialize({ databaseUrl: process.env.DATABASE_URL });
 * app.use(Audit.expressMiddleware());
 *
 * process.on('SIGTERM', async () => {
 *   await Audit.shutdown();
 *   process.exit(0);
 * });
 *
 * @module audit-logger
 */

'use strict';

const { initializePool } = require('./src/infrastructure/database/PostgreSQLConnection');
const { runMigrations } = require('./src/infrastructure/database/MigrationRunner');
const { AuditLogRepository } = require('./src/infrastructure/database/AuditLogRepository');
const { SaveAuditLogUseCase } = require('./src/application/useCases/SaveAuditLogUseCase');
const { createExpressMiddleware } = require('./src/adapters/middlewares/ExpressMiddleware');
const { closePool, testConnection } = require('./src/infrastructure/database/PostgreSQLConnection');

/**
 * @typedef {Object} InitializeOptions
 * @property {string} [databaseUrl] - Connection string PostgreSQL
 * @property {string} [host] - Host do banco (alternativa ao databaseUrl)
 * @property {number} [port=5432] - Porta do banco
 * @property {string} [database] - Nome do banco
 * @property {string} [user] - Usuário
 * @property {string} [password] - Senha
 * @property {number} [poolMin=5] - Conexões mínimas no pool
 * @property {number} [poolMax=20] - Conexões máximas no pool
 * @property {boolean} [enabled=true] - Habilita/desabilita auditoria
 * @property {string[]} [excludePaths=['/health', '/metrics']] - Rotas excluídas
 */

/**
 * @typedef {Object} InitializeResult
 * @property {'ok'|'warning'|'error'} status - Status da inicialização
 * @property {string} message - Descrição do status
 * @property {boolean} inFallbackMode - Se está usando fallback (v1.2+)
 */

/**
 * Estado interno do Audit (injetado na inicialização).
 * @type {{ useCase: SaveAuditLogUseCase|null, options: InitializeOptions }}
 * @private
 */
const _state = {
  useCase: null,
  options: {},
};

/**
 * Objeto principal de configuração e acesso ao audit-logger.
 * @namespace Audit
 */
const Audit = {
  /**
   * Inicializa o audit-logger: configura pool, executa migrações,
   * monta dependências. Deve ser chamado UMA VEZ antes de usar o middleware.
   *
   * @param {InitializeOptions} options
   * @returns {Promise<InitializeResult>}
   *
   * @example
   * const result = await Audit.initialize({
   *   databaseUrl: process.env.DATABASE_URL
   * });
   * if (result.status !== 'ok') {
   *   console.warn('Audit em modo fallback:', result.message);
   * }
   */
  async initialize(options = {}) {
    _state.options = options;

    const dbConfig = {
      connectionString: options.databaseUrl ?? process.env.DATABASE_URL,
      host: options.host ?? process.env.DATABASE_HOST,
      port: options.port ?? Number(process.env.DATABASE_PORT) || 5432,
      database: options.database ?? process.env.DATABASE_NAME,
      user: options.user ?? process.env.DATABASE_USER,
      password: options.password ?? process.env.DATABASE_PASSWORD,
      min: options.poolMin ?? Number(process.env.DATABASE_POOL_MIN) || 5,
      max: options.poolMax ?? Number(process.env.DATABASE_POOL_MAX) || 20,
    };

    try {
      // 1. Inicializa o pool de conexões
      initializePool(dbConfig);

      // 2. Testa a conexão
      const connected = await testConnection();
      if (!connected) {
        throw new Error('Não foi possível conectar ao banco de dados');
      }

      // 3. Executa migrações (cria tabela se não existe)
      await runMigrations();

      // 4. Monta as dependências (Dependency Injection manual)
      const repository = new AuditLogRepository();
      _state.useCase = new SaveAuditLogUseCase(repository);

      return {
        status: 'ok',
        message: 'Audit logger inicializado com sucesso',
        inFallbackMode: false,
      };
    } catch (err) {
      // Falha na inicialização — o middleware ainda pode ser usado
      // mas os logs serão perdidos até que o banco seja restaurado
      process.stderr.write(`[audit-logger] Init failed: ${err.message}\n`);

      // v1.2+ implementará fallback para arquivo JSON aqui
      return {
        status: 'warning',
        message: `DB indisponível: ${err.message}. Logs serão descartados.`,
        inFallbackMode: false,
      };
    }
  },

  /**
   * Retorna o middleware Express de auditoria.
   * Deve ser chamado APÓS Audit.initialize().
   *
   * @param {Object} [options={}] - Opções do middleware
   * @param {boolean} [options.enabled] - Override da flag global
   * @param {string[]} [options.excludePaths] - Caminhos a ignorar
   * @returns {import('express').RequestHandler}
   *
   * @example
   * app.use(Audit.expressMiddleware({
   *   excludePaths: ['/health', '/metrics', '/favicon.ico']
   * }));
   */
  expressMiddleware(options = {}) {
    if (!_state.useCase) {
      // Retorna middleware no-op se não inicializado (seguro)
      return (_req, _res, next) => next();
    }

    return createExpressMiddleware(_state.useCase, {
      enabled: options.enabled ?? _state.options.enabled ?? true,
      excludePaths: options.excludePaths ?? _state.options.excludePaths ?? ['/health', '/metrics'],
    });
  },

  /**
   * Encerra o audit-logger graciosamente.
   * Fecha conexões com o banco e libera recursos.
   *
   * @returns {Promise<void>}
   *
   * @example
   * process.on('SIGTERM', async () => {
   *   await Audit.shutdown();
   *   process.exit(0);
   * });
   */
  async shutdown() {
    await closePool();
    _state.useCase = null;
    process.stderr.write('[audit-logger] Shutdown completo\n');
  },

  /**
   * Retorna o status atual do audit-logger.
   *
   * @returns {Promise<Object>} Status e informações de saúde
   */
  async getStatus() {
    const healthy = _state.useCase
      ? await testConnection()
      : false;

    return {
      initialized: !!_state.useCase,
      databaseConnected: healthy,
      inFallbackMode: false, // v1.2+ implementa
    };
  },
};

module.exports = { Audit };
```

---

## 4.5 Testes do MVP

**O que você precisa saber:**

- **Vitest** é compatível com Jest (mesma API) mas mais rápido e moderno
- `describe` agrupa testes relacionados
- `it` (ou `test`) define um caso de teste
- `expect` faz asserções sobre o resultado
- Teste unitário: testa uma unidade isolada (sem banco, sem rede)

```javascript
// packages/audit-logger/src/domain/entities/AuditLog.test.js

import { describe, it, expect } from "vitest";
import { AuditLog } from "./AuditLog.js";
import { InvalidAuditLogError } from "../exceptions/InvalidAuditLogError.js";

describe("AuditLog Entity", () => {
  const validData = {
    ip: "203.0.113.42",
    url: "/api/users",
    method: "GET",
    statusCode: 200,
    timestamp: new Date(),
  };

  describe("Criação válida", () => {
    it("deve criar AuditLog com campos obrigatórios", () => {
      const log = new AuditLog(validData);
      expect(log.ip).toBe("203.0.113.42");
      expect(log.url).toBe("/api/users");
      expect(log.method).toBe("GET");
      expect(log.statusCode).toBe(200);
    });

    it("deve derivar severity=INFO para status 200", () => {
      const log = new AuditLog({ ...validData, statusCode: 200 });
      expect(log.severity).toBe("INFO");
    });

    it("deve derivar severity=WARN para status 404", () => {
      const log = new AuditLog({ ...validData, statusCode: 404 });
      expect(log.severity).toBe("WARN");
    });

    it("deve derivar severity=ERROR para status 500", () => {
      const log = new AuditLog({ ...validData, statusCode: 500 });
      expect(log.severity).toBe("ERROR");
    });

    it("deve auto-gerar request_id UUID se não fornecido", () => {
      const log = new AuditLog(validData);
      expect(log.request_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it("deve usar request_id fornecido se presente", () => {
      const customId = "550e8400-e29b-41d4-a716-446655440000";
      const log = new AuditLog({ ...validData, request_id: customId });
      expect(log.request_id).toBe(customId);
    });

    it("deve gerar anonymous_id como string de 64 chars", () => {
      const log = new AuditLog(validData);
      expect(log.anonymous_id).toHaveLength(64);
      expect(log.anonymous_id).toMatch(/^[a-f0-9]{64}$/);
    });

    it("deve ser imutável (Object.freeze)", () => {
      const log = new AuditLog(validData);
      expect(() => {
        log.ip = "outro";
      }).toThrow(TypeError);
    });
  });

  describe("Validações obrigatórias", () => {
    it("deve rejeitar ip vazio", () => {
      expect(() => new AuditLog({ ...validData, ip: "" })).toThrow(
        InvalidAuditLogError,
      );
    });

    it("deve rejeitar ip null", () => {
      expect(() => new AuditLog({ ...validData, ip: null })).toThrow(
        InvalidAuditLogError,
      );
    });

    it("deve rejeitar statusCode float", () => {
      expect(() => new AuditLog({ ...validData, statusCode: 200.5 })).toThrow(
        InvalidAuditLogError,
      );
    });

    it("deve rejeitar statusCode < 100", () => {
      expect(() => new AuditLog({ ...validData, statusCode: 99 })).toThrow(
        InvalidAuditLogError,
      );
    });

    it("deve rejeitar statusCode > 599", () => {
      expect(() => new AuditLog({ ...validData, statusCode: 600 })).toThrow(
        InvalidAuditLogError,
      );
    });

    it("deve rejeitar timestamp muito no futuro (> 12h)", () => {
      const future = new Date(Date.now() + 13 * 60 * 60 * 1000);
      expect(() => new AuditLog({ ...validData, timestamp: future })).toThrow(
        InvalidAuditLogError,
      );
    });

    it("deve rejeitar timestamp muito antigo (> 31 dias)", () => {
      const old = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
      expect(() => new AuditLog({ ...validData, timestamp: old })).toThrow(
        InvalidAuditLogError,
      );
    });

    it("deve rejeitar method inválido", () => {
      expect(() => new AuditLog({ ...validData, method: "INVALID" })).toThrow(
        InvalidAuditLogError,
      );
    });
  });
});
```

---

# 5. Versão 1.1 — Buffer e Batch Processing

> 🎯 **Objetivo:** Substituir o insert direto por um sistema de buffer em memória com batch insert. Performance: de ~1 insert/request para ~500 inserts/flush. Redução de carga no banco de ~500x.

---

## 5.1 O que Muda na v1.1

**O que você precisa saber antes desta versão:**

- `EventEmitter` (já coberto na seção 1.3)
- `setInterval` vs `setTimeout`: interval repete, timeout é once
- `clearInterval` para cancelar timers (fundamental no graceful shutdown)
- Batch INSERT com PostgreSQL: uma query com N rows é muito mais eficiente que N queries

**Conceito central — Por que batch é mais eficiente?**

```
1 INSERT por request:
  → 1000 requisições = 1000 round-trips TCP ao banco
  → 1000 × ~5ms = ~5 segundos de overhead por segundo de tráfego

Batch INSERT (500 por vez):
  → 1000 requisições = 2 round-trips TCP ao banco
  → 2 × ~5ms = ~10ms de overhead total
  → 500x mais eficiente!
```

---

## 5.2 Novos Arquivos na v1.1

### `AuditBuffer.js` — Buffer FIFO com Flush Events

```javascript
// src/application/buffer/AuditBuffer.js

/**
 * @fileoverview Buffer em memória para acúmulo de logs de auditoria.
 *
 * FIFO (First In, First Out): logs são adicionados no fim e retirados do início.
 * Emite evento 'flush' em duas situações:
 *   1. Volume: quando atinge maxSize (default: 500)
 *   2. Tempo: quando flushInterval expira (default: 1000ms)
 *
 * O flush por tempo garante que poucos logs não fiquem presos em memória
 * quando o tráfego é baixo.
 *
 * @module AuditBuffer
 */

"use strict";

const EventEmitter = require("node:events");

/**
 * Buffer FIFO para logs de auditoria com flush automático.
 *
 * @class
 * @extends EventEmitter
 *
 * @fires AuditBuffer#flush - Emitido com array de AuditLog prontos para persistir
 *
 * @example
 * const buffer = new AuditBuffer({ maxSize: 500, flushInterval: 1000 });
 *
 * buffer.on('flush', async (batch) => {
 *   await repository.saveBatch(batch);
 * });
 *
 * buffer.add(auditLog);
 */
class AuditBuffer extends EventEmitter {
  /**
   * @constructor
   * @param {Object} [options={}]
   * @param {number} [options.maxSize=500] - Flush por volume
   * @param {number} [options.flushInterval=1000] - Flush por tempo (ms)
   * @param {number} [options.maxPending=10000] - Máx logs em memória
   * @param {'drop'|'reject'} [options.overflowBehavior='drop'] - Comportamento no overflow
   */
  constructor(options = {}) {
    super(); // Inicializa EventEmitter

    /** @private @type {number} */
    this._maxSize = options.maxSize ?? 500;

    /** @private @type {number} */
    this._flushInterval = options.flushInterval ?? 1000;

    /** @private @type {number} */
    this._maxPending = options.maxPending ?? 10000;

    /** @private @type {'drop'|'reject'} */
    this._overflowBehavior = options.overflowBehavior ?? "drop";

    /**
     * Array interno de logs aguardando flush.
     * @private
     * @type {import('../../domain/entities/AuditLog').AuditLog[]}
     */
    this._items = [];

    /** @private @type {NodeJS.Timeout|null} */
    this._timer = null;

    /** @private @type {boolean} */
    this._shutdown = false;

    // Inicia o timer de flush por tempo
    this._startTimer();
  }

  /**
   * Adiciona um log ao buffer.
   * Se o buffer estiver cheio (maxSize), emite 'flush' imediatamente.
   *
   * @param {import('../../domain/entities/AuditLog').AuditLog} log
   * @returns {boolean} true se adicionado, false se rejeitado (overflow)
   */
  add(log) {
    if (this._shutdown) return false;

    // Overflow: buffer com mais de maxPending logs
    if (this._items.length >= this._maxPending) {
      if (this._overflowBehavior === "reject") {
        return false; // Descarta o novo log
      }
      // 'drop': remove o mais antigo para aceitar o novo
      this._items.shift();
    }

    this._items.push(log);

    // Flush por volume
    if (this._items.length >= this._maxSize) {
      this._flush();
    }

    return true;
  }

  /**
   * Executa o flush manualmente (esvazia o buffer e emite evento).
   * Seguro chamar quando buffer está vazio.
   *
   * @returns {import('../../domain/entities/AuditLog').AuditLog[]} Logs que foram flushed
   */
  flush() {
    return this._flush();
  }

  /**
   * Para o buffer (graceful shutdown).
   * Após shutdown, novos logs são rejeitados.
   * Chame flush() antes para garantir que logs em memória sejam processados.
   *
   * @returns {void}
   */
  shutdown() {
    this._shutdown = true;
    this._stopTimer();
  }

  /**
   * Retorna o número atual de logs no buffer.
   * @returns {number}
   */
  get size() {
    return this._items.length;
  }

  /**
   * Executa o flush interno: copia os items, limpa o array, emite evento.
   * @private
   * @returns {import('../../domain/entities/AuditLog').AuditLog[]}
   */
  _flush() {
    if (this._items.length === 0) return [];

    // splice(0) remove todos os items e retorna eles
    // IMPORTANTE: isso é atômico no JavaScript single-thread
    const batch = this._items.splice(0);

    // Emite o evento com o batch (listeners processam de forma assíncrona)
    this.emit("flush", batch);

    return batch;
  }

  /**
   * Inicia o timer de flush por tempo.
   * @private
   */
  _startTimer() {
    this._timer = setInterval(() => {
      if (this._items.length > 0) {
        this._flush();
      }
    }, this._flushInterval);

    // unref() permite que o processo Node.js encerre mesmo com timer ativo
    // Sem isso, setInterval manteria o processo vivo indefinidamente
    this._timer.unref();
  }

  /**
   * Para o timer de flush por tempo.
   * @private
   */
  _stopTimer() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }
}

module.exports = { AuditBuffer };
```

### `BatchWorker.js` — Processa Batches Assincronamente

```javascript
// src/infrastructure/database/BatchWorker.js

/**
 * @fileoverview Worker que processa batches do buffer e persiste no banco.
 *
 * Escuta o evento 'flush' do AuditBuffer e executa batch INSERT.
 * Implementa retry único (100ms backoff) antes de ativar fallback.
 *
 * FLUXO:
 * buffer.emit('flush', batch)
 *   → BatchWorker.onFlush(batch)
 *     → repository.saveBatch(batch) [tenta]
 *     → Se falha: aguarda 100ms, tenta novamente
 *     → Se ainda falha: ativa fallback
 *
 * @module BatchWorker
 */

"use strict";

/**
 * Worker de processamento de batches de auditoria.
 * @class
 */
class BatchWorker {
  /**
   * @constructor
   * @param {import('../../application/ports/IAuditLogRepository').IAuditLogRepository} primaryRepository
   *   Repositório principal (PostgreSQL)
   * @param {import('../../application/ports/IAuditLogRepository').IAuditLogRepository|null} [fallbackRepository=null]
   *   Repositório de fallback (JSON Lines) — null no MVP
   * @param {Object} [options={}]
   * @param {number} [options.retryDelayMs=100] - Delay antes do retry
   */
  constructor(primaryRepository, fallbackRepository = null, options = {}) {
    /** @private */
    this._primary = primaryRepository;

    /** @private */
    this._fallback = fallbackRepository;

    /** @private */
    this._retryDelayMs = options.retryDelayMs ?? 100;

    /** @private @type {boolean} */
    this._inFallbackMode = false;

    /** @private @type {number} Operações em andamento */
    this._inflight = 0;
  }

  /**
   * Processa um batch de logs recebido do buffer.
   * Este método é chamado como handler do evento 'flush'.
   *
   * @param {import('../../domain/entities/AuditLog').AuditLog[]} batch
   * @returns {Promise<void>}
   */
  async processBatch(batch) {
    if (!batch || batch.length === 0) return;

    this._inflight++;

    try {
      if (this._inFallbackMode && this._fallback) {
        await this._saveFallback(batch);
      } else {
        await this._savePrimary(batch);
      }
    } finally {
      this._inflight--;
    }
  }

  /**
   * Tenta salvar no repositório primário com retry único.
   * @private
   * @param {import('../../domain/entities/AuditLog').AuditLog[]} batch
   */
  async _savePrimary(batch) {
    try {
      await this._primary.saveBatch(batch);
    } catch (firstError) {
      // Retry após 100ms
      await this._sleep(this._retryDelayMs);

      try {
        await this._primary.saveBatch(batch);
      } catch (secondError) {
        process.stderr.write(
          `[audit-logger] Batch insert falhou após retry: ${secondError.message}\n`,
        );

        // Ativa modo fallback permanente
        this._inFallbackMode = true;

        // Tenta salvar no fallback
        await this._saveFallback(batch);
      }
    }
  }

  /**
   * Salva no repositório de fallback (se disponível).
   * @private
   * @param {import('../../domain/entities/AuditLog').AuditLog[]} batch
   */
  async _saveFallback(batch) {
    if (!this._fallback) {
      process.stderr.write(
        `[audit-logger] Fallback não configurado. ${batch.length} logs perdidos.\n`,
      );
      return;
    }

    try {
      await this._fallback.saveBatch(batch);
    } catch (err) {
      process.stderr.write(
        `[audit-logger] Fallback também falhou: ${err.message}. ${batch.length} logs perdidos.\n`,
      );
    }
  }

  /**
   * Aguarda operações in-flight completarem (usado no shutdown).
   * @param {number} [timeoutMs=5000] - Timeout máximo de espera
   * @returns {Promise<void>}
   */
  async waitForInflight(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;

    while (this._inflight > 0 && Date.now() < deadline) {
      await this._sleep(50);
    }
  }

  /**
   * @private
   * @param {number} ms
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = { BatchWorker };
```

### Atualizar `AuditLogRepository.js` — Adicionar `saveBatch`

```javascript
// Adicionar ao AuditLogRepository.js:

/**
 * Persiste um batch de logs usando INSERT parameterizado multi-row.
 * Muito mais eficiente que N inserts individuais.
 *
 * Técnica: gera placeholders dinamicamente para o VALUES clause.
 * Para 3 logs com 15 campos cada:
 * VALUES ($1,$2,...$15), ($16,$17,...$30), ($31,$32,...$45)
 *
 * @param {import('../../domain/entities/AuditLog').AuditLog[]} logs
 * @returns {Promise<void>}
 */
async saveBatch(logs) {
  if (!logs || logs.length === 0) return;

  const pool = getPool();
  const FIELDS_PER_ROW = 15;
  const values = [];
  const placeholders = [];

  logs.forEach((log, rowIndex) => {
    const offset = rowIndex * FIELDS_PER_ROW;

    // Gera ($1, $2, ..., $15), ($16, $17, ..., $30), etc.
    placeholders.push(
      `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, ` +
      `$${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, ` +
      `$${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, ` +
      `$${offset + 13}, $${offset + 14}, $${offset + 15})`
    );

    values.push(
      log.request_id,
      log.anonymous_id,
      log.ip,
      log.userId ?? null,
      log.url,
      log.method,
      log.statusCode,
      log.severity,
      log.body ? JSON.stringify(log.body) : null,
      log.headers ? JSON.stringify(log.headers) : null,
      log.response_body ? JSON.stringify(log.response_body) : null,
      log.duration_ms ?? null,
      log.user_agent ?? null,
      log.schema_version,
      log.timestamp
    );
  });

  const sql = `
    INSERT INTO audit_logs (
      request_id, anonymous_id, ip, user_id, url, method,
      status_code, severity, body, headers, response_body,
      duration_ms, user_agent, schema_version, timestamp
    ) VALUES ${placeholders.join(', ')}
    ON CONFLICT (request_id) DO NOTHING;
  `;

  await pool.query(sql, values);
}
```

### Atualizar `SaveAuditLogUseCase.js` — Usar Buffer

```javascript
// SaveAuditLogUseCase.js atualizado para v1.1:
// Adiciona ao buffer em vez de persistir diretamente

async execute(rawData) {
  try {
    const auditLog = new AuditLog(rawData);
    this._buffer.add(auditLog); // ← substitui repository.save()
  } catch (err) {
    process.stderr.write(`[audit-logger] Erro ao criar AuditLog: ${err.message}\n`);
  }
}
```

---

# 6. Versão 1.2 — Fallback e Resiliência

> 🎯 **Objetivo:** O audit-logger nunca pode fazer a aplicação falhar. Se o banco cair, os logs continuam sendo salvos em arquivo JSON Lines (`logs/audit-fallback.jsonl`).

---

## 6.1 O que Você Precisa Saber

**JSON Lines (NDJSON — Newline Delimited JSON):**

- Um JSON por linha — cada linha é um objeto JSON válido completo
- Eficiente para append (não precisa reescrever o arquivo inteiro)
- Fácil de processar linha por linha com `readline` do Node.js
- Extensão: `.jsonl` ou `.ndjson`

```
{"request_id":"uuid1","ip":"1.2.3.4","url":"/api/users","statusCode":200}
{"request_id":"uuid2","ip":"5.6.7.8","url":"/api/login","statusCode":401}
```

**`fs.appendFileSync` vs `fs.appendFile`:**

- `Sync` bloqueia o event loop — **evite em código de alta frequência**
- Para fallback (cenário degradado), `appendFile` assíncrono é preferível
- Use `fs/promises` para API baseada em Promise no Node.js 20+

---

## 6.2 `FallbackRepository.js`

```javascript
// src/infrastructure/fallback/FallbackRepository.js

/**
 * @fileoverview Repositório de fallback usando JSON Lines (NDJSON).
 *
 * Ativado automaticamente quando o PostgreSQL falha.
 * Escreve um JSON por linha em logs/audit-fallback.jsonl.
 *
 * Rotação de arquivo:
 * - Por tamanho: quando arquivo > maxSize (100MB default)
 * - Por data: ao mudar o dia (midnight UTC)
 *
 * @module FallbackRepository
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  IAuditLogRepository,
} = require("../../application/ports/IAuditLogRepository");

/**
 * Repositório de fallback para arquivo JSON Lines.
 * @class
 * @implements {IAuditLogRepository}
 */
class FallbackRepository extends IAuditLogRepository {
  /**
   * @constructor
   * @param {Object} [options={}]
   * @param {string} [options.logDir='logs'] - Diretório dos arquivos de log
   * @param {number} [options.maxSizeBytes=104857600] - 100MB antes de rotacionar
   */
  constructor(options = {}) {
    super();

    /** @private */
    this._logDir = options.logDir ?? process.env.LOG_DIR ?? "logs";

    /** @private */
    this._maxSizeBytes = options.maxSizeBytes ?? 104857600;

    /** @private */
    this._currentDate = this._getUTCDateString();

    // Garante que o diretório existe
    this._ensureLogDir();
  }

  /**
   * Persiste um único log no arquivo de fallback.
   * @param {import('../../domain/entities/AuditLog').AuditLog} log
   * @returns {Promise<void>}
   */
  async save(log) {
    await this.saveBatch([log]);
  }

  /**
   * Persiste um batch de logs no arquivo de fallback.
   * Cada log é escrito como uma linha JSON (NDJSON).
   *
   * @param {import('../../domain/entities/AuditLog').AuditLog[]} logs
   * @returns {Promise<void>}
   */
  async saveBatch(logs) {
    if (!logs || logs.length === 0) return;

    // Verifica se deve rotacionar (data mudou ou tamanho excedido)
    this._checkRotation();

    const filePath = this._getCurrentFilePath();
    const lines = logs.map((log) => JSON.stringify(log)).join("\n") + "\n";

    try {
      await fs.promises.appendFile(filePath, lines, "utf8");
    } catch (err) {
      // Último recurso: stderr
      process.stderr.write(
        `[audit-logger] Fallback write failed: ${err.message}\n`,
      );
      process.stderr.write(
        `[audit-logger] Logs perdidos: ${logs.length} registros\n`,
      );
    }
  }

  /**
   * Sempre saudável (arquivo nunca recusa conexão como banco faz).
   * @returns {Promise<boolean>}
   */
  async isHealthy() {
    try {
      this._ensureLogDir();
      return true;
    } catch {
      return false;
    }
  }

  /** @returns {Promise<void>} */
  async close() {
    // Arquivo não precisa de close explícito (não é handle persistente)
  }

  /**
   * Retorna o caminho do arquivo de fallback atual.
   * @private
   * @returns {string}
   */
  _getCurrentFilePath() {
    return path.join(this._logDir, `audit-fallback-${this._currentDate}.jsonl`);
  }

  /**
   * Data UTC no formato YYYY-MM-DD para o nome do arquivo.
   * @private
   * @returns {string}
   */
  _getUTCDateString() {
    return new Date().toISOString().substring(0, 10); // "2026-03-30"
  }

  /**
   * Verifica e executa rotação se necessário.
   * @private
   */
  _checkRotation() {
    const today = this._getUTCDateString();

    // Rotação por data (mudou o dia UTC)
    if (today !== this._currentDate) {
      this._currentDate = today;
    }

    // Rotação por tamanho
    const filePath = this._getCurrentFilePath();
    try {
      const stat = fs.statSync(filePath);
      if (stat.size >= this._maxSizeBytes) {
        // Renomeia com sufixo de timestamp para não perder dados
        const rotated = filePath.replace(".jsonl", `.${Date.now()}.jsonl`);
        fs.renameSync(filePath, rotated);
      }
    } catch {
      // Arquivo não existe ainda — OK, será criado no próximo write
    }
  }

  /**
   * Garante que o diretório de logs existe.
   * @private
   */
  _ensureLogDir() {
    fs.mkdirSync(this._logDir, { recursive: true });
  }
}

module.exports = { FallbackRepository };
```

---

# 7. Versão 1.3 — Sanitização e Segurança

> 🎯 **Objetivo:** Nunca persistir senhas, tokens ou dados sensíveis em texto claro. Sanitização profunda e recursiva de todos os payloads antes de salvar.

---

## 7.1 O que Você Precisa Saber

**Deep Clone vs Shallow Clone:**

- Shallow clone (`{ ...obj }`) copia apenas o primeiro nível — sub-objetos ainda são referências
- Deep clone (`structuredClone(obj)`) copia toda a árvore de objetos — nenhuma referência compartilhada
- **NUNCA modifique o objeto original** — o body da requisição pode ser usado por outros middlewares

**Mascaramento recursivo:**

- O objeto pode ter qualquer profundidade: `{ user: { credentials: { password: "..." } } }`
- Todos os níveis devem ser verificados
- Arrays também devem ser verificados (cada item pode ser um objeto com dados sensíveis)

---

## 7.2 `DataSanitizer.js`

```javascript
// src/utils/DataSanitizer.js

/**
 * @fileoverview Sanitização recursiva de dados sensíveis.
 *
 * IMPORTANTE:
 * - NUNCA modifica o objeto original (usa structuredClone)
 * - Recursivo: verifica todos os níveis aninhados
 * - Case-insensitive: "Password", "PASSWORD", "password" são todos mascarados
 * - Arrays são percorridos: [{password: "..."}, ...] é sanitizado
 *
 * @module DataSanitizer
 */

"use strict";

/**
 * Valor usado para mascarar campos sensíveis.
 * @constant {string}
 */
const MASK_VALUE = "********";

/**
 * Lista de campos sensíveis que devem ser mascarados (case-insensitive).
 * Configurável via AUDIT_SENSITIVE_FIELDS env var (adicional aos defaults).
 *
 * @constant {Set<string>}
 * @private
 */
const DEFAULT_SENSITIVE_FIELDS = new Set([
  "password",
  "senha",
  "pass",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "api_key",
  "apitoken",
  "secret",
  "clientsecret",
  "client_secret",
  "authorization",
  "auth",
  "credential",
  "credentials",
  "cvv",
  "cvc",
  "ssn",
  "cpf",
  "cnpj",
  "bank_account",
  "bankaccount",
  "credit_card",
  "creditcard",
  "private_key",
  "privatekey",
]);

/**
 * Cria o Set de campos sensíveis combinando defaults com env vars.
 * @returns {Set<string>}
 * @private
 */
function buildSensitiveFields() {
  const custom = process.env.AUDIT_SENSITIVE_FIELDS ?? "";
  const customFields = custom
    .split(",")
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...DEFAULT_SENSITIVE_FIELDS, ...customFields]);
}

/** @type {Set<string>} */
const SENSITIVE_FIELDS = buildSensitiveFields();

/**
 * Sanitiza um objeto removendo/mascarando campos sensíveis.
 * Opera em uma deep clone — o objeto original NÃO é modificado.
 *
 * @param {Object|null|undefined} obj - Objeto a sanitizar
 * @returns {Object|null} Cópia sanitizada ou null se entrada inválida
 *
 * @example
 * const body = { email: 'user@example.com', password: 'secret123' };
 * const sanitized = sanitize(body);
 * // → { email: 'user@example.com', password: '********' }
 * // body original não foi modificado
 *
 * // Recursivo:
 * const nested = { user: { credentials: { token: 'abc', name: 'John' } } };
 * sanitize(nested);
 * // → { user: { credentials: { token: '********', name: 'John' } } }
 */
function sanitize(obj) {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;

  // Deep clone: nenhuma referência ao objeto original
  const cloned = structuredClone(obj);

  // Aplica mascaramento recursivo na cópia
  return maskRecursive(cloned);
}

/**
 * Percorre recursivamente o objeto e mascara campos sensíveis.
 * Modifica o objeto in-place (mas é sempre uma cópia do structuredClone).
 *
 * @param {Object|Array} obj - Objeto ou array para percorrer
 * @returns {Object|Array} Objeto modificado
 * @private
 */
function maskRecursive(obj) {
  if (obj === null || typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    // Percorre cada item do array
    return obj.map((item) => maskRecursive(item));
  }

  // Percorre cada chave do objeto
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_FIELDS.has(key.toLowerCase())) {
      // Mascara o campo sensível
      obj[key] = MASK_VALUE;
    } else if (obj[key] !== null && typeof obj[key] === "object") {
      // Recursão para objetos aninhados
      obj[key] = maskRecursive(obj[key]);
    }
  }

  return obj;
}

module.exports = { sanitize, MASK_VALUE };
```

---

## 7.3 `PayloadTruncator.js` — Limites de Tamanho

```javascript
// src/utils/PayloadTruncator.js

/**
 * @fileoverview Truncamento de payloads que excedem limites de tamanho.
 *
 * Limites da spec-v4:
 * - URL: 2KB (2048 bytes)
 * - Body / Response Body: 64KB (65536 bytes)
 * - Headers: 16KB (16384 bytes)
 * - Total do log: 256KB (262144 bytes)
 *
 * IMPORTANTE: Bytes, não caracteres. UTF-8 pode usar até 4 bytes por char.
 * Use Buffer.byteLength() para contar bytes corretamente.
 *
 * @module PayloadTruncator
 */

"use strict";

const { LIMITS } = require("./FieldLimitConstants");

/**
 * Trunca uma string para não exceder o limite de bytes.
 * Respeita limites UTF-8 (não corta no meio de um caractere multibyte).
 *
 * @param {string} str - String a truncar
 * @param {number} maxBytes - Limite máximo em bytes
 * @returns {string} String truncada ou original se dentro do limite
 *
 * @example
 * truncateString('/api/very-long-url...', 2048); // → truncado se > 2KB
 * truncateString('/api/short', 2048);            // → sem alteração
 */
function truncateString(str, maxBytes) {
  if (!str || typeof str !== "string") return str;

  if (Buffer.byteLength(str, "utf8") <= maxBytes) {
    return str; // Dentro do limite — sem alteração
  }

  // Trunca por bytes, respeitando caracteres multibyte UTF-8
  return Buffer.from(str, "utf8").slice(0, maxBytes).toString("utf8");
}

/**
 * Trunca um objeto serializado para não exceder o limite de bytes.
 * Se o JSON serializado for muito grande, retorna null com indicação.
 *
 * @param {Object|null} obj - Objeto a verificar
 * @param {number} maxBytes - Limite máximo em bytes
 * @param {string} [fieldName='payload'] - Nome do campo (para log)
 * @returns {Object|null} Objeto original se dentro do limite, ou null
 *
 * @example
 * truncatePayload(largeBody, 65536); // → null se > 64KB
 * truncatePayload(smallBody, 65536); // → smallBody (sem alteração)
 */
function truncatePayload(obj, maxBytes, fieldName = "payload") {
  if (obj === null || obj === undefined) return null;

  const json = JSON.stringify(obj);
  const byteSize = Buffer.byteLength(json, "utf8");

  if (byteSize <= maxBytes) return obj;

  process.stderr.write(
    `[audit-logger] ${fieldName} truncado: ${byteSize} bytes > ${maxBytes} limite\n`,
  );

  // Retorna null para indicar que o payload foi descartado por excesso de tamanho
  // Alternativa futura: truncar o JSON parcialmente
  return { _truncated: true, _originalBytes: byteSize };
}

/**
 * Aplica todos os truncamentos de acordo com a spec-v4.
 *
 * @param {Object} rawData - Dados brutos da requisição
 * @returns {Object} Dados com campos truncados conforme necessário
 */
function applyTruncations(rawData) {
  return {
    ...rawData,
    url: rawData.url
      ? truncateString(rawData.url, LIMITS.URL_BYTES)
      : rawData.url,
    body: rawData.body
      ? truncatePayload(rawData.body, LIMITS.BODY_BYTES, "body")
      : rawData.body,
    headers: rawData.headers
      ? truncatePayload(rawData.headers, LIMITS.HEADERS_BYTES, "headers")
      : rawData.headers,
    response_body: rawData.response_body
      ? truncatePayload(
          rawData.response_body,
          LIMITS.RESPONSE_BODY_BYTES,
          "response_body",
        )
      : rawData.response_body,
  };
}

module.exports = { truncateString, truncatePayload, applyTruncations };
```

---

## 7.4 Particionamento PostgreSQL (v1.3)

**O que você precisa saber:**

- A tabela no MVP tem `PRIMARY KEY (id)` — para particionamento, muda para `PRIMARY KEY (id, timestamp)`
- `PartitionManager` cria a partição de hoje e de amanhã (preemptivo)
- `PARTITION BY RANGE (timestamp)` divide a tabela por intervalos de data

```javascript
// src/infrastructure/database/PartitionManager.js

/**
 * @fileoverview Gerencia criação e remoção de partições diárias.
 *
 * Particionamento diário por timestamp (UTC):
 * - audit_logs_2026_03_30: FROM '2026-03-30' TO '2026-03-31'
 * - audit_logs_2026_03_31: FROM '2026-03-31' TO '2026-04-01'
 *
 * Criação preemptiva: HOJE e AMANHÃ são sempre criadas ao iniciar.
 * Assim, inserts no final do dia nunca falham por partição inexistente.
 *
 * Retenção: partições com mais de AUDIT_RETENTION_DAYS são dropadas.
 * DROP TABLE é O(1) — muito mais rápido que DELETE.
 *
 * @module PartitionManager
 */

"use strict";

const { getPool } = require("./PostgreSQLConnection");

/**
 * Gera o nome da partição para uma data.
 * Formato: audit_logs_YYYY_MM_DD
 *
 * @param {Date} date - Data da partição (UTC)
 * @returns {string} Nome da partição
 * @private
 *
 * @example
 * getPartitionName(new Date('2026-03-30')); // → 'audit_logs_2026_03_30'
 */
function getPartitionName(date) {
  const iso = date.toISOString().substring(0, 10); // "2026-03-30"
  return `audit_logs_${iso.replace(/-/g, "_")}`;
}

/**
 * Cria a partição diária para uma data específica.
 * Usa IF NOT EXISTS para idempotência (seguro chamar múltiplas vezes).
 *
 * @param {Date} date - Data da partição
 * @returns {Promise<void>}
 */
async function createPartition(date) {
  const pool = getPool();
  const partitionName = getPartitionName(date);

  // Data de início: 00:00:00 UTC do dia
  const from = date.toISOString().substring(0, 10);

  // Data de fim: 00:00:00 UTC do dia seguinte
  const nextDay = new Date(date);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const to = nextDay.toISOString().substring(0, 10);

  const sql = `
    CREATE TABLE IF NOT EXISTS ${partitionName}
    PARTITION OF audit_logs
    FOR VALUES FROM ('${from}') TO ('${to}');
  `;

  await pool.query(sql);
}

/**
 * Cria partições para hoje e amanhã (preemptivo).
 * Chamado na inicialização e diariamente.
 *
 * @returns {Promise<void>}
 */
async function createCurrentPartitions() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  await createPartition(today);
  await createPartition(tomorrow);
}

/**
 * Remove partições mais antigas que retentionDays.
 * DROP TABLE é O(1) — não varre dados, apenas remove estrutura.
 *
 * @param {number} [retentionDays=90] - Dias de retenção
 * @returns {Promise<number>} Número de partições removidas
 */
async function dropOldPartitions(retentionDays = 90) {
  const pool = getPool();
  const cutoffDate = new Date();
  cutoffDate.setUTCDate(cutoffDate.getUTCDate() - retentionDays);

  // Lista todas as tabelas de partição
  const { rows } = await pool.query(`
    SELECT tablename
    FROM pg_tables
    WHERE tablename LIKE 'audit_logs_%'
      AND schemaname = 'public'
    ORDER BY tablename;
  `);

  let dropped = 0;

  for (const { tablename } of rows) {
    // Extrai a data do nome: audit_logs_2026_03_30 → 2026-03-30
    const dateStr = tablename.replace("audit_logs_", "").replace(/_/g, "-");

    const partitionDate = new Date(`${dateStr}T00:00:00Z`);

    if (partitionDate < cutoffDate) {
      await pool.query(`DROP TABLE IF EXISTS ${tablename};`);
      dropped++;
    }
  }

  return dropped;
}

module.exports = {
  createPartition,
  createCurrentPartitions,
  dropOldPartitions,
};
```

---

# 8. Versão 2.0 — Agregação e Anomalias

> 🎯 **Objetivo:** Gerar relatórios diários e mensais automaticamente. Detectar comportamentos suspeitos (brute force, rate abuse, error spike). Um job diário à 00:00 UTC realiza todo o trabalho.

---

## 8.1 O que Você Precisa Saber

**Node.js sem cron nativo:**

- Node.js não tem um cron scheduler embutido
- Calcule o delay até o próximo 00:00 UTC com `setTimeout`
- Ou use a lib `node-cron` (adiciona dependência)
- Neste projeto: implementamos o scheduler manualmente com `setTimeout` recursivo

**SQL Aggregation:**

- `COUNT(*)`: total de registros
- `COUNT(DISTINCT column)`: valores únicos
- `AVG(column)`: média
- `GROUP BY`: agrupa para agregação
- `WHERE timestamp >= '2026-03-29' AND timestamp < '2026-03-30'`: range diário

---

## 8.2 `DailySummaryJob.js`

```javascript
// src/infrastructure/aggregation/DailySummaryJob.js

/**
 * @fileoverview Job de agregação diária de logs de auditoria.
 *
 * Executa todos os dias às 00:00 UTC calculando métricas do dia anterior.
 * Usa ON CONFLICT (date) DO UPDATE para idempotência (pode ser re-executado).
 *
 * Schema da tabela daily_summary (criada pela migration):
 * - date DATE UNIQUE
 * - total_requests INTEGER
 * - avg_duration_ms NUMERIC
 * - max_duration_ms INTEGER
 * - error_count INTEGER
 * - warn_count INTEGER
 * - unauthorized_count INTEGER
 * - unique_ips INTEGER
 * - unique_users INTEGER
 * - insights JSONB (resultado do AnomalyDetector)
 *
 * @module DailySummaryJob
 */

"use strict";

const { getPool } = require("../database/PostgreSQLConnection");
const { detectAnomalies } = require("./AnomalyDetector");

/**
 * SQL que calcula as métricas agregadas do dia anterior.
 * Usa partition pruning automaticamente (PostgreSQL otimiza para a partição do dia).
 * @constant {string}
 * @private
 */
const AGGREGATION_SQL = `
  SELECT
    COUNT(*)                                              AS total_requests,
    ROUND(AVG(duration_ms)::numeric, 2)                  AS avg_duration_ms,
    MAX(duration_ms)                                      AS max_duration_ms,
    COUNT(*) FILTER (WHERE status_code >= 500)            AS error_count,
    COUNT(*) FILTER (WHERE status_code BETWEEN 400 AND 499) AS warn_count,
    COUNT(*) FILTER (WHERE status_code IN (401, 403))    AS unauthorized_count,
    COUNT(DISTINCT ip)                                    AS unique_ips,
    COUNT(DISTINCT user_id) FILTER (WHERE user_id IS NOT NULL) AS unique_users
  FROM audit_logs
  WHERE timestamp >= $1 AND timestamp < $2;
`;

/**
 * Executa a agregação para o dia fornecido (ou ontem por padrão).
 *
 * @param {Date} [targetDate] - Data para agregar (default: ontem UTC)
 * @returns {Promise<void>}
 */
async function run(targetDate) {
  const pool = getPool();

  // Data alvo: ontem (em UTC)
  const yesterday =
    targetDate ??
    (() => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      d.setUTCHours(0, 0, 0, 0);
      return d;
    })();

  const from = new Date(yesterday);
  from.setUTCHours(0, 0, 0, 0);

  const to = new Date(yesterday);
  to.setUTCDate(to.getUTCDate() + 1);
  to.setUTCHours(0, 0, 0, 0);

  try {
    // Calcula métricas
    const { rows } = await pool.query(AGGREGATION_SQL, [from, to]);
    const metrics = rows[0];

    // Detecta anomalias no período
    const insights = await detectAnomalies(from, to);

    // Persiste no daily_summary (idempotente via ON CONFLICT)
    await pool.query(
      `
      INSERT INTO daily_summary (
        date, total_requests, avg_duration_ms, max_duration_ms,
        error_count, warn_count, unauthorized_count,
        unique_ips, unique_users, insights
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (date) DO UPDATE SET
        total_requests    = EXCLUDED.total_requests,
        avg_duration_ms   = EXCLUDED.avg_duration_ms,
        max_duration_ms   = EXCLUDED.max_duration_ms,
        error_count       = EXCLUDED.error_count,
        warn_count        = EXCLUDED.warn_count,
        unauthorized_count = EXCLUDED.unauthorized_count,
        unique_ips        = EXCLUDED.unique_ips,
        unique_users      = EXCLUDED.unique_users,
        insights          = EXCLUDED.insights,
        updated_at        = CURRENT_TIMESTAMP;
    `,
      [
        from.toISOString().substring(0, 10),
        metrics.total_requests,
        metrics.avg_duration_ms,
        metrics.max_duration_ms,
        metrics.error_count,
        metrics.warn_count,
        metrics.unauthorized_count,
        metrics.unique_ips,
        metrics.unique_users,
        JSON.stringify(insights),
      ],
    );
  } catch (err) {
    process.stderr.write(
      `[audit-logger] DailySummaryJob failed: ${err.message}\n`,
    );
    // Não propaga o erro — falha no job não deve derrubar a aplicação
  }
}

/**
 * Calcula quantos millisegundos faltam para o próximo 00:00 UTC.
 * @returns {number} Millisegundos até meia-noite UTC
 * @private
 */
function msUntilMidnightUTC() {
  const now = new Date();
  const midnight = new Date();
  midnight.setUTCDate(midnight.getUTCDate() + 1);
  midnight.setUTCHours(0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/**
 * Agenda o job para rodar todos os dias às 00:00 UTC.
 * Usa setTimeout recursivo (mais preciso que setInterval para eventos diários).
 *
 * @returns {{ cancel: Function }} Objeto com método cancel() para parar o job
 */
function schedule() {
  /** @type {NodeJS.Timeout|null} */
  let timer = null;

  function scheduleNext() {
    const delay = msUntilMidnightUTC();
    timer = setTimeout(async () => {
      await run(); // Executa a agregação
      scheduleNext(); // Agenda o próximo
    }, delay);
    timer.unref(); // Não mantém o processo vivo
  }

  scheduleNext();

  return {
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}

module.exports = { run, schedule };
```

---

## 8.3 `AnomalyDetector.js`

```javascript
// src/infrastructure/aggregation/AnomalyDetector.js

/**
 * @fileoverview Detector de anomalias em logs de auditoria.
 *
 * Detecta três tipos de anomalia (spec-v4):
 * 1. BRUTE FORCE: IPs com > 100 respostas 401/403 no período
 * 2. RATE ABUSE: IPs com > 100 requisições por minuto
 * 3. ERROR SPIKE: > 30% das requisições são 5xx (mín 50 req total)
 *
 * Thresholds configuráveis via env:
 * - AUDIT_ANOMALY_FORCEBRUTE_THRESHOLD (default: 100)
 * - AUDIT_ANOMALY_RATEABUSE_THRESHOLD (default: 100)
 * - AUDIT_ANOMALY_ERRORSPIKE_PCT (default: 30)
 * - AUDIT_ANOMALY_ERRORSPIKE_MIN_COUNT (default: 50)
 *
 * @module AnomalyDetector
 */

"use strict";

const { getPool } = require("../database/PostgreSQLConnection");

/**
 * @typedef {Object} AnomalyInsights
 * @property {string[]} suspicious_ips - IPs com comportamento suspeito (brute force ou rate abuse)
 * @property {boolean} brute_force_detected - Detectou tentativa de força bruta
 * @property {boolean} rate_abuse_detected - Detectou abuso de rate limit
 * @property {boolean} error_spike_detected - Detectou spike de erros 5xx
 */

/**
 * Executa todos os detectores de anomalia para um período.
 *
 * @param {Date} from - Início do período (UTC)
 * @param {Date} to - Fim do período (UTC, exclusivo)
 * @returns {Promise<AnomalyInsights>}
 */
async function detectAnomalies(from, to) {
  const [bruteForceIps, rateAbuseIps, errorSpike] = await Promise.all([
    detectBruteForce(from, to),
    detectRateAbuse(from, to),
    detectErrorSpike(from, to),
  ]);

  const suspiciousIps = [...new Set([...bruteForceIps, ...rateAbuseIps])];

  return {
    suspicious_ips: suspiciousIps,
    brute_force_detected: bruteForceIps.length > 0,
    rate_abuse_detected: rateAbuseIps.length > 0,
    error_spike_detected: errorSpike,
  };
}

/**
 * Detecta IPs com excesso de respostas 401/403 (brute force / credential stuffing).
 *
 * @param {Date} from
 * @param {Date} to
 * @returns {Promise<string[]>} IPs suspeitos
 * @private
 */
async function detectBruteForce(from, to) {
  const pool = getPool();
  const threshold =
    Number(process.env.AUDIT_ANOMALY_FORCEBRUTE_THRESHOLD) || 100;

  const { rows } = await pool.query(
    `
    SELECT ip, COUNT(*) AS attempts
    FROM audit_logs
    WHERE timestamp >= $1
      AND timestamp < $2
      AND status_code IN (401, 403)
    GROUP BY ip
    HAVING COUNT(*) > $3
    ORDER BY attempts DESC;
  `,
    [from, to, threshold],
  );

  return rows.map((r) => r.ip);
}

/**
 * Detecta IPs com mais de N requisições por minuto (rate abuse).
 * Usa window de 1 minuto — conta o minuto com mais requisições.
 *
 * @param {Date} from
 * @param {Date} to
 * @returns {Promise<string[]>} IPs suspeitos
 * @private
 */
async function detectRateAbuse(from, to) {
  const pool = getPool();
  const threshold =
    Number(process.env.AUDIT_ANOMALY_RATEABUSE_THRESHOLD) || 100;

  const { rows } = await pool.query(
    `
    SELECT ip, MAX(req_per_minute) AS max_per_minute
    FROM (
      SELECT
        ip,
        DATE_TRUNC('minute', timestamp) AS minute,
        COUNT(*) AS req_per_minute
      FROM audit_logs
      WHERE timestamp >= $1 AND timestamp < $2
      GROUP BY ip, minute
    ) t
    GROUP BY ip
    HAVING MAX(req_per_minute) > $3
    ORDER BY max_per_minute DESC;
  `,
    [from, to, threshold],
  );

  return rows.map((r) => r.ip);
}

/**
 * Detecta se mais de N% das requisições resultaram em erro 5xx.
 *
 * @param {Date} from
 * @param {Date} to
 * @returns {Promise<boolean>}
 * @private
 */
async function detectErrorSpike(from, to) {
  const pool = getPool();
  const pct = Number(process.env.AUDIT_ANOMALY_ERRORSPIKE_PCT) || 30;
  const minCount = Number(process.env.AUDIT_ANOMALY_ERRORSPIKE_MIN_COUNT) || 50;

  const { rows } = await pool.query(
    `
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status_code >= 500) AS errors
    FROM audit_logs
    WHERE timestamp >= $1 AND timestamp < $2;
  `,
    [from, to],
  );

  const { total, errors } = rows[0];

  if (Number(total) < minCount) return false;

  const errorPct = (Number(errors) / Number(total)) * 100;
  return errorPct >= pct;
}

module.exports = { detectAnomalies };
```

---

# 9. Versão 3.0 — Full Production

> 🎯 **Objetivo:** Versão equivalente à spec-v4 completa. Tudo funcionando: graceful shutdown com timeout de 15s, middleware Fastify, retenção automática de partições, health endpoint completo.

---

## 9.1 O que a v3.0 Adiciona

| Feature             | Detalhes                                          |
| ------------------- | ------------------------------------------------- |
| Graceful Shutdown   | 5 passos com timeouts, SIGTERM/SIGINT             |
| Middleware Fastify  | Plugin nativo Fastify com `fastify.addHook`       |
| RetentionManager    | `DROP PARTITION` automático (diariamente)         |
| MonthlySummaryJob   | Agregação mensal no 1º dia de cada mês            |
| `Audit.getStatus()` | Health check completo (DB, fallback, buffer size) |
| Winston Logger      | Logging interno estruturado da lib                |
| Vitest Config       | Coverage configurada para 85%+                    |

---

## 9.2 Graceful Shutdown Completo

```javascript
// Adicionar ao index.js — substitui o shutdown simples da v1.0

/**
 * Encerra o audit-logger graciosamente em até 15 segundos.
 *
 * Sequência (spec-v4 §4.4):
 * 1. Para o buffer (50ms) — não aceita novos logs
 * 2. Flush dos logs restantes em memória (5s)
 * 3. Aguarda operações in-flight (5s)
 * 4. Fecha pool do banco (5s)
 * 5. Fecha handle do arquivo de fallback
 *
 * @param {Object} [deps] - Dependências (injetadas em testes)
 * @returns {Promise<void>}
 */
async shutdown(deps) {
  const buffer = deps?.buffer ?? _state.buffer;
  const worker = deps?.worker ?? _state.worker;
  const fallback = deps?.fallback ?? _state.fallback;

  const log = (msg) => process.stderr.write(`[audit-logger] ${msg}\n`);

  // STEP 1: Para o buffer
  if (buffer) {
    buffer.shutdown();
    log('✅ Buffer parado');
  }

  // STEP 2: Flush dos logs restantes (com timeout de 5s)
  if (buffer && worker) {
    const remaining = buffer.flush();
    if (remaining.length > 0) {
      await Promise.race([
        worker.processBatch(remaining),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Flush timeout')), 5000)
        ),
      ]).catch((err) => log(`⚠️  Flush timeout: ${err.message}`));
    }
    log(`✅ Flush de ${remaining.length} logs restantes`);
  }

  // STEP 3: Aguarda in-flight (5s)
  if (worker) {
    await worker.waitForInflight(5000);
    log('✅ Operações in-flight completas');
  }

  // STEP 4: Fecha pool do banco (5s)
  await Promise.race([
    closePool(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('DB close timeout')), 5000)
    ),
  ]).catch((err) => log(`⚠️  DB close timeout: ${err.message}`));
  log('✅ Pool do banco fechado');

  // STEP 5: Fecha fallback
  if (fallback) {
    await fallback.close();
    log('✅ Fallback fechado');
  }

  _state.useCase = null;
  log('✅ Graceful shutdown completo');
},
```

---

## 9.3 Middleware Fastify

```javascript
// src/adapters/middlewares/FastifyMiddleware.js

/**
 * @fileoverview Plugin Fastify para captura automática de auditoria HTTP.
 *
 * Usa hooks nativos do Fastify:
 * - onRequest: registra startTime e requestId
 * - onResponse: captura dados pós-resposta e envia para use case
 *
 * DIFERENÇA DO EXPRESS:
 * - Express usa res.on('finish') — evento Node.js nativo
 * - Fastify usa fastify.addHook('onResponse') — sistema próprio de hooks
 *
 * @module FastifyMiddleware
 */

"use strict";

const { randomUUID } = require("node:crypto");
const { extract } = require("../extractors/RequestDataExtractor");

/**
 * Plugin Fastify de auditoria.
 * Compatível com Fastify v4+ (async plugin com fastify-plugin para encapsulamento).
 *
 * @param {import('fastify').FastifyInstance} fastify
 * @param {Object} options
 * @param {import('../../application/useCases/SaveAuditLogUseCase').SaveAuditLogUseCase} options.useCase
 * @param {boolean} [options.enabled=true]
 * @param {string[]} [options.excludePaths=[]]
 * @returns {Promise<void>}
 *
 * @example
 * await fastify.register(auditPlugin, {
 *   useCase: saveAuditLogUseCase,
 *   excludePaths: ['/health']
 * });
 */
async function auditPlugin(fastify, options) {
  const { useCase, enabled = true, excludePaths = [] } = options;

  if (!enabled) return;

  // Hook: executado no início de cada requisição
  fastify.addHook("onRequest", async (request) => {
    if (excludePaths.includes(request.url)) return;

    request._startTime = Date.now();
    request._auditRequestId = request.headers["x-request-id"] ?? randomUUID();
  });

  // Hook: executado após a resposta ser enviada
  fastify.addHook("onResponse", async (request, reply) => {
    if (excludePaths.includes(request.url)) return;
    if (!request._startTime) return;

    // Adapta o objeto Fastify para o extrator (interface compatível com Express)
    const reqAdapter = {
      method: request.method,
      originalUrl: request.url,
      headers: request.headers,
      body: request.body,
      socket: { remoteAddress: request.socket?.remoteAddress },
      _auditRequestId: request._auditRequestId,
      user: request.user,
      locals: {},
    };

    const resAdapter = {
      statusCode: reply.statusCode,
    };

    const rawData = extract(reqAdapter, resAdapter, request._startTime);

    // Fire-and-forget
    useCase.execute(rawData).catch((err) => {
      process.stderr.write(
        `[audit-logger] Fastify hook error: ${err.message}\n`,
      );
    });
  });
}

module.exports = { auditPlugin };
```

---

# 10. Checklist por Versão

---

## MVP (v1.0) — Checklist

**Pré-requisitos de conhecimento:**

- [x] Event Loop do Node.js
- [x] `async/await` e Promises
- [x] `pg` (node-postgres) — Pool, queries parametrizadas
- [x] Clean Architecture — camadas e responsabilidades
- [x] Fire-and-forget pattern
- [x] JSDoc — `@param`, `@returns`, `@typedef`, `@class`

**Entregáveis:**

- [x] `InvalidAuditLogError.js`
- [x] `SeverityClassifier.js` + testes
- [x] `IpExtractor.js` + testes
- [x] `AnonymousIdGenerator.js` + testes
- [x] `AuditLog.js` (entidade com todas as validações) + testes
- [ ] `IAuditLogRepository.js` (interface)
- [ ] `PostgreSQLConnection.js` (singleton + pool)
- [ ] `MigrationRunner.js` (auto-migration)
- [ ] `AuditLogRepository.js` (save direto)
- [ ] `SaveAuditLogUseCase.js`
- [ ] `RequestDataExtractor.js`
- [ ] `ExpressMiddleware.js`
- [ ] `index.js` (facade com initialize, expressMiddleware, shutdown, getStatus)
- [ ] `package.json` monorepo configurado
- [ ] Testes: 100% das entidades e services de domínio

---

## v1.1 — Checklist (Buffer + Batch)

**Pré-requisitos adicionais:**

- [ ] `EventEmitter` — `.on()`, `.emit()`, `.once()`
- [ ] `setInterval` + `clearInterval` + `.unref()`
- [ ] Batch INSERT com `pg` (placeholders dinâmicos)
- [ ] Observer Pattern

**Entregáveis:**

- [ ] `AuditBuffer.js` (FIFO, flush por volume e tempo, overflow) + testes
- [ ] `BatchWorker.js` (retry único, ativação do fallback) + testes
- [ ] `AuditLogRepository.saveBatch()` (batch INSERT)
- [ ] Atualizar `SaveAuditLogUseCase.js` para usar buffer
- [ ] Testes de integração: buffer → worker → (mock) repository

---

## v1.2 — Checklist (Fallback + Resiliência)

**Pré-requisitos adicionais:**

- [ ] JSON Lines / NDJSON formato
- [ ] `fs/promises` — `appendFile`, `stat`, `rename`, `mkdir`
- [ ] Rotação de arquivos por tamanho e data
- [ ] Comportamento quando banco está indisponível

**Entregáveis:**

- [ ] `FallbackRepository.js` (JSONL, rotação, stderr) + testes
- [ ] Atualizar `index.js` — fallback na inicialização
- [ ] Atualizar `BatchWorker.js` — ativa fallback permanente após 2ª falha
- [ ] Testes: simular banco caído → logs no arquivo

---

## v1.3 — Checklist (Sanitização + Segurança + Partições)

**Pré-requisitos adicionais:**

- [ ] `structuredClone()` vs shallow clone
- [ ] `Buffer.byteLength()` para contagem em bytes (UTF-8)
- [ ] PostgreSQL particionamento — conceito e SQL
- [ ] Whitelist de headers HTTP

**Entregáveis:**

- [ ] `DataSanitizer.js` (recursivo, case-insensitive, structuredClone) + testes
- [ ] `PayloadTruncator.js` (URL 2KB, body 64KB, headers 16KB) + testes
- [ ] `FieldLimitConstants.js`
- [ ] `PartitionManager.js` (create today+tomorrow, drop old) + testes
- [ ] Atualizar migration — tabela com `PARTITION BY RANGE (timestamp)`
- [ ] `FastifyMiddleware.js` + testes
- [ ] Integrar sanitização no `SaveAuditLogUseCase`
- [ ] Testes: campos sensíveis mascarados, payloads truncados

---

## v2.0 — Checklist (Agregação + Anomalias)

**Pré-requisitos adicionais:**

- [ ] SQL avançado: `COUNT(*) FILTER`, `GROUP BY`, `DATE_TRUNC`
- [ ] `ON CONFLICT DO UPDATE` (upsert idempotente)
- [ ] Scheduler com `setTimeout` recursivo
- [ ] `Promise.all` para execução paralela

**Entregáveis:**

- [ ] Migration: tabelas `daily_summary` e `monthly_summary`
- [ ] `DailySummaryJob.js` (00:00 UTC) + testes
- [ ] `MonthlySummaryJob.js` (01:00 UTC, 1º do mês) + testes
- [ ] `AnomalyDetector.js` (brute force, rate abuse, error spike) + testes
- [ ] Integrar jobs no `index.js` (schedule no initialize)
- [ ] Testes: anomalias detectadas corretamente

---

## v3.0 — Checklist (Full Production)

**Pré-requisitos adicionais:**

- [ ] `Promise.race()` para timeouts
- [ ] `process.on('SIGTERM')` e `process.on('SIGINT')`
- [ ] Fastify hooks (`addHook`)
- [ ] Winston logger estruturado
- [ ] Vitest coverage configuration

**Entregáveis:**

- [ ] Graceful shutdown completo (5 passos, 15s max) + testes
- [ ] `RetentionManager.js` (agendado diariamente) + testes
- [ ] `WinstonLogger.js` + integração em todos os módulos
- [ ] `Audit.getStatus()` completo (DB, fallback, buffer size, jobs status)
- [ ] `vitest.config.js` com coverage >= 85%
- [ ] 150+ testes passando
- [ ] Benchmark: 1000+ req/s sem degradação
- [ ] README com exemplos de uso
- [ ] CHANGELOG atualizado
- [ ] Tag git `v3.0.0` (equivalente à spec-v4)

---

## Checklist de Lançamento Final

- [ ] `npm run test` — todos os testes passando
- [ ] `npm run test:coverage` — 85%+ de cobertura
- [ ] `npm run lint` — sem warnings
- [ ] Nenhuma vulnerabilidade em `npm audit`
- [ ] Load test: 1000+ req/s por 60 segundos
- [ ] Testar fallback: parar o banco e verificar arquivo JSONL
- [ ] Testar sanitização: senha nunca aparece no banco
- [ ] Testar particionamento: partições criadas e dropadas
- [ ] README com quickstart de 3 linhas
- [ ] `.env.example` documentado

---

> 💡 **Dica final de sênior:** Não tente implementar tudo de uma vez. Cada versão deve ser um PR separado, revisado, testado e integrado antes da próxima começar. O MVP funcionando e testado vale mais do que a v3.0 incompleta. **Faça commits pequenos, escreva testes primeiro, e documente enquanto implementa — não depois.**
