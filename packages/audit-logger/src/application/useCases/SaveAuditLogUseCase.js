// src/application/useCases/SaveAuditLogUseCase.js

/**
 * @fileoverview Caso de uso: salvar um log de auditoria.
 *
 * Orquestra: criação da entidade → validação → persistência.
 * No MVP, persiste diretamente. Na v1.1, adiciona ao buffer.
 *
 * @module SaveAuditLogUseCase
 */

"use strict";

const { AuditLog } = require("../../domain/entities/AuditLog");

/**
 * Caso de uso responsável por salvar um log de auditoria.
 * @class
 */
class SaveAuditLogUseCase {
    /**
     * @constructor
     * @param {import('../ports/IAuditLogRepository').IAuditLogRepository} repository
     *   Repositório de persistência (injetado — Dependency Injection)
     */
    constructor(repository) {
        /** @private */
        this._repository = repository;
    }

    /**
     * Executa o salvamento de um log de auditoria.
     *
     * Fluxo:
     * 1. Cria a entidade AuditLog (valida e deriva campos)
     * 2. Persiste via repositório injetado
     * 3. Captura erros (fire-and-forget — não propaga para middleware)
     *
     * @param {Object} rawData - Dados brutos da requisição HTTP
     * @returns {Promise<void>} Resolve sempre (erros são logados, não propagados)
     *
     * @example
     * const useCase = new SaveAuditLogUseCase(repository);
     * await useCase.execute({
     *   ip: '203.0.113.42',
     *   url: '/api/users',
     *   method: 'GET',
     *   statusCode: 200,
     *   timestamp: new Date()
     * });
     */
    async execute(rawData) {
        try {
            const auditLog = new AuditLog(rawData);
            await this._repository.save(auditLog);
        } catch (err) {
            // Log interno da lib — nunca propaga para o middleware
            process.stderr.write(
                `[audit-logger] Falha ao salvar log: ${err.message}\n`,
            );
        }
    }
}

module.exports = { SaveAuditLogUseCase };