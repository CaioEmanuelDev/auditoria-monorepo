# 📘 Especificação Técnica v4 — Audit Logger Package

**Versão**: 4.0 (Production-Ready)  
**Data**: 16 de março de 2026  
**Status**: ✅ Validado por TDD — Pronto para Implementação  
**Base**: spec-v3 + Refinamento via TDD + 19 ambiguidades resolvidas  

---

## 📑 ÍNDICE

1. Visão Geral
2. Arquitetura & Camadas
3. Contratos & Interfaces
4. Schema PostgreSQL + Particionamento
5. Fluxos Obrigatórios
6. Configurações & Ambiente
7. Tratamento de Falhas
8. Resiliência & Escalabilidade
9. Performance & Limites
10. Segurança
11. Critérios de Aceitação
12. Edge Cases Cobertos

---

# 1. VISÃO GERAL

## 1.1 Objetivo

Pacote **middleware de auditoria plug-and-play** para Node.js v20+ que:
- ✅ Captura automaticamente **rastro de auditoria HTTP** (Audit Trail)
- ✅ Persiste em **PostgreSQL particionado** de alta performance
- ✅ Resiliente com **fallback para arquivo JSON Lines**
- ✅ **Fire-and-forget** — nunca bloqueia requisições
- ✅ **Observabilidade** — detecção de anomalias automática
- ✅ **Eficiente** — batch insert, índices otimizados, compression ready

## 1.2 Características Principais

- ✅ Captura automática: método, URL, IP, status code, body, headers
- ✅ Sanitização centralizada: mascaramento recursivo de dados sensíveis
- ✅ Auto-migração: cria tabela particionada se não existir
- ✅ Fallback resiliente: JSON Lines se banco falhar
- ✅ Severidade automática: INFO/WARN/ERROR por status HTTP
- ✅ PostgreSQL-first: otimizações específicas (JSONB, partitioning)
- ✅ Não bloqueia: mesmo se auditoria falha, requisição continua
- ✅ Singleton: uma única instância de logger e conexão
- ✅ UUID v4 correlation IDs: rastreabilidade distribuída
- ✅ Headers normalizados: whitelist + blacklist explícita
- ✅ Timestamps UTC ISO 8601: auditoria distribuída sem ambiguidades
- ✅ Batch processing: 500+ logs/flushInterval para high throughput
- ✅ Agregação automática: daily + monthly summaries com anomalias
- ✅ Retenção automática: TTL via DROP PARTITION (fast, safe)

## 1.3 Non-Goals (Fora do Escopo)

- ❌ Multi-processo horizontal scaling (use Redis queue em v5+)
- ❌ Real-time alerting (integre com monitoring tool)
- ❌ Advanced IA/ML anomaly detection (use external service)
- ❌ TypeScript (JavaScript puro com JSDoc)

---

# 2. ARQUITETURA & CAMADAS

## 2.1 Clean Architecture Layers

```
┌──────────────────────────────────────────────────────────────┐
│ ADAPTER LAYER (Express/Fastify)                              │
│ └─ ExpressAuditMiddleware / FastifyAuditMiddleware           │
│    └─ Middleware intercepts request/response                 │
│    └─ Calls next() immediately (non-blocking)               │
│    └─ Re.on('finish') captura response                       │
│    └─ Extrai duração, status, headers, body                 │
│    └─ Envia para SaveAuditLogUseCase (fire-and-forget)      │
└──────────────────────────────────────────────────────────────┘
                           ↓↓↓
┌──────────────────────────────────────────────────────────────┐
│ APPLICATION LAYER                                            │
│ └─ SaveAuditLogUseCase                                       │
│    ├─ Cria entity AuditLog (validação)                      │
│    ├─ Sanitiza dados sensíveis (deep clone)                 │
│    └─ Adiciona ao buffer (não persiste direto)              │
└──────────────────────────────────────────────────────────────┘
                           ↓↓↓
┌──────────────────────────────────────────────────────────────┐
│ BUFFER (In-Memory FIFO)                                      │
│ └─ AuditBuffer                                               │
│    ├─ Aceita logs: .add(log)                                 │
│    ├─ Flushes by volume (max 500) or time (1s)              │
│    ├─ Emite evento: buffer.on('flush', callback)            │
│    └─ Fire-and-forget: nenhum await aqui                    │
└──────────────────────────────────────────────────────────────┘
                           ↓↓↓
┌──────────────────────────────────────────────────────────────┐
│ WORKER LAYER (Async Batch Processor)                        │
│ └─ BatchWorker                                               │
│    ├─ Aguarda flush event from buffer                       │
│    ├─ Takes logs (up to 500)                                │
│    ├─ Retry once if error (100ms backoff)                   │
│    └─ On failure: activate FallbackRepository                │
└──────────────────────────────────────────────────────────────┘
                    ↙                        ↖
        PRIMARY (DB)                  FALLBACK (File)
        
┌──────────────────────────┐     ┌─────────────────────────────┐
│ AuditLogRepository       │     │ FallbackRepository          │
│ (PostgreSQL)             │     │ (JSON Lines File)           │
├──────────────────────────┤     ├─────────────────────────────┤
│ - Batch insert           │     │ - Append JSON Lines         │
│ - Use correct partition  │     │ - logs/audit-fallback.json  │
│ - Leverage indexes       │     │ - Rotates by size/date      │
│ - JSONB for body/headers │     │ - Never blocks              │
│ - Parameterized queries  │     │ - stderr on error           │
└──────────────────────────┘     └─────────────────────────────┘
        └────────────────┬──────────────────────┘
                         ↓
        PostgreSQL Table (Partitioned by date)
        
┌──────────────────────────────────────────────────────────────┐
│ INFRASTRUCTURE LAYER                                         │
├──────────────────────────────────────────────────────────────┤
│ - PostgreSQLConnection (Singleton + pool)                    │
│ - PartitionManager (create today/tomorrow, delete old, TTL)  │
│ - DailySummaryJob (aggregation + anomaly detection)          │
│ - AnomalyDetector (brute force, rate limit, error spike)     │
│ - DataSanitizer (deep recursive masking)                     │
│ - IpExtractor (priority order extraction)                    │
│ - UserIdExtractor (priority order extraction)                │
│ - AnonymousIdGenerator (SHA256 hash)                         │
│ - SeverityClassifier (status → severity)                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ DOMAIN LAYER (Business Logic)                                │
│ - AuditLog Entity (validações, defaults)                     │
│ - Tipos & Value Objects                                      │
│ - Regras de negócio (severidade, sanitização)               │
└──────────────────────────────────────────────────────────────┘
```

## 2.2 Estrutura de Diretórios

```
packages/audit-logger/

src/
├── domain/
│   ├── entities/
│   │   └── AuditLog.js           # Validações, defaults
│   ├── services/
│   │   ├── SeverityClassifier.js  # 2xx→INFO, 4xx→WARN, 5xx→ERROR
│   │   ├── IpExtractor.js         # Priority-based IP extraction
│   │   ├── UserIdExtractor.js     # Priority-based user ID extraction
│   │   └── AnonymousIdGenerator.js # SHA256(ip + userAgent)
│   └── exceptions/
│       └── InvalidAuditLogError.js
│
├── application/
│   ├── useCases/
│   │   └── SaveAuditLogUseCase.js  # Orquestração, adds to buffer
│   ├── buffer/
│   │   └── AuditBuffer.js          # In-memory FIFO + flush events
│   └── ports/
│       └── IAuditLogRepository.js  # Interface (implemented twice)
│
├── adapters/
│   ├── middlewares/
│   │   ├── ExpressMiddleware.js    # Express integration
│   │   └── FastifyMiddleware.js    # Fastify integration
│   ├── extractors/
│   │   └── RequestDataExtractor.js # Extrai dados HTTP
│   └── http/
│       └── ContentTypeChecker.js   # Verifica se deve capturar body
│
├── infrastructure/
│   ├── database/
│   │   ├── PostgreSQLConnection.js # Singleton + pool
│   │   ├── AuditLogRepository.js   # Batch insert, partitions
│   │   ├── PartitionManager.js     # Create/drop partitions
│   │   └── BatchWorker.js          # Async worker (flush buffer)
│   ├── aggregation/
│   │   ├── DailySummaryJob.js      # Calcula + salva daily_summary
│   │   ├── MonthlySummaryJob.js    # Agrega monthly_summary
│   │   ├── AnomalyDetector.js      # Força bruta, rate abuse, errors
│   │   └── RetentionManager.js     # TTL via DROP PARTITION
│   ├── fallback/
│   │   └── FallbackRepository.js   # JSON Lines file storage
│   └── logger/
│       └── WinstonLogger.js        # Logging infrastructure
│
├── utils/
│   ├── DataSanitizer.js            # Deep recursive masking
│   ├── PayloadTruncator.js         # Size limits enforcement
│   ├── FieldLimitConstants.js      # 2KB, 64KB, 16KB, 256KB
│   └── constants.js                # Globals, thresholds
│
└── index.js                        # Facade pública
```

---

# 3. CONTRATOS & INTERFACES

## 3.1 Entity: AuditLog

### Schema Completo

```javascript
/**
 * @typedef {Object} AuditLog
 * 
 * ==== IDENTIFIERS & CORRELATION ====
 * @property {number} id                      - Auto-increment PK
 * @property {string} request_id               - UUID v4 (unique correlation)
 * @property {string} anonymous_id             - SHA256(ip + userAgent)
 * 
 * ==== REQUEST DATA (OBRIGATÓRIO) ====
 * @property {string} ip                       - Cliente IP ou "UNKNOWN" (never null)
 * @property {string} [userId]                 - ID do usuário (optional)
 * @property {string} url                      - Request URL (obrigatório, max 2KB)
 * @property {string} method                   - GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS
 * @property {number} statusCode               - HTTP status (100-599)
 * @property {string} severity                 - INFO|WARN|ERROR (derivado de statusCode)
 * 
 * ==== PAYLOADS (SANITIZADOS) ====
 * @property {object|null} [body]              - Request body (optional, max 64KB)
 * @property {object|null} [headers]           - Whitelist headers (optional, max 16KB)
 * @property {object|null} [response_body]     - Response body (optional, max 64KB)
 * 
 * ==== PERFORMANCE & METADATA ====
 * @property {number} [duration_ms]            - Request latency (milliseconds, >= 0)
 * @property {string} [user_agent]             - User-Agent header from request
 * @property {string} [schema_version]         - DB schema version
 * 
 * ==== TIMESTAMPS (UTC ISO 8601) ====
 * @property {Date|string} timestamp           - HTTP request moment (OBRIGATÓRIO, UTC)
 * @property {Date} created_at                 - DB insertion moment (auto: DEFAULT NOW())
 */
```

### Regra de Severidade

| Status Code Range | Severity |
|-------------------|----------|
| 100-399           | INFO     |
| 400-499           | WARN     |
| 500-599           | ERROR    |

### Validações de AuditLog

```javascript
// OBRIGATÓRIOS:
- ip: string, non-empty, or "UNKNOWN" (never null)
- url: string, non-empty, max 2048 bytes
- method: uppercase string in [GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS]
- statusCode: integer 100-599 (inclusive)
- timestamp: Date or ISO 8601 string (always interpreted as UTC)

// OPCIONAIS:
- userId: string or undefined
- body: object or null or undefined (max 64KB after JSON.stringify)
- headers: object or null or undefined (max 16KB after JSON.stringify)
- response_body: object or null or undefined (max 64KB)
- duration_ms: non-negative integer or undefined
- user_agent: string or undefined

// AUTO-GENERATED:
- request_id: UUID v4 if not provided
- anonymous_id: SHA256(ip + userAgent)
- severity: derived from statusCode
- created_at: DEFAULT CURRENT_TIMESTAMP (from DB)

// REJECTED:
- statusCode < 100 or > 599
- statusCode is float (not integer)
- timestamp > now + 12 hours (future, clock skew)
- timestamp < now - 31 days (very old)
- url length > 2KB
- body length > 64KB (after JSON encode)
- headers length > 16KB (after JSON encode)
- total log > 256KB (entire JSON)
```

---

## 3.2 Schema PostgreSQL (Definitive)

### Tabela Particionada Inicialmente

```sql
-- Versão: v4
-- Tipo: Range partition por timestamp (daily)

CREATE TABLE IF NOT EXISTS audit_logs (
  -- ===== IDENTIFIERS =====
  id BIGSERIAL,
  request_id UUID NOT NULL UNIQUE,
  anonymous_id CHAR(64) NOT NULL,                 -- SHA256 hex
  
  -- ===== REQUEST DATA =====
  ip VARCHAR(45) NOT NULL,                       -- IPv4 (15) + IPv6 (39)
  user_id VARCHAR(255),
  url VARCHAR(2048) NOT NULL,
  method VARCHAR(10) NOT NULL,
  status_code INTEGER NOT NULL,                  -- 100-599
  severity VARCHAR(10) NOT NULL,                 -- INFO, WARN, ERROR
  
  -- ===== PAYLOADS (JSONB) =====
  body JSONB,                                    -- Request body (sanitized)
  headers JSONB,                                 -- Request headers (whitelist)
  response_body JSONB,                           -- Response body (optional)
  
  -- ===== PERFORMANCE & METADATA =====
  duration_ms INTEGER,                           -- milliseconds, >= 0
  user_agent VARCHAR(512),
  schema_version INTEGER NOT NULL DEFAULT 4,
  
  -- ===== TIMESTAMPS (CRITICAL) =====
  timestamp TIMESTAMP NOT NULL,                  -- Request moment (UTC, user-set or auto)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Insertion moment
  
  -- PRIMARY KEY must include partition key (timestamp)
  PRIMARY KEY (id, timestamp)
) PARTITION BY RANGE (timestamp);
```

### Estratégia de Particionamento

```sql
-- Partições diárias, criadas automaticamente para:
-- 1. TODAY (já existente ao iniciar app)
-- 2. TOMORROW (preemptively, para evitar late INSERT)

-- Exemplo para 2026-03-16:
CREATE TABLE IF NOT EXISTS audit_logs_2026_03_16
PARTITION OF audit_logs
FOR VALUES FROM ('2026-03-16 00:00:00') TO ('2026-03-17 00:00:00');

-- Exemplo para 2026-03-17 (preemptive):
CREATE TABLE IF NOT EXISTS audit_logs_2026_03_17
PARTITION OF audit_logs
FOR VALUES FROM ('2026-03-17 00:00:00') TO ('2026-03-18 00:00:00');

-- Retenção: DROP partitions > 90 dias (diário à 02:00 UTC)
DROP TABLE IF EXISTS audit_logs_2025_12_01;  -- Fast O(1) drop
```

### Índices Obrigatórios

```sql
-- Índice principal: queries por timestamp (desc)
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
ON audit_logs (timestamp DESC)
WHERE timestamp > (CURRENT_DATE - INTERVAL '2 days');

-- Índice para queries por IP (brute force detection)
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip
ON audit_logs (ip)
WHERE timestamp > (CURRENT_DATE - INTERVAL '1 day');

-- Índice para queries por status (anomalies)
CREATE INDEX IF NOT EXISTS idx_audit_logs_status
ON audit_logs (status_code)
WHERE timestamp > (CURRENT_DATE - INTERVAL '1 day');

-- Índice para queries por request_id (correlation)
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id
ON audit_logs (request_id);

-- Índice para queries por user_id (user tracking)
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
ON audit_logs (user_id, timestamp DESC)
WHERE user_id IS NOT NULL
AND timestamp > (CURRENT_DATE - INTERVAL '2 days');

-- Índice para performance tracking
CREATE INDEX IF NOT EXISTS idx_audit_logs_duration
ON audit_logs (duration_ms DESC)
WHERE duration_ms IS NOT NULL
AND timestamp > (CURRENT_DATE - INTERVAL '1 day');
```

### Tabelas de Agregação

```sql
-- Daily Summary (1 row por dia)
CREATE TABLE IF NOT EXISTS daily_summary (
  date DATE PRIMARY KEY,
  
  total_requests INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms NUMERIC(10,2),
  max_duration_ms INTEGER,
  min_duration_ms INTEGER,
  
  error_count INTEGER NOT NULL DEFAULT 0,      -- 5xx
  warn_count INTEGER NOT NULL DEFAULT 0,       -- 4xx
  unauthorized_count INTEGER NOT NULL DEFAULT 0, -- 401/403
  rate_limit_hits INTEGER NOT NULL DEFAULT 0,  -- 429
  
  unique_ips INTEGER,
  unique_users INTEGER,
  
  insights JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Monthly Summary (1 row por mês)
CREATE TABLE IF NOT EXISTS monthly_summary (
  month DATE PRIMARY KEY,  -- First day of month: 2026-03-01
  
  total_requests INTEGER NOT NULL DEFAULT 0,
  avg_duration_ms NUMERIC(10,2),
  error_count INTEGER NOT NULL DEFAULT 0,
  
  unique_ips INTEGER,
  unique_users INTEGER,
  
  insights JSONB,
  
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Índices para agregação
CREATE INDEX IF NOT EXISTS idx_daily_summary_date
ON daily_summary (date DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_summary_month
ON monthly_summary (month DESC);
```

---

## 3.3 Buffer Interface

```javascript
/**
 * @interface AuditBuffer
 */
class AuditBuffer {
  /**
   * Adiciona log ao buffer
   * @param {AuditLog} auditLog - Validated entity
   * @throws {Error} se buffer está shutdown ou overflow
   */
  add(auditLog) {}

  /**
   * Retorna tamanho atual do buffer
   * @returns {number}
   */
  getSize() {}

  /**
   * Flush imediato (retorna logs restantes)
   * @returns {AuditLog[]}
   */
  flush() {}

  /**
   * Eventos
   * @event flush - emitido quando buffer ≥ maxBatchSize ou interval expirou
   * @event drain - emitido em shutdown (logs restantes)
   */
  on(eventName, callback) {}

  /**
   * Shutdown gracioso
   * - Para de aceitar novos logs
   * - Emit drain event com logs restantes
   * @returns {Promise<void>}
   */
  shutdown() {}
}
```

---

## 3.4 Repository Interface

```javascript
/**
 * @interface IAuditLogRepository
 */
class IAuditLogRepository {
  /**
   * Batch insert (obrigatório method)
   * @param {AuditLog[]} logs - Up to 500-1000 logs
   * @returns {Promise<{count: number}>}
   * @throws {Error} se insert falhar
   */
  async insertBatch(logs) {}

  /**
   * Encontra log por ID
   * @param {number} id
   * @returns {Promise<AuditLog|null>}
   */
  async findById(id) {}

  /**
   * Encontra logs de um usuário
   * @param {string} userId
   * @returns {Promise<AuditLog[]>}
   */
  async findByUserId(userId) {}

  /**
   * Encontra logs por intervalo de data
   * @param {Date} startDate
   * @param {Date} endDate
   * @returns {Promise<AuditLog[]>}
   */
  async findByDateRange(startDate, endDate) {}

  /**
   * Encontra logs por request_id (correlação)
   * @param {string} request_id UUID
   * @returns {Promise<AuditLog|null>}
   */
  async findByRequestId(request_id) {}

  /**
   * Inicializa tabela + partições
   * @returns {Promise<void>}
   */
  async initTable() {}
}
```

---

# 4. FLUXOS OBRIGATÓRIOS

## 4.1 Inicialização (Obrigatório antes de usar)

```javascript
const Audit = require('@packages/audit-logger');

// STEP 1: Initialize (MUST happen before adding middleware)
const initResult = await Audit.initialize({
  // Optional:
  userIdExtractor: (req) => req.user?.id,     // Custom extraction
  customHeaders: ['x-correlation-id'],         // Add to whitelist
  sensitiveFields: ['ssn', 'bank_account'],    // Override defaults
  
  // Or use env vars + defaults (see section 6)
});

if (initResult.status === 'warning') {
  console.warn(`⚠️  ${initResult.message}`);
  // App continues in FALLBACK_MODE (DB unavailable)
}

// STEP 2: Attach middleware
const app = express();
app.use(Audit.expressMiddleware());

// STEP 3: Routes as normal
app.get('/api/users', (req, res) => {
  res.json({ users: [] });
});

// STEP 4: Graceful shutdown
process.on('SIGTERM', async () => {
  await Audit.shutdown();  // Flushes buffer, closes connections
  process.exit(0);
});
```

## 4.2 Request-Response Cycle (Middleware)

```
┌─────────────────────────────────────── HTTP REQUEST ─────────────────────────────────────┐
│                                                                                            │
│ 1. Express/Fastify Middleware Intercepta:                                                │
│    └─ req._startTime = Date.now()                                                        │
│    └─ req._requestId = header['x-request-id'] || uuidv4()                                │
│                                                                                            │
│ 2. Chama next() IMEDIATAMENTE (non-blocking)                                             │
│    └─ ✅ Requisição continua normalmente                                                 │
│                                                                                            │
│ 3. Handler executa + gera Response                                                       │
│    └─ GET /api/users → 200 OK                                                            │
│                                                                                            │
│ 4. res.on('finish') Dispara (response complete):                                         │
│    │                                                                                       │
│    ├─ ⏱️ duration_ms = Date.now() - req._startTime                                       │
│    ├─ 📍 Extract data via RequestDataExtractor:                                          │
│    │    ├─ ipAddress (x-forwarded-for → x-real-ip → socket → UNKNOWN)                   │
│    │    ├─ userId (X-User-ID → req.user.id → req.locals.userId → undefined)             │
│    │    ├─ method (GET)                                                                  │
│    │    ├─ url (/api/users, truncated to 2KB)                                            │
│    │    ├─ statusCode (200)                                                              │
│    │    ├─ body (if POST/PUT/PATCH + json, max 64KB, else undefined)                    │
│    │    ├─ headers (whitelist + normalize lowercase)                                     │
│    │    ├─ response_body (if captured by middleware hook)                               │
│    │    ├─ user_agent (User-Agent header)                                                │
│    │    └─ request_id (UUID v4)                                                          │
│    │                                                                                       │
│    └─ 🧽 Sanitization (deep clone + mask sensitive):                                     │
│         ├─ password → ********                                                           │
│         ├─ token → ********                                                              │
│         ├─ apiKey → ******** (recursive, all levels)                                     │
│         └─ Original object NOT modified (structuredClone)                                │
│                                                                                            │
│    └─ 🔍 Validate AuditLog Entity:                                                       │
│         ├─ Generate missing IDs (request_id, anonymous_id)                               │
│         ├─ Derive severity (statusCode → INFO/WARN/ERROR)                                │
│         └─ Reject if invalid                                                             │
│                                                                                            │
│    └─ ➕ Add to buffer (FIRE-AND-FORGET):                                                │
│         └─ SaveAuditLogUseCase.execute(auditLog).catch(err => logger.error(...))        │
│            └─ buffer.add(auditLog)  ← non-blocking, immediate return                    │
│                                                                                            │
│ 5. ✅ Response sent to client (already happened in step 3)                               │
│    └─ Audit process DOES NOT affect response time                                        │
│                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────── ASYNC PERSISTENCE (Background) ─────────────────────────────┐
│                                                                                              │
│ Buffer accumulates logs:                                                                    │
│   Request 1: log → buffer (size: 1)                                                        │
│   Request 2: log → buffer (size: 2)                                                        │
│   ...                                                                                       │
│   Request 500: log → buffer (size: 500)                                                    │
│        └─ THRESHOLD HIT: emit 'flush' event                                               │
│                                                                                              │
│ OR timeout (1s default):                                                                   │
│   1000ms elapsed → emit 'flush' event even if buffer size < 500                           │
│                                                                                              │
│ BatchWorker listens to 'flush' event:                                                      │
│   1. Receives batch of logs                                                                │
│   2. Parameterized batch INSERT to PostgreSQL                                              │
│      INSERT INTO audit_logs VALUES (...), (...), ... (500 rows)                           │
│   3. Logs inserted into TODAY's partition (auto-selected)                                  │
│   4. If SUCCESS: buffer cleared, metrics updated                                           │
│   5. If FAILURE (retryOnce=true):                                                          │
│      └─ Wait 100ms, retry                                                                 │
│   6. If FAILURE (after retry):                                                             │
│      └─ Activate FALLBACK: append to logs/audit-fallback.json                            │
│      └─ Permanent fallback mode until app restart                                         │
│                                                                                              │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## 4.3 Daily Aggregation (1x per day @ 00:00 UTC)

```
┌────────────────────────────── 00:00 UTC ────────────────────────────────┐
│                                                                           │
│ Scheduled Job: DailySummaryJob.run()                                     │
│                                                                           │
│ STEP 1: Read logs from YESTERDAY (2026-03-15)                           │
│    SELECT * FROM audit_logs                                              │
│    WHERE timestamp >= '2026-03-15' AND timestamp < '2026-03-16'        │
│    └─ Uses partition pruning (only scan yesterday's partition)           │
│                                                                           │
│ STEP 2: Calculate aggregates                                             │
│    ├─ total_requests = COUNT(*)                                          │
│    ├─ avg_duration_ms = AVG(duration_ms)                                │
│    ├─ max_duration_ms = MAX(duration_ms)                                │
│    ├─ error_count = COUNT(*) WHERE status_code >= 500                  │
│    ├─ warn_count = COUNT(*) WHERE status_code BETWEEN 400-499          │
│    ├─ unauthorized_count = COUNT(*) WHERE status_code IN (401, 403)    │
│    ├─ unique_ips = COUNT(DISTINCT ip)                                   │
│    └─ unique_users = COUNT(DISTINCT user_id WHERE user_id IS NOT NULL) │
│                                                                           │
│ STEP 3: Run AnomalyDetector                                              │
│    ├─ Detect force brute: IPs with > 100 (401/403)                     │
│    ├─ Detect rate abuse: IPs with > 100 req/min                        │
│    ├─ Detect error spike: > 30% of requests are 5xx                    │
│    └─ Build insights JSONB:                                             │
│       {                                                                  │
│         "suspicious_ips": ["192.168.1.1", "203.0.113.42"],             │
│         "error_spike_detected": true,                                   │
│         "rate_abuse_detected": false                                    │
│       }                                                                  │
│                                                                           │
│ STEP 4: Insert into daily_summary                                        │
│    INSERT INTO daily_summary (                                           │
│      date, total_requests, avg_duration_ms, ..., insights               │
│    ) VALUES (                                                            │
│      '2026-03-15', 500, 145.32, ..., '{...}'::jsonb                    │
│    )                                                                      │
│    ON CONFLICT (date) DO UPDATE SET ... (idempotent)                    │
│                                                                           │
│ STEP 5: On FAILURE                                                       │
│    └─ Retry once (exponential backoff: wait 1s, try again)              │
│    └─ If still fails: log error, continue (don't fail app)              │
│    └─ Data might be incomplete but won't break anything                 │
│                                                                           │
└────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────── 01:00 UTC (Monthly) ────────────────────────┐
│                                                                            │
│ First day of month only (e.g., 2026-04-01 01:00 UTC):                   │
│ Aggregate ALL daily_summary rows for PREVIOUS month into monthly_summary │
│                                                                            │
│ SELECT                                                                    │
│   DATE_TRUNC('month', '2026-03-01'::date) as month,                     │
│   SUM(total_requests),                                                   │
│   AVG(avg_duration_ms),                                                  │
│   ...                                                                     │
│ FROM daily_summary                                                       │
│ WHERE date >= '2026-03-01' AND date < '2026-04-01'                      │
│ GROUP BY month                                                            │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

## 4.4 Shutdown Sequence (Graceful)

```javascript
// Iniciada por SIGTERM, SIGINT, ou app.close()

async function gracefulShutdown() {
  console.log('Shutting down Audit Logger...');
  
  // STEP 1: Stop accepting new logs (50ms timeout)
  buffer.shutdown();
  console.log('✅ Buffer stopped accepting new logs');
  
  // STEP 2: Flush remaining buffer (5s timeout)
  const drained = buffer.flush();
  if (drained.length > 0) {
    await worker.flushImmediately(drained);
    console.log(`✅ Flushed ${drained.length} remaining logs`);
  }
  
  // STEP 3: Wait for in-flight operations (5s timeout)
  await worker.waitForInflight();
  console.log('✅ All in-flight operations completed');
  
  // STEP 4: Close DB connection pool (5s timeout)
  await connection.close();
  console.log('✅ DB connection closed');
  
  // STEP 5: Close file handle (fallback)
  if (fallbackRepository) {
    await fallbackRepository.close();
    console.log('✅ Fallback file handle closed');
  }
  
  console.log('✅ Graceful shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Total timeout: 15 seconds max
```

---

# 5. CONFIGURAÇÕES & AMBIENTE (.env)

## 5.1 Arquivo .env (Raiz do Projeto)

```bash
# ===== DATABASE CONNECTION =====
# Option A: Connection string
DATABASE_URL=postgresql://user:password@localhost:5432/audit_db

# Option B: Components (if DATABASE_URL not set)
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=audit_db
DATABASE_USER=audit_user
DATABASE_PASSWORD=secure_password

# Connection pool
DATABASE_POOL_MIN=5
DATABASE_POOL_MAX=20
DATABASE_CONNECTION_TIMEOUT=5000      # ms
DATABASE_QUERY_TIMEOUT=10000          # ms (fail fast on slow queries)

# ===== LOGGING & FALLBACK STORAGE =====
LOG_DIR=logs                           # Directory for fallback file
LOG_LEVEL=info                         # debug, info, warn, error
LOG_FALLBACK_MAX_SIZE=104857600        # 100MB (fallback file rotation)
LOG_FALLBACK_RETENTION_DAYS=7          # Keep 7 days of rotated files
LOG_FALLBACK_ROTATE_DAILY=true         # Rotate at midnight UTC

# ===== BUFFER & BATCH PROCESSING =====
AUDIT_MAX_BATCH_SIZE=500               # Flush on volume
AUDIT_FLUSH_INTERVAL=1000              # 1 second, flush on time
AUDIT_BUFFER_MAX_PENDING=10000         # Max logs in RAM before overflow
AUDIT_BUFFER_OVERFLOW_BEHAVIOR=drop    # drop oldest, or reject new

# ===== ANOMALY DETECTION THRESHOLDS =====
AUDIT_ANOMALY_FORCEBRUTE_THRESHOLD=100     # 401/403 per IP
AUDIT_ANOMALY_RATEABUSE_THRESHOLD=100      # req/min per IP
AUDIT_ANOMALY_ERRORSPIKE_PCT=30            # % of 5xx errors
AUDIT_ANOMALY_ERRORSPIKE_MIN_COUNT=50      # min requests for calculation

# ===== RETENTION POLICY =====
AUDIT_RETENTION_DAYS=90                # Drop partitions older than this
AUDIT_RETENTION_ACTION=drop            # drop (fast) or archive (future)

# ===== PARTITION MANAGEMENT =====
AUDIT_PARTITION_TIMEZONE=UTC           # Always UTC (not configurable)
AUDIT_PARTITION_SCHEDULE=00:00         # Create partitions every day at 00:00 UTC

# ===== AGGREGATION SCHEDULES =====
AUDIT_AGGREGATION_DAILY_TIME=00:00     # 00:00 UTC every day
AUDIT_AGGREGATION_MONTHLY_TIME=01:00   # 01:00 UTC first day of month

# ===== FEATURE FLAGS =====
AUDIT_ENABLED=true                     # Enable/disable middleware
AUDIT_CAPTURE_RESPONSE_BODY=false      # Capture response body? (may slow down)
AUDIT_SANITIZE_ENABLED=true            # Enable sanitization

# ===== CUSTOM CONFIGURATION =====
# Headers to capture (in addition to whitelist)
AUDIT_CUSTOM_HEADERS=x-correlation-id,x-b3-traceid,x-amzn-trace-id

# Additional sensitive fields to mask
AUDIT_SENSITIVE_FIELDS=ssn,bank_account,confidential
```

## 5.2 Precedência de Configuração

```
Priority (highest to lowest):
1. Environment variables (AUDIT_*, DATABASE_*, LOG_*)
2. Configuration file (audit.config.js, if exists in project root)
3. .env file (default)
4. Hard defaults (in code)

Example:
  process.env.AUDIT_MAX_BATCH_SIZE = 500  // Use this
  vs
  config.audit.maxBatchSize = 1000        // Ignored (env var wins)
```

## 5.3 Default Configuration (If .env Missing)

```javascript
const DEFAULTS = {
  // Database
  DATABASE_HOST: 'localhost',
  DATABASE_PORT: 5432,
  DATABASE_NAME: 'audit_db',
  DATABASE_USER: 'postgres',
  DATABASE_PASSWORD: '',
  DATABASE_POOL_MIN: 5,
  DATABASE_POOL_MAX: 20,
  DATABASE_CONNECTION_TIMEOUT: 5000,
  DATABASE_QUERY_TIMEOUT: 10000,
  
  // Logging
  LOG_DIR: 'logs',
  LOG_LEVEL: 'info',
  LOG_FALLBACK_MAX_SIZE: 104857600,           // 100MB
  LOG_FALLBACK_RETENTION_DAYS: 7,
  LOG_FALLBACK_ROTATE_DAILY: true,
  
  // Buffer
  AUDIT_MAX_BATCH_SIZE: 500,
  AUDIT_FLUSH_INTERVAL: 1000,
  AUDIT_BUFFER_MAX_PENDING: 10000,
  AUDIT_BUFFER_OVERFLOW_BEHAVIOR: 'drop',
  
  // Anomaly Detection
  AUDIT_ANOMALY_FORCEBRUTE_THRESHOLD: 100,
  AUDIT_ANOMALY_RATEABUSE_THRESHOLD: 100,
  AUDIT_ANOMALY_ERRORSPIKE_PCT: 30,
  AUDIT_ANOMALY_ERRORSPIKE_MIN_COUNT: 50,
  
  // Retention
  AUDIT_RETENTION_DAYS: 90,
  AUDIT_RETENTION_ACTION: 'drop',
  
  // Feature flags
  AUDIT_ENABLED: true,
  AUDIT_CAPTURE_RESPONSE_BODY: false,
  AUDIT_SANITIZE_ENABLED: true
};

// Behavior if DATABASE_URL absent:
if (!DATABASE_URL && (!DATABASE_HOST || !DATABASE_NAME)) {
  logger.warn('DATABASE_URL / DATABASE_HOST not configured');
  logger.info('Activating FALLBACK_MODE');
  inFallbackMode = true;
  // Continue with fallback (JSON file storage)
}
```

---

# 6. TRATAMENTO DE FALHAS & RESILIÊNCIA

## 6.1 Falha no Banco de Dados

```
Cenário: DB Connection Refused (ECONNREFUSED)

┌─ Initialization ──────────────────────────────┐
│ 1. Try to connect:                             │
│    conn.connect() → ECONNREFUSED              │
│                                                │
│ 2. Log warning:                                │
│    logger.warn('DB unavailable at startup') │
│                                                │
│ 3. Activate FALLBACK_MODE:                     │
│    inFallbackMode = true                      │
│    repository = FallbackRepository             │
│                                                │
│ 4. Return warning status:                      │
│    {                                           │
│      status: 'warning',                        │
│      message: 'DB unavailable. Using fallback file storage.',
│      inFallbackMode: true                     │
│    }                                           │
│                                                │
│ 5. App CONTINUES (middleware works normally) │
│    All logs go to file instead of DB         │
│                                                │
└────────────────────────────────────────────────┘
```

## 6.2 Falha no Insert (Batch Worker)

```
Cenário: DB error during batch INSERT

┌─ Worker processes flush event ────────────────────────┐
│                                                        │
│ 1. Execute INSERT:                                    │
│    INSERT INTO audit_logs VALUES (...), ... (500 rows)│
│                                                        │
│ 2. ERROR (e.g., connection lost mid-operation):      │
│    ECONNREFUSED, TIMEOUT, or SQL error              │
│                                                        │
│ 3. First retry (if retries > 0):                     │
│    Wait 100ms, try again                            │
│                                                        │
│ 4. Still fails:                                       │
│    logger.error('DB insert failed after retry')      │
│    logger.info('Activating fallback for batch')      │
│                                                        │
│ 5. Fallback action:                                   │
│    FOR EACH log IN batch:                            │
│      fallbackRepository.save(log)                    │
│      └─ Append to logs/audit-fallback.json (NDJSON)  │
│                                                        │
│ 6. Permanent fallback mode:                           │
│    inFallbackMode = true                            │
│    All future inserts use fallback                   │
│                                                        │
│ 7. Continue (don't block middleware):               │
│    Return immediately to middleware                  │
│    Requisições continuam normalmente               │
│                                                        │
└────────────────────────────────────────────────────────┘
```

## 6.3 Falha no Arquivo de Fallback

```
Cenário: Can't write to logs/audit-fallback.json

┌─ Fallback repository tries to save log ────────────┐
│                                                     │
│ 1. File system error (EACCES, ENOSPC, etc):       │
│    File permission denied, disk full, etc         │
│                                                     │
│ 2. Try to create logs directory:                  │
│    fs.mkdirSync('logs', { recursive: true })     │
│    If fails: log to stderr (not file)             │
│                                                     │
│ 3. Try to append JSON line:                       │
│    fs.appendFileSync('logs/audit-fallback.json', ...) │
│    If fails: catch, log to stderr only            │
│                                                     │
│ 4. Stderr output:                                  │
│    [ERROR] Audit fallback failed: EACCES ...      │
│                                                     │
│ 5. CRITICAL: NEVER block middleware              │
│    .catch() handles silently                       │
│    HTTP response sent normally                     │
│    Log is lost (acceptable trade-off)              │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 6.4 Fire-and-Forget Pattern (CRITICAL)

```javascript
// ❌ WRONG (blocks request):
middleware(req, res, next) {
  await useCase.execute(data);  // ← BLOCKS!
  next();
}

// ✅ CORRECT (fire-and-forget):
middleware(req, res, next) {
  useCase.execute(data)  // ← NO await
    .catch(err => logger.error('Audit failed:', err));
  
  next();  // ← Returns immediately
}

// Guarantee:
// - Requisição NUNCA é bloqueada
// - Audit é processado em background
// - Erro na auditoria NÃO afeta resposta
```

---

# 7. PERFORMANCE & LIMITES

## 7.1 Field Size Limits

| Field | Limit | Behavior |
|-------|-------|----------|
| url | 2 KB | Truncate silently |
| body | 64 KB | Set to null if > |
| headers | 16 KB | Set to {} if > |
| response_body | 64 KB | Set to null if > |
| **Total log** | 256 KB | Ignore entire log if > |

Cálculo: `JSON.stringify(auditLog).length` em bytes UTF-8

## 7.2 Buffer Configuration

```javascript
{
  maxBatchSize: 500,           // Flush on volume
  flushInterval: 1000,         // 1 second
  maxPendingSize: 10000,       // Max RAM before overflow
  overflowBehavior: 'drop'     // Drop oldest if overflow
}
```

Calculation: `500 logs × 5 KB avg = 2.5 MB per batch`

## 7.3 Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Middleware overhead | < 1ms | Fire-and-forget, no await |
| Buffer add | < 0.1ms | O(1) push to array |
| Batch insert 500 logs | < 100ms | Parameterized, partitioned |
| Daily aggregation (100k logs) | < 500ms | Uses indexes, partition pruning |
| Anomaly detection | < 200ms | Aggregated, no real-time scan |
| Partition creation | < 50ms | CREATE TABLE IF NOT EXISTS |
| Request latency impact | ~0ms | Async background |

## 7.4 Throughput Capacity

Single Node.js process (estimated):

```
5,000 requests/sec × 1ms avg overhead × 500 batch size
→ ~2,500 logs/sec sustainable throughput
→ ~216M logs/day
→ 4 partitions at 54M logs per partition

For higher throughput:
- Use multiple Node processes (clustering)
- Use Redis/RabbitMQ queue (v5+)
- Increase batch size to 1000
- Increase flush interval to 2s
```

---

# 8. SEGURANÇA

## 8.1 Sanitização

Campos **sempre mascarados** (case-insensitive):

```javascript
[
  'password', 'pwd', 'passwd',
  'token', 'access_token', 'refresh_token', 'bearer', 'secret', 'api_secret',
  'apikey', 'api_key', 'api-key', 'client_secret',
  'ssn', 'social_security_number', 'pin', 'otp',
  'creditcard', 'credit_card', 'cc', 'cvv', 'cvc',
  'private_key', 'webhook_secret'
]
```

**Mascaramento**: `field: '********'` (8 asteriscos)

**Recursão**: Profundidade ilimitada (objetos aninhados, arrays)

## 8.2 SQL Injection Prevention

**Sempre parameterized queries:**

```javascript
// ✅ CORRECT (safe):
await db.query(
  'INSERT INTO audit_logs (ip, url, method) VALUES ($1, $2, $3)',
  [log.ip, log.url, log.method]
);

// ❌ WRONG (vulnerable):
await db.query(
  `INSERT INTO audit_logs VALUES ('${log.ip}', '${log.url}')`
);
```

## 8.3 Authorization Headers (Never Captured)

Blacklist:

```javascript
[
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-session-id'
]
```

These headers are NEVER captured, even if whitelist is customized.

## 8.4 File Permissions (Fallback Storage)

```bash
# logs/audit-fallback.json permissions:
-rw-r----- (0o640)

# Directory permissions:
drwxr-xr-x (0o755)

# Owner: user running Node process
# Group: typically same as owner (or audit group)

# This prevents:
- World-readable logs (info disclosure)
- World-writable logs (tampering)
```

---

# 9. CRITÉRIOS DE ACEITAÇÃO

Pacote é **pronto para produção** se:

- ✅ Tabela `audit_logs` criada automaticamente (com partitioning)
- ✅ Cada requisição HTTP gera entrada (ou arquivo em fallback)
- ✅ Queda do banco **NÃO causa erro 500** na aplicação
- ✅ Logs redirecionados para fallback se banco falhar
- ✅ Dados sensíveis **NUNCA aparecem em texto puro** (no banco/arquivo)
- ✅ Middleware é **fire-and-forget** (não bloqueia requisição)
- ✅ **Batch insert** 500+ logs em < 100ms
- ✅ Cobertura de testes: **mínimo 85%**
- ✅ **Sanitização recursiva** em profundidade ilimitada
- ✅ **Timestamp automático** (sempre UTC ISO 8601)
- ✅ **UUID v4 request_id** para correlação distribuída
- ✅ **Headers normalizados** (lowercase) com whitelist/blacklist explícita
- ✅ **Content-Type prefix matching** (não exact)
- ✅ **User ID extraction** com prioridades explícitas
- ✅ **Performance tracking** (duration_ms)
- ✅ **Daily aggregation** calcula corretamente (total, avg, errors, etc)
- ✅ **Anomaly detection** (força bruta, rate abuse, error spike)
- ✅ **Retenção automática** (TTL via DROP PARTITION)
- ✅ **Graceful shutdown** flushes buffer antes de sair
- ✅ **Documentação completa** e **testes servem como source of truth**

---

# 10. EDGE CASES GARANTIDAMENTE TRATADOS

- ✅ Request sem IP → "UNKNOWN"
- ✅ Body vazio (POST) → null
- ✅ Headers ausentes → {}
- ✅ Payload gigante (>256KB) → log inteiro ignorado
- ✅ JSON inválido → não capturado
- ✅ Timeout no banco → retry + fallback
- ✅ Falha no insert batch → activate fallback
- ✅ Partição inexistente (INSERT fora do range) → PartitionManager cria
- ✅ Tentativa de dropar partição inexistente → DROP IF EXISTS (safe)
- ✅ Buffer overflow (max 10K pending) → drop oldest logs
- ✅ Concurrent shutdown() calls → idempotent
- ✅ Circular references em sanitização → structuredClone() handles
- ✅ UTF-8 multibyte chars em truncamento → bytes, não chars
- ✅ Database connection timeout → activate fallback
- ✅ Fallback file permission denied → stderr log, continue
- ✅ Disk full (fallback) → offline gracefully
- ✅ Request timestamp > 12h no futuro → rejected
- ✅ Request timestamp > 31 dias no passado → rejected
- ✅ Statuscode não inteiro (float) → rejected
- ✅ Statuscode < 100 ou > 599 → rejected

---

# 11. EXEMPLO REAL DE LOG PERSISTIDO

```json
{
  "id": 12345,
  "request_id": "550e8400-e29b-41d4-a716-446655440000",
  "anonymous_id": "a1b2c3d4e5f6g7h8...(64 chars SHA256)",
  "ip": "203.0.113.42",
  "user_id": "user-abc123",
  "url": "/api/auth/login",
  "method": "POST",
  "status_code": 200,
  "severity": "INFO",
  "duration_ms": 145,
  "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "body": {
    "email": "john@example.com",
    "password": "********",
    "rememberMe": true
  },
  "headers": {
    "user-agent": "Mozilla/5.0...",
    "accept": "application/json",
    "accept-language": "en-US,en;q=0.9",
    "accept-encoding": "gzip, deflate",
    "content-type": "application/json",
    "content-length": "82"
  },
  "response_body": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user-abc123",
      "email": "john@example.com"
    }
  },
  "timestamp": "2026-03-16T10:15:30.123Z",
  "created_at": "2026-03-16T10:15:30.456Z",
  "schema_version": 4
}
```

---

# 12. DECISÕES DE DESIGN EXPLICADAS

### Por que PostgreSQL-only em v4?

**Resposta**: 
- PostgreSQL partitioning é nativo (v10+) — não genérico
- JSONB é eficiente para body/headers/insights
- Índices partial com WHERE clause para hot data
- No futuro: Logical replication, Foreign Data Wrappers

### Por que buffer em memória (não persistent)?

**Resposta**:
- Trade-off: Simplicity vs Crash-safety
- Acceptable: Single process, graceful shutdown flushes
- Future (v5+): Use Redis for distributed buffer
- For crash-safety now: Use application-level backup (BGP, WAL)

### Por que fire-and-forget no middleware?

**Resposta**:
- Auditoria NUNCA deve afetar performance de negócio
- User experience é priority #1
- Best-effort logging (acceptable some loss under extreme load)
- If lossless needed: Use message queue (future)

### Por que thresholds hardcoded + env-configurable?

**Resposta**:
- Defaults são sensatos (100 = forte evidência de attack)
- Environment allows tuning por workload
- No runtime config updates (too complex for v4)
- Future (v5+): Admin dashboard for tweaks

---

# PRÓXIMOS PASSOS

## Para Implementação

1. **Clone repo** + setup Vitest
2. **Implement domain layer** (entidades, serviços)
3. **Implement utils** (sanitizer, trunctors, extractors)
4. **Implement application layer** (use case, buffer)
5. **Implement infrastructure** (PostgreSQL, repos, jobs)
6. **Implement adapters** (middleware Express/Fastify)
7. **Write 150+ testes** (usando suíte em COMPLETE_TEST_SUITE_V4.md)
8. **Achieve 85%+ coverage**
9. **Run E2E tests**
10. **Create README + examples**
11. **Publish to npm**

## Checklist de Lançamento

- [ ] Build passes
- [ ] All 150+ tests pass
- [ ] 85%+ code coverage
- [ ] No ESLint warnings
- [ ] Performance benchmarks met
- [ ] README + examples complete
- [ ] Edge cases documented
- [ ] Schema migrations tested
- [ ] Fallback behavior tested under load
- [ ] Security review (no SQL injection, sanitization correct)
- [ ] Dependencies audited (no vulns)
- [ ] Load test: 1000+ req/sec sustained
- [ ] Documentation published
- [ ] Version bumped (0.1.0 → 1.0.0)
- [ ] Changelog updated
- [ ] Tagged in git

---

# APPENDIX A: Resumo de Mudanças V3 → V4

| Aspecto | V3 | V4 |
|---------|----|----|
| **Buffer strategy** | Mencionado | Detailed config + overflow behavior |
| **Aggregation timing** | "1x por dia" | Exato: 00:00 UTC + retry strategy |
| **Shutdown sequence** | Vago | 5-step sequence + timeouts |
| **Partition timezone** | Não definido | Always UTC (explícito) |
| **Retry strategy** | Não definido | Single retry (100ms) + fallback |
| **Single-process limitation** | Omitido | Documentado (v5+ scaling plan) |
| **Thresholds** | Hardcoded | Env-configurable |
| **Fallback rotation** | Append-only | Rotation by size/date + TTL |
| **Request ID priority** | Não definido | Header first, else generate |
| **Concurrent safeguards** | Não definido | Unique constraint + error handling |
| **Configuration** | .env apenas | .env + audit.config.js + API |
| **Health endpoint** | Não existe | Audit.getStatus() API |
| **Graceful shutdown** | Mencionado | Detailed hook precedence |
| **Test suite** | Genérico | 150+ TDD-derived test cases |
| **Performance targets** | Nenhum | Explicit targets (100ms batch, etc) |
| **Ambiguidades** | 19 encontradas | **Todas resolvidas** |

---

# APPENDIX B: Configurações Recomendadas por Ambiente

## Development

```bash
AUDIT_ENABLED=true
AUDIT_MAX_BATCH_SIZE=10           # Small for testing
AUDIT_FLUSH_INTERVAL=500          # Quick flush
LOG_LEVEL=debug
AUDIT_ANOMALY_FORCEBRUTE_THRESHOLD=10   # Lower for testing
DATABASE_POOL_MIN=1
DATABASE_POOL_MAX=5
```

## Production (High Traffic)

```bash
AUDIT_ENABLED=true
AUDIT_MAX_BATCH_SIZE=1000         # Larger batches
AUDIT_FLUSH_INTERVAL=500          # 500ms for freshness
LOG_LEVEL=warn                    # Less noise
AUDIT_BUFFER_MAX_PENDING=50000    # Larger buffer
DATABASE_POOL_MIN=10
DATABASE_POOL_MAX=50
DATABASE_QUERY_TIMEOUT=5000       # Fail fast
AUDIT_CAPTURE_RESPONSE_BODY=false # Performance
```

## Testing (CI/CD)

```bash
AUDIT_ENABLED=true
AUDIT_MAX_BATCH_SIZE=100
LOG_LEVEL=error
DATABASE_HOST=localhost           # via docker-compose
AUDIT_BUFFER_OVERFLOW_BEHAVIOR=reject  # Strict
```

---

# APPENDIX C: Roadmap (v4 → v5+)

**v4.x** (Current):
- PostgreSQL-only, single-process
- Memory buffer
- Basic anomaly detection

**v5.0** (Future):
- Redis distributed buffer
- Horizontal scaling support
- Advanced IA/ML anomalies
- Real-time alerting via webhooks
- Admin dashboard

**v6.0+**:
- Multi-cloud storage (S3, GCS)
- Time series DB support (ClickHouse, TimescaleDB)
- GraphQL API for queries

---

**FIM DA ESPECIFICAÇÃO V4**

Status: ✅ **PRONTA PARA IMPLEMENTAÇÃO**  
Data: 16 de março de 2026  
Validação: TDD com 150+ test cases  
Cobertura esperada: 85%+  
Performance pré-validada: ✅ High-throughput ready

