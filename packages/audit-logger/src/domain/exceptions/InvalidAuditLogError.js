// src/domain/exceptions/InvalidAuditLogError.js

/**
 * @fileoverview Erro lançado quando dados de um AuditLog são inválidos.
 * @module InvalidAuditLogError
 */

'use strict'

/**
 * Erro de domínio para AuditLog com dados inválidos.
 * Estende Error nativo para manter stack trace e instanceof.
 * 
 * @class
 * @extends Error
 * 
 * @example
 * throw new InvalidAuditLogError('statusCode deve ser inteiro', { statusCode: 99.5 });
 */

class InvalidAuditLogError extends Error {
    /**
     * @constructor
     * @param {string} message - Descrição do erro
     * @param {object} [context={}] - Dados contextuais para debugging
     */
    constructor(message, context = {}) {
        super(message);

        /**@type {string} Nome da classe de erro*/
        this.name = 'InvalidAuditLogError';

        /**@type {object} Contexto adicional do erro */
        this.context = context;

        // Garante stack trace correto no V8 (Node.js)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, InvalidAuditLogError);
        }
    }
}

module.exports = { InvalidAuditLogError }

