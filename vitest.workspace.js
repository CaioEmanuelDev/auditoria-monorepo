// Como o Vitest sabe quais pacotes testar no monorepo
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/*/vitest.config.js'
]);