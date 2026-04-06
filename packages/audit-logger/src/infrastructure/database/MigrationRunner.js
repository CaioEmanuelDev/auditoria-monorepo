// src/infrastructure/database/MigrationRunner.js

/**
 * @fileoverview Executa auto-migração da tabela de auditoria
 * no PostgreSQL.
 * 
 * Em produção real, use uma ferramenta de migration (Flyway,
 * Liquibase, node-pg-migrate).
 * Aqui usamos auto-migration para simplificar o MVP e ambientes de desenvolvimento.
 * 
 * @module MigrationRunner
 */

"use strict";

const { getPool } = require('./PostgreSQLConnection');

/**
 * SQl de criação da tabela principal (sem particionamento no MVP).
 * O particionamento é adicionado na v1.3
 * 
 * @constant {string}
 * @private
 */
const CREATE_TABLE_SQL = `
    CREATE TABLE IF NOT EXISTS audit_logs (
        -- Identificadores
        id          BIGSERIAL       PRIMARY KEY,
        request_id  UUID            NOT NULL UNIQUE,
        anonymous_id CHAR(64)       NOT NULL,

        -- Dados da requisição
        ip          VARCHAR(45)     NOT NULL,
        user_id     VARCHAR(255),
        url         VARCHAR(2048)   NOT NULL,
        method      VARCHAR(10)     NOT NULL,
        status_code INTEGER         NOT NULL,
        severity    VARCHAR(10)     NOT NULL,

        -- Payloads (JSONB para flexibilidade e performance)
        body        JSONB,
        headers     JSONB,
        response_body JSONB,

        -- Performance e metadados
        duration_ms INTEGER,
        user_agent  VARCHAR(512),
        schema_version INTEGER      NOT NULL DEFAULT 4,

        -- Timestamps (sempre UTC)
        timestamp   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
`;

/**
 * Índices para queries frequentes (spec-v4).
 * Separados do CREATE TABLE para poder ser executados
 * independentemente.
 * @constant {string[]}
 * @private
 */
const CREATE_INDEXES_SQL = [
    `CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp
    ON audit_logs (timestamp DESC);`,

    `CREATE INDEX IF NOT EXISTS idx_audit_logs_ip
    ON audit_logs (ip);`,

    `CREATE INDEX IF NOT EXISTS idx_audit_logs_status_code
    ON audit_logs (status_code);`,
];

/**
 * Executa as migrações necessárias para o funcionamento do audit-logger.
 * É seguro executar múltiplas vezes (idempotente via IF NOT EXISTS).
 * 
 * @returns {Promise<void>}
 * @throws {Error} Se a conexão com o banco falhar
 * 
 * @example
 * // Na inicialização da aplicação:
 * await runMigrations();
 * console.log('Tabela de auditoria pronta');
 */
async function runMigrations() {
    const pool = getPool();

    // Cria a tabela(idempotente)
    await pool.query(CREATE_TABLE_SQL);

    // Cria os índices (idempotente)
    for (const indexSql of CREATE_INDEXES_SQL) {
        await pool.query(indexSql)
    }
}

module.exports = { runMigrations };