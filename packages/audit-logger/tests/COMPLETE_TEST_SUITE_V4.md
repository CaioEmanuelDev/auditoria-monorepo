# 🧪 SUÍTE COMPLETA DE TESTES - AUDIT LOGGER V4

**Status**: TDD (Test-Driven Development)  
**Framework**: Vitest  
**Total Testes**: 150+ casos  
**Cobertura Target**: 85%+

---

## 📂 ESTRUTURA DE DIRETÓRIOS

```
tests/
├── domain/                    # Business logic, entities
│   ├── entities/
│   │   └── AuditLog.test.js  # Creation, validation, defaults
│   ├── services/
│   │   ├── SeverityClassifier.test.js
│   │   ├── IpExtractor.test.js
│   │   └── AnonymousIdGenerator.test.js
│   └── valueObjects/
│       └── Timestamp.test.js
│
├── utils/                     # Utilities
│   ├── DataSanitizer.test.js
│   ├── PayloadTruncator.test.js
│   ├── FieldLimits.test.js
│   └── ContentTypeChecker.test.js
│
├── application/              # Use cases
│   ├── useCases/
│   │   └── SaveAuditLogUseCase.test.js
│   └── buffer/
│       └── AuditBuffer.test.js
│
├── infrastructure/           # External integrations
│   ├── database/
│   │   ├── PostgreSQLConnection.test.js
│   │   ├── AuditLogRepository.test.js
│   │   ├── PartitionManager.test.js
│   │   └── BatchWorker.test.js
│   ├── aggregation/
│   │   ├── DailySummaryJob.test.js
│   │   ├── AnomalyDetector.test.js
│   │   └── DailyAggregationQuery.test.js
│   └── fallback/
│       └── FallbackRepository.test.js
│
├── adapters/                 # Middleware, extractors
│   ├── middlewares/
│   │   ├── ExpressMiddleware.test.js
│   │   └── FastifyMiddleware.test.js
│   └── extractors/
│       ├── RequestDataExtractor.test.js
│       ├── HeaderExtractor.test.js
│       └── UserIdExtractor.test.js
│
├── integration/              # E2E, workflow
│   ├── request-to-db.test.js
│   ├── buffer-to-batch.test.js
│   ├── aggregation-pipeline.test.js
│   └── fallback-activation.test.js
│
└── performance/              # Load, stress
    ├── high-throughput.test.js
    ├── buffer-capacity.test.js
    └── batch-efficiency.test.js
```

---

## 🧼 PADRÃO AAA (Arrange / Act / Assert)

Exemplo:

```javascript
describe('AuditLog.create', () => {
  it('should create valid AuditLog with all required fields', () => {
    // ARRANGE
    const data = {
      ip: '203.0.113.42',
      url: '/api/users',
      method: 'GET',
      statusCode: 200,
      timestamp: new Date('2026-03-16T10:15:30.123Z')
    };

    // ACT
    const auditLog = AuditLog.create(data);

    // ASSERT
    expect(auditLog.ip).toBe('203.0.113.42');
    expect(auditLog.severity).toBe('INFO');
    expect(auditLog.request_id).toMatch(/^[0-9a-f]{8}-/);
  });
});
```

---

## 🔍 DOMÍNIO - DETALHADO

### 1. AuditLog Entity

#### 1.1 Criação Básica

```javascript
describe('AuditLog.create', () => {
  it('should create AuditLog with all required fields', () => {
    // ✅
  });

  it('should auto-generate request_id if not provided', () => {
    // UUID v4 format
  });

  it('should auto-generate anonymous_id as hash(ip + userAgent)', () => {
    // hash should be consistent for same ip + userAgent
  });

  it('should auto-generate timestamp if not provided', () => {
    // timestamp should be ISO 8601 UTC
  });

  it('should set timestamp to UTC if provided as Date', () => {
    // convert Date to ISO 8601
  });

  it('should accept timestamp as ISO 8601 string', () => {
    // parse and validate
  });

  it('should derive severity from statusCode', () => {
    // 2xx → INFO, 4xx → WARN, 5xx → ERROR
  });

  it('should throw if statusCode is outside valid range (100-599)', () => {
    // statusCode: 99 → ERROR
    // statusCode: 600 → ERROR
  });

  it('should require ip field (can be "UNKNOWN")', () => {
    // ip is required, cannot be null
  });

  it('should require url field', () => {
    // url cannot be null or empty
  });

  it('should require method field (GET|POST|etc)', () => {
    // method must be uppercase
  });

  it('should require statusCode field as integer', () => {
    // must be integer, not string
  });

  it('should normalize method to UPPERCASE', () => {
    // "get" → "GET"
  });

  it('should trim whitespace from string fields', () => {
    // "  /api/users  " → "/api/users"
  });

  it('should accept optional userId', () => {
    // userId: null → OK
    // userId: "user123" → OK
  });

  it('should accept optional body, headers, response_body', () => {
    // all optional, can be null or object
  });

  it('should accept optional duration_ms as non-negative integer', () => {
    // duration_ms: -1 → ERROR
    // duration_ms: 0 → OK
  });

  it('should accept optional user_agent string', () => {
    // user_agent optional
  });
});
```

#### 1.2 Validações Rigorosas

```javascript
describe('AuditLog validation', () => {
  it('should reject null ip', () => {
    // must throw InvalidAuditLogError
  });

  it('should reject undefined url', () => {
    // must throw
  });

  it('should reject empty string url', () => {
    // must throw
  });

  it('should reject invalid method (not in GET|POST|...)', () => {
    // must throw
  });

  it('should reject statusCode < 100', () => {
    // must throw
  });

  it('should reject statusCode > 599', () => {
    // must throw
  });

  it('should reject statusCode as float (not integer)', () => {
    // 200.5 → ERROR
  });

  it('should reject invalid timestamp format', () => {
    // "invalid-date" → ERROR
  });

  it('should reject future timestamp (> current time + 5s)', () => {
    // prevent clock skew exploits
  });

  it('should reject timestamp older than 31 days', () => {
    // very old logs not allowed
  });

  it('should reject duration_ms as negative', () => {
    // -100 → ERROR
  });

  it('should reject non-object body', () => {
    // body must be object, null, or undefined (not number/string)
  });

  it('should reject non-object headers', () => {
    // headers must be object or undefined
  });

  it('should reject non-object response_body', () => {
    // response_body must be object or undefined
  });

  it('should reject method not uppercase', () => {
    // "Post" → ERROR, must be "POST"
  });

  it('should reject invalid ipv4 format silently (accept as-is)', () => {
    // NO validation of IP format, just accept
  });

  it('should accept "UNKNOWN" ip', () => {
    // "UNKNOWN" is valid
  });

  it('should accept IPv6 addresses', () => {
    // "2001:db8::1" is valid
  });

  it('should accept IPv6-mapped IPv4 (::ffff:192.168.1.1)', () => {
    // accept as-is (not normalize)
  });
});
```

#### 1.3 Severity Classification

```javascript
describe('SeverityClassifier', () => {
  it('should classify 100-299 as INFO', () => {
    expect(SeverityClassifier.classify(100)).toBe('INFO');
    expect(SeverityClassifier.classify(200)).toBe('INFO');
    expect(SeverityClassifier.classify(201)).toBe('INFO');
    expect(SeverityClassifier.classify(299)).toBe('INFO');
  });

  it('should classify 300-399 as INFO', () => {
    expect(SeverityClassifier.classify(300)).toBe('INFO');
    expect(SeverityClassifier.classify(301)).toBe('INFO');
    expect(SeverityClassifier.classify(399)).toBe('INFO');
  });

  it('should classify 400-499 as WARN', () => {
    expect(SeverityClassifier.classify(400)).toBe('WARN');
    expect(SeverityClassifier.classify(401)).toBe('WARN');
    expect(SeverityClassifier.classify(404)).toBe('WARN');
    expect(SeverityClassifier.classify(499)).toBe('WARN');
  });

  it('should classify 500-599 as ERROR', () => {
    expect(SeverityClassifier.classify(500)).toBe('ERROR');
    expect(SeverityClassifier.classify(502)).toBe('ERROR');
    expect(SeverityClassifier.classify(599)).toBe('ERROR');
  });

  it('should classify edge case 399.999 as ERROR (float rounds up)', () => {
    // edge case: should handle properly
  });
});
```

#### 1.4 Anonymous ID Generation

```javascript
describe('AnonymousIdGenerator', () => {
  it('should generate deterministic hash from ip + userAgent', () => {
    const id1 = AnonymousIdGenerator.generate('192.168.1.1', 'Mozilla/5.0');
    const id2 = AnonymousIdGenerator.generate('192.168.1.1', 'Mozilla/5.0');
    expect(id1).toBe(id2);
  });

  it('should generate different hash for different ip', () => {
    const id1 = AnonymousIdGenerator.generate('192.168.1.1', 'Mozilla/5.0');
    const id2 = AnonymousIdGenerator.generate('192.168.1.2', 'Mozilla/5.0');
    expect(id1).not.toBe(id2);
  });

  it('should generate different hash for different userAgent', () => {
    const id1 = AnonymousIdGenerator.generate('192.168.1.1', 'Mozilla/5.0');
    const id2 = AnonymousIdGenerator.generate('192.168.1.1', 'Chrome/120');
    expect(id1).not.toBe(id2);
  });

  it('should use SHA256 hash (64-char hex)', () => {
    const id = AnonymousIdGenerator.generate('192.168.1.1', 'Mozilla/5.0');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle empty userAgent', () => {
    const id = AnonymousIdGenerator.generate('192.168.1.1', '');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should handle UNKNOWN ip', () => {
    const id = AnonymousIdGenerator.generate('UNKNOWN', 'Mozilla/5.0');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

---

### 2. IP Extraction

```javascript
describe('IpExtractor', () => {
  it('should extract IP from x-forwarded-for header (first value)', () => {
    const headers = { 'x-forwarded-for': '203.0.113.42, 192.168.1.1' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('203.0.113.42');
  });

  it('should trim whitespace from x-forwarded-for', () => {
    const headers = { 'x-forwarded-for': '  203.0.113.42  ' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('203.0.113.42');
  });

  it('should fallback to x-real-ip if x-forwarded-for missing', () => {
    const headers = { 'x-real-ip': '203.0.113.42' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('203.0.113.42');
  });

  it('should fallback to cf-connecting-ip if previous missing', () => {
    const headers = { 'cf-connecting-ip': '203.0.113.42' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('203.0.113.42');
  });

  it('should fallback to socket.remoteAddress', () => {
    const headers = {};
    const socket = { remoteAddress: '203.0.113.42' };
    const ip = IpExtractor.extract(headers, socket);
    expect(ip).toBe('203.0.113.42');
  });

  it('should fallback to socket.connection.remoteAddress', () => {
    const headers = {};
    const socket = { connection: { remoteAddress: '203.0.113.42' } };
    const ip = IpExtractor.extract(headers, socket);
    expect(ip).toBe('203.0.113.42');
  });

  it('should return UNKNOWN if all sources exhausted', () => {
    const headers = {};
    const socket = {};
    const ip = IpExtractor.extract(headers, socket);
    expect(ip).toBe('UNKNOWN');
  });

  it('should handle IPv6-mapped IPv4 (::ffff:192.168.1.1)', () => {
    const headers = { 'x-forwarded-for': '::ffff:192.168.1.1' };
    const ip = IpExtractor.extract(headers, {});
    // Should accept as-is (NO normalization)
    expect(ip).toBe('::ffff:192.168.1.1');
  });

  it('should handle plain IPv6', () => {
    const headers = { 'x-forwarded-for': '2001:db8::1' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('2001:db8::1');
  });

  it('should handle IPv6 with zone (fe80::1%eth0)', () => {
    const headers = { 'x-forwarded-for': 'fe80::1%eth0' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('fe80::1%eth0');
  });

  it('should handle localhost IPv4', () => {
    const headers = { 'x-forwarded-for': '127.0.0.1' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('127.0.0.1');
  });

  it('should handle localhost IPv6', () => {
    const headers = { 'x-forwarded-for': '::1' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('::1');
  });

  it('should return UNKNOWN for empty/null/whitespace-only ip', () => {
    const headers = { 'x-forwarded-for': '   ' };
    const ip = IpExtractor.extract(headers, {});
    expect(ip).toBe('UNKNOWN');
  });
});
```

---

### 3. User ID Extraction

```javascript
describe('UserIdExtractor', () => {
  it('should extract from X-User-ID header (priority 1)', () => {
    const req = {
      headers: { 'x-user-id': 'user-123' },
      user: { id: 'user-from-auth' },
      locals: { userId: 'user-from-locals' }
    };
    const userId = UserIdExtractor.extract(req);
    expect(userId).toBe('user-123');
  });

  it('should be case-insensitive for header name', () => {
    const req = { headers: { 'X-USER-ID': 'user-123' } };
    const userId = UserIdExtractor.extract(req);
    expect(userId).toBe('user-123');
  });

  it('should fallback to req.user.id (priority 2)', () => {
    const req = {
      headers: {},
      user: { id: 'user-from-auth' }
    };
    const userId = UserIdExtractor.extract(req);
    expect(userId).toBe('user-from-auth');
  });

  it('should fallback to req.locals.userId (priority 3)', () => {
    const req = {
      headers: {},
      user: undefined,
      locals: { userId: 'user-from-locals' }
    };
    const userId = UserIdExtractor.extract(req);
    expect(userId).toBe('user-from-locals');
  });

  it('should return undefined if all sources exhausted', () => {
    const req = { headers: {}, user: undefined, locals: {} };
    const userId = UserIdExtractor.extract(req);
    expect(userId).toBeUndefined();
  });

  it('should handle custom extractor function', () => {
    const req = { headers: {}, custom: { auth_id: 'custom-123' } };
    const extractor = (r) => r.custom.auth_id;
    const userId = UserIdExtractor.extract(req, extractor);
    expect(userId).toBe('custom-123');
  });

  it('should handle JWT extraction from Bearer token', () => {
    // If implemented: extract jwt.sub or jwt.userId
  });
});
```

---

## 🧰 UTILS - DETALHADO

### 1. Data Sanitizer (Deep Recursion)

```javascript
describe('DataSanitizer', () => {
  it('should mask password field at top level', () => {
    const data = { password: 'secret123' };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.password).toBe('********');
  });

  it('should mask sensitive fields case-insensitively', () => {
    const data = { PASSWORD: 'secret', Token: 'xyz' };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.PASSWORD).toBe('********');
    expect(sanitized.Token).toBe('********');
  });

  it('should mask all default sensitive fields', () => {
    const data = {
      password: 'pwd',
      token: 'tkn',
      apikey: 'key',
      secret: 'sec',
      creditcard: 'cc',
      ssn: 'ssn'
    };
    const sanitized = DataSanitizer.sanitize(data);
    Object.values(sanitized).forEach(v => {
      expect(v).toBe('********');
    });
  });

  it('should sanitize nested objects recursively', () => {
    const data = {
      user: {
        name: 'John',
        password: 'secret'
      }
    };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.user.name).toBe('John');
    expect(sanitized.user.password).toBe('********');
  });

  it('should sanitize arrays of objects', () => {
    const data = {
      users: [
        { name: 'John', password: 'pwd1' },
        { name: 'Jane', password: 'pwd2' }
      ]
    };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.users[0].password).toBe('********');
    expect(sanitized.users[1].password).toBe('********');
  });

  it('should sanitize deeply nested structures', () => {
    const data = {
      level1: {
        level2: {
          level3: {
            password: 'secret'
          }
        }
      }
    };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.level1.level2.level3.password).toBe('********');
  });

  it('should not modify original object (deep clone)', () => {
    const data = { password: 'secret' };
    const sanitized = DataSanitizer.sanitize(data);
    expect(data.password).toBe('secret');
    expect(sanitized.password).toBe('********');
  });

  it('should use structuredClone for deep copy', () => {
    const data = { password: 'secret', date: new Date() };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.date instanceof Date).toBe(true);
  });

  it('should handle circular references', () => {
    const data = { password: 'secret' };
    data.self = data; // circular
    // should not hang or throw
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.password).toBe('********');
  });

  it('should accept custom sensitive fields list', () => {
    const data = { custom_secret: 'secret', password: 'pwd' };
    const sanitized = DataSanitizer.sanitize(
      data,
      ['custom_secret'] // override defaults
    );
    expect(sanitized.custom_secret).toBe('********');
    expect(sanitized.password).toBe('pwd'); // not in override list
  });

  it('should merge custom fields with defaults if asked', () => {
    // DataSanitizer.sanitize(data, sensitiveFields, mergeWithDefaults=true)
  });

  it('should preserve non-sensitive values', () => {
    const data = {
      email: 'john@example.com',
      name: 'John Doe',
      password: 'secret'
    };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.email).toBe('john@example.com');
    expect(sanitized.name).toBe('John Doe');
    expect(sanitized.password).toBe('********');
  });

  it('should handle null and undefined values', () => {
    const data = { password: null, token: undefined };
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.password).toBe('********');
    expect(sanitized.token).toBe('********');
  });

  it('should handle empty arrays', () => {
    const data = { items: [], password: 'secret' };
    const sanitized = DataSanitizer.sanitize(data);
    expect(Array.isArray(sanitized.items)).toBe(true);
    expect(sanitized.items.length).toBe(0);
  });

  it('should handle primitives (strings, numbers)', () => {
    const sanitized = DataSanitizer.sanitize('string value');
    expect(sanitized).toBe('string value');
  });
});
```

### 2. Content Type Checker

```javascript
describe('ContentTypeChecker', () => {
  it('should match application/json exactly', () => {
    expect(ContentTypeChecker.shouldCapture('application/json')).toBe(true);
  });

  it('should match application/json with charset', () => {
    expect(ContentTypeChecker.shouldCapture('application/json; charset=utf-8')).toBe(true);
  });

  it('should match application/x-www-form-urlencoded', () => {
    expect(ContentTypeChecker.shouldCapture('application/x-www-form-urlencoded')).toBe(true);
  });

  it('should not match application/octet-stream', () => {
    expect(ContentTypeChecker.shouldCapture('application/octet-stream')).toBe(false);
  });

  it('should not match image/*', () => {
    expect(ContentTypeChecker.shouldCapture('image/png')).toBe(false);
  });

  it('should not match multipart/form-data', () => {
    expect(ContentTypeChecker.shouldCapture('multipart/form-data')).toBe(false);
  });

  it('should be case-insensitive', () => {
    expect(ContentTypeChecker.shouldCapture('Application/JSON')).toBe(true);
  });

  it('should handle missing content-type', () => {
    expect(ContentTypeChecker.shouldCapture(null)).toBe(false);
    expect(ContentTypeChecker.shouldCapture(undefined)).toBe(false);
  });

  it('should use prefix match, not exact', () => {
    expect(ContentTypeChecker.shouldCapture('application/json+ld')).toBe(false); // +ld is different
    expect(ContentTypeChecker.shouldCapture('application/json; boundary=...')).toBe(true);
  });
});
```

### 3. Payload Truncator

```javascript
describe('PayloadTruncator', () => {
  it('should truncate URL to 2KB', () => {
    const url = 'a'.repeat(3000);
    const truncated = PayloadTruncator.truncateUrl(url);
    expect(truncated.length).toBeLessThanOrEqual(2048);
  });

  it('should truncate body to 64KB', () => {
    const body = { data: 'b'.repeat(100000) };
    const truncated = PayloadTruncator.truncateBody(body);
    const jsonSize = JSON.stringify(truncated).length;
    expect(jsonSize).toBeLessThanOrEqual(65536);
  });

  it('should return null if body > 64KB', () => {
    const body = { data: 'c'.repeat(100000) };
    const truncated = PayloadTruncator.truncateBody(body);
    expect(truncated).toBeNull();
  });

  it('should truncate headers to 16KB', () => {
    const headers = { 'large-header': 'd'.repeat(20000) };
    const truncated = PayloadTruncator.truncateHeaders(headers);
    const jsonSize = JSON.stringify(truncated).length;
    expect(jsonSize).toBeLessThanOrEqual(16384);
  });

  it('should return empty object if headers > 16KB', () => {
    const headers = { 'large-header': 'e'.repeat(20000) };
    const truncated = PayloadTruncator.truncateHeaders(headers);
    expect(truncated).toEqual({});
  });

  it('should ignore entire log if total > 256KB', () => {
    const auditLog = {
      ip: 'f'.repeat(200000),
      body: 'g'.repeat(100000)
    };
    const ignored = PayloadTruncator.shouldIgnoreEntireLog(auditLog);
    expect(ignored).toBe(true);
  });

  it('should calculate size as UTF-8 bytes, not char count', () => {
    // multi-byte emoji
    const data = { emoji: '😀'.repeat(1000) };
    const size = PayloadTruncator.getSize(data);
    expect(size).toBeGreaterThan(1000);
  });
});
```

---

## ⚙️ APPLICATION - DETALHADO

### 1. AuditBuffer

```javascript
describe('AuditBuffer', () => {
  it('should add log to buffer', () => {
    const buffer = new AuditBuffer({ maxBatchSize: 500 });
    const log = { ip: '192.168.1.1', url: '/api' };
    buffer.add(log);
    expect(buffer.getSize()).toBe(1);
  });

  it('should maintain insertion order', () => {
    const buffer = new AuditBuffer({ maxBatchSize: 500 });
    buffer.add({ id: 1 });
    buffer.add({ id: 2 });
    buffer.add({ id: 3 });
    const batch = buffer.flush();
    expect(batch[0].id).toBe(1);
    expect(batch[1].id).toBe(2);
    expect(batch[2].id).toBe(3);
  });

  it('should flush when batch size reached', () => {
    const buffer = new AuditBuffer({ maxBatchSize: 2 });
    const flushed = [];
    buffer.on('flush', (batch) => flushed.push(batch));
    
    buffer.add({ id: 1 });
    buffer.add({ id: 2 });
    buffer.add({ id: 3 });
    
    expect(flushed.length).toBe(1);
    expect(flushed[0].length).toBe(2);
  });

  it('should auto-flush after timeout', (done) => {
    const buffer = new AuditBuffer({ flushInterval: 100 });
    const flushed = [];
    buffer.on('flush', (batch) => flushed.push(batch));
    
    buffer.add({ id: 1 });
    
    setTimeout(() => {
      expect(flushed.length).toBe(1);
      done();
    }, 150);
  });

  it('should return remaining logs on flush()', () => {
    const buffer = new AuditBuffer({ maxBatchSize: 5 });
    buffer.add({ id: 1 });
    buffer.add({ id: 2 });
    
    const batch = buffer.flush();
    expect(batch.length).toBe(2);
    expect(buffer.getSize()).toBe(0);
  });

  it('should handle empty flush', () => {
    const buffer = new AuditBuffer();
    const batch = buffer.flush();
    expect(batch).toEqual([]);
  });

  it('should prevent buffer overflow (cap at maxBatchSize)', () => {
    const buffer = new AuditBuffer({ maxBatchSize: 1000, overflowBehavior: 'drop' });
    for (let i = 0; i < 2000; i++) {
      buffer.add({ id: i });
    }
    expect(buffer.getSize()).toBeLessThanOrEqual(1000);
  });

  it('should handle concurrent additions', (done) => {
    const buffer = new AuditBuffer({ maxBatchSize: 100 });
    const promises = [];
    
    for (let i = 0; i < 50; i++) {
      promises.push(Promise.resolve().then(() => {
        buffer.add({ id: i });
      }));
    }
    
    Promise.all(promises).then(() => {
      expect(buffer.getSize()).toBe(50);
      done();
    });
  });

  it('should not allow operations after shutdown', () => {
    const buffer = new AuditBuffer();
    buffer.shutdown();
    expect(() => buffer.add({ id: 1 })).toThrow();
  });

  it('should drain remaining logs before shutdown', () => {
    const buffer = new AuditBuffer();
    let drained = [];
    buffer.on('drain', (batch) => { drained = batch; });
    
    buffer.add({ id: 1 });
    buffer.add({ id: 2 });
    
    buffer.shutdown();
    
    expect(drained.length).toBe(2);
  });
});
```

### 2. SaveAuditLogUseCase

```javascript
describe('SaveAuditLogUseCase', () => {
  it('should add log to buffer (fire-and-forget)', async () => {
    const buffer = new AuditBuffer();
    const useCase = new SaveAuditLogUseCase(buffer);
    
    const data = { ip: '192.168.1.1', url: '/api', statusCode: 200 };
    
    await useCase.execute(data);
    // should complete immediately
    
    expect(buffer.getSize()).toBe(1);
  });

  it('should sanitize before adding to buffer', async () => {
    const buffer = new AuditBuffer();
    const useCase = new SaveAuditLogUseCase(buffer);
    
    const data = { ip: '192.168.1.1', url: '/api', password: 'secret' };
    
    await useCase.execute(data);
    
    const logs = buffer.flush();
    expect(logs[0].password).toBe('********');
  });

  it('should not throw even if buffer is full', async () => {
    const buffer = new AuditBuffer({ maxBatchSize: 1, overflowBehavior: 'drop' });
    const useCase = new SaveAuditLogUseCase(buffer);
    
    buffer.add({ id: 'existing' }); // fill buffer
    
    // should not throw
    await useCase.execute({ ip: '192.168.1.1', url: '/api' });
  });

  it('should validate data before processing', async () => {
    const buffer = new AuditBuffer();
    const useCase = new SaveAuditLogUseCase(buffer);
    
    const invalidData = { ip: '192.168.1.1', statusCode: 600 }; // invalid status
    
    // should throw or handle validation
    await expect(useCase.execute(invalidData)).rejects.toThrow();
  });

  it('should create AuditLog entity from raw data', async () => {
    const capturedLogs = [];
    const buffer = {
      add: (log) => capturedLogs.push(log),
      getSize: () => capturedLogs.length
    };
    const useCase = new SaveAuditLogUseCase(buffer);
    
    const data = { ip: '192.168.1.1', url: '/api', method: 'GET', statusCode: 200 };
    
    await useCase.execute(data);
    
    const entity = capturedLogs[0];
    expect(entity.request_id).toBeDefined();
    expect(entity.anonymous_id).toBeDefined();
    expect(entity.severity).toBe('INFO');
  });
});
```

---

## 🏗️ INFRASTRUCTURE - DETALHADO

### 1. PostgreSQL Connection

```javascript
describe('PostgreSQLConnection', () => {
  it('should connect to PostgreSQL via DATABASE_URL', async () => {
    const conn = new PostgreSQLConnection('postgresql://user:pass@localhost:5432/db');
    await conn.connect();
    expect(conn.isConnected()).toBe(true);
  });

  it('should be a singleton', async () => {
    const conn1 = PostgreSQLConnection.getInstance('postgresql://...');
    const conn2 = PostgreSQLConnection.getInstance('postgresql://...');
    expect(conn1).toBe(conn2);
  });

  it('should support connection pooling', async () => {
    const conn = new PostgreSQLConnection('postgresql://...', { poolSize: 10 });
    await conn.connect();
    // pool should have max 10 connections
  });

  it('should handle connection timeout', async () => {
    const conn = new PostgreSQLConnection('postgresql://invalid', { timeout: 1000 });
    await expect(conn.connect()).rejects.toThrow();
  });

  it('should support connection URL or components', async () => {
    const conn = new PostgreSQLConnection({
      host: 'localhost',
      port: 5432,
      database: 'audit_db',
      user: 'user',
      password: 'pass'
    });
    await conn.connect();
    expect(conn.isConnected()).toBe(true);
  });

  it('should read from .env if no config provided', async () => {
    // process.env.DATABASE_URL = 'postgresql://...'
    const conn = new PostgreSQLConnection();
    await conn.connect();
  });

  it('should fallback to defaults if .env missing', async () => {
    // DATABASE_URL undefined
    // should use defaults (localhost, 5432, etc)
    // but likely fail or warn
  });

  it('should execute query correctly', async () => {
    const conn = await getConnectedPostgreSQL();
    const result = await conn.query('SELECT 1 as num');
    expect(result.rows[0].num).toBe(1);
  });

  it('should support parameterized queries', async () => {
    const conn = await getConnectedPostgreSQL();
    const result = await conn.query(
      'SELECT $1 as val',
      ['test_value']
    );
    expect(result.rows[0].val).toBe('test_value');
  });

  it('should disconnect cleanly', async () => {
    const conn = new PostgreSQLConnection('postgresql://...');
    await conn.connect();
    await conn.disconnect();
    expect(conn.isConnected()).toBe(false);
  });
});
```

### 2. Partition Manager

```javascript
describe('PartitionManager', () => {
  it('should create partition for today', async () => {
    const manager = new PartitionManager(connection);
    await manager.ensureTodayPartition();
    
    const partitionName = `audit_logs_${formatDate(new Date())}`;
    // verify partition exists
  });

  it('should create partition for tomorrow', async () => {
    const manager = new PartitionManager(connection);
    await manager.ensureTomorrowPartition();
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const partitionName = `audit_logs_${formatDate(tomorrow)}`;
    // verify partition exists
  });

  it('should not recreate partition if already exists', async () => {
    const manager = new PartitionManager(connection);
    
    let createCount = 0;
    connection.query = jest.fn(() => {
      if (connection.query.mock.calls.length === 1) {
        createCount++;
      }
      return Promise.resolve();
    });
    
    await manager.ensureTodayPartition();
    await manager.ensureTodayPartition(); // second call
    
    // should only create once
  });

  it('should delete partitions older than 90 days', async () => {
    const manager = new PartitionManager(connection);
    
    // create old partition
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 91);
    
    let deletedPartitions = [];
    connection.query = jest.fn((sql) => {
      if (sql.includes('DROP')) {
        deletedPartitions.push(sql);
      }
      return Promise.resolve();
    });
    
    await manager.deleteOldPartitions(90);
    
    expect(deletedPartitions.length).toBeGreaterThan(0);
  });

  it('should use UTC date for partition naming', async () => {
    const manager = new PartitionManager(connection);
    
    // regardless of timezone
    await manager.ensureTodayPartition();
    
    // partition should be named with UTC date
  });

  it('should handle partition creation failure gracefully', async () => {
    const manager = new PartitionManager(connection);
    
    connection.query = jest.fn(() => Promise.reject(new Error('DB error')));
    
    // should not throw
    await manager.ensureTodayPartition();
  });

  it('should run as singleton job', async () => {
    const manager = new PartitionManager(connection);
    
    const jobId = await manager.scheduleDaily();
    
    // job should run daily at specific time
    expect(jobId).toBeDefined();
  });
});
```

### 3. Batch Worker

```javascript
describe('BatchWorker', () => {
  it('should flush buffer every interval', (done) => {
    const buffer = new AuditBuffer();
    const repository = { insertBatch: jest.fn().mockResolvedValue({ count: 1 }) };
    const worker = new BatchWorker(buffer, repository, { flushInterval: 100 });
    
    buffer.add({ id: 1 });
    
    setTimeout(() => {
      expect(repository.insertBatch).toHaveBeenCalled();
      worker.stop();
      done();
    }, 150);
  });

  it('should wait for inflight insert before flushing again', async () => {
    const buffer = new AuditBuffer();
    let insertCount = 0;
    const repository = {
      insertBatch: jest.fn(() => {
        insertCount++;
        return new Promise(r => setTimeout(() => r({ count: 1 }), 50));
      })
    };
    
    const worker = new BatchWorker(buffer, repository, { flushInterval: 10 });
    
    buffer.add({ id: 1 });
    buffer.add({ id: 2 });
    
    await new Promise(r => setTimeout(r, 200));
    
    // should respect inflight state
    worker.stop();
  });

  it('should retry on insert failure', async () => {
    const buffer = new AuditBuffer();
    let attemptCount = 0;
    const repository = {
      insertBatch: jest.fn(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({ count: 1 });
      })
    };
    
    const worker = new BatchWorker(buffer, repository, { retries: 1 });
    
    buffer.add({ id: 1 });
    
    await new Promise(r => setTimeout(r, 100));
    
    expect(repository.insertBatch).toHaveBeenCalledTimes(2);
    worker.stop();
  });

  it('should activate fallback on persistent failure', async () => {
    const buffer = new AuditBuffer();
    const repository = {
      insertBatch: jest.fn(() => Promise.reject(new Error('DB down')))
    };
    const fallback = { insertBatch: jest.fn().mockResolvedValue({ count: 1 }) };
    
    const worker = new BatchWorker(buffer, repository, { fallbackRepository: fallback, retries: 1 });
    
    buffer.add({ id: 1 });
    
    await new Promise(r => setTimeout(r, 100));
    
    expect(fallback.insertBatch).toHaveBeenCalled();
    worker.stop();
  });

  it('should clear buffer after successful insert', async () => {
    const buffer = new AuditBuffer();
    const repository = { insertBatch: jest.fn().mockResolvedValue({ count: 1 }) };
    
    const worker = new BatchWorker(buffer, repository, { flushInterval: 50 });
    
    buffer.add({ id: 1 });
    expect(buffer.getSize()).toBe(1);
    
    await new Promise(r => setTimeout(r, 100));
    
    // buffer should be empty after flush
    expect(buffer.getSize()).toBe(0);
    worker.stop();
  });

  it('should gracefully shutdown and flush remaining', async () => {
    const buffer = new AuditBuffer();
    const repository = { insertBatch: jest.fn().mockResolvedValue({ count: 1 }) };
    
    const worker = new BatchWorker(buffer, repository);
    
    buffer.add({ id: 1 });
    buffer.add({ id: 2 });
    
    await worker.shutdown();
    
    expect(repository.insertBatch).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 1 }),
      expect.objectContaining({ id: 2 })
    ]));
  });

  it('should not process while shutdown pending', async () => {
    const buffer = new AuditBuffer();
    const repository = { insertBatch: jest.fn().mockResolvedValue({ count: 1 }) };
    
    const worker = new BatchWorker(buffer, repository, { flushInterval: 50 });
    
    buffer.add({ id: 1 });
    
    const shutdownPromise = worker.shutdown();
    buffer.add({ id: 2 }); // should not be processed
    
    await shutdownPromise;
    
    // only first flush should succeed
  });
});
```

### 4. AuditLogRepository (PostgreSQL)

```javascript
describe('AuditLogRepository', () => {
  it('should create audit_logs table if not exists', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const result = await connection.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs')"
    );
    expect(result.rows[0].exists).toBe(true);
  });

  it('should create partitions (TODAY + TOMORROW)', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    // verify partitions created
    const result = await connection.query(
      "SELECT * FROM pg_tables WHERE tablename LIKE 'audit_logs_%'"
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('should insert batch of logs', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const logs = [
      { ip: '192.168.1.1', url: '/api/1', method: 'GET', statusCode: 200, timestamp: new Date() },
      { ip: '192.168.1.2', url: '/api/2', method: 'POST', statusCode: 201, timestamp: new Date() }
    ];
    
    const result = await repo.insertBatch(logs);
    
    expect(result.count).toBe(2);
  });

  it('should use parameterized queries to prevent SQL injection', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const maliciousLog = {
      ip: "192.168.1.1'; DROP TABLE audit_logs; --",
      url: '/api',
      method: 'GET',
      statusCode: 200,
      timestamp: new Date()
    };
    
    // should not throw or execute injection
    await repo.insertBatch([maliciousLog]);
    
    // table should still exist
    const result = await connection.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'audit_logs')"
    );
    expect(result.rows[0].exists).toBe(true);
  });

  it('should insert into correct partition', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const now = new Date();
    const log = {
      ip: '192.168.1.1',
      url: '/api',
      method: 'GET',
      statusCode: 200,
      timestamp: now
    };
    
    await repo.insertBatch([log]);
    
    // verify inserted into today's partition
    const partitionName = `audit_logs_${now.toISOString().split('T')[0].replace(/-/g, '_')}`;
    const result = await connection.query(
      `SELECT COUNT(*) FROM ${partitionName}`
    );
    expect(result.rows[0].count).toBeGreaterThan(0);
  });

  it('should handle JSONB body field correctly', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const log = {
      ip: '192.168.1.1',
      url: '/api',
      method: 'POST',
      statusCode: 200,
      body: { email: 'test@example.com', password: '********' },
      timestamp: new Date()
    };
    
    await repo.insertBatch([log]);
    
    // verify JSONB stored correctly
    const result = await connection.query('SELECT body FROM audit_logs LIMIT 1');
    expect(result.rows[0].body).toEqual(log.body);
  });

  it('should handle JSONB headers field', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const log = {
      ip: '192.168.1.1',
      url: '/api',
      method: 'GET',
      statusCode: 200,
      headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json' },
      timestamp: new Date()
    };
    
    await repo.insertBatch([log]);
    
    const result = await connection.query('SELECT headers FROM audit_logs LIMIT 1');
    expect(result.rows[0].headers).toEqual(log.headers);
  });

  it('should find log by request_id', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const requestId = crypto.randomUUID();
    const log = {
      request_id: requestId,
      ip: '192.168.1.1',
      url: '/api',
      method: 'GET',
      statusCode: 200,
      timestamp: new Date()
    };
    
    await repo.insertBatch([log]);
    
    const found = await repo.findByRequestId(requestId);
    expect(found).toBeDefined();
    expect(found.request_id).toBe(requestId);
  });

  it('should find logs by user_id', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const userId = 'user-123';
    const logs = [
      { user_id: userId, ip: '192.168.1.1', url: '/api/1', method: 'GET', statusCode: 200, timestamp: new Date() },
      { user_id: userId, ip: '192.168.1.2', url: '/api/2', method: 'GET', statusCode: 200, timestamp: new Date() }
    ];
    
    await repo.insertBatch(logs);
    
    const found = await repo.findByUserId(userId);
    expect(found.length).toBe(2);
    expect(found.every(l => l.user_id === userId)).toBe(true);
  });

  it('should find logs by date range', async () => {
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const now = new Date();
    const start = new Date(now.getTime() - 3600000);
    const end = new Date(now.getTime() + 3600000);
    
    const log = {
      ip: '192.168.1.1',
      url: '/api',
      method: 'GET',
      statusCode: 200,
      timestamp: now
    };
    
    await repo.insertBatch([log]);
    
    const found = await repo.findByDateRange(start, end);
    expect(found.length).toBeGreaterThan(0);
  });

  it('should use index for timestamp queries', async () => {
    // verify EXPLAIN PLAN uses idx_audit_logs_timestamp
    const repo = new AuditLogRepository(connection);
    await repo.initTable();
    
    const plan = await connection.query(
      `EXPLAIN SELECT * FROM audit_logs WHERE timestamp > NOW() - INTERVAL '1 hour'`
    );
    
    expect(plan.rows[0]['QUERY PLAN']).toContain('Index');
  });
});
```

### 5. Daily Summary Job

```javascript
describe('DailySummaryJob', () => {
  it('should calculate total_requests', async () => {
    const job = new DailySummaryJob(connection);
    
    // insert 5 logs with today's timestamp
    const logs = Array(5).fill(null).map((_, i) => ({
      ip: `192.168.1.${i}`,
      url: '/api',
      method: 'GET',
      statusCode: 200,
      timestamp: new Date()
    }));
    
    await insertTestLogs(logs);
    
    await job.run();
    
    const result = await connection.query('SELECT total_requests FROM daily_summary WHERE date = CURRENT_DATE');
    expect(result.rows[0].total_requests).toBe(5);
  });

  it('should calculate avg_duration_ms', async () => {
    const job = new DailySummaryJob(connection);
    
    const logs = [
      { ip: '192.168.1.1', duration_ms: 100, statusCode: 200, timestamp: new Date() },
      { ip: '192.168.1.2', duration_ms: 200, statusCode: 200, timestamp: new Date() },
      { ip: '192.168.1.3', duration_ms: 300, statusCode: 200, timestamp: new Date() }
    ];
    
    await insertTestLogs(logs);
    await job.run();
    
    const result = await connection.query('SELECT avg_duration_ms FROM daily_summary WHERE date = CURRENT_DATE');
    expect(result.rows[0].avg_duration_ms).toBeCloseTo(200, 0);
  });

  it('should count errors (5xx)', async () => {
    const job = new DailySummaryJob(connection);
    
    const logs = [
      { ip: '192.168.1.1', statusCode: 200, timestamp: new Date() },
      { ip: '192.168.1.2', statusCode: 500, timestamp: new Date() },
      { ip: '192.168.1.3', statusCode: 502, timestamp: new Date() }
    ];
    
    await insertTestLogs(logs);
    await job.run();
    
    const result = await connection.query('SELECT error_count FROM daily_summary WHERE date = CURRENT_DATE');
    expect(result.rows[0].error_count).toBe(2);
  });

  it('should count unauthorized (401/403)', async () => {
    const job = new DailySummaryJob(connection);
    
    const logs = [
      { ip: '192.168.1.1', statusCode: 401, timestamp: new Date() },
      { ip: '192.168.1.2', statusCode: 403, timestamp: new Date() },
      { ip: '192.168.1.3', statusCode: 200, timestamp: new Date() }
    ];
    
    await insertTestLogs(logs);
    await job.run();
    
    const result = await connection.query('SELECT unauthorized_count FROM daily_summary WHERE date = CURRENT_DATE');
    expect(result.rows[0].unauthorized_count).toBe(2);
  });

  it('should count unique IPs', async () => {
    const job = new DailySummaryJob(connection);
    
    const logs = [
      { ip: '192.168.1.1', statusCode: 200, timestamp: new Date() },
      { ip: '192.168.1.1', statusCode: 200, timestamp: new Date() },
      { ip: '192.168.1.2', statusCode: 200, timestamp: new Date() }
    ];
    
    await insertTestLogs(logs);
    await job.run();
    
    const result = await connection.query('SELECT unique_ips FROM daily_summary WHERE date = CURRENT_DATE');
    expect(result.rows[0].unique_ips).toBe(2);
  });

  it('should generate insights JSONB', async () => {
    const job = new DailySummaryJob(connection);
    
    await insertTestLogs([{ ip: '192.168.1.1', statusCode: 200, timestamp: new Date() }]);
    await job.run();
    
    const result = await connection.query('SELECT insights FROM daily_summary WHERE date = CURRENT_DATE');
    expect(result.rows[0].insights).toBeDefined();
    expect(typeof result.rows[0].insights).toBe('object');
  });

  it('should run only once per day', async () => {
    const job = new DailySummaryJob(connection);
    
    await job.run();
    const result1 = await connection.query('SELECT COUNT(*) FROM daily_summary WHERE date = CURRENT_DATE');
    
    await job.run(); // second run
    const result2 = await connection.query('SELECT COUNT(*) FROM daily_summary WHERE date = CURRENT_DATE');
    
    expect(result1.rows[0].count).toBe(result2.rows[0].count); // should not duplicate
  });

  it('should handle no logs for day gracefully', async () => {
    const job = new DailySummaryJob(connection);
    
    await job.run();
    
    const result = await connection.query('SELECT COUNT(*) FROM daily_summary WHERE date = CURRENT_DATE');
    // should not fail, might insert 0 or not insert at all
  });
});
```

### 6. Anomaly Detector

```javascript
describe('AnomalyDetector', () => {
  it('should detect force brute attacks (>100 401/403 per IP)', async () => {
    const detector = new AnomalyDetector(connection);
    
    // insert 101 failed auth attempts from one IP
    const logs = Array(101).fill(null).map((_, i) => ({
      ip: '192.168.1.1',
      statusCode: 401,
      timestamp: new Date()
    }));
    
    await insertTestLogs(logs);
    
    const anomalies = await detector.detectForcebrute();
    
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].ip).toBe('192.168.1.1');
    expect(anomalies[0].count).toBeGreaterThan(100);
  });

  it('should detect rate abuse (>100 req/min per IP)', async () => {
    const detector = new AnomalyDetector(connection);
    
    // insert 101 requests from one IP in 1 minute
    const now = new Date();
    const logs = Array(101).fill(null).map((_, i) => ({
      ip: '192.168.1.1',
      statusCode: 200,
      timestamp: new Date(now.getTime() - (30 * 1000)) // within 1 min window
    }));
    
    await insertTestLogs(logs);
    
    const anomalies = await detector.detectRateAbuse();
    
    expect(anomalies.length).toBe(1);
    expect(anomalies[0].ip).toBe('192.168.1.1');
  });

  it('should detect error spike (>30% of requests are 5xx)', async () => {
    const detector = new AnomalyDetector(connection);
    
    const logs = [
      ...Array(10).fill(null).map(() => ({ statusCode: 500, timestamp: new Date() })),
      ...Array(20).fill(null).map(() => ({ statusCode: 200, timestamp: new Date() }))
    ];
    
    await insertTestLogs(logs);
    
    const anomalies = await detector.detectErrorSpike();
    
    expect(anomalies.length).toBeGreaterThan(0);
  });

  it('should save anomalies to insights JSONB', async () => {
    const detector = new AnomalyDetector(connection);
    
    const logs = Array(101).fill(null).map(() => ({
      ip: '192.168.1.1',
      statusCode: 401,
      timestamp: new Date()
    }));
    
    await insertTestLogs(logs);
    
    await detector.saveAnomalies();
    
    const result = await connection.query('SELECT insights FROM daily_summary');
    expect(result.rows[0].insights.suspicious_ips).toBeDefined();
  });
});
```

---

## 🌐 MIDDLEWARE - DETALHADO

### 1. Request Data Extractor

```javascript
describe('RequestDataExtractor', () => {
  it('should extract all required fields from request', () => {
    const req = {
      method: 'GET',
      url: '/api/users',
      headers: { 'user-agent': 'Mozilla/5.0' }
    };
    
    const res = {
      statusCode: 200
    };
    
    const data = RequestDataExtractor.extract(req, res, 100);
    
    expect(data).toHaveProperty('method', 'GET');
    expect(data).toHaveProperty('url', '/api/users');
    expect(data).toHaveProperty('statusCode', 200);
    expect(data).toHaveProperty('duration_ms', 100);
  });

  it('should extract IP with priority order', () => {
    const req = {
      headers: { 'x-forwarded-for': '203.0.113.42, 192.168.1.1' },
      socket: { remoteAddress: '10.0.0.1' }
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.ip).toBe('203.0.113.42');
  });

  it('should extract user ID with priority order', () => {
    const req = {
      headers: { 'x-user-id': 'header-user' },
      user: { id: 'auth-user' },
      locals: { userId: 'locals-user' }
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.userId).toBe('header-user');
  });

  it('should capture body for POST with json content-type', () => {
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: { email: 'test@example.com', password: '********' }
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.body).toEqual(req.body);
  });

  it('should not capture body for GET', () => {
    const req = {
      method: 'GET',
      headers: {},
      body: { ignored: 'data' }
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.body).toBeUndefined();
  });

  it('should extract whitelist of headers', () => {
    const req = {
      method: 'GET',
      headers: {
        'user-agent': 'Mozilla/5.0',
        'authorization': 'Bearer token123', // should NOT be captured
        'accept': 'application/json'
      }
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.headers['user-agent']).toBeDefined();
    expect(data.headers['accept']).toBeDefined();
    expect(data.headers['authorization']).toBeUndefined();
  });

  it('should normalize header keys to lowercase', () => {
    const req = {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.headers['user-agent']).toBeDefined();
    expect(data.headers['User-Agent']).toBeUndefined();
  });

  it('should truncate large body to 64KB', () => {
    const largeBody = { data: 'x'.repeat(100000) };
    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: largeBody
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.body).toBeNull();
  });

  it('should truncate URL to 2KB', () => {
    const req = {
      method: 'GET',
      url: '/api/' + 'a'.repeat(3000),
      headers: {}
    };
    
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.url.length).toBeLessThanOrEqual(2048);
  });

  it('should generate UUID v4 request_id', () => {
    const req = { method: 'GET', headers: {} };
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.request_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('should use request_id from header if provided', () => {
    const req = {
      method: 'GET',
      headers: { 'x-request-id': 'external-uuid-1234' }
    };
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.request_id).toBe('external-uuid-1234');
  });

  it('should extract user_agent from headers', () => {
    const req = {
      method: 'GET',
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    };
    const res = { statusCode: 200 };
    
    const data = RequestDataExtractor.extract(req, res, 0);
    
    expect(data.user_agent).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  });
});
```

### 2. Express Middleware

```javascript
describe('ExpressMiddleware', () => {
  it('should attach to express app', () => {
    const app = express();
    const middleware = new ExpressAuditMiddleware(useCase);
    
    app.use(middleware.attach());
    
    expect(app._router.stack.some(l => l.name === 'audit')).toBe(true);
  });

  it('should capture request start time', (done) => {
    const app = express();
    const middleware = new ExpressAuditMiddleware(useCase);
    
    app.use(middleware.attach());
    
    app.get('/test', (req, res) => {
      expect(req._startTime).toBeDefined();
      res.send('OK');
    });
    
    request(app).get('/test').end(done);
  });

  it('should call next() immediately (non-blocking)', (done) => {
    const app = express();
    const middleware = new ExpressAuditMiddleware(useCase);
    
    let nextCalled = false;
    app.use(middleware.attach());
    app.get('/test', (req, res) => {
      expect(nextCalled).toBe(true);
      res.send('OK');
    });
    
    // middleware should call next before waiting
    request(app).get('/test').end(done);
  });

  it('should send data to use case after response', (done) => {
    const app = express();
    const useCaseSpy = jest.fn().mockResolvedValue({});
    const middleware = new ExpressAuditMiddleware(useCaseSpy);
    
    app.use(middleware.attach());
    app.get('/test', (req, res) => {
      res.send('OK');
    });
    
    request(app).get('/test').end(() => {
      // wait for async execution
      setTimeout(() => {
        expect(useCaseSpy).toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  it('should not block request if audit fails', (done) => {
    const app = express();
    const useCaseSpy = jest.fn().mockRejectedValue(new Error('Audit failed'));
    const middleware = new ExpressAuditMiddleware(useCaseSpy);
    
    app.use(middleware.attach());
    app.get('/test', (req, res) => {
      res.send('OK');
    });
    
    request(app)
      .get('/test')
      .expect(200) // should still return 200
      .end(done);
  });

  it('should calculate duration correctly', (done) => {
    const app = express();
    let capturedDuration = null;
    const useCaseSpy = jest.fn(async (data) => {
      capturedDuration = data.duration_ms;
      return {};
    });
    const middleware = new ExpressAuditMiddleware(useCaseSpy);
    
    app.use(middleware.attach());
    app.get('/test', (req, res) => {
      setTimeout(() => res.send('OK'), 100);
    });
    
    request(app).get('/test').end(() => {
      setTimeout(() => {
        expect(capturedDuration).toBeGreaterThanOrEqual(100);
        done();
      }, 50);
    });
  });
});
```

---

## 🔥 EDGE CASES

```javascript
describe('Edge Cases - Critical', () => {
  it('should handle empty request body', () => {
    const data = RequestDataExtractor.extract(
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: {} },
      { statusCode: 200 },
      0
    );
    expect(data.body).toEqual({});
  });

  it('should handle null headers', () => {
    const data = RequestDataExtractor.extract(
      { method: 'GET', headers: null },
      { statusCode: 200 },
      0
    );
    expect(data).toBeDefined();
  });

  it('should handle request without IP', () => {
    const ip = IpExtractor.extract({}, {});
    expect(ip).toBe('UNKNOWN');
  });

  it('should handle invalid JSON in body', () => {
    // should not throw
    const data = RequestDataExtractor.extract(
      { method: 'POST', body: 'invalid json' },
      { statusCode: 200 },
      0
    );
    expect(data).toBeDefined();
  });

  it('should handle gigantic payload (>256KB total log)', () => {
    const data = {
      body: 'x'.repeat(200000),
      headers: 'y'.repeat(200000)
    };
    
    const shouldIgnore = PayloadTruncator.shouldIgnoreEntireLog(data);
    expect(shouldIgnore).toBe(true);
  });

  it('should handle buffer overflow (max 1000 pending)', () => {
    const buffer = new AuditBuffer({ maxBatchSize: 1000, overflowBehavior: 'drop' });
    
    for (let i = 0; i < 2000; i++) {
      buffer.add({ id: i });
    }
    
    expect(buffer.getSize()).toBeLessThanOrEqual(1000);
  });

  it('should handle partition doesn\'t exist on INSERT', async () => {
    const repo = new AuditLogRepository(connection);
    
    // try to insert with future timestamp (partition doesn't exist)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 10);
    
    const log = {
      ip: '192.168.1.1',
      url: '/api',
      statusCode: 200,
      timestamp: futureDate
    };
    
    // should not throw (partition manager creates it)
    await repo.insertBatch([log]);
  });

  it('should handle worker crash during flush', async () => {
    const buffer = new AuditBuffer();
    const repository = {
      insertBatch: jest.fn(() => {
        throw new Error('Worker crashed');
      })
    };
    
    const worker = new BatchWorker(buffer, repository, { fallbackRepository: fallback });
    
    buffer.add({ id: 1 });
    
    // should activate fallback, not throw
    await new Promise(r => setTimeout(r, 100));
  });

  it('should handle concurrent shutdown() calls', async () => {
    const buffer = new AuditBuffer();
    const worker = new BatchWorker(buffer, repository);
    
    // call shutdown twice simultaneously
    const p1 = worker.shutdown();
    const p2 = worker.shutdown();
    
    // should not throw
    await Promise.all([p1, p2]);
  });

  it('should handle very old timestamp (>31 days)', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 40);
    
    const data = { ip: '192.168.1.1', timestamp: oldDate };
    
    expect(() => AuditLog.create(data)).toThrow();
  });

  it('should handle future timestamp (clock skew)', () => {
    const futureDate = new Date();
    futureDate.setSeconds(futureDate.getSeconds() + 10);
    
    const data = { ip: '192.168.1.1', timestamp: futureDate };
    
    expect(() => AuditLog.create(data)).toThrow();
  });

  it('should handle circular references in sanitization', () => {
    const data = { password: 'secret' };
    data.self = data;
    
    // should not hang
    const sanitized = DataSanitizer.sanitize(data);
    expect(sanitized.password).toBe('********');
  });

  it('should handle UTF-8 multibyte chars in truncation', () => {
    const emoji = '😀'.repeat(1000); // ~4KB
    const body = { data: emoji };
    
    const truncated = PayloadTruncator.truncateBody(body);
    
    const size = JSON.stringify(truncated).length;
    expect(size).toBeLessThanOrEqual(65536);
  });

  it('should handle database connection timeout', async () => {
    const conn = new PostgreSQLConnection('postgresql://invalid', { timeout: 100 });
    
    // should not throw forever
    const result = await Promise.race([
      conn.connect(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout')), 500))
    ]);
  });

  it('should handle fallback file permission error', async () => {
    const fallback = new FallbackRepository('/root/audit-fallback.json'); // no permission
    
    // should not throw, just log error
    await fallback.save({
      ip: '192.168.1.1',
      url: '/api',
      statusCode: 200
    });
  });
});
```

---

## 📊 PERFORMANCE / STRESS

```javascript
describe('Performance & Load', () => {
  it('should handle 1000 concurrent requests', async () => {
    const buffer = new AuditBuffer({ maxBatchSize: 500 });
    
    const promises = Array(1000).fill(null).map((_, i) => {
      return Promise.resolve().then(() => {
        buffer.add({ id: i, ip: `192.168.${i % 255}.${i % 255}` });
      });
    });
    
    await Promise.all(promises);
    
    expect(buffer.getSize()).toBeLessThanOrEqual(1000);
  });

  it('should batch insert 500 logs in < 100ms', async () => {
    const repo = new AuditLogRepository(connection);
    
    const logs = Array(500).fill(null).map((_, i) => ({
      id: i,
      ip: `192.168.${i}.1`,
      url: '/api',
      statusCode: 200,
      timestamp: new Date()
    }));
    
    const start = Date.now();
    await repo.insertBatch(logs);
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(100);
  });

  it('should aggregate daily log of 100k rows in < 500ms', async () => {
    const job = new DailySummaryJob(connection);
    
    // insert 100k logs
    const logs = Array(100000).fill(null).map((_, i) => ({
      ip: `192.168.${i % 255}.${i % 255}`,
      statusCode: [200, 200, 400, 500][i % 4],
      timestamp: new Date()
    }));
    
    await insertTestLogsInBatch(logs, 1000);
    
    const start = Date.now();
    await job.run();
    const duration = Date.now() - start;
    
    expect(duration).toBeLessThan(500);
  });

  it('should memory not grow unbounded with buffer', async () => {
    const buffer = new AuditBuffer({ maxBatchSize: 100, flushInterval: 50 });
    const repository = { insertBatch: jest.fn().mockResolvedValue({}) };
    const worker = new BatchWorker(buffer, repository);
    
    const initialMemory = process.memoryUsage().heapUsed;
    
    for (let i = 0; i < 10000; i++) {
      buffer.add({ id: i, data: 'x'.repeat(100) });
      if (i % 100 === 0) {
        await new Promise(r => setTimeout(r, 10));
      }
    }
    
    await worker.shutdown();
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    
    // should not grow more than 10MB
    expect(memoryGrowth).toBeLessThan(10 * 1024 * 1024);
  });
});
```

---

## 🎯 COVERAGE TARGETS

- **Domain**: 95%+
- **Utils**: 90%+
- **Application**: 85%+
- **Infrastructure**: 85%+
- **Adapters**: 80%+
- **Integration**: 75%+
- **Overall**: 85%+

---

## ✅ TODOS FOR IMPLEMENTATION

- [ ] Set up Vitest configuration
- [ ] Implement all domain entities & services
- [ ] Implement all utils (sanitizer, extractor, etc)
- [ ] Implement application layer (use case, buffer)
- [ ] Implement infrastructure (connection, repository)
- [ ] Implement aggregation & anomaly detection
- [ ] Implement middleware (Express)
- [ ] Run all 150+ tests
- [ ] Achieve 85%+ coverage
- [ ] Document any deviations from spec

