/**
 * SaveAuditLogUseCase Tests
 * 
 * Testa a orquestração de salvamento de logs de auditoria.
 * Valida validação de domínio, chamadas ao repositório e tratamento de erros.
 */

describe('Application :: SaveAuditLogUseCase', () => {
  // const SaveAuditLogUseCase = require('../../../src/application/useCases/SaveAuditLogUseCase');

  describe('Salvamento Bem-Sucedido', () => {
    it('deve salvar um log válido no repositório', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const result = await useCase.execute(auditLogData);

      // Assert
      expect(mockRepository.save).toHaveBeenCalledWith(expect.objectContaining({
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      }));
      expect(result).toHaveProperty('id', 1);
    });

    it('deve validar dados antes de salvar', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn(),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const invalidData = {
        // ip: undefined (faltando)
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act & Assert
      await expect(useCase.execute(invalidData)).rejects.toThrow('IP é obrigatório');
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('deve retornar ID do log salvo', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 999 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const result = await useCase.execute(auditLogData);

      // Assert
      expect(result.id).toBe(999);
    });
  });

  describe('Validação de Dados', () => {
    it('deve chamar validação do domínio antes de persistir', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn(),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const invalidData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'INVALID_METHOD', // Inválido
        statusCode: 200,
      };

      // Act & Assert
      await expect(useCase.execute(invalidData)).rejects.toThrow();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('deve rejeitar status code inválido', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn(),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const invalidData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 999, // Inválido
      };

      // Act & Assert
      await expect(useCase.execute(invalidData)).rejects.toThrow();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('deve rejeitar URL vazia', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn(),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const invalidData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '', // Vazia
        method: 'GET',
        statusCode: 200,
      };

      // Act & Assert
      await expect(useCase.execute(invalidData)).rejects.toThrow();
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Erro de Repositório', () => {
    it('deve propagar erro do repositório', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockRejectedValue(new Error('Database connection failed')),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act & Assert
      await expect(useCase.execute(auditLogData)).rejects.toThrow('Database connection failed');
    });

    it('deve propagar erro de timeout do banco', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockRejectedValue(new Error('Query timeout')),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act & Assert
      await expect(useCase.execute(auditLogData)).rejects.toThrow('Query timeout');
    });
  });

  describe('Transformação de Dados', () => {
    it('deve converter dados brutos para AuditLog entity', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
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
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: '192.168.1.1',
          userId: 'user-123',
          severity: 'INFO', // Derivado de statusCode
        })
      );
    });

    it('deve incluir severity derivada de statusCode', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 400, // WARN
      };

      // Act
      await useCase.execute(auditLogData);

      // Assert
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'WARN',
        })
      );
    });

    it('deve incluir timestamp se não fornecido', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        // timestamp: undefined (será preenchido)
      };

      // Act
      await useCase.execute(auditLogData);

      // Assert
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        })
      );
    });
  });

  describe('Comportamento Assíncrono', () => {
    it('deve retornar Promise', () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const result = useCase.execute(auditLogData);

      // Assert
      expect(result).toBeInstanceOf(Promise);
    });

    it('deve aguardar repositório completar', async () => {
      // Arrange
      let saveWasCalled = false;
      const mockRepository = {
        save: jest.fn(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          saveWasCalled = true;
          return { id: 1 };
        }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
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
      expect(saveWasCalled).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('deve aceitar body como null', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'DELETE',
        statusCode: 204,
        body: null,
      };

      // Act
      const result = await useCase.execute(auditLogData);

      // Assert
      expect(result).toBeDefined();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('deve aceitar userId como undefined', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: '192.168.1.1',
        // userId: undefined (opcional)
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const result = await useCase.execute(auditLogData);

      // Assert
      expect(result).toBeDefined();
    });

    it('deve aceitar IP como UNKNOWN quando não detectado', async () => {
      // Arrange
      const mockRepository = {
        save: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const useCase = new SaveAuditLogUseCase(mockRepository);
      const auditLogData = {
        ip: 'UNKNOWN',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
      };

      // Act
      const result = await useCase.execute(auditLogData);

      // Assert
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: 'UNKNOWN',
        })
      );
    });
  });
});
