// src/domain/services/SeverityClassifier.js

/**
 * @fileoverview Classifica a severidade de logs baseado no status HTTP.
 * @module SeverityClassifier
 */

'use strict';

/**
 * @typedef {'INFO'|'WARN'|'ERROR'} Severity
 */

/**
 * Tabela de mapeamento: range de status → severidade.
 * Extraída como constante para facilitar testes e modificações.
 *
 * @type {Array<{min: number, max: number, severity: Severity}>}
 * @constant
 * @private
 */
const SEVERITY_RANGES = [
    { min: 100, max: 399, severity: 'INFO' },
    { min: 400, max: 499, severity: 'WARN' },
    { min: 500, max: 599, severity: 'ERROR' },
];

/**
 * Determina a severidade de auditoria para um código de status HTTP.
 *
 * Regras (da spec-v4):
 * - 100–399 → INFO  (sucesso e redirecionamentos)
 * - 400–499 → WARN  (erros do cliente)
 * - 500–599 → ERROR (erros do servidor)
 *
 * @param {number} statusCode - Código de status HTTP (100-599, inteiro)
 * @returns {Severity} Severidade correspondente
 * @throws {import('../exceptions/InvalidAuditLogError').InvalidAuditLogError}
 *   Se statusCode não for inteiro ou estiver fora do range 100-599
 *
 * @example
 * classify(200);  // → 'INFO'
 * classify(301);  // → 'INFO'
 * classify(400);  // → 'WARN'
 * classify(401);  // → 'WARN'
 * classify(500);  // → 'ERROR'
 * classify(503);  // → 'ERROR'
 */
function classify(statusCode) {
    const { InvalidAuditLogError } = require('../exceptions/InvalidAuditLogError');

    if (!Number.isInteger(statusCode)) {
        throw new InvalidAuditLogError(
            'statusCode deve ser um inteiro',
            { received: statusCode, type: typeof statusCode }
        );
    }

    const range = SEVERITY_RANGES.find(
        (r) => statusCode >= r.min && statusCode <= r.max
    );

    if (!range) {
        throw new InvalidAuditLogError(
            'statusCode fora do intervalo válido (100-599)',
            { received: statusCode }
        );
    }

    return range.severity;
}

module.exports = { classify };