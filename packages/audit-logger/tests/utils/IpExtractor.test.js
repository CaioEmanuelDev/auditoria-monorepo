/**
 * IP Extractor Utility Tests
 * 
 * Testa a extração de IP a partir de requisições HTTP,
 * considerando proxies, headers customizados e cases especiais.
 */

describe('Utils :: IpExtractor', () => {
  // const IpExtractor = require('../../../src/utils/IpExtractor');

  describe('Extração de IP Direto', () => {
    it('deve extrair IP de socket.remoteAddress (conexão direta)', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '192.168.1.100',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('192.168.1.100');
    });

    it('deve extrair IP de socket.connection.remoteAddress', () => {
      // Arrange
      const req = {
        socket: {
          connection: {
            remoteAddress: '10.0.0.5',
          },
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('10.0.0.5');
    });
  });

  describe('Extração via Headers HTTP', () => {
    it('deve extrair IP do header x-forwarded-for', () => {
      // Arrange
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1, 203.0.113.2, 203.0.113.3',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('203.0.113.1'); // Primeiro IP (cliente original)
    });

    it('deve extrair o PRIMEIRO IP quando x-forwarded-for contém múltiplos', () => {
      // Arrange
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1, 203.0.113.2, 203.0.113.3',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('203.0.113.1');
    });

    it('deve extrair IP de x-real-ip header', () => {
      // Arrange
      const req = {
        headers: {
          'x-real-ip': '192.0.2.100',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('192.0.2.100');
    });

    it('deve extrair IP de cf-connecting-ip (Cloudflare)', () => {
      // Arrange
      const req = {
        headers: {
          'cf-connecting-ip': '198.51.100.5',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('198.51.100.5');
    });
  });

  describe('Prioridade de Headers', () => {
    it('deve usar x-forwarded-for se disponível (maior prioridade)', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '127.0.0.1',
        },
        headers: {
          'x-forwarded-for': '203.0.113.1',
          'x-real-ip': '192.0.2.100',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('203.0.113.1');
    });

    it('deve usar x-real-ip se x-forwarded-for não existir', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '127.0.0.1',
        },
        headers: {
          'x-real-ip': '192.0.2.100',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('192.0.2.100');
    });

    it('deve usar cf-connecting-ip como fallback', () => {
      // Arrange
      const req = {
        headers: {
          'cf-connecting-ip': '198.51.100.5',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('198.51.100.5');
    });

    it('deve usar socket.remoteAddress como último recurso', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '192.168.1.1',
        },
        headers: {},
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('192.168.1.1');
    });
  });

  describe('IPv6 Support', () => {
    it('deve aceitar endereço IPv6 válido', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '::1',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('::1');
    });

    it('deve remover prefixo IPv4-mapped em IPv6', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '::ffff:192.168.1.1',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('192.168.1.1');
    });

    it('deve aceitar IPv6 completo', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
    });
  });

  describe('Casos de Erro e Fallback', () => {
    it('deve retornar UNKNOWN quando IP não puder ser extraído', () => {
      // Arrange
      const req = {
        headers: {},
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('UNKNOWN');
    });

    it('deve retornar UNKNOWN quando req é null', () => {
      // Arrange
      const req = null;

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('UNKNOWN');
    });

    it('deve retornar UNKNOWN quando req é undefined', () => {
      // Arrange
      const req = undefined;

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('UNKNOWN');
    });

    it('deve retornar UNKNOWN quando headers é undefined', () => {
      // Arrange
      const req = {
        headers: undefined,
        socket: undefined,
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('UNKNOWN');
    });

    it('deve retornar UNKNOWN quando socket é null', () => {
      // Arrange
      const req = {
        socket: null,
        headers: {},
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('UNKNOWN');
    });

    it('deve retornar UNKNOWN quando x-forwarded-for é vazio', () => {
      // Arrange
      const req = {
        headers: {
          'x-forwarded-for': '',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('UNKNOWN');
    });

    it('deve ignorar x-forwarded-for com apenas espaços', () => {
      // Arrange
      const req = {
        headers: {
          'x-forwarded-for': '   ',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('UNKNOWN');
    });
  });

  describe('Limpeza e Sanitização de IP', () => {
    it('deve remover espaços em branco de x-forwarded-for', () => {
      // Arrange
      const req = {
        headers: {
          'x-forwarded-for': ' 203.0.113.1 , 203.0.113.2',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('203.0.113.1');
    });

    it('deve remover espaços em branco de socket.remoteAddress', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '  192.168.1.1  ',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('192.168.1.1');
    });
  });

  describe('Localhost', () => {
    it('deve aceitar 127.0.0.1', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '127.0.0.1',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('127.0.0.1');
    });

    it('deve aceitar ::1 (IPv6 localhost)', () => {
      // Arrange
      const req = {
        socket: {
          remoteAddress: '::1',
        },
      };

      // Act
      const ip = IpExtractor.extract(req);

      // Assert
      expect(ip).toBe('::1');
    });
  });
});
