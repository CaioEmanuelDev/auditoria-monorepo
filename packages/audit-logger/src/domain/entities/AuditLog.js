import { randomUUID, createHash } from 'node:crypto';
/**
 * # 3. CONTRATOS & INTERFACES

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
*/

/**
 * @class AuditLog
 * @description Entidade responsável por centralizar e validar logs de auditoria
 */

export class AuditLog {
    #id
    #request_id
    #anonymous_id
    #ip
    #url
    #method
    #statusCode
    #timestamp

    // OPCIONAIS
    #userId
    #body
    #headers
    #response_body
    #duration_ms
    #user_agent
    #severity

/**
 * 
 * @param {Object} props - Propriedades do log de auditoria
 * @param {string} props.ip - IP do cliente (obrigatório, ou "UNKNOWN")
 * @param {string} props.url - URL da requisição (obrigatório, max 2048 bytes)
 * @param {string} props.method - Método HTTP (obrigatório, GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)
 * @param {number} props.statusCode - Código de status HTTP (obrigatório, 100-599)
 * @param {Date|string} props.timestamp - Timestamp da requisição (obrigatório, UTC)
 * @param {string} [props.userId] - ID do usuário (opcional)
 * @param {object|null} [props.body] - Corpo da requisição (opcional, max 64KB)
 * @param {object|null} [props.headers] - Cabeçalhos da requisição (opcional, max 16KB)
 * @param {object|null} [props.response_body] - Corpo da resposta (opcional, max 64KB)
 * @param {number} [props.duration_ms] - Duração da requisição em ms (opcional, >= 0)
 * @param {string} [props.user_agent] - User-Agent da requisição (opcional)
 * @throws {Error} Lança erros de validação se os dados forem inválidos 
 */

    constructor({ ip, url, method, statusCode, timestamp, userId, body, headers, response_body, duration_ms, user_agent }) {
    // 1.Validações obrigatórias
    // URL
    if (!url || url.length > 2048) {
        throw new Error("URL inválida ou muito longa (max 2KB)");
    }
    // Metodo HTTP
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!method || !validMethods.includes(method.toUpperCase())) {
        throw new Error("Método Http inválido ou ausente");
    }

    // Status Code
    if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
        throw new Error ("Status Code inválido (deve ser inteiro entre 100 e 599)");
    }
    // Timestamp
    const logTime = new Date(timestamp)
    
    
    // Atribuição de propriedades
    this.#ip = ip || 'UNKNOWN';
    this.#url = url;
    this.#method = method.toUpperCase();
    this.#statusCode = statusCode;
    this.#timestamp = logTime;
    this.#userId = userId;
    this.#body = body;
    this.#headers = headers;
    this.#response_body = response_body;
    this.#duration_ms = duration_ms;
    this.#user_agent = user_agent;

    // Lógica Derivada (Severidade)
    this.#severity = this.#classifySeverity(statusCode);
}
    // Getters imutáveis
    getIp() { return this.#ip;}
    getUrl() { return this.#url;}
    getMethod() { return this.#method;}
    getStatusCode() { return this.#statusCode;}
    getTimestamp() { return this.#timestamp;}
    getUserId() { return this.#userId;}
    getBody() { return this.#body;}
    getHeaders() { return this.#headers;}
    getResponseBody() { return this.#response_body;}
    getDurationMs() { return this.#duration_ms;}
    getUserAgent() { return this.#user_agent;}
    getSeverity() { return this.#severity;}


    #classifySeverity(statusCode) {
        if (statusCode >= 100 && statusCode <= 399) return "INFO";
        if (statusCode >= 400 && statusCode <= 499) return "WARN";
        if (statusCode >= 500 && statusCode <= 599) return "ERROR";
        return "UNKNOWN";
    }
}