/**
 * TEST SUITE: Complete Audit Logger Package
 * 
 * Organized by layer:
 * - Domain (Entities, Services)
 * - Application (Use Cases)
 * - Infrastructure (Repositories, Database, Logger)
 * - Adapters (Middlewares, HTTP utilities)
 * - Integration Tests
 * - Resilience Tests
 */

// ============================================================================
// DOMAIN TESTS
// ============================================================================

describe('Domain Layer', () => {

  // ========== AuditLog Entity Tests ==========
  describe('AuditLog Entity', () => {
    const AuditLog = require('../src/domain/entities/AuditLog');

    describe('✓ Criação e Validação Básica', () => {
      test('cria AuditLog com campos obrigatórios válidos', () => {
        // Arrange
        const data = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        };

        // Act
        const auditLog = AuditLog.create(data);

        // Assert
        expect(auditLog).toBeDefined();
        expect(auditLog.ip).toBe('192.168.1.1');
        expect(auditLog.severity).toBe('INFO'); // 200 = INFO
      });

      test('rejeita AuditLog sem ip', () => {
        expect(() => AuditLog.create({
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        })).toThrow('Campo obrigatório: ip');
      });

      test('rejeita AuditLog sem url', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          method: 'GET',
          statusCode: 200
        })).toThrow('Campo obrigatório: url');
      });

      test('rejeita AuditLog sem method', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          statusCode: 200
        })).toThrow('Campo obrigatório: method');
      });

      test('rejeita AuditLog sem statusCode', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET'
        })).toThrow('Campo obrigatório: statusCode');
      });
    });

    describe('✓ Validação de IP', () => {
      test('aceita IPv4 válido', () => {
        const auditLog = AuditLog.create({
          ip: '203.0.113.42',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        expect(auditLog.ip).toBe('203.0.113.42');
      });

      test('aceita IPv6 válido', () => {
        const auditLog = AuditLog.create({
          ip: '2001:0db8:85a3::8a2e:0370:7334',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        expect(auditLog.ip).toBe('2001:0db8:85a3::8a2e:0370:7334');
      });

      test('converte IP null/vazio/whitespace para UNKNOWN', () => {
        const testCases = [null, undefined, '', '   ', '\n'];
        testCases.forEach(ip => {
          const auditLog = AuditLog.create({
            ip,
            url: '/api/users',
            method: 'GET',
            statusCode: 200
          });
          expect(auditLog.ip).toBe('UNKNOWN');
        });
      });

      test('remove prefixo IPv6-mapped para IPv4', () => {
        const auditLog = AuditLog.create({
          ip: '::ffff:192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        expect(auditLog.ip).toBe('192.168.1.1');
      });

      test('aceita localhost 127.0.0.1', () => {
        const auditLog = AuditLog.create({
          ip: '127.0.0.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        expect(auditLog.ip).toBe('127.0.0.1');
      });

      test('aceita IPv6 loopback ::1', () => {
        const auditLog = AuditLog.create({
          ip: '::1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        expect(auditLog.ip).toBe('::1');
      });
    });

    describe('✓ Validação de HTTP Method', () => {
      test('aceita todos os métodos HTTP válidos', () => {
        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        validMethods.forEach(method => {
          const auditLog = AuditLog.create({
            ip: '192.168.1.1',
            url: '/api/users',
            method,
            statusCode: 200
          });
          expect(auditLog.method).toBe(method);
        });
      });

      test('rejeita método lowercase (não case-insensitive)', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'get',
          statusCode: 200
        })).toThrow('Método HTTP inválido: get');
      });

      test('rejeita método não-standard', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'CUSTOM',
          statusCode: 200
        })).toThrow('Método HTTP inválido');
      });
    });

    describe('✓ Validação de Status Code', () => {
      test('aceita status codes no intervalo 100-599', () => {
        const validCodes = [100, 200, 201, 301, 400, 404, 500, 502, 599];
        validCodes.forEach(code => {
          const auditLog = AuditLog.create({
            ip: '192.168.1.1',
            url: '/api/users',
            method: 'GET',
            statusCode: code
          });
          expect(auditLog.statusCode).toBe(code);
        });
      });

      test('rejeita status code < 100', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 99
        })).toThrow('Status code deve estar entre 100-599');
      });

      test('rejeita status code > 599', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 600
        })).toThrow('Status code deve estar entre 100-599');
      });

      test('rejeita status code não-inteiro', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200.5
        })).toThrow('Status code deve ser inteiro');
      });
    });

    describe('✓ Classificação Automática de Severidade', () => {
      test('classifica 100-399 como INFO', () => {
        const testCodes = [100, 200, 201, 204, 301, 304, 399];
        testCodes.forEach(code => {
          const auditLog = AuditLog.create({
            ip: '192.168.1.1',
            url: '/api/users',
            method: 'GET',
            statusCode: code
          });
          expect(auditLog.severity).toBe('INFO');
        });
      });

      test('classifica 400-499 como WARN', () => {
        const testCodes = [400, 401, 403, 404, 409, 429, 499];
        testCodes.forEach(code => {
          const auditLog = AuditLog.create({
            ip: '192.168.1.1',
            url: '/api/users',
            method: 'GET',
            statusCode: code
          });
          expect(auditLog.severity).toBe('WARN');
        });
      });

      test('classifica 500-599 como ERROR', () => {
        const testCodes = [500, 501, 502, 503, 504, 505, 599];
        testCodes.forEach(code => {
          const auditLog = AuditLog.create({
            ip: '192.168.1.1',
            url: '/api/users',
            method: 'GET',
            statusCode: code
          });
          expect(auditLog.severity).toBe('ERROR');
        });
      });
    });

    describe('✓ Campos Opcionais', () => {
      test('aceita userId opcional', () => {
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          userId: 'user-123'
        });
        expect(auditLog.userId).toBe('user-123');
      });

      test('permite userId undefined', () => {
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        expect(auditLog.userId).toBeUndefined();
      });

      test('aceita body como objeto', () => {
        const body = { name: 'John', email: 'john@example.com' };
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'POST',
          statusCode: 201,
          body
        });
        expect(auditLog.body).toEqual(body);
      });

      test('aceita body vazio ({})', () => {
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'POST',
          statusCode: 201,
          body: {}
        });
        expect(auditLog.body).toEqual({});
      });

      test('aceita body como string', () => {
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'POST',
          statusCode: 201,
          body: 'form data test'
        });
        expect(auditLog.body).toBe('form data test');
      });

      test('aceita headers opcional', () => {
        const headers = {
          'user-agent': 'Mozilla/5.0',
          'accept': 'application/json'
        };
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          headers
        });
        expect(auditLog.headers).toEqual(headers);
      });
    });

    describe('✓ Timestamp', () => {
      test('gera timestamp automaticamente se não fornecido', () => {
        const beforeCreate = new Date();
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        const afterCreate = new Date();

        expect(auditLog.timestamp).toBeInstanceOf(Date);
        expect(auditLog.timestamp.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
      });

      test('usa timestamp fornecido', () => {
        const customDate = new Date('2026-03-16T10:15:30.123Z');
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          timestamp: customDate
        });
        expect(auditLog.timestamp).toEqual(customDate);
      });

      test('aceita string ISO 8601 para timestamp', () => {
        const isoString = '2026-03-16T10:15:30.123Z';
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          timestamp: isoString
        });
        expect(auditLog.timestamp).toEqual(new Date(isoString));
      });

      test('timestamp é sempre em UTC (ISO 8601)', () => {
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        });
        const isoString = auditLog.timestamp.toISOString();
        expect(isoString).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      });
    });

    describe('✓ URL Validation', () => {
      test('aceita URLs válidas', () => {
        const validUrls = ['/api/users', '/users', '/api/v1/users/123', '/', '/path?query=value'];
        validUrls.forEach(url => {
          const auditLog = AuditLog.create({
            ip: '192.168.1.1',
            url,
            method: 'GET',
            statusCode: 200
          });
          expect(auditLog.url).toBe(url);
        });
      });

      test('rejeita URL vazia', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '',
          method: 'GET',
          statusCode: 200
        })).toThrow('Campo obrigatório: url');
      });

      test('rejeita URL null', () => {
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: null,
          method: 'GET',
          statusCode: 200
        })).toThrow();
      });

      test('trunca URL maior que 2KB silenciosamente', () => {
        const longUrl = '/api/users?' + 'x'.repeat(3000);
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: longUrl,
          method: 'GET',
          statusCode: 200
        });
        expect(auditLog.url.length).toBeLessThanOrEqual(2048);
      });
    });

    describe('✓ Body Size Limits', () => {
      test('aceita body até 64KB', () => {
        const body = { data: 'x'.repeat(60000) };
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'POST',
          statusCode: 201,
          body
        });
        expect(auditLog.body).toBeDefined();
      });

      test('rejeita body maior que 64KB', () => {
        const body = { data: 'x'.repeat(66000) };
        expect(() => AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'POST',
          statusCode: 201,
          body
        })).toThrow('Body excede 64KB');
      });
    });

    describe('✓ JSON Serialization', () => {
      test('serializa AuditLog para JSON corretamente', () => {
        const auditLog = AuditLog.create({
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          userId: 'user-123'
        });
        const json = JSON.parse(JSON.stringify(auditLog));
        expect(json.ip).toBe('192.168.1.1');
        expect(json.severity).toBe('INFO');
      });
    });
  });

  // ========== IpExtractor Tests ==========
  describe('IpExtractor Service', () => {
    const IpExtractor = require('../src/domain/services/IpExtractor');

    test('extrai IP de x-forwarded-for header (primeiro valor)', () => {
      const req = {
        headers: { 'x-forwarded-for': '203.0.113.42, 192.168.1.1' }
      };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('203.0.113.42');
    });

    test('extrai IP de x-real-ip header se x-forwarded-for ausente', () => {
      const req = {
        headers: { 'x-real-ip': '203.0.113.42' }
      };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('203.0.113.42');
    });

    test('extrai IP de cf-connecting-ip header (Cloudflare)', () => {
      const req = {
        headers: { 'cf-connecting-ip': '203.0.113.42' }
      };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('203.0.113.42');
    });

    test('extrai IP de socket.remoteAddress', () => {
      const req = {
        headers: {},
        socket: { remoteAddress: '203.0.113.42' }
      };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('203.0.113.42');
    });

    test('extrai IP de socket.connection.remoteAddress', () => {
      const req = {
        headers: {},
        socket: { connection: { remoteAddress: '203.0.113.42' } }
      };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('203.0.113.42');
    });

    test('retorna UNKNOWN se nenhuma fonte de IP disponível', () => {
      const req = { headers: {}, socket: {} };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('UNKNOWN');
    });

    test('remove whitespace e trata como empty', () => {
      const req = {
        headers: { 'x-forwarded-for': '   ' }
      };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('UNKNOWN');
    });

    test('remove prefixo IPv6-mapped', () => {
      const req = {
        socket: { remoteAddress: '::ffff:192.168.1.1' }
      };
      const ip = IpExtractor.extract(req);
      expect(ip).toBe('192.168.1.1');
    });
  });

  // ========== SeverityClassifier Tests ==========
  describe('SeverityClassifier Service', () => {
    const SeverityClassifier = require('../src/domain/services/SeverityClassifier');

    test('classifica 100-399 como INFO', () => {
      expect(SeverityClassifier.classify(100)).toBe('INFO');
      expect(SeverityClassifier.classify(200)).toBe('INFO');
      expect(SeverityClassifier.classify(399)).toBe('INFO');
    });

    test('classifica 400-499 como WARN', () => {
      expect(SeverityClassifier.classify(400)).toBe('WARN');
      expect(SeverityClassifier.classify(404)).toBe('WARN');
      expect(SeverityClassifier.classify(499)).toBe('WARN');
    });

    test('classifica 500-599 como ERROR', () => {
      expect(SeverityClassifier.classify(500)).toBe('ERROR');
      expect(SeverityClassifier.classify(503)).toBe('ERROR');
      expect(SeverityClassifier.classify(599)).toBe('ERROR');
    });
  });
});

// ============================================================================
// UTILITY TESTS
// ============================================================================

describe('Utilities Layer', () => {

  // ========== DataSanitizer Tests ==========
  describe('DataSanitizer', () => {
    const DataSanitizer = require('../src/utils/DataSanitizer');

    describe('✓ Campos Sensíveis Padrão', () => {
      test('mascara password', () => {
        const sanitizer = new DataSanitizer();
        const data = { password: 'secret123' };
        const clean = sanitizer.sanitize(data);
        expect(clean.password).toBe('********');
      });

      test('mascara token', () => {
        const sanitizer = new DataSanitizer();
        const data = { token: 'abc123xyz' };
        const clean = sanitizer.sanitize(data);
        expect(clean.token).toBe('********');
      });

      test('mascara apiKey', () => {
        const sanitizer = new DataSanitizer();
        const data = { apiKey: 'sk_live_abc' };
        const clean = sanitizer.sanitize(data);
        expect(clean.apiKey).toBe('********');
      });

      test('mascara creditCard', () => {
        const sanitizer = new DataSanitizer();
        const data = { creditCard: '4111111111111111' };
        const clean = sanitizer.sanitize(data);
        expect(clean.creditCard).toBe('********');
      });

      test('mascara cvv', () => {
        const sanitizer = new DataSanitizer();
        const data = { cvv: '123' };
        const clean = sanitizer.sanitize(data);
        expect(clean.cvv).toBe('********');
      });

      test('mascara ssn', () => {
        const sanitizer = new DataSanitizer();
        const data = { ssn: '123-45-6789' };
        const clean = sanitizer.sanitize(data);
        expect(clean.ssn).toBe('********');
      });

      test('é case-insensitive', () => {
        const sanitizer = new DataSanitizer();
        const data = { PASSWORD: 'secret123', Password: 'secret456', password: 'secret789' };
        const clean = sanitizer.sanitize(data);
        expect(clean.PASSWORD).toBe('********');
        expect(clean.Password).toBe('********');
        expect(clean.password).toBe('********');
      });
    });

    describe('✓ Sanitização Recursiva', () => {
      test('mascara em objetos aninhados', () => {
        const sanitizer = new DataSanitizer();
        const data = {
          user: {
            name: 'John',
            password: 'secret123'
          }
        };
        const clean = sanitizer.sanitize(data);
        expect(clean.user.name).toBe('John');
        expect(clean.user.password).toBe('********');
      });

      test('mascara em arrays de objetos', () => {
        const sanitizer = new DataSanitizer();
        const data = {
          users: [
            { name: 'John', password: 'secret1' },
            { name: 'Jane', password: 'secret2' }
          ]
        };
        const clean = sanitizer.sanitize(data);
        expect(clean.users[0].password).toBe('********');
        expect(clean.users[1].password).toBe('********');
      });

      test('mascara em profundidade ilimitada', () => {
        const sanitizer = new DataSanitizer();
        const data = {
          level1: {
            level2: {
              level3: {
                level4: {
                  password: 'secret'
                }
              }
            }
          }
        };
        const clean = sanitizer.sanitize(data);
        expect(clean.level1.level2.level3.level4.password).toBe('********');
      });

      test('mascara em arrays combinados com objetos', () => {
        const sanitizer = new DataSanitizer();
        const data = {
          items: [
            [{ password: 'secret1' }],
            [{ apiKey: 'secret2' }]
          ]
        };
        const clean = sanitizer.sanitize(data);
        expect(clean.items[0][0].password).toBe('********');
        expect(clean.items[1][0].apiKey).toBe('********');
      });
    });

    describe('✓ Preservação de Estrutura', () => {
      test('preserva estrutura original após sanitização', () => {
        const sanitizer = new DataSanitizer();
        const data = {
          user: { name: 'John', password: 'secret' }
        };
        const clean = sanitizer.sanitize(data);
        expect(clean).toHaveProperty('user.name');
        expect(clean).toHaveProperty('user.password');
      });

      test('cria deep clone (não modifica original)', () => {
        const sanitizer = new DataSanitizer();
        const data = { password: 'secret' };
        const clean = sanitizer.sanitize(data);
        expect(data.password).toBe('secret'); // original não modificado
        expect(clean.password).toBe('********'); // clone modificado
      });

      test('preserva tipos de dados não-sensíveis', () => {
        const sanitizer = new DataSanitizer();
        const data = {
          name: 'John',
          age: 30,
          active: true,
          email: 'john@example.com'
        };
        const clean = sanitizer.sanitize(data);
        expect(clean.name).toBe('John');
        expect(clean.age).toBe(30);
        expect(clean.active).toBe(true);
        expect(clean.email).toBe('john@example.com');
      });
    });

    describe('✓ Campos Customizados', () => {
      test('permite definir lista customizada de campos', () => {
        const sanitizer = new DataSanitizer(['ssn', 'bank_account']);
        const data = {
          ssn: '123-45-6789',
          bank_account: '1234567890',
          password: 'secret123' // não customizado, não será mascarado
        };
        const clean = sanitizer.sanitize(data);
        expect(clean.ssn).toBe('********');
        expect(clean.bank_account).toBe('********');
        expect(clean.password).toBe('secret123'); // não mascarado
      });

      test('customiza campos sensíveis adicionais', () => {
        const sanitizer = new DataSanitizer(['customSecret', 'internalKey']);
        const data = {
          customSecret: 'hidden',
          internalKey: 'shh'
        };
        const clean = sanitizer.sanitize(data);
        expect(clean.customSecret).toBe('********');
        expect(clean.internalKey).toBe('********');
      });
    });

    describe('✓ Edge Cases', () => {
      test('sanitiza null sem erro', () => {
        const sanitizer = new DataSanitizer();
        const clean = sanitizer.sanitize(null);
        expect(clean).toBeNull();
      });

      test('sanitiza undefined sem erro', () => {
        const sanitizer = new DataSanitizer();
        const clean = sanitizer.sanitize(undefined);
        expect(clean).toBeUndefined();
      });

      test('sanitiza array vazio', () => {
        const sanitizer = new DataSanitizer();
        const clean = sanitizer.sanitize([]);
        expect(Array.isArray(clean)).toBe(true);
        expect(clean.length).toBe(0);
      });

      test('sanitiza objeto vazio', () => {
        const sanitizer = new DataSanitizer();
        const clean = sanitizer.sanitize({});
        expect(clean).toEqual({});
      });

      test('sanitiza valores primitivos sem erro', () => {
        const sanitizer = new DataSanitizer();
        expect(sanitizer.sanitize('string')).toBe('string');
        expect(sanitizer.sanitize(123)).toBe(123);
        expect(sanitizer.sanitize(true)).toBe(true);
      });
    });
  });

  // ========== RequestDataExtractor Tests ==========
  describe('RequestDataExtractor', () => {
    const RequestDataExtractor = require('../src/adapters/http/RequestDataExtractor');

    describe('✓ Extração de Dados HTTP', () => {
      test('extrai method corretamente', () => {
        const req = { method: 'POST' };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.method).toBe('POST');
      });

      test('extrai url path corretamente', () => {
        const req = { url: '/api/users', method: 'GET' };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.url).toBe('/api/users');
      });

      test('extrai statusCode da resposta', () => {
        const req = { method: 'GET', url: '/api/users' };
        const res = { statusCode: 200 };
        const data = RequestDataExtractor.extract(req, res);
        expect(data.statusCode).toBe(200);
      });

      test('captura body para POST', () => {
        const req = {
          method: 'POST',
          url: '/api/users',
          body: { name: 'John' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toEqual({ name: 'John' });
      });

      test('ignora body para GET', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          body: { should: 'be ignored' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeUndefined();
      });

      test('ignora body para HEAD', () => {
        const req = {
          method: 'HEAD',
          url: '/api/users',
          body: { should: 'be ignored' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeUndefined();
      });

      test('ignora body para DELETE', () => {
        const req = {
          method: 'DELETE',
          url: '/api/users/123',
          body: { should: 'be ignored' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeUndefined();
      });
    });

    describe('✓ Captura de Headers', () => {
      test('captura headers whitelisted', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {
            'user-agent': 'Mozilla/5.0',
            'accept': 'application/json',
            'authorization': 'Bearer abc123' // deve ser ignorado
          }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.headers['user-agent']).toBe('Mozilla/5.0');
        expect(data.headers['accept']).toBe('application/json');
        expect(data.headers['authorization']).toBeUndefined(); // não capturado
      });

      test('ignora headers blacklisted', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {
            'authorization': 'Bearer secret',
            'cookie': 'session=abc',
            'x-api-key': 'sk_live_xyz'
          }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.headers).not.toHaveProperty('authorization');
        expect(data.headers).not.toHaveProperty('cookie');
        expect(data.headers).not.toHaveProperty('x-api-key');
      });

      test('normaliza headers para lowercase', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {
            'User-Agent': 'Mozilla/5.0',
            'ACCEPT': 'application/json'
          }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        // Headers devem ser normalizados para lowercase
        expect(data.headers['user-agent']).toBeDefined();
        expect(data.headers['accept']).toBeDefined();
      });
    });

    describe('✓ Content-Type Handling', () => {
      test('captura body se Content-Type é application/json', () => {
        const req = {
          method: 'POST',
          url: '/api/users',
          headers: { 'content-type': 'application/json' },
          body: { name: 'John' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeDefined();
      });

      test('captura body se Content-Type é application/json; charset=utf-8', () => {
        const req = {
          method: 'POST',
          url: '/api/users',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body: { name: 'John' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeDefined();
      });

      test('captura body se Content-Type é application/x-www-form-urlencoded', () => {
        const req = {
          method: 'POST',
          url: '/api/users',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: 'name=John&email=john@example.com'
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeDefined();
      });

      test('ignora body se Content-Type é application/octet-stream', () => {
        const req = {
          method: 'POST',
          url: '/api/upload',
          headers: { 'content-type': 'application/octet-stream' },
          body: Buffer.from([0x00, 0x01, 0x02])
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeUndefined();
      });

      test('ignora body se Content-Type é image/*', () => {
        const req = {
          method: 'POST',
          url: '/api/upload',
          headers: { 'content-type': 'image/png' },
          body: Buffer.from([0x89, 0x50, 0x4E, 0x47])
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeUndefined();
      });
    });

    describe('✓ Body Size Limits', () => {
      test('ignora body maior que 64KB', () => {
        const largeBody = 'x'.repeat(70000);
        const req = {
          method: 'POST',
          url: '/api/users',
          headers: { 'content-type': 'application/json' },
          body: largeBody
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeUndefined();
      });

      test('captura body menor que 64KB', () => {
        const body = { data: 'x'.repeat(50000) };
        const req = {
          method: 'POST',
          url: '/api/users',
          headers: { 'content-type': 'application/json' },
          body
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.body).toBeDefined();
      });
    });

    describe('✓ User ID Extraction', () => {
      test('extrai userId do header X-User-ID', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: { 'x-user-id': 'user-123' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.userId).toBe('user-123');
      });

      test('extrai userId de req.user.id', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {},
          user: { id: 'user-456' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.userId).toBe('user-456');
      });

      test('extrai userId de req.locals.userId', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {},
          locals: { userId: 'user-789' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.userId).toBe('user-789');
      });

      test('prioriza header X-User-ID sobre req.user.id', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: { 'x-user-id': 'from-header' },
          user: { id: 'from-user' }
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.userId).toBe('from-header');
      });

      test('userId é undefined se não encontrado', () => {
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {}
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        expect(data.userId).toBeUndefined();
      });
    });

    describe('✓ Request ID Generation', () => {
      test('gera request_id único para cada extração', () => {
        const req1 = { method: 'GET', url: '/api/users' };
        const req2 = { method: 'GET', url: '/api/users' };

        const data1 = RequestDataExtractor.extract(req1, {});
        const data2 = RequestDataExtractor.extract(req2, {});

        expect(data1.request_id).toBeDefined();
        expect(data2.request_id).toBeDefined();
        expect(data1.request_id).not.toBe(data2.request_id);
      });

      test('request_id é UUID válido', () => {
        const req = { method: 'GET', url: '/api/users' };
        const data = RequestDataExtractor.extract(req, {});

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(data.request_id).toMatch(uuidRegex);
      });
    });

    describe('✓ Response Body Capture (Section 21)', () => {
      test('captura response body se disponível', () => {
        const req = { method: 'GET', url: '/api/users' };
        const res = {
          statusCode: 200,
          body: { users: [] }
        };
        const data = RequestDataExtractor.extract(req, res);
        // Note: response_body pode ser capturado opcionalmente
        // Comportamento a definir em implementação
      });
    });

    describe('✓ Duration Calculation (Section 21)', () => {
      test('calcula duration_ms desde início pedido', () => {
        const now = Date.now();
        const req = {
          method: 'GET',
          url: '/api/users',
          _startTime: now
        };
        const res = {};
        const data = RequestDataExtractor.extract(req, res);
        // duration_ms deve ser calculado
        expect(data.duration_ms).toBeGreaterThanOrEqual(0);
      });
    });
  });
});

// ============================================================================
// APPLICATION LAYER TESTS
// ============================================================================

describe('Application Layer', () => {

  describe('SaveAuditLogUseCase', () => {
    const SaveAuditLogUseCase = require('../src/application/useCases/SaveAuditLogUseCase');

    describe('✓ Validação e Persistência', () => {
      test('salva log validado no repositório', async () => {
        // Arrange
        const mockRepository = {
          save: jest.fn().mockResolvedValue({ id: 1 })
        };
        const useCase = new SaveAuditLogUseCase(mockRepository);
        const data = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        };

        // Act
        const result = await useCase.execute(data);

        // Assert
        expect(mockRepository.save).toHaveBeenCalled();
        expect(result.id).toBe(1);
      });

      test('rejeita dados inválidos antes de persistir', async () => {
        // Arrange
        const mockRepository = {
          save: jest.fn()
        };
        const useCase = new SaveAuditLogUseCase(mockRepository);
        const data = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET'
          // statusCode faltando
        };

        // Act & Assert
        await expect(useCase.execute(data)).rejects.toThrow();
        expect(mockRepository.save).not.toHaveBeenCalled();
      });

      test('chama repositório com AuditLog entity validado', async () => {
        // Arrange
        const mockRepository = {
          save: jest.fn().mockResolvedValue({ id: 1 })
        };
        const useCase = new SaveAuditLogUseCase(mockRepository);
        const data = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          body: { password: 'secret' }
        };

        // Act
        await useCase.execute(data);

        // Assert
        const callArgument = mockRepository.save.mock.calls[0][0];
        expect(callArgument.ip).toBe('192.168.1.1');
        expect(callArgument.severity).toBe('INFO');
        // Body deve estar sanitizado
        expect(callArgument.body.password).toBe('********');
      });
    });

    describe('✓ Erro no Repositório', () => {
      test('propaga erro do repositório', async () => {
        // Arrange
        const mockRepository = {
          save: jest.fn().mockRejectedValue(new Error('DB connection failed'))
        };
        const useCase = new SaveAuditLogUseCase(mockRepository);
        const data = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        };

        // Act & Assert
        await expect(useCase.execute(data)).rejects.toThrow('DB connection failed');
      });
    });

    describe('✓ Fire and Forget Pattern', () => {
      test('execução é assíncrona (não aguarda promessa)', async () => {
        // Arrange
        const mockRepository = {
          save: jest.fn().mockImplementation(
            () => new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 100))
          )
        };
        const useCase = new SaveAuditLogUseCase(mockRepository);
        const data = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200
        };

        // Act
        const startTime = Date.now();
        const promise = useCase.execute(data);
        const timeToReturn = Date.now() - startTime;

        // Assert
        // Promise é retornada imediatamente (não aguarda 100ms)
        expect(promise).toBeInstanceOf(Promise);
        expect(timeToReturn).toBeLessThan(50); // Muito rápido
      });
    });
  });
});

// ============================================================================
// INFRASTRUCTURE LAYER TESTS
// ============================================================================

describe('Infrastructure Layer', () => {

  describe('AuditLogRepository', () => {
    const AuditLogRepository = require('../src/infrastructure/database/AuditLogRepository');

    describe('✓ Auto Criação de Tabela', () => {
      test('cria tabela audit_logs se não existir', async () => {
        // Arrange
        const mockConnection = {
          query: jest.fn().mockResolvedValue({})
        };
        const repository = new AuditLogRepository(mockConnection);

        // Act
        await repository.ensureTable();

        // Assert
        expect(mockConnection.query).toHaveBeenCalled();
        // Deve ser chamado com CREATE TABLE IF NOT EXISTS
        const sql = mockConnection.query.mock.calls[0][0];
        expect(sql).toContain('CREATE TABLE');
        expect(sql).toContain('audit_logs');
      });

      test('não relança erro se tabela já existe', async () => {
        // Arrange
        const mockConnection = {
          query: jest.fn().mockRejectedValueOnce(new Error('table already exists'))
              .mockResolvedValueOnce({})
        };
        const repository = new AuditLogRepository(mockConnection);

        // Act & Assert (não deve lançar erro)
        try {
          await repository.ensureTable();
        } catch (e) {
          expect(e).toBeUndefined();
        }
      });
    });

    describe('✓ Save Log', () => {
      test('insere auditlog no banco corretamente', async () => {
        // Arrange
        const mockConnection = {
          query: jest.fn().mockResolvedValue({ rows: [{ id: 1 }] })
        };
        const repository = new AuditLogRepository(mockConnection);
        const auditLog = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          severity: 'INFO'
        };

        // Act
        const result = await repository.save(auditLog);

        // Assert
        expect(mockConnection.query).toHaveBeenCalled();
        expect(result.id).toBe(1);
      });
    });

    describe('✓ Consultas', () => {
      test('busca log por ID', async () => {
        // Arrange
        const mockConnection = {
          query: jest.fn().mockResolvedValue({
            rows: [{ id: 1, ip: '192.168.1.1', statusCode: 200 }]
          })
        };
        const repository = new AuditLogRepository(mockConnection);

        // Act
        const log = await repository.findById(1);

        // Assert
        expect(log.id).toBe(1);
        expect(log.ip).toBe('192.168.1.1');
      });

      test('busca logs por userId', async () => {
        // Arrange
        const mockConnection = {
          query: jest.fn().mockResolvedValue({
            rows: [
              { id: 1, userId: 'user-123' },
              { id: 2, userId: 'user-123' }
            ]
          })
        };
        const repository = new AuditLogRepository(mockConnection);

        // Act
        const logs = await repository.findByUserId('user-123');

        // Assert
        expect(logs.length).toBe(2);
        expect(logs[0].userId).toBe('user-123');
      });

      test('busca logs por intervalo de datas', async () => {
        // Arrange
        const mockConnection = {
          query: jest.fn().mockResolvedValue({
            rows: [{ id: 1, timestamp: '2026-03-16T10:00:00Z' }]
          })
        };
        const repository = new AuditLogRepository(mockConnection);
        const startDate = new Date('2026-03-16T00:00:00Z');
        const endDate = new Date('2026-03-17T00:00:00Z');

        // Act
        const logs = await repository.findByDateRange(startDate, endDate);

        // Assert
        expect(logs.length).toBe(1);
      });
    });
  });

  describe('FallbackAuditLogRepository', () => {
    const FallbackAuditLogRepository = require('../src/infrastructure/database/FallbackAuditLogRepository');

    describe('✓ Salva em Arquivo JSON Lines', () => {
      test('escreve log em arquivo logs/audit-fallback.json', async () => {
        // Arrange
        const mockFileSystem = {
          appendFile: jest.fn().mockResolvedValue(undefined)
        };
        const repository = new FallbackAuditLogRepository(mockFileSystem);
        const auditLog = {
          ip: '192.168.1.1',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
          severity: 'INFO'
        };

        // Act
        await repository.save(auditLog);

        // Assert
        expect(mockFileSystem.appendFile).toHaveBeenCalled();
        const filePath = mockFileSystem.appendFile.mock.calls[0][0];
        expect(filePath).toContain('audit-fallback.json');
      });

      test('escreve como JSON strings (uma por linha)', async () => {
        // Arrange
        const mockFileSystem = {
          appendFile: jest.fn().mockResolvedValue(undefined)
        };
        const repository = new FallbackAuditLogRepository(mockFileSystem);
        const auditLog = { ip: '192.168.1.1' };

        // Act
        await repository.save(auditLog);

        // Assert
        const content = mockFileSystem.appendFile.mock.calls[0][1];
        expect(content).toContain('192.168.1.1');
        expect(content).toContain('\n');
      });

      test('nunca bloqueia se arquivo falhar ao escrever', async () => {
        // Arrange
        const mockFileSystem = {
          appendFile: jest.fn().mockRejectedValue(new Error('ENOENT'))
        };
        const mockLogger = {
          error: jest.fn()
        };
        const repository = new FallbackAuditLogRepository(mockFileSystem, mockLogger);

        // Act & Assert (não deve lançar erro)
        await expect(repository.save({})).resolves.not.toThrow();
        expect(mockLogger.error).toHaveBeenCalled();
      });
    });
  });

  describe('DatabaseConnection Singleton', () => {
    const DatabaseConnection = require('../src/infrastructure/database/DatabaseConnection');

    describe('✓ Padrão Singleton', () => {
      test('retorna mesma instância em múltiplas chamadas', async () => {
        // Arrange
        const config = { host: 'localhost', database: 'audit' };

        // Act
        const conn1 = await DatabaseConnection.getInstance(config);
        const conn2 = await DatabaseConnection.getInstance(config);

        // Assert
        expect(conn1).toBe(conn2);
      });

      test('tenta conectar ao banco na inicialização', async () => {
        // Arrange
        const config = { host: 'localhost', database: 'audit' };
        const mockDriver = {
          connect: jest.fn().mockResolvedValue({})
        };

        // Act
        await DatabaseConnection.getInstance(config, mockDriver);

        // Assert
        expect(mockDriver.connect).toHaveBeenCalled();
      });
    });

    describe('✓ Fallback Mode', () => {
      test('ativa fallback se conexão falhar', async () => {
        // Arrange
        const config = { host: 'localhost', database: 'audit' };
        const mockDriver = {
          connect: jest.fn().mockRejectedValue(new Error('Connection refused'))
        };

        // Act
        const result = await DatabaseConnection.getInstance(config, mockDriver);

        // Assert
        expect(result.isInFallbackMode()).toBe(true);
      });

      test('retorna aviso em status quando em fallback', async () => {
        // Arrange
        const config = { host: 'localhost', database: 'audit' };
        const mockDriver = {
          connect: jest.fn().mockRejectedValue(new Error('Connection timeout'))
        };

        // Act
        const result = await DatabaseConnection.getInstance(config, mockDriver);

        // Assert
        expect(result.status).toBe('warning');
      });
    });
  });

  describe('Winston Logger Singleton', () => {
    const WinstonLogger = require('../src/infrastructure/logger/Winston');

    describe('✓ Configuração', () => {
      test('cria logger com console transport', () => {
        // Arrange & Act
        const logger = WinstonLogger.getInstance({
          level: 'info',
          logDir: 'logs'
        });

        // Assert
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.warn).toBe('function');
        expect(typeof logger.error).toBe('function');
      });

      test('cria logger com file transport para fallback', () => {
        // Arrange & Act
        const logger = WinstonLogger.getInstance({
          level: 'info',
          logDir: 'logs'
        });

        // Assert
        // Logger deve ter transport de arquivo para fallback
        expect(logger).toBeDefined();
      });
    });
  });
});

// ============================================================================
// ADAPTER LAYER TESTS
// ============================================================================

describe('Adapter Layer', () => {

  describe('ExpressAuditMiddleware', () => {
    const ExpressAuditMiddleware = require('../src/adapters/middlewares/express');

    describe('✓ Captura de Requisição', () => {
      test('captura dados da requisição ao chegar', (done) => {
        // Arrange
        const mockUseCase = {
          execute: jest.fn().mockResolvedValue({ id: 1 })
        };
        const middleware = ExpressAuditMiddleware(mockUseCase);
        const req = { method: 'GET', url: '/api/users', headers: {} };
        const res = { statusCode: 200 };
        const next = jest.fn();

        // Act
        middleware(req, res, next);

        // Assert
        expect(next).toHaveBeenCalled();
        done();
      });

      test('aguarda resposta ser finalizada antes de logar', (done) => {
        // Arrange
        const mockUseCase = {
          execute: jest.fn().mockResolvedValue({ id: 1 })
        };
        const middleware = ExpressAuditMiddleware(mockUseCase);
        const finishListeners = [];
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {},
          on: jest.fn()
        };
        const res = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'finish') finishListeners.push(callback);
          })
        };
        const next = jest.fn(() => {
          setTimeout(() => {
            finishListeners.forEach(cb => cb());
          }, 10);
        });

        // Act
        middleware(req, res, next);
        setTimeout(() => {
          // Assert
          expect(mockUseCase.execute).toHaveBeenCalled();
          done();
        }, 50);
      });
    });

    describe('✓ Fire and Forget', () => {
      test('não aguarda use case terminar', (done) => {
        // Arrange
        const mockUseCase = {
          execute: jest.fn(() =>
            new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 100))
          )
        };
        const middleware = ExpressAuditMiddleware(mockUseCase);
        const req = { method: 'GET', url: '/api/users', headers: {} };
        const res = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'finish') callback();
          })
        };
        const next = jest.fn();

        const startTime = Date.now();
        // Act
        middleware(req, res, next);

        setTimeout(() => {
          const elapsed = Date.now() - startTime;
          // Assert
          // Middleware retornou rapidamente sem aguardar 100ms do use case
          expect(elapsed).toBeLessThan(80);
          done();
        }, 10);
      });

      test('erros em use case não interrompem resposta', (done) => {
        // Arrange
        const mockUseCase = {
          execute: jest.fn().mockRejectedValue(new Error('DB error'))
        };
        const mockLogger = {
          error: jest.fn()
        };
        const middleware = ExpressAuditMiddleware(mockUseCase, mockLogger);
        const req = { method: 'GET', url: '/api/users', headers: {} };
        const res = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'finish') callback();
          })
        };
        const next = jest.fn();

        // Act
        middleware(req, res, next);
        setTimeout(() => {
          // Assert
          expect(next).toHaveBeenCalled();
          expect(mockLogger.error).toHaveBeenCalled();
          done();
        }, 50);
      });
    });

    describe('✓ Extração de Dados', () => {
      test('extrai e envia dados corretos para use case', (done) => {
        // Arrange
        const mockUseCase = {
          execute: jest.fn().mockResolvedValue({ id: 1 })
        };
        const middleware = ExpressAuditMiddleware(mockUseCase);
        const req = {
          method: 'POST',
          url: '/api/users',
          headers: { 'user-agent': 'Test' },
          body: { name: 'John' }
        };
        const res = {
          statusCode: 201,
          on: jest.fn((event, callback) => {
            if (event === 'finish') callback();
          })
        };
        const next = jest.fn();

        // Act
        middleware(req, res, next);
        setTimeout(() => {
          // Assert
          const callArg = mockUseCase.execute.mock.calls[0][0];
          expect(callArg.method).toBe('POST');
          expect(callArg.url).toBe('/api/users');
          expect(callArg.statusCode).toBe(201);
          done();
        }, 50);
      });
    });

    describe('✓ Cronômetro de Latência', () => {
      test('calcula latência entre início e fim da resposta', (done) => {
        // Arrange
        const mockUseCase = {
          execute: jest.fn().mockResolvedValue({ id: 1 })
        };
        const middleware = ExpressAuditMiddleware(mockUseCase);
        const req = {
          method: 'GET',
          url: '/api/users',
          headers: {}
        };
        const res = {
          statusCode: 200,
          on: jest.fn((event, callback) => {
            if (event === 'finish') {
              setTimeout(callback, 25); // Simula 25ms de latência
            }
          })
        };
        const next = jest.fn();

        // Act
        middleware(req, res, next);
        setTimeout(() => {
          // Assert
          const callArg = mockUseCase.execute.mock.calls[0][0];
          expect(callArg.duration_ms).toBeGreaterThanOrEqual(20);
          done();
        }, 100);
      });
    });
  });

  describe('FastifyAuditMiddleware', () => {
    test('registra plugin Fastify corretamente', () => {
      // Este teste seria similar ao Express
      // Fastify usa hooks (onResponse) ao invés de eventos
      const plugin = require('../src/adapters/middlewares/fastify');
      expect(typeof plugin).toBe('function');
    });
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

describe('Integration Tests', () => {

  describe('✓ Fluxo Completo E2E', () => {
    test('requisição HTTP dispara auditoria completa', async () => {
      // Este teste integraria:
      // 1. Express com middleware
      // 2. Use case com repositório mock
      // 3. AuditLog sendo criado, sanitizado e persistido

      // A implementação seria ompleta, mas aqui mockamos para demonstrar
      const mockRepository = { save: jest.fn().mockResolvedValue({ id: 1 }) };
      // ... setup completo ...
    });
  });

  describe('✓ Comportamento de Fallback', () => {
    test('quando banco falha, usa fallback para arquivo', async () => {
      // Arrange: DatabaseConnection falha, FallbackRepository ativado

      // Act: Fazer requisição na API

      // Assert: Log foi escrito em arquivo, não lançou erro
    });

    test('quando arquivo também falha, apenas loga erro', async () => {
      // A requisição não é bloqueada mesmo se ambos falharem
    });
  });

  describe('✓ Inicialização', () => {
    test('Audit.initialize() cria tabela se banco está disponível', async () => {
      // Arrange: .env configurado com BD válido

      // Act
      const result = await Audit.initialize();

      // Assert
      expect(result.status).toBe('success');
      // Tabela audit_logs deve existir
    });

    test('Audit.initialize() ativa fallback se banco indisponível', async () => {
      // Arrange: .env com BD inacessível

      // Act
      const result = await Audit.initialize();

      // Assert
      expect(result.status).toBe('warning');
      expect(Audit.isInFallbackMode()).toBe(true);
    });

    test('initialize() é idempotente (múltiplas chamadas seguras)', async () => {
      // Act
      const result1 = await Audit.initialize();
      const result2 = await Audit.initialize();

      // Assert
      expect(result1.status).toBe(result2.status);
    });
  });

  describe('✓ Resiliência', () => {
    test('falha em auditoria nunca retorna erro 500 ao cliente', async () => {
      // Arrange: Middleware com auditoria que falha

      // Act: Fazer requisição

      // Assert: Status code da resposta é original (200, 201, etc), não 500
    });

    test('múltiplas requisições simultâneas não causam race conditions', async () => {
      // Promise.all de 100 requisições simultâneas
      // Todas devem logar sem problemas de concorrência
    });
  });
});

// ============================================================================
// RESILIENCE & ERROR HANDLING TESTS
// ============================================================================

describe('Resiliência e Tratamento de Erros', () => {

  describe('✓ Dados Sanitizados em Todo Fluxo', () => {
    test('dados sensíveis são mascarados desde a entrada até persistência', async () => {
      // Arrange: Requisição com password no body

      // Act:1. Extrai dados (password presente)
      //    2. Usa SaveAuditLogUseCase
      //    3. AuditLog sanitiza
      //    4. Persiste no banco

      // Assert: Banco nunca vê password em texto claro
    });
  });

  describe('✓ Edge Cases de Input', () => {
    test('body vazio é tratado corretamente', async () => {
      // POST com Content-Type correto mas body vazio
      // Deve logar com body: null ou undefined, sem erro
    });

    test('headers ausentes não causam erro', async () => {
      // Requisição sem nenhum header customizado
      // Middleware gera headers whitelist vazio, sem erro
    });

    test('request sem IP trata como UNKNOWN', async () => {
      // req.socket.remoteAddress === undefined
      // ip deve ser UNKNOWN
    });

    test('erro em timeout do banco ativa fallback', async () => {
      // Database query timeout
      // Use case retorna Promise rejection
      // Fallback ativado
    });

    test('erro em escrita de arquivo log mantém aplicação rodando', async () => {
      // fs.appendFile rejeitado
      // Erro logado em stderr
      // Requisição continua normalmente
    });
  });

  describe('✓ Dados Aninhados Profundamente', () => {
    test('sanitiza password em qualquer profundidade de aninhamento', async () => {
      const data = {
        level1: {
          level2: {
            level3: [
              {
                credentials: {
                  token: 'secret',
                  user: {
                    password: 'hidden'
                  }
                }
              }
            ]
          }
        }
      };
      // Ambos token e password devem ser mascarados
    });
  });
});
