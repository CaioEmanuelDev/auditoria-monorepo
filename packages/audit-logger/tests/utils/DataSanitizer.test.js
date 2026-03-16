/**
 * DataSanitizer Utility Tests
 * 
 * Testa a sanitização centralizada de dados sensíveis.
 * Valida mascaramento de password, token, secret, apiKey, etc.
 */

describe('Utils :: DataSanitizer', () => {
  // const DataSanitizer = require('../../../src/utils/DataSanitizer');

  describe('Mascaramento de Campos Top-Level', () => {
    it('deve mascarar campo password em objeto', () => {
      // Arrange
      const data = {
        username: 'john_doe',
        password: 'super_secret_123',
        email: 'john@example.com',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.password).toBe('********');
      expect(sanitized.username).toBe('john_doe');
      expect(sanitized.email).toBe('john@example.com');
    });

    it('deve mascarar campo token em objeto', () => {
      // Arrange
      const data = {
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        userId: 'user-123',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.token).toBe('********');
      expect(sanitized.userId).toBe('user-123');
    });

    it('deve mascarar campo secret em objeto', () => {
      // Arrange
      const data = {
        secret: 'my_super_secret',
        appId: 'app-123',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.secret).toBe('********');
      expect(sanitized.appId).toBe('app-123');
    });

    it('deve mascarar campo apiKey em objeto', () => {
      // Arrange
      const data = {
        apiKey: 'sk_live_1234567890abcdef',
        service: 'stripe',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.apiKey).toBe('********');
      expect(sanitized.service).toBe('stripe');
    });

    it('deve mascarar múltiplos campos sensíveis simultaneamente', () => {
      // Arrange
      const data = {
        username: 'john_doe',
        password: 'secret123',
        token: 'eyJhbGciOiJIUzI1NiIs...',
        apiKey: 'sk_live_abc123',
        email: 'john@example.com',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.password).toBe('********');
      expect(sanitized.token).toBe('********');
      expect(sanitized.apiKey).toBe('********');
      expect(sanitized.email).toBe('john@example.com');
    });
  });

  describe('Mascaramento de Campos Aninhados (Nested)', () => {
    it('deve mascarar campo password aninhado em objeto', () => {
      // Arrange
      const data = {
        user: {
          name: 'John Doe',
          password: 'secret123',
          email: 'john@example.com',
        },
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.user.password).toBe('********');
      expect(sanitized.user.name).toBe('John Doe');
      expect(sanitized.user.email).toBe('john@example.com');
    });

    it('deve mascarar campos sensíveis em múltiplos níveis de nesting', () => {
      // Arrange
      const data = {
        user: {
          name: 'John',
          credentials: {
            password: 'secret123',
            apiKey: 'sk_live_123',
          },
        },
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.user.credentials.password).toBe('********');
      expect(sanitized.user.credentials.apiKey).toBe('********');
      expect(sanitized.user.name).toBe('John');
    });

    it('deve mascarar campos sensíveis em array de objetos', () => {
      // Arrange
      const data = {
        users: [
          { id: 1, name: 'John', password: 'secret1' },
          { id: 2, name: 'Jane', password: 'secret2' },
        ],
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.users[0].password).toBe('********');
      expect(sanitized.users[1].password).toBe('********');
      expect(sanitized.users[0].name).toBe('John');
      expect(sanitized.users[1].name).toBe('Jane');
    });
  });

  describe('Casos Especiais e Edge Cases', () => {
    it('deve lidar com campo sensível vazio (string vazia)', () => {
      // Arrange
      const data = {
        password: '',
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.password).toBe('');
      expect(sanitized.username).toBe('john');
    });

    it('deve lidar com campo sensível null', () => {
      // Arrange
      const data = {
        password: null,
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.password).toBeNull();
      expect(sanitized.username).toBe('john');
    });

    it('deve lidar com campo sensível undefined', () => {
      // Arrange
      const data = {
        password: undefined,
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.password).toBeUndefined();
      expect(sanitized.username).toBe('john');
    });

    it('deve lidar com campo sensível booleano', () => {
      // Arrange
      const data = {
        password: true,
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      // Mesmo sendo booleano, deve mascarar
      expect(sanitized.password).toBe('********');
    });

    it('deve lidar com campo sensível numérico', () => {
      // Arrange
      const data = {
        password: 12345,
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.password).toBe('********');
    });
  });

  describe('Preservação de Dados', () => {
    it('deve não modificar o objeto original', () => {
      // Arrange
      const original = {
        password: 'secret123',
        username: 'john',
      };
      const originalPassword = original.password;

      // Act
      const sanitized = DataSanitizer.sanitize(original);

      // Assert
      expect(original.password).toBe(originalPassword);
      expect(sanitized.password).toBe('********');
    });

    it('deve retornar novo objeto após sanitização', () => {
      // Arrange
      const data = {
        password: 'secret123',
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized).not.toBe(data);
    });

    it('deve aceitar null/undefined como entrada', () => {
      // Arrange & Act & Assert
      expect(DataSanitizer.sanitize(null)).toBeNull();
      expect(DataSanitizer.sanitize(undefined)).toBeUndefined();
    });
  });

  describe('Campos Case-Insensitive', () => {
    it('deve mascarar PASSWORD (maiúsculo)', () => {
      // Arrange
      const data = {
        PASSWORD: 'secret123',
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.PASSWORD).toBe('********');
    });

    it('deve mascarar Password (camelCase)', () => {
      // Arrange
      const data = {
        Password: 'secret123',
        username: 'john',
      };

      // Act
      const sanitized = DataSanitizer.sanitize(data);

      // Assert
      expect(sanitized.Password).toBe('********');
    });
  });

  describe('Campos Customizados para Sanitização', () => {
    it('deve aceitar lista customizada de campos para sanitizar', () => {
      // Arrange
      const data = {
        ssn: '123-45-6789',
        creditCard: '4532-1111-2222-3333',
        username: 'john',
      };
      const customFields = ['ssn', 'creditCard'];

      // Act
      const sanitized = DataSanitizer.sanitize(data, customFields);

      // Assert
      expect(sanitized.ssn).toBe('********');
      expect(sanitized.creditCard).toBe('********');
      expect(sanitized.username).toBe('john');
    });
  });
});
