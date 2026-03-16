/**
 * Express Audit Middleware Tests
 * 
 * Testa a captura de dados HTTP e delegação ao use case.
 */

describe('Adapters :: ExpressAuditMiddleware', () => {
  // const createAuditMiddleware = require('../../../src/adapters/middlewares/express');

  describe('Captura Básica de Requisição', () => {
    it('deve capturar método HTTP da requisição', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
          })
        );
        done();
      }, 50);
    });

    it('deve capturar URL da requisição', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users/123',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            url: '/api/users/123',
          })
        );
        done();
      }, 50);
    });

    it('deve capturar IP da requisição', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '203.0.113.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            ip: '203.0.113.1',
          })
        );
        done();
      }, 50);
    });

    it('deve capturar status code da resposta', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn((event, callback) => {
          if (event === 'finish') {
            callback();
          }
        }),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 200,
          })
        );
        done();
      }, 50);
    });
  });

  describe('Captura de Body', () => {
    it('deve capturar body da requisição POST', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'POST',
        url: '/api/users',
        headers: { 'content-type': 'application/json' },
        socket: { remoteAddress: '192.168.1.1' },
        body: { name: 'John Doe', email: 'john@example.com' },
      };
      const res = {
        statusCode: 201,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            body: { name: 'John Doe', email: 'john@example.com' },
          })
        );
        done();
      }, 50);
    });

    it('deve ignorar body em requisição GET', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
        body: undefined,
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        const callArgs = mockUseCase.execute.mock.calls[0][0];
        expect(callArgs.body).toBeUndefined();
        done();
      }, 50);
    });

    it('deve aceitar body vazio', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'POST',
        url: '/api/users',
        headers: { 'content-type': 'application/json' },
        socket: { remoteAddress: '192.168.1.1' },
        body: {},
      };
      const res = {
        statusCode: 201,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalled();
        done();
      }, 50);
    });
  });

  describe('Middleware Chain', () => {
    it('deve chamar next() para continuar pipeline', () => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      expect(next).toHaveBeenCalled();
    });

    it('não deve bloquear requisição antes do next()', () => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      let nextWasCalled = false;
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn(() => {
        nextWasCalled = true;
      });

      // Act
      middleware(req, res, next);

      // Assert
      expect(nextWasCalled).toBe(true);
    });
  });

  describe('Fire and Forget', () => {
    it('não deve aguardar conclusão do use case antes de chamar next()', () => {
      // Arrange
      let resolveUseCase;
      const mockUseCase = {
        execute: jest.fn(
          () => new Promise(resolve => {
            resolveUseCase = resolve;
          })
        ),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      let nextWasCalled = false;
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn(() => {
        nextWasCalled = true;
      });

      // Act
      middleware(req, res, next);

      // Assert - next foi chamado ANTES de usar case ser resolvido
      expect(nextWasCalled).toBe(true);

      // Cleanup
      resolveUseCase({ id: 1 });
    });
  });

  describe('Captura com Headers Proxy', () => {
    it('deve extrair IP de x-forwarded-for quando disponível', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {
          'x-forwarded-for': '203.0.113.1, 203.0.113.2',
        },
        socket: { remoteAddress: '127.0.0.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            ip: '203.0.113.1',
          })
        );
        done();
      }, 50);
    });
  });

  describe('Erro no Use Case', () => {
    it('não deve interromper requisição mesmo se use case falhar', () => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      let nextWasCalled = false;
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn(() => {
        nextWasCalled = true;
      });

      // Act
      middleware(req, res, next);

      // Assert
      expect(nextWasCalled).toBe(true);
    });
  });

  describe('Headers Ausentes', () => {
    it('deve funcionar quando headers é undefined', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: undefined,
        socket: { remoteAddress: '192.168.1.1' },
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalled();
        done();
      }, 50);
    });

    it('deve usar IP UNKNOWN quando socket não disponível', (done) => {
      // Arrange
      const mockUseCase = {
        execute: jest.fn().mockResolvedValue({ id: 1 }),
      };
      const middleware = createAuditMiddleware(mockUseCase);
      const req = {
        method: 'GET',
        url: '/api/users',
        headers: {},
        socket: null,
      };
      const res = {
        statusCode: 200,
        on: jest.fn(),
      };
      const next = jest.fn();

      // Act
      middleware(req, res, next);

      // Assert
      setTimeout(() => {
        expect(mockUseCase.execute).toHaveBeenCalledWith(
          expect.objectContaining({
            ip: 'UNKNOWN',
          })
        );
        done();
      }, 50);
    });
  });
});
