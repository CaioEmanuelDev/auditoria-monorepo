/**
 * SeverityClassifier Utility Tests
 * 
 * Testa a classificação automática de severidade baseada em status HTTP.
 */

describe('Utils :: SeverityClassifier', () => {
  // const SeverityClassifier = require('../../../src/utils/SeverityClassifier');

  describe('Classificação por Faixa de Status Code', () => {
    it('deve classificar status 100-199 como INFO', () => {
      // Arrange
      const statusCodes = [100, 101, 102, 150, 199];

      statusCodes.forEach(code => {
        // Act
        const severity = SeverityClassifier.classify(code);

        // Assert
        expect(severity).toBe('INFO');
      });
    });

    it('deve classificar status 200-299 como INFO', () => {
      // Arrange
      const statusCodes = [200, 201, 202, 204, 206, 250, 299];

      statusCodes.forEach(code => {
        // Act
        const severity = SeverityClassifier.classify(code);

        // Assert
        expect(severity).toBe('INFO');
      });
    });

    it('deve classificar status 300-399 como INFO', () => {
      // Arrange
      const statusCodes = [300, 301, 302, 304, 307, 350, 399];

      statusCodes.forEach(code => {
        // Act
        const severity = SeverityClassifier.classify(code);

        // Assert
        expect(severity).toBe('INFO');
      });
    });

    it('deve classificar status 400-499 como WARN', () => {
      // Arrange
      const statusCodes = [400, 401, 403, 404, 429, 450, 499];

      statusCodes.forEach(code => {
        // Act
        const severity = SeverityClassifier.classify(code);

        // Assert
        expect(severity).toBe('WARN');
      });
    });

    it('deve classificar status 500-599 como ERROR', () => {
      // Arrange
      const statusCodes = [500, 501, 502, 503, 504, 550, 599];

      statusCodes.forEach(code => {
        // Act
        const severity = SeverityClassifier.classify(code);

        // Assert
        expect(severity).toBe('ERROR');
      });
    });
  });

  describe('Status Codes Comuns', () => {
    describe('2xx Success', () => {
      it('200 OK deve ser INFO', () => {
        expect(SeverityClassifier.classify(200)).toBe('INFO');
      });

      it('201 Created deve ser INFO', () => {
        expect(SeverityClassifier.classify(201)).toBe('INFO');
      });

      it('204 No Content deve ser INFO', () => {
        expect(SeverityClassifier.classify(204)).toBe('INFO');
      });
    });

    describe('3xx Redirection', () => {
      it('301 Moved Permanently deve ser INFO', () => {
        expect(SeverityClassifier.classify(301)).toBe('INFO');
      });

      it('302 Found deve ser INFO', () => {
        expect(SeverityClassifier.classify(302)).toBe('INFO');
      });

      it('304 Not Modified deve ser INFO', () => {
        expect(SeverityClassifier.classify(304)).toBe('INFO');
      });
    });

    describe('4xx Client Error', () => {
      it('400 Bad Request deve ser WARN', () => {
        expect(SeverityClassifier.classify(400)).toBe('WARN');
      });

      it('401 Unauthorized deve ser WARN', () => {
        expect(SeverityClassifier.classify(401)).toBe('WARN');
      });

      it('403 Forbidden deve ser WARN', () => {
        expect(SeverityClassifier.classify(403)).toBe('WARN');
      });

      it('404 Not Found deve ser WARN', () => {
        expect(SeverityClassifier.classify(404)).toBe('WARN');
      });

      it('429 Too Many Requests deve ser WARN', () => {
        expect(SeverityClassifier.classify(429)).toBe('WARN');
      });
    });

    describe('5xx Server Error', () => {
      it('500 Internal Server Error deve ser ERROR', () => {
        expect(SeverityClassifier.classify(500)).toBe('ERROR');
      });

      it('502 Bad Gateway deve ser ERROR', () => {
        expect(SeverityClassifier.classify(502)).toBe('ERROR');
      });

      it('503 Service Unavailable deve ser ERROR', () => {
        expect(SeverityClassifier.classify(503)).toBe('ERROR');
      });

      it('504 Gateway Timeout deve ser ERROR', () => {
        expect(SeverityClassifier.classify(504)).toBe('ERROR');
      });
    });
  });

  describe('Validação de Input', () => {
    it('deve rejeitar status code null', () => {
      expect(() => SeverityClassifier.classify(null)).toThrow();
    });

    it('deve rejeitar status code undefined', () => {
      expect(() => SeverityClassifier.classify(undefined)).toThrow();
    });

    it('deve rejeitar status code negativo', () => {
      expect(() => SeverityClassifier.classify(-1)).toThrow();
    });

    it('deve rejeitar status code string', () => {
      expect(() => SeverityClassifier.classify('200')).toThrow();
    });

    it('deve rejeitar status code fora do range (> 599)', () => {
      expect(() => SeverityClassifier.classify(600)).toThrow();
    });

    it('deve rejeitar status code fora do range (< 100)', () => {
      expect(() => SeverityClassifier.classify(99)).toThrow();
    });
  });

  describe('Tipos de Input', () => {
    it('deve aceitar número inteiro', () => {
      const severity = SeverityClassifier.classify(200);
      expect(['INFO', 'WARN', 'ERROR']).toContain(severity);
    });

    it('deve rejeitar número float', () => {
      expect(() => SeverityClassifier.classify(200.5)).toThrow();
    });

    it('deve rejeitar boolean', () => {
      expect(() => SeverityClassifier.classify(true)).toThrow();
    });

    it('deve rejeitar objeto', () => {
      expect(() => SeverityClassifier.classify({})).toThrow();
    });

    it('deve rejeitar array', () => {
      expect(() => SeverityClassifier.classify([200])).toThrow();
    });
  });
});
