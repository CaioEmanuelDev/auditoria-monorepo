/**
 * AuditLogRepository Tests
 * 
 * Testa a persistência de logs em banco de dados SQL.
 */

describe('Infrastructure :: AuditLogRepository', () => {
  // const AuditLogRepository = require('../../../src/infrastructure/database/AuditLogRepository');

  describe('Salvamento em Banco', () => {
    it('deve salvar um audit log válido no banco de dados', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockResolvedValue([1]),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act
      const result = await repository.save(auditLog);

      // Assert
      expect(mockDatabase.insert).toHaveBeenCalledWith('audit_logs', expect.objectContaining({
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
      }));
      expect(result.id).toBe(1);
    });

    it('deve retornar ID do log inserido', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockResolvedValue([999]),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act
      const result = await repository.save(auditLog);

      // Assert
      expect(result.id).toBe(999);
    });

    it('deve persister timestamp exatamente como fornecido', async () => {
      // Arrange
      const testDate = new Date('2026-03-16T10:00:00Z');
      const mockDatabase = {
        insert: jest.fn().mockResolvedValue([1]),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: testDate,
      };

      // Act
      await repository.save(auditLog);

      // Assert
      expect(mockDatabase.insert).toHaveBeenCalledWith(
        'audit_logs',
        expect.objectContaining({
          timestamp: testDate,
        })
      );
    });
  });

  describe('Criação Automática de Tabela', () => {
    it('deve criar tabla audit_logs se não existir', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(false),
        createTable: jest.fn().mockResolvedValue(true),
        insert: jest.fn().mockResolvedValue([1]),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act
      await repository.save(auditLog);

      // Assert
      expect(mockDatabase.tableExists).toHaveBeenCalledWith('audit_logs');
      expect(mockDatabase.createTable).toHaveBeenCalled();
    });

    it('não deve criar tabela se já existir', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(true),
        createTable: jest.fn(),
        insert: jest.fn().mockResolvedValue([1]),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act
      await repository.save(auditLog);

      // Assert
      expect(mockDatabase.createTable).not.toHaveBeenCalled();
    });

    it('deve repassar erro if table creation falha', async () => {
      // Arrange
      const mockDatabase = {
        tableExists: jest.fn().mockResolvedValue(false),
        createTable: jest.fn().mockRejectedValue(new Error('Permission denied')),
        insert: jest.fn(),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act & Assert
      await expect(repository.save(auditLog)).rejects.toThrow('Permission denied');
      expect(mockDatabase.insert).not.toHaveBeenCalled();
    });
  });

  describe('Erro de Conexão', () => {
    it('deve lançar erro se banco não acessível', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act & Assert
      await expect(repository.save(auditLog)).rejects.toThrow('ECONNREFUSED');
    });

    it('deve lançar erro se query timeout', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockRejectedValue(new Error('Query timeout')),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act & Assert
      await expect(repository.save(auditLog)).rejects.toThrow('Query timeout');
    });
  });

  describe('Compatibilidade Multi-Driver', () => {
    it('deve usar parametrized queries (proteção contra SQL injection)', async () => {
      // Arrange
      const mockDatabase = {
        insert: jest.fn().mockResolvedValue([1]),
      };
      const repository = new AuditLogRepository(mockDatabase);
      const auditLog = {
        ip: '192.168.1.1; DROP TABLE audit_logs;',
        userId: 'user-123',
        url: '/api/users',
        method: 'GET',
        statusCode: 200,
        severity: 'INFO',
        timestamp: new Date(),
      };

      // Act
      await repository.save(auditLog);

      // Assert
      expect(mockDatabase.insert).toHaveBeenCalled();
      // O valor foi passado, não concatenado em SQL
      const callArgs = mockDatabase.insert.mock.calls[0][1];
      expect(callArgs.ip).toBe('192.168.1.1; DROP TABLE audit_logs;');
    });
  });

  describe('Leitura de Logs', () => {
    it('deve recuperar um log por ID', async () => {
      // Arrange
      const mockDatabase = {
        query: jest.fn().mockResolvedValue([{
          id: 1,
          ip: '192.168.1.1',
          userId: 'user-123',
        }]),
      };
      const repository = new AuditLogRepository(mockDatabase);

      // Act
      const log = await repository.findById(1);

      // Assert
      expect(log.id).toBe(1);
      expect(log.ip).toBe('192.168.1.1');
    });

    it('deve recuperar logs com filtro', async () => {
      // Arrange
      const mockDatabase = {
        query: jest.fn().mockResolvedValue([
          { id: 1, userId: 'user-123', statusCode: 200 },
          { id: 2, userId: 'user-123', statusCode: 201 },
        ]),
      };
      const repository = new AuditLogRepository(mockDatabase);

      // Act
      const logs = await repository.findByUserId('user-123');

      // Assert
      expect(logs).toHaveLength(2);
      expect(logs[0].userId).toBe('user-123');
    });

    it('deve retornar array vazio se nenhum log encontrado', async () => {
      // Arrange
      const mockDatabase = {
        query: jest.fn().mockResolvedValue([]),
      };
      const repository = new AuditLogRepository(mockDatabase);

      // Act
      const logs = await repository.findByUserId('unknown-user');

      // Assert
      expect(logs).toEqual([]);
    });
  });
});
