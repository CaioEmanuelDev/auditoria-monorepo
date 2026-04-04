/**
 * @file vitest.config.js - Configuração de testes para o pacote audit-logger
 * @description Define o environment, globals, e coverage para testes com Vitest
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ✅ Node environment (não browser)
    environment: 'node',
    
    // ✅ Globals (describe, it, beforeEach, etc. sem importar)
    globals: true,
    
    // ✅ Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.js'],
      // Não contar testes, spec files, ou configuração
      exclude: ['**/*.test.js', '**/*.spec.js', 'node_modules/']
    },
    
    // ✅ Configurações de timeout (testes de DB podem ser lentos)
    testTimeout: 10000,
    hookTimeout: 10000,
    
    // ✅ Suprimir logs durante testes (mais limpo)
    silent: false
  }
});
