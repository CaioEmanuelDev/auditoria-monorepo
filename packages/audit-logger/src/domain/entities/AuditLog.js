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
```
*/

export class AuditLog {
    #id;
    #url;
    #method;

}