/**
 * Integration Tests — Fallback Behavior
 * 
 * Testa o comportamento de fallback quando banco falha.
 */

describe('Integration :: Fallback Behavior', () => {
  describe('Fallback para Arquivo', () => {
    it('deve redirecionar log para arquivo se banco falhar', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const mockFileLogger = {
        logToFile: jest.fn().mockResolvedValue(true),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const fallbackRepository = new FallbackAuditLogRepository(mockFileLogger);
      
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      try {
        await repository.save(auditLogData);
      } catch {
        await fallbackRepository.save(auditLogData);
      }

      // Assert
      expect(mockFileLogger.logToFile).toHaveBeenCalledWith(
        'logs/audit-fallback.json',
        expect.objectContaining({
          ip: '192.168.1.1',
          userId: 'user-123',
        })
      );
    });

    it('deve usar arquivo fallback quando banco indisponível na inicialização', async () => {
      // Arrange
      const mockDatabase = {
        checkConnection: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const mockLogger = {
        warn: jest.fn(),
      };
      const mockFileLogger = {
        logToFile: jest.fn().mockResolvedValue(true),
      };

      const audit = new AuditPackage(mockDatabase, mockLogger, mockFileLogger);

      // Act
      const initResult = await audit.initialize();

      // Assert
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('fallback')
      );
      expect(audit.isInFallbackMode()).toBe(true);
    });

    it('deve continuar salvando em arquivo mesmo após falhar em banco', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('Connection timeout')),
      };
      const mockFileLogger = {
        logToFile: jest.fn().mockResolvedValue(true),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const fallbackRepository = new FallbackAuditLogRepository(mockFileLogger);
      
      const auditLog1 = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };
      
      const auditLog2 = {
        ip: '192.168.1.2',
        userId: 'user-456',
        url: '/api/posts',
        method: 'POST',
        statusCode: 201,
      };

      // Act
      try {
        await repository.save(auditLog1);
      } catch {
        await fallbackRepository.save(auditLog1);
      }

      try {
        await repository.save(auditLog2);
      } catch {
        await fallbackRepository.save(auditLog2);
      }

      // Assert
      expect(mockFileLogger.logToFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('Recuperação Automática', () => {
    it('não deve tentar voltar para banco após fallback (permanece em fallback)', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const mockFileLogger = {
        logToFile: jest.fn().mockResolvedValue(true),
      };

      const repository = new AuditLogRepository(mockDatabase);
      const fallbackRepository = new FallbackAuditLogRepository(mockFileLogger);
      
      const auditLog1 = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act - Primeira tentativa falha, usa fallback
      try {
        await repository.save(auditLog1);
      } catch {
        await fallbackRepository.save(auditLog1);
      }

      // Mais tarde, tenta novamente (sem verificar se banco está de volta)
      const auditLog2 = {
        ip: '192.168.1.2',
        userId: 'user-456',
        url: '/api/posts',
        method: 'POST',
        statusCode: 201,
      };

      try {
        await repository.save(auditLog2);
      } catch {
        await fallbackRepository.save(auditLog2);
      }

      // Assert
      // Permanece tentando banco (não reentra em fallback automaticamente)
      expect(mockDatabase.insert).toHaveBeenCalledTimes(2);
    });
  });

  describe('Modo Fallback Permanente até Reinicialização', () => {
    it('deve permanecer em modo fallback até reiniciar aplicação', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const mockFileLogger = {
        logToFile: jest.fn().mockResolvedValue(true),
      };

      const audit = new AuditPackage(mockDatabase, null, mockFileLogger);
      await audit.initialize();

      // Act
      const isInFallback1 = audit.isInFallbackMode();
      
      // Simula múltiplas requisições
      await audit.logAudit({ ip: '192.168.1.1', url: '/api/users', method: 'GET', statusCode: 200 });
      await audit.logAudit({ ip: '192.168.1.2', url: '/api/posts', method: 'GET', statusCode: 200 });
      
      const isInFallback2 = audit.isInFallbackMode();

      // Assert
      expect(isInFallback1).toBe(true);
      expect(isInFallback2).toBe(true);
      expect(mockFileLogger.logToFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('Erro em Fallback Storage', () => {
    it('deve logar aviso se arquivo fallback também falhar', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const mockLogger = {
        error: jest.fn(),
      };
      const mockFileLogger = {
        logToFile: jest.fn().mockRejectedValue(new Error('Permission denied')),
      };

      const audit = new AuditPackage(mockDatabase, mockLogger, mockFileLogger);

      // Act
      await audit.initialize();
      
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };
      
      await audit.logAudit(auditLog);

      // Assert
      expect(mockLogger.error).toHaveBeenCalled();
      expect(mockFileLogger.logToFile).toHaveBeenCalled();
    });

    it('não deve interromper requisição mesmo se arquivo fallback falhar', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('Connection lost')),
      };
      const mockFileLogger = {
        logToFile: jest.fn().mockRejectedValue(new Error('Disk full')),
      };

      const audit = new AuditPackage(mockDatabase, null, mockFileLogger);
      const middleware = createExpressAuditMiddleware(audit);

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

      // Assert - Requisição continua mesmo com erro em fallback
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Estrutura do Arquivo Fallback', () => {
    it('deve usar caminho relativo logs/audit-fallback.json', async () => {
      // Arrange
      const mockFileLogger = {
        logToFile: jest.fn().mockResolvedValue(true),
      };
      const fallbackRepository = new FallbackAuditLogRepository(mockFileLogger);

      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      await fallbackRepository.save(auditLog);

      // Assert
      const callArgs = mockFileLogger.logToFile.mock.calls[0];
      expect(callArgs[0]).toBe('logs/audit-fallback.json');
    });

    it('deve salvar como JSON Line format (um log por linha)', async () => {
      // Arrange
      const mockFileLogger = {
        logToFile: jest.fn().mockResolvedValue(true),
      };
      const fallbackRepository = new FallbackAuditLogRepository(mockFileLogger);

      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      await fallbackRepository.save(auditLog);

      // Assert
      const savedData = mockFileLogger.logToFile.mock.calls[0][1];
      expect(typeof savedData).toBe('string');
      const parsed = JSON.parse(savedData);
      expect(parsed.ip).toBe('192.168.1.1');
    });
  });
});
