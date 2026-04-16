// src/infrastructure/database/AuditLogRepository.js

/**
 * @fileoverview Repositório de AuditLog com PostgreSQL.
 * Implementa IAuditLogRepository usando pg (node-postgres).
 * 
 * MVP: insert direto (sem batch).
 * v1.1: batch insert com buffer.
 * 
 * @module AuditLogRepository
 */

'use strict'

const {
    IAuditLogRepository,
} = require("../../application/ports/IAuditLogRepository")
const { getPool } = require('./PostgreSQLConnection')

/**
 * SQL de insert de um único Log.
 * Usa ON CONFLICT DO NOTHING para idempotência (retry seguro).
 * @constant {string}
 * @private
 */
const INSERT_SQL = `
    INSERT INTO audit_logs (
        request_id, anonymous_id, ip, user_id, url, method,
        status_code, severity, body, headers, response_body,
        duration_ms, user_agent, schema_version, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (request_id) DO NOTHING;
`;

/**
 * Repositório de persistência de AuditLog no PostgreSQL.
 * @class
 * @implements {IAuditLogRepository}
 */
class AuditLogRepository extends IAuditLogRepository {
    /**
   * Persiste um único AuditLog no banco de dados.
   *
   * Note: JSONB requer que objetos JavaScript sejam passados como string JSON
   * para o driver pg (ele faz o cast automaticamente quando recebe string).
   *
   * @param {import('../../domain/entities/AuditLog').AuditLog} log
   * @returns {Promise<void>}
   * @throws {Error} Se a query falhar
   */
    async save(log) {
        const pool = getPool();

        await pool.query(INSERT_SQL, [
            log.request_id, // $1  UUID
            log.anonymous_id, // $2  CHAR(64)
            log.ip, // $3  VARCHAR(45)
            log.userId ?? null, // $4  VARCHAR(255)
            log.url, // $5  VARCHAR(2048)
            log.method, // $6  VARCHAR(10)
            log.statusCode, // $7  INTEGER
            log.severity, // $8  VARCHAR(10)
            log.body ? JSON.stringify(log.body) : null, // $9  JSONB
            log.headers ? JSON.stringify(log.headers) : null, // $10 JSONB
            log.response_body ? JSON.stringify(log.response_body) : null, // $11 JSONB
            log.duration_ms ?? null, // $12 INTEGER
            log.user_agent ?? null, // $13 VARCHAR(512)
            log.schema_version, // $14 INTEGER
            log.timestamp, // $15 TIMESTAMP
        ]);
    }

    /**
     * Verifica saúde da conexão com o banco.
     * @returns {Promise<boolean>}
     */
    async isHealthy() {
        try {
            const pool = getPool();
            await pool.query('SELECT 1');
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Fecha o pool de conexões.
     * @returns {Promise<void>}
     */
    async close() {
        const { closePool } = require('./PostgreSQLConnection');
        await closePool();
    }
}

module.exports = { AuditLogRepository };