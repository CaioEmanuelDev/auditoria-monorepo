/**
 * AuditLog Entity Tests
 * 
 * Testa a criação e validação da entidade AuditLog seguindo as regras do domínio.
 * Não deve conhecer banco de dados, frameworks HTTP ou Winston.
 */

describe('Domain :: AuditLog Entity', () => {
  // ARRANGE (Importação será feita quando implementar)
  // const AuditLog = require('../../../src/domain/entities/AuditLog');

  describe('Criação e Validação Básica', () => {
    it('deve criar um AuditLog válido com todos os campos obrigatórios', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        body: { name: 'John' },
        timestamp: new Date('2026-03-16T10:00:00Z'),
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.ip).toBe('192.168.1.1');
      expect(auditLog.userId).toBe('user-123');
      expect(auditLog.url).toBe('/api/users');
      expect(auditLog.method).toBe('GET');
      expect(auditLog.statusCode).toBe(200);
      expect(auditLog.timestamp).toEqual(new Date('2026-03-16T10:00:00Z'));
    });

    it('deve rejeitar quando IP está faltando', () => {
      // Arrange
      const auditLogData = {
        // ip: undefined (faltando)
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act & Assert
      expect(() => new AuditLog(auditLogData)).toThrow('IP é obrigatório');
    });

    it('deve rejeitar quando URL está faltando', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        // url: undefined (faltando)
        method: 'GET',
        statusCode: 200,
      };

      // Act & Assert
      expect(() => new AuditLog(auditLogData)).toThrow('URL é obrigatória');
    });

    it('deve rejeitar quando método está faltando', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        // method: undefined (faltando)
        statusCode: 200,
      };

      // Act & Assert
      expect(() => new AuditLog(auditLogData)).toThrow('Método HTTP é obrigatório');
    });

    it('deve rejeitar quando status code está faltando', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        // statusCode: undefined (faltando)
      };

      // Act & Assert
      expect(() => new AuditLog(auditLogData)).toThrow('Status Code é obrigatório');
    });

    it('deve aceitar userId como opcional', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        // userId: undefined (opcional)
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.userId).toBeUndefined();
    });

    it('deve aceitar body como opcional', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        // body: undefined (opcional)
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.body).toBeUndefined();
    });

    it('deve gerar timestamp automático se não fornecido', () => {
      // Arrange
      const now = new Date();
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        // timestamp: undefined (será preenchido automaticamente)
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.timestamp).toBeDefined();
      expect(auditLog.timestamp.getTime()).toBeLessThanOrEqual(now.getTime() + 100);
      expect(auditLog.timestamp.getTime()).toBeGreaterThanOrEqual(now.getTime() - 100);
    });
  });

  describe('Regra de Severidade Baseada em Status Code', () => {
    it('deve definir severidade como INFO para status 200 (2xx)', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.severity).toBe('INFO');
    });

    it('deve definir severidade como INFO para status 100-399', () => {
      // Arrange
      const testCases = [100, 150, 299, 300, 350, 399];

      testCases.forEach(statusCode => {
        const auditLogData = {
          ip: '192.168.1.1',
          userId: 'user-123',
          url: '/api/users',
          method: 'GET',
          statusCode,
        };

        // Act
        const auditLog = new AuditLog(auditLogData);

        // Assert
        expect(auditLog.severity).toBe('INFO');
      });
    });

    it('deve definir severidade como WARN para status 400-499', () => {
      // Arrange
      const testCases = [400, 401, 404, 429, 499];

      testCases.forEach(statusCode => {
        const auditLogData = {
          ip: '192.168.1.1',
          userId: 'user-123',
          url: '/api/users',
          method: 'GET',
          statusCode,
        };

        // Act
        const auditLog = new AuditLog(auditLogData);

        // Assert
        expect(auditLog.severity).toBe('WARN');
      });
    });

    it('deve definir severidade como ERROR para status 500+', () => {
      // Arrange
      const testCases = [500, 502, 503, 599, 600];

      testCases.forEach(statusCode => {
        const auditLogData = {
          ip: '192.168.1.1',
          userId: 'user-123',
          url: '/api/users',
          method: 'GET',
          statusCode,
        };

        // Act
        const auditLog = new AuditLog(auditLogData);

        // Assert
        expect(auditLog.severity).toBe('ERROR');
      });
    });
  });

  describe('Anonimização de IP', () => {
    it('deve aceitar IP válido', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.ip).toBe('192.168.1.1');
    });

    it('deve converter null ou vazio para UNKNOWN', () => {
      // Arrange
      const testCases = [null, undefined, '', '   '];

      testCases.forEach(ip => {
        const auditLogData = {
          ip,
          userId: 'user-123',
          url: '/api/users',
          method: 'GET',
          statusCode: 200,
        };

        // Act
        const auditLog = new AuditLog(auditLogData);

        // Assert
        expect(auditLog.ip).toBe('UNKNOWN');
      });
    });

    it('deve aceitar IPv6', () => {
      // Arrange
      const auditLogData = {
        ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.ip).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });
  });

  describe('Validação de Método HTTP', () => {
    it('deve aceitar métodos HTTP válidos (GET, POST, PUT, DELETE, PATCH)', () => {
      // Arrange
      const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

      validMethods.forEach(method => {
        const auditLogData = {
          ip: '192.168.1.1',
          userId: 'user-123',
          url: '/api/users',
          method,
          statusCode: 200,
        };

        // Act
        const auditLog = new AuditLog(auditLogData);

        // Assert
        expect(auditLog.method).toBe(method);
      });
    });

    it('deve rejeitar método HTTP inválido', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'INVALID',
        statusCode: 200,
      };

      // Act & Assert
      expect(() => new AuditLog(auditLogData)).toThrow('Método HTTP inválido');
    });
  });

  describe('Validação de Status Code', () => {
    it('deve aceitar status codes válidos (100-599)', () => {
      // Arrange
      const validStatusCodes = [100, 200, 300, 400, 500];

      validStatusCodes.forEach(statusCode => {
        const auditLogData = {
          ip: '192.168.1.1',
          userId: 'user-123',
          url: '/api/users',
          method: 'GET',
          statusCode,
        };

        // Act
        const auditLog = new AuditLog(auditLogData);

        // Assert
        expect(auditLog.statusCode).toBe(statusCode);
      });
    });

    it('deve rejeitar status code fora do range (< 100 ou > 599)', () => {
      // Arrange
      const invalidStatusCodes = [0, 50, 600, 999];

      invalidStatusCodes.forEach(statusCode => {
        const auditLogData = {
          ip: '192.168.1.1',
          userId: 'user-123',
          url: '/api/users',
          method: 'GET',
          statusCode,
        };

        // Act & Assert
        expect(() => new AuditLog(auditLogData)).toThrow('Status Code deve estar entre 100 e 599');
      });
    });

    it('deve rejeitar status code não-numérico', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 'OK',
      };

      // Act & Assert
      expect(() => new AuditLog(auditLogData)).toThrow('Status Code deve ser um número');
    });
  });

  describe('Edge Cases - Body Vazio', () => {
    it('deve aceitar body como objeto vazio', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'POST',
        statusCode: 201,
        body: {},
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.body).toEqual({});
    });

    it('deve aceitar body como array vazio', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        body: [],
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.body).toEqual([]);
    });

    it('deve aceitar body como string vazia', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'DELETE',
        statusCode: 204,
        body: '',
      };

      // Act
      const auditLog = new AuditLog(auditLogData);

      // Assert
      expect(auditLog.body).toBe('');
    });
  });

  describe('Conversão para JSON Persistente', () => {
    it('deve converter AuditLog para formato JSON para persistência', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        body: { name: 'John' },
      };
      const auditLog = new AuditLog(auditLogData);

      // Act
      const json = auditLog.toJSON();

      // Assert
      expect(json).toHaveProperty('ip', '192.168.1.1');
      expect(json).toHaveProperty('userId', 'user-123');
      expect(json).toHaveProperty('url', '/api/users');
      expect(json).toHaveProperty('method', 'GET');
      expect(json).toHaveProperty('statusCode', 200);
      expect(json).toHaveProperty('severity', 'INFO');
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('body', { name: 'John' });
    });

    it('deve incluir apenas campos permitidos no JSON', () => {
      // Arrange
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };
      const auditLog = new AuditLog(auditLogData);

      // Act
      const json = auditLog.toJSON();

      // Assert
      const allowedFields = ['ip', 'userId', 'url', 'method', 'statusCode', 'severity', 'timestamp', 'body', 'headers'];
      Object.keys(json).forEach(key => {
        expect(allowedFields).toContain(key);
      });
    });
  });
});
