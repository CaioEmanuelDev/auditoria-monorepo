# Especificação Técnica v2 — Audit Logger Package

## 1. Visão Geral

Este pacote é um **middleware de auditoria plug-and-play** desenvolvido em **Node.js (v20+)** utilizando **JavaScript puro com JSDoc**.

Seu objetivo principal é **registrar automaticamente o rastro de auditoria (Audit Trail)** de todas as interações HTTP de uma aplicação, capturando metadados críticos e persistindo de forma **assíncrona** (fire-and-forget) em um banco de dados relacional.

### 1.1 Características Principais

- ✅ **Captura automática** de métodos, URLs, IPs, status codes e bodies
- ✅ **Sanitização centralizada** de dados sensíveis (password, token, secret, apiKey)
- ✅ **Auto-migração** da tabela `audit_logs` se não existir
- ✅ **Fallback resiliente** para arquivo JSON Lines se banco falhar
- ✅ **Classificação automática** de severidade (INFO, WARN, ERROR) por status HTTP
- ✅ **Support multidrive SQL** (PostgreSQL, MySQL, etc)
- ✅ **Não bloqueia requisição** mesmo se auditoria falhar
- ✅ **Singleton** para logger e conexão com banco (uma única instância)

---

## 2. Arquitetura

### 2.1 Camadas (Clean Architecture)

```
┌─────────────────────────────────────────────────────────┐
│ Interface Adapters (Express, Fastify)                   │
│ └─ Middlewares (ExpressAuditMiddleware, etc)            │
│    └─ RequestDataExtractor (IP, Headers, Body)          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Application Layer                                        │
│ └─ SaveAuditLogUseCase                                  │
│    ├─ Valida dados (AuditLog Entity)                    │
│    └─ Orquestra persistência (Repositório)              │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Infrastructure Layer                                     │
│ ├─ AuditLogRepository (persistência)                    │
│ │  ├─ Tenta banco de dados                             │
│ │  └─ Fallback: FallbackAuditLogRepository              │
│ ├─ DatabaseConnection (Singleton)                       │
│ │  └─ Winston Logger (Singleton)                        │
│ └─ DataSanitizer (mascaramento)                         │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Domain Layer                                             │
│ ├─ AuditLog (Entity)                                    │
│ ├─ Validações (métodos HTTP, status codes)              │
│ ├─ IpExtractor (extração de IP)                         │
│ └─ SeverityClassifier (INFO/WARN/ERROR)                 │
└─────────────────────────────────────────────────────────┘
```

### 2.2 Estrutura de Diretórios

```
packages/audit-logger/

src/
├── domain/
│   ├── entities/
│   │   └── AuditLog.js           # Entity AuditLog (validações)
│   ├── exceptions/
│   │   └── InvalidAuditLogError.js
│   └── services/
│       ├── IpExtractor.js         # Extração de IP
│       └── SeverityClassifier.js  # Classificação de severidade
│
├── application/
│   ├── ports/
│   │   ├── IAuditLogRepository.js  # Interface do repositório
│   │   └── ILogger.js               # Interface do logger
│   └── useCases/
│       └── SaveAuditLogUseCase.js   # Orquestração
│
├── adapters/
│   ├── http/
│   │   └── RequestDataExtractor.js  # Extração de dados HTTP
│   └── middlewares/
│       ├── express.js               # Express middleware
│       └── fastify.js               # Fastify middleware
│
├── infrastructure/
│   ├── database/
│   │   ├── DatabaseConnection.js    # Singleton - Conexão BD
│   │   ├── AuditLogRepository.js    # Implementação repositório
│   │   └── FallbackAuditLogRepository.js  # Fallback para arquivo
│   └── logger/
│       └── Winston.js               # Configuração Winston
│
├── utils/
│   ├── DataSanitizer.js             # Mascaramento de dados
│   └── constants.js                 # Constantes globais
│
└── index.js                         # Facade pública (Audit.initialize, etc)
```

---

## 3. Contratos e Interfaces

### 3.1 Entity: AuditLog

```javascript
/**
 * @typedef {Object} AuditLog
 * @property {string} ip              - IP do cliente (UNKNOWN se não detectado)
 * @property {string} [userId]        - ID do usuário (opcional)
 * @property {string} url             - URL da requisição (obrigatório)
 * @property {string} method          - Método HTTP: GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS
 * @property {number} statusCode      - Status HTTP (100-599)
 * @property {string} severity        - INFO | WARN | ERROR (derivado de statusCode)
 * @property {Date} timestamp         - Data/hora da requisição (auto-gerado se não fornecido)
 * @property {object|string|null} [body]  - Body da requisição (opcional, sanitizado)
 * @property {object} [headers]       - Headers capturados (opcional, whitelist apenas)
 */
```

#### Validações de AuditLog

- **ip**: string não-vazia ou UNKNOWN
- **userId**: string qualquer ou undefined
- **url**: string não-vazia e não-null
- **method**: um de GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS (case-sensitive)
- **statusCode**: inteiro entre 100-599 (inclusive)
- **severity**: derivado automaticamente de statusCode
- **timestamp**: Date ou auto-gerado=Date.now()
- **body**: qualquer tipo ou undefined

#### Regra de Severidade

| Status Code | Severity |
|-------------|----------|
| 100–399    | INFO     |
| 400–499    | WARN     |
| 500–599    | ERROR    |

#### Anonimização de IP

- Se IP for `null`, `undefined`, vazio ou whitespace → usar `"UNKNOWN"`
- IPv6 com prefixo IPv4 (`::ffff:192.168.1.1`) → remover prefixo
- IPv4 e IPv6 válidos → aceitar como-está

---

### 3.2 Interface: IAuditLogRepository

```javascript
/**
 * @interface IAuditLogRepository
 */
interface IAuditLogRepository {
  /**
   * Salva um audit log no banco (com auto-create de tabela)
   * 
   * @param {AuditLog} auditLog - Log validado do domínio
   * @returns {Promise<{id: number}>} ID do log inserido
   * @throws {Error} Se criação de tabela ou insert falhar
   */
  save(auditLog);

  /**
   * Recupera log por ID
   * @param {number} id
   * @returns {Promise<AuditLog|null>}
   */
  findById(id);

  /**
   * Recupera logs de um usuário
   * @param {string} userId
   * @returns {Promise<AuditLog[]>}
   */
  findByUserId(userId);

  /**
   * Recupera logs com filtro por data
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Promise<AuditLog[]>}
   */
  findByDateRange(startDate, endDate);
}
```

---

### 3.3 Schema da Tabela `audit_logs`

```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,                    -- IPv4 (15) + IPv6 (39)
  user_id VARCHAR(255),                       -- NULL se anônimo
  url VARCHAR(2048) NOT NULL,                 -- Até 2KB
  method VARCHAR(10) NOT NULL,                -- GET, POST, etc
  status_code INTEGER NOT NULL,               -- 100-599
  severity VARCHAR(10) NOT NULL,              -- INFO, WARN, ERROR
  body TEXT,                                  -- JSON ou string, até 64KB
  headers JSONB,                              -- Headers capturados (PostgreSQL JSONB)
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para consultas comuns
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX idx_audit_logs_status_code ON audit_logs(status_code);
```

**Variações por driver:**

**MySQL:**
```sql
CREATE TABLE IF NOT EXISTS audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  user_id VARCHAR(255),
  url VARCHAR(2048) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INT NOT NULL,
  severity VARCHAR(10) NOT NULL,
  body LONGTEXT,
  headers JSON,
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_timestamp (timestamp DESC),
  INDEX idx_severity (severity),
  INDEX idx_status_code (status_code)
);
```

---

## 4. Fluxo de Execução

### 4.1 Inicialização (`await Audit.initialize()`)

```
1. Carrega .env da raiz do projeto
   ├─ DATABASE_URL (ou DATABASE_HOST, DATABASE_PORT, etc)
   ├─ DATABASE_NAME
   ├─ DATABASE_USER
   └─ DATABASE_PASSWORD

2. Cria Singleton DatabaseConnection
   ├─ Tenta conectar ao banco
   ├─ Se OK: continua
   └─ Se ERRO: ativa FALLBACK_MODE e emite aviso

3. Cria Singleton Winston Logger
   ├─ Console (nível: info, warn, error)
   └─ File: logs/audit-fallback.json (para fallback)

4. Se banco disponível: cria tabela audit_logs se não existir
   ├─ Executa SQL CREATE TABLE IF NOT EXISTS
   └─ Se ERRO: ativa FALLBACK_MODE

5. Instancia Repositories e Use Cases
   ├─ AuditLogRepository (ou FallbackAuditLogRepository se error)
   └─ SaveAuditLogUseCase

6. Retorna Facade (Audit object) pronto para usar
```

### 4.2 Fluxo por Requisição HTTP

```
┌─ Express Middleware ─────────────────────────────┐
│                                                  │
│  1. Captura início da requisição                │
│     ├─ Inicia cronômetro                        │
│     └─ Inicializa contexto                      │
│                                                  │
│  2. Chama next() (continua pipeline Express)    │
│                                                  │
│  3. Aguarda fim da resposta (event: 'finish')   │
│     └─ Cronômetro para                          │
│                                                  │
│  4. Extrai dados HTTP (RequestDataExtractor):   │
│     ├─ method (GET|POST|...)                    │
│     ├─ url (/api/users)                         │
│     ├─ statusCode (200|404|500)                 │
│     ├─ headers (whitelist)                      │
│     ├─ body (se POST/PUT/PATCH)                 │
│     ├─ ip (socket → x-forwarded-for → UNKNOWN) │
│     └─ userId (header X-User-ID ou context)    │
│                                                  │
│  5. Sanitiza dados (DataSanitizer):             │
│     └─ Mascara password, token, secret, apiKey │
│        (recursivamente, profundidade ilimitada)│
│                                                  │
│  6. Chama use case de forma assíncrona:         │
│     │                                            │
│     ├──→ Promise.catch() para logar erro        │
│     │     (não aguarda finalização)             │
│     │                                            │
│     └──→ SaveAuditLogUseCase.execute(data)     │
│          └─ Valida AuditLog entity              │
│          └─ Chama AuditLogRepository.save()     │
│             ├─ Se OK: insere no banco           │
│             └─ Se ERRO: chama fallback          │
│                                                  │
│  7. Retorna ao cliente (Fire and Forget)        │
│     └─ Requisição não aguarda auditoria         │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## 5. Sanitização Centralizada

### 5.1 Campos Sensíveis Padrão

Por padrão, os seguintes campos são **mascarados com `********`**:

```javascript
['password', 'pwd', 'passwd',
 'token', 'access_token', 'refresh_token', 'bearer',
 'secret', 'api_secret',
 'apikey', 'api_key', 'api-key',
 'creditcard', 'credit_card', 'cc',
 'cvv', 'cvc',
 'ssn', 'social_security_number',
 'pin', 'otp',
 'webhook_secret', 'client_secret',
 'private_key']
```

**Case-insensitive**: `PASSWORD`, `Password`, `password` → todos mascarados.

### 5.2 Sanitização Recursiva

- Percorre objeto/array em **profundidade ilimitada**
- Mascara campos sensíveis em qualquer nível de aninhamento
- Preserva estrutura original (não remove a chave, apenas valor)
- Nunca modifica objeto original (cria **deep clone**)

```javascript
// Antes
{
  user: {
    name: 'John',
    password: 'secret123',
    credentials: {
      apiKey: 'sk_live_abc',
      verified: true
    }
  }
}

// Depois (após sanitizar)
{
  user: {
    name: 'John',
    password: '********',
    credentials: {
      apiKey: '********',
      verified: true
    }
  }
}
```

### 5.3 Campos Customizados

Permite definir lista customizada de campos:

```javascript
const sanitizer = new DataSanitizer(['ssn', 'bank_account']);
const clean = sanitizer.sanitize(data);
```

---

## 6. Extração de IP

### 6.1 Ordem de Prioridade

1. **x-forwarded-for** (toma primeiro valor antes de `,`)
2. **x-real-ip**
3. **cf-connecting-ip** (Cloudflare)
4. **socket.remoteAddress**
5. **socket.connection.remoteAddress**
6. **Fallback**: `"UNKNOWN"`

### 6.2 Tratamentos Especiais

- **IPv6-mapped IPv4** (`::ffff:192.168.1.1`) → remove prefixo
- **Whitespace** → remove e-trata como empty
- **Localhost** (`127.0.0.1`, `::1`) → aceita normal

---

## 7. Captura de Headers

### 7.1 Headers Capturados (Whitelist)

Apenas os seguintes headers são capturados:

```javascript
[
  'user-agent',
  'accept',
  'accept-language',
  'accept-encoding',
  'content-type',
  'content-length',
  'host',
  'origin',
  'referer',
  'custom-header' // Aplicação pode customize
]
```

### 7.2 Headers Ignorados (Blacklist)

Nunca capturados:

```javascript
[
  'authorization',    // Nunca capturar tokens
  'cookie',          // Cookies sensíveis
  'set-cookie',
  'x-api-key',       // API keys
  'x-auth-token',
  'x-session-id'
]
```

---

## 8. Captura de Body

### 8.1 Regras

- **GET, HEAD, DELETE**: body ignorado (mesmo que presente)
- **POST, PUT, PATCH**: body capturado se:
  - Content-Type é `application/json` ou `application/x-www-form-urlencoded`
  - Tamanho ≤ 64KB
- **Binary content** (image, zip, pdf): ignorado

### 8.2 Limites

| Campo | Limite | Comportamento |
|-------|--------|---------------|
| url | 2KB | Trunca se maior |
| body | 64KB | Ignora se maior |
| body total + headers | 256KB | Ignora log se muito grande |

---

## 9. Extração de User ID

### 9.1 Estratégia (em ordem de precedência)

1. **Header `X-User-ID`** (customizável)
   ```
   X-User-ID: user-123
   ```

2. **Contexto Express** (req.locals ou req.user)
   ```javascript
   req.locals.userId = 'user-456';
   ```

3. **JWT decodificado** (extrair `sub` ou `userId`)
   ```javascript
   // No middleware de auth:
   req.user = jwt.decode(token);
   // Extrair req.user.sub ou req.user.id
   ```

4. **Undefined**: se nenhum encontrado

### 9.2 Configuração

```javascript
const audit = new Audit({
  userIdExtractor: (req) => {
    return req.headers['x-user-id'] || req.user?.id || undefined;
  }
});
```

---

## 10. Tratamento de Falhas

### 10.1 Regra Absoluta: Fail-Safe

Uma falha na auditoria **NUNCA deve interromper o fluxo da aplicação**.

```
┌─ Erro no Banco ─────────────┐
│                             │
├─ Erro em Query SQL         │
├─ Connection Timeout         │
├─ Connection Refused         │
├─ Tabela não pode criar      │
│                             │
└──→ Ativa FALLBACK MODE ────→ Salva em arquivo
                              └─ logs/audit-fallback.json
```

### 10.2 Fallback para Arquivo

Quando banco falha:

1. Log é serializado como **JSON strings** (uma por linha)
2. Salvo em `logs/audit-fallback.json`
3. Usa Winston para consistência com resto do app
4. Se arquivo também falhar: **erro é logado em stderr, nunca bloqueia**

### 10.3 Sequência Fire-and-Forget

```javascript
// No middleware
middleware(req, res, next) {
  // ...extrai dados...

  // Fire and forget: não aguarda
  useCase.execute(data)
    .catch(error => logger.error('Audit failed:', error));

  // Requisição continua
  next();
}
```

**Nunca fazer:**
```javascript
await useCase.execute(data); // ❌ Bloqueia requisição
```

### 10.4 Modo Fallback Permanente

Após ativar fallback, permanece até **reiniciar a aplicação**:

```javascript
// Não tenta reconectar automaticamente
// Apenas registra erro, continua em fallback

// Para voltar: Application.restart()
```

### 10.5 Erro em Fallback Storage

Se arquivo fallback falhar ao escrever:

1. Log erro em **stderr** (não arquivo)
2. **Nunca bloqueia** requisição
3. Continua tentando banco na próxima requisição

```javascript
// Pseudo-código
useCase.execute(data)
  .catch(dbError => {
    // Tenta arquivo
    fallbackRepository.save(data)
      .catch(fileError => {
        // Último recurso: stderr
        console.error('Critical:', dbError, fileError);
        // NÃO lança erro (fail-safe)
      });
  });
```

---

## 11. Resiliência na Inicialização

```javascript
// Se banco indisponível na inicialização:
const result = await Audit.initialize();

if (result.status === 'warning') {
  // Banco inacessível, operando em fallback
  // Log example: "Banco indisponível. Salvando em arquivo."
}

// Application continua funcionando normalmente
```

---

## 12. Singleton Pattern

### 12.1 DatabaseConnection

- **Uma única instância** por processo Node.js
- Criada em `Audit.initialize()`
- Reutilizada por todas as requisições
- Pool de conexões gerenciado pela biblioteca SQL

### 12.2 Winston Logger

- **Uma única instância** por DatabaseConnection
- Configurado durante inicialização
- Outputs:
  - **Console**: níveis info, warn, error
  - **File** (`logs/audit-fallback.json`): fallback storage

### 12.3 Repositories

- **Uma instância** de `AuditLogRepository` ou `FallbackAuditLogRepository`
- Escolhida durante `initialize()`
- Reutilizada para todas requisições

---

## 13. Use Case: SaveAuditLogUseCase

```javascript
class SaveAuditLogUseCase {
  constructor(repository) {
    this.repository = repository;
  }

  /**
   * @param {object} data - Dados brutos da requisição HTTP
   * @param {string} data.ip
   * @param {string} [data.userId]
   * @param {string} data.url
   * @param {string} data.method
   * @param {number} data.statusCode
   * @param {any} [data.body]
   * @param {object} [data.headers]
   * @returns {Promise<{id: number}>}
   */
  async execute(data) {
    // 1. Valida dados (lança erro se inválido)
    const auditLog = new AuditLog(data);

    // 2. Sanitiza (modifica cópia, não original)
    const sanitized = DataSanitizer.sanitize(auditLog);

    // 3. Delega persistência
    return await this.repository.save(sanitized);
  }
}
```

---

## 14. Testes

### 14.1 Cobertura Mínima: 80%

Áreas críticas:
- Domain (entities, validações)
- Sanitização (todos campos sensíveis)
- Use case (validação + persistência + erro)
- Middleware (captura + fire-and-forget)
- Fallback (comportamento resiliente)

### 14.2 Ferramentas

- **Jest** ou **Vitest**
- Mocks para banco de dados
- Não usar banco real em testes unitários

### 14.3 Estrutura de Testes

```
tests/
├── domain/
│   ├── entities/
│   │   └── AuditLog.test.js
│   └── services/
│       ├── IpExtractor.test.js
│       └── SeverityClassifier.test.js
├── application/
│   └── useCases/
│       └── SaveAuditLogUseCase.test.js
├── adapters/
│   ├── middlewares/
│   │   ├── ExpressAuditMiddleware.test.js
│   │   └── FastifyAuditMiddleware.test.js
│   └── http/
│       └── RequestDataExtractor.test.js
├── infrastructure/
│   ├── database/
│   │   ├── AuditLogRepository.test.js
│   │   └── DatabaseConnection.test.js
│   └── logger/
│       └── Winston.test.js
├── utils/
│   └── DataSanitizer.test.js
└── integration/
    ├── end-to-end.test.js
    └── fallback-behavior.test.js
```

---

## 15. Configuração

### 15.1 Arquivo `.env` (Raiz do Projeto)

```
# Banco de dados
DATABASE_URL=postgresql://user:pass@localhost:5432/audit_db
# OU (alternativa)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=audit_db
DATABASE_USER=audit_user
DATABASE_PASSWORD=secret123

# Logger de fallback
LOG_DIR=logs
LOG_LEVEL=info

# Auditoria
AUDIT_BODY_MAX_SIZE=65536       # 64KB
AUDIT_URL_MAX_SIZE=2048         # 2KB
AUDIT_ENABLED=true

# Timeout do banco
DATABASE_CONNECTION_TIMEOUT=5000 # 5s
DATABASE_QUERY_TIMEOUT=10000     # 10s
```

### 15.2 Uso na Aplicação

```javascript
// app.js
const express = require('express');
const { Audit } = require('@mymonorepo/audit-logger');

const app = express();

// 1. Inicializar Audit (antes de subir servidor)
await Audit.initialize();

// 2. Usar middleware
app.use(Audit.expressMiddleware());

// 3. Suas rotas
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

// 4. Subir servidor
app.listen(3000, () => console.log('Running on 3000'));
```

---

## 16. API Pública

### 16.1 Facade Principal

```javascript
class Audit {
  /**
   * Inicializa pacote (deve ser chamado antes de usar)
   * @returns {Promise<{status: 'ok'|'warning'}>}
   */
  static async initialize() {}

  /**
   * Retorna middleware para Express
   * @returns {Function} Middleware Express
   */
  static expressMiddleware() {}

  /**
   * Retorna middleware para Fastify
   * @returns {Function} Middleware Fastify
   */
  static fastifyMiddleware() {}

  /**
   * Retorna instância do repositório
   * @returns {IAuditLogRepository}
   */
  static getRepository() {}

  /**
   * Verifica se está em modo fallback
   * @returns {boolean}
   */
  static isInFallbackMode() {}

  /**
   * Registra log manualmente (para eventos não-HTTP)
   * @param {AuditLog} data
   * @returns {Promise<{id: number}>}
   */
  static async logAudit(data) {}

  /**
   * Fecha conexão e finalizará pendências
   * @returns {Promise<void>}
   */
  static async shutdown() {}
}
```

---

## 17. Restrições e Regras

- ✅ Requer **Node.js >= 20**
- ✅ Usar **JavaScript puro com JSDoc** (sem TypeScript)
- ✅ Proibido `console.log` para mensagens internas → usar **Winston**
- ✅ Configurações lidas **dinamicamente de `.env`** (raiz do projeto)
- ✅ Usar **yarn** como package manager
- ✅ **TypeScript strict: true** no tsconfig (se futuramente usar TS)

---

## 18. Critérios de Aceitação

O pacote será considerado funcional se:

✅ Tabela `audit_logs` for criada automaticamente ao initializar

✅ Cada requisição HTTP gerar entrada no banco (ou arquivo em fallback)

✅ Queda do banco **NÃO lança erro 500 na aplicação**

✅ Logs são redirecionados para `logs/audit-fallback.json` se banco falhar

✅ Dados sensíveis **nunca apareçam em texto claro** no banco/arquivo

✅ Middleware é **fire-and-forget** (não bloqueia requisição)

✅ Suporta **múltiplos drivers SQL** (PostgreSQL, MySQL, etc)

✅ Cobertura de testes: **mínimo 80%**

✅ **Sanitização recursiva** em profundidade ilimitada

✅ **Timestamp automático** de cada requisição

---

## 19. Exemplo Completo de Log Persistido

```json
{
  "id": 1,
  "ip": "203.0.113.42",
  "userId": "user-abc123",
  "url": "/api/auth/login",
  "method": "POST",
  "statusCode": 200,
  "severity": "INFO",
  "body": {
    "email": "john@example.com",
    "password": "********"
  },
  "headers": {
    "user-agent": "Mozilla/5.0...",
    "accept": "application/json",
    "host": "api.example.com"
  },
  "timestamp": "2026-03-16T10:15:30.123Z",
  "created_at": "2026-03-16T10:15:30.123Z"
}
```

---

## 20. Versionamento de Schema

Se futuro modificar schema:

1. Criar migration em `src/infrastructure/database/migrations/`
2. Versionar em `audit_logs.version` ou table separada
3. Verificar versão no startup
4. Aplicar migrations se necessário

---

## Resumo de Mudanças da V1 para V2

| Aspecto | V1 | V2 |
|--------|----|----|
| Schema | Vago | Definido com SQL completo |
| User ID | Não especificado | Headers + contexto + JWT |
| Headers | Mencionados | Whitelist/Blacklist explícita |
| Fallback | Genérico | JSON Lines em `logs/audit-fallback.json` |
| Sanitização | Básica | Recursiva + profundidade ilimitada |
| Campos Sensíveis | Exemplo | Lista completa + customizável |
| Repositório | Abstrato | Interface IAuditLogRepository definida |
| Error Handling | Vago | Fire-and-forget com .catch() explícito |
| Limites | Nenhum | Body 64KB, URL 2KB, total 256KB |
| Timestamp | Implícito | Automático servidor, sempre UTC |
| Content-Type | Não menciona | Ignora application/octet-stream, etc |
| Testes | Genéricos | 18 ambiguidades resolvidas |

