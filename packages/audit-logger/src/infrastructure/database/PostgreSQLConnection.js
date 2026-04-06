// src/infrastructure/database/PostgreSQLConnection.js

/**
 * @fileoverview Singleton de conexão com PostgreSQL usando pool de conexões.
 * 
 * Por que Singleton?
 * - Evita múltiplas conexões desnecessárias
 * - Mantém estado consistente
 * - Facilita gerenciamento de recursos
 * - Padrão de projeto conhecido e testado
 * - Um pool de conexões é caro para criar
 * - Toda a aplicação deve compartilhar o mesmo pool
 * - Node.js module cache garante uma única instância por processo
 * 
 * @module PostgreSQLConnection
 */

"use strict";

const { Pool } = require('pg');

/**
 * @typedef {Object} DatabaseConfig
 * @property {string} [connectionString] - Connection string completa
 * @property {string} [host] - Host do banco
 * @property {number} [port=5432] - Porta do banco
 * @property {string} [database] - Nome do banco
 * @property {string} [user] - Usuário
 * @property {string} [password] - Senha
 * @property {number} [min=5] - Conexões mínimas no pool
 * @property {number} [max=20] - Conexões máximas no pool
 * @property {number} [connectionTimeoutMillis=5000] - Timeout de conexão
 * @property {number} [query_timeout=1000] - Timeout de query
 */

/**
 * Instância singleton do pool (módulo-nível).
 * @type {Pool|null}
 * @private
 */
let _pool = null;

/**
 * Inicializa o pool de conexões PostgreSQL.
 * Deve ser chamado uma única vez durante a inicialização da aplicação.
 * 
 * @param {DatabaseConfig} config - Configuração da conexão
 * @returns {Pool} Pool de conexões inicializado
 * 
 * @example
 * const pool = initializePool({
 *  connectionString: process.env.DATABASE_URL,
 *  min: 5,
 *  max: 20,
 *  connectionTimeoutMillis: 5000,
 *  query_timeout: 1000,
 * });
 */
function initializePool(config) {
    if (_pool) {
        return _pool; //Já inicializado - retorna o existente
    }

    _pool = new Pool({
        connectionString: config.connectionString,
        host: config.host,
        port: config.port ?? 5432,
        database: config.database,
        user: config.user,
        password: config.password,
        min: config.min ?? 5,
        max: config.max ?? 20,
        connectionTimeoutMillis: config.connectionTimeoutMillis ?? 5000,
        query_timeout: config.query_timeout ?? 1000,
        // Importante: desabilite SSL em desenvolvimento, habilita em produção
        // @ts-ignore
        ssl: config.ssl ?? false,
    });

    // Escuta erros do pool (conexões que caem em idle)
    _pool.on('error', (err) => {
        process.stderr.write(`[audit-logger] Pool error: ${err.message}\n`);
    });

    return _pool;
}

/**
 * Retorna o pool de conexões atual.
 * Lança erro se `initializePool` não foi chamado antes.
 * 
 * @returns {Pool} Pool ativo
 * @throws {Error} Se o pool não foi inicializado
 */
function getPool() {
    if (!_pool) {
        throw new Error(
            "[audit-logger] Pool não inicializado. Chame Audit.initialize() primeiro.",
        );
    }
    return _pool;
}

/**
 * Fecha todas as conexões do pool e reseta o singleton.
 * Deve ser chamado no graceful shutdown da aplicação.
 * 
 * @returns {Promise<void>}
 */
async function closePool() {
    if (_pool) {
        await _pool.end();
        _pool = null;
    }
}

/**
 * Testa se a conexão com o banco está ativa.
 * 
 * @returns {Promise<boolean>} true se conectado, false caso contrário
 */
async function testConnection() {
    try {
        const pool = getPool();
        const result = await pool.query("SELECT 1 AS ok");
        return result.rows[0].ok === 1;
    } catch {
        return false;
    }
}

module.exports = { initializePool, getPool, closePool, testConnection }