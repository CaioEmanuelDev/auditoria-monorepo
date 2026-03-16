/**
 * Integration Tests — End-to-End Audit Flow
 * 
 * Testa o fluxo completo de auditoria da requisição até persistência.
 */

describe('Integration :: End-to-End Audit Flow', () => {
  describe('Fluxo Completo: Request → Log → Banco', () => {
    it('deve registrar um GET request bem-sucedido', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };
      const mockLogger = {
        info: jest.fn(),
      };
      
      // Simular componentes
      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);
      const middleware = createExpressAuditMiddleware(useCase);

      // Simular Express request/response
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') callback();
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Aguardar processamento assíncrono
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(mockDatabase.insert).toHaveBeenCalledWith('audit_logs', expect.objectContaining({
        method: 'GET',
        url: '/api/users',
        ip: '192.168.1.1',
        statusCode: 200,
        severity: 'INFO',
      }));
      expect(next).toHaveBeenCalled();
    });

    it('deve registrar um POST request com body e dados sensíveis mascarados', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);
      const middleware = createExpressAuditMiddleware(useCase);

      const req = {
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'content-type': 'application/json' },
        socket: { remoteAddress: '203.0.113.1' },
        body: {
          email: 'user@example.com',
          password: 'super_secret_123',
        },
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') callback();
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      expect(mockDatabase.insert).toHaveBeenCalled();
      const savedLog = mockDatabase.insert.mock.calls[0][1];
      
      // Password deve estar mascarado
      expect(savedLog.body.password).toBe('********');
      // Email deve estar intacto
      expect(savedLog.body.email).toBe('user@example.com');
    });

    it('deve registrar erro 404 com severidade WARN', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);
      const middleware = createExpressAuditMiddleware(useCase);

      const req = {
        method: 'GET',
        url: '/api/nonexistent',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 404,
        on: jest.fn((event, callback) => {
          if (event === 'finish') callback();
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      const savedLog = mockDatabase.insert.mock.calls[0][1];
      expect(savedLog.statusCode).toBe(404);
      expect(savedLog.severity).toBe('WARN');
    });

    it('deve registrar erro 500 com severidade ERROR', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);
      const middleware = createExpressAuditMiddleware(useCase);

      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 500,
        on: jest.fn((event, callback) => {
          if (event === 'finish') callback();
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      const savedLog = mockDatabase.insert.mock.calls[0][1];
      expect(savedLog.statusCode).toBe(500);
      expect(savedLog.severity).toBe('ERROR');
    });
  });

  describe('Resiliência — Falha do Banco', () => {
    it('não deve interromper fluxo de requisição se banco falhar', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockRejectedValue(new Error('Connection timeout')),
      };
      const mockLogger = {
        warn: jest.fn(),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);
      const middleware = createExpressAuditMiddleware(useCase, mockLogger);

      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') callback();
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert - requisição continua (fail-safe)
      expect(next).toHaveBeenCalled();
      // Logger foi chamado para registrar erro
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('Criação Automática de Tabela', () => {
    it('deve criar tabela audit_logs na primeira requisição se não existir', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true),
        createTable: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);

      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      await useCase.execute(auditLogData);

      // Assert
      expect(mockDatabase.tableExists).toHaveBeenCalled();
      expect(mockDatabase.createTable).toHaveBeenCalled();
      expect(mockDatabase.insert).toHaveBeenCalled();
    });
  });

  describe('Dados Sensíveis Aninhados', () => {
    it('deve mascarar dados sensíveis em estruturas aninhadas', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);
      const middleware = createExpressAuditMiddleware(useCase);

      const req = {
        method: 'POST',
        url: '/api/stripe/webhook',
        headers: { 'content-type': 'application/json' },
        socket: { remoteAddress: '192.168.1.1' },
        body: {
          event: 'customer.created',
          data: {
            object: {
              email: 'customer@example.com',
              apiKey: 'sk_live_abc123xyz',
            },
          },
        },
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') callback();
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      const savedLog = mockDatabase.insert.mock.calls[0][1];
      expect(savedLog.body.data.object.apiKey).toBe('********');
      expect(savedLog.body.data.object.email).toBe('customer@example.com');
    });
  });

  describe('Timestamp Automático', () => {
    it('deve incluir timestamp na requisição', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);

      const beforeTime = new Date();
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      await useCase.execute(auditLogData);
      const afterTime = new Date();

      // Assert
      const savedLog = mockDatabase.insert.mock.calls[0][1];
      expect(savedLog.timestamp).toBeInstanceOf(Date);
      expect(savedLog.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
      expect(savedLog.timestamp.getTime()).toBeLessThanOrEqual(afterTime.getTime() + 100);
    });
  });

  describe('Request sem IP (UNKNOWN)', () => {
    it('deve usar UNKNOWN quando IP não puder ser detectado', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const useCase = new SaveAuditLogUseCase(repository);
      const middleware = createExpressAuditMiddleware(useCase);

      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: null,
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') callback();
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert
      const savedLog = mockDatabase.insert.mock.calls[0][1];
      expect(savedLog.ip).toBe('UNKNOWN');
    });
  });
});
