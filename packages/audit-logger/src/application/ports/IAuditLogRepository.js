// src/application/ports/IAuditLogRepository.js

/**
 * @fileoverview Interface (Port) para persistência de logs de auditoria.
 * 
 * Conceito - Port & Adapter:
 * Esta "interface" define o contrato que qualquer repositório deve segir.
 * A camada de Application conhece apenas este contrato - não sabe se é
 * PostgreSQL, MongoDB, arquivo JSON, etc. Isso é Dependency Inversion
 * 
 * Implementações (Adapters):
 * - AuditLogRepository (PostgreSQL) - caminho feliz
 * - FallbackRepository (JSON lines) - quando banco falha
 * 
 * @module IAuditLogRepository
 */

"use strict";

/**
 * Interface abstrata para repositório de AuditLog.
 * Implemente esta classe para criar novos backends de persistência.
 * 
 * @abstract
 * @class
 */
class IAuditLogRepository {
    /**
     * Persiste um único log de auditoria.
     * 
     * @abstract
     * @param {import('../../domain/entities/AuditLog').AuditLog} log
     * @returns {Promise<void>}
     * @throws {Error} Sempre (não implementado na classe base)
     */
    async save(log) {
        throw new Error("IAuditLogRepository.save() deve ser implementado")
    }

    /**
     * Persiste um batch de logs de auditoria de forma eficiente.
     * 
     * @abstract
     * @param {import('../../domain/entities/AuditLog').AuditLog[]} logs
     * @returns {Promise<void>}
     * @throws {Error} Sempre (não implementado na classe base)
     */
    async saveBatch(logs) {
        throw new Error("IAuditLogRepository.saveBatch() não implementado")
    }

    /**
     * Verifica se a conexão com o backend está ativa.
     * 
     * @abstract
     * @returns {Promise<boolean>}
     */
    async isHealthy() {
        throw new Error('IAuditLogRepository.isHealthy() não implementado');
    }

    /**
     * Fecha a conexão e libera recursos.
     * 
     * @abstract
     * @returns {Promise<void>}
     */
    async close() {
        throw new Error('IAuditLogRepository.close() não implementado');
    }
}

module.exports = { IAuditLogRepository };