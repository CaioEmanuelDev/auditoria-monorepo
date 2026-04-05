// src/domain/entities/AuditLog.js

/**
 * @fileoverview Entidade de domínio para logs de auditoria HTTP.
 * 
 * Esta é a peça central do domínio. Representa um evento de auditoria
 * completo e validado. Todos os campos obrigatórios são verificados
 * no contrutor --- nenhum AuditLog inválido pode existir.
 * 
 * @module AuditLog
 */

'use strict';

const { randomUUID } = require('node:crypto');
const { classify } = require('../services/SeverityClassifier');
const { generate } = require('../services/AnonymousIdGenerator');
const { InvalidAuditLogError } = require('../exceptions/InvalidAuditLogError');

/**
 * Métodos HTTP permitidos pela spec-v4.
 * @constant {Set<string>}
 * @private
 */
const ALLOWED_METHODS = new Set([
    'GET', 
    'POST', 
    'PUT', 
    'DELETE', 
    'PATCH', 
    'HEAD', 
    'OPTIONS'
]);

/**
 * Limite do tamanho da URL em Bytes (espec-v4: 2048).
 * @constant {number}
 * @private
 */

const MAX_URL_BYTES = 2048;

/**
 * Janela de tempo no passado para rejeitar timestamps muito antigos (31 dias em ms).
 * @constant {number}
 * @private
 */

const MAX_PAST_MS = 31*24*60*60*1000;

/**
 * Janela de tolerância para timestamps no futuro (12 horas em ms, clock skew).
 * @constant {number}
 * @private
 */

const MAX_FUTURE_MS = 12*60*60*1000;

/**
 * Representa um log de auditoria HTTP validado e imutável.
 * 
 * Campos auto-gerados se não fornecidos:
 * - 'request_id': UUID v4 aleat´rio
 * - 'anonymus_id': SHA-256(ip + userAgent)
 * - 'severity': derivado do statusCode
 * - 'timestamp': Date.now() se não fornecido
 * 
 * @class
 * 
 * @example
 * const log = new AuditLog({
 *  ip: '203.0.113.42',
 *  url: '/api/users',
 *  method: 'GET',
 *  statusCode: 200,
 *  timestamp: Date.now()});
 * 
 * console.log(log.severity); // -> 'INFO'
 * console.log(log.request_id); // -> 'uuid-v4-gerado'
 */
class AuditLog {
    /**
     * @constructor
     * @param {Object} data - Dados brutos da requisição HTTP
     * @param {string} data.ip - IP do cliente (obrigatório)
     * @param {string} data.url - URL da requisição (obrigatório, max 2048 bytes)
     * @param {string} data.method - Método HTTP em maiúsculas (obrigatório)
     * @param {number} data.statusCode - Status HTTP 100-599, inteiro (obrigatório)
     * @param {Date|string} data.timestamp - Momento da requisição UTC (obrigatório)
     * @param {string} [data.request_id] - UUID v4 (auto-gerado se ausente)
     * @param {string} [data.userId] - ID do usuário autenticado
     * @param {Object|null} [data.body] - Body da requisição (sanitizado)
     * @param {Object|null} [data.headers] - Headers filtrados pela whitelist
     * @param {Object|null} [data.response_body] - Body da resposta
     * @param {number} [data.duration_ms] - Latência em milissegundos
     * @param {string} [data.user_agent] - User-Agent header
     * @param {number} [data.schema_version=4] - Versão do schema
     * 
     * @throws {InvalidAuditLogError}
     */
    constructor(data) {
    // ── Validações obrigatórias ──────────────────────────────────────────────
    
    this._validateIp(data.ip);
    this._validateUrl(data.url);
    this._validateMethod(data.method);
    this._validateTimestamp(data.timestamp);
    // statusCode é validado dentro de classify()

    // ── Campos obrigatórios ──────────────────────────────────────────────────
    /**@type {string} IP do cliente */
    this.ip = data.ip;

    /**@type {string} URL da requisição */
    this.url = data.url;

    /**@type {string} Método HTTP */
    this.method = data.method.toUpperCase();

    /**@type {number} Status HTTP */
    this.statusCode = data.statusCode;

    /**@type {Date} Timestamp da requisição (UTC) */
    this.timestamp = data.timestamp instanceof Date
    ? data.timestamp
    : new Date(data.timestamp);

    // ── Campos auto-gerados ──────────────────────────────────────────────────
    /**@type {string} UUID v4 único por requisição */
    this.request_id = data.request_id ?? randomUUID();

    /**@type {'INFO' | 'WARN' | 'ERROR'} Severidade derivada do statusCode */
    this.severity = classify(this.statusCode);

    
    /**@type {string} SHA256(IP + userAgent) para anonimização */
    this.anonymus_id = generate(data.ip, data.user_agent ?? '');

     // ── Campos opcionais ─────────────────────────────────────────────────────
     /**@type {string|undefined} ID do usuário autenticado */
     this.userId = data.userId;

     /**@type {Object|null|undefined} Body da requisição */
     this.body = data.body ?? null;

     /**@type {Object|null|undefined} Headers da requisição */
     this.headers = data.headers ?? null;

     /**@type {Object|null|undefined} Body da resposta */
     this.response_body = data.response_body ?? null;

     /**@type {number|undefined} Latência em ms */
     this.duration_ms = data.duration_ms;

     /**@type {string|undefined} User-Agent */
     this.user_agent = data.user_agent;

     /**@type {number} Versão do schema (default: 4) */
     this.schema_version = data.schema_version ?? 4;

     // Torna o objeto imutável --- logs não devem ser modificados após criação
     Object.freeze(this);
}

/**
 * Valida o campo IP.
 * @private
 * @param {*} ip
 * @throws {InvalidAuditLogError}
 */
_validateIp(ip) {
    if (!ip || typeof ip !== 'string' || ip.trim().length === 0) {
        throw new InvalidAuditLogError(
            'ip é obrigatório e deve ser uma string não vazia',
            { received: ip }
        )
    }
}

/**
 * Valida a URL (não vazia, max 2048 bytes).
 * @private
 * @param {*} url
 * @throws {InvalidAuditLogError}
 */
_validateUrl(url) {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
        throw new InvalidAuditLogError('url é obrigatória', { received: url });
    }

    const byteLength = Buffer.byteLength(url, 'utf8');
    if (byteLength > MAX_URL_BYTES) {
        throw new InvalidAuditLogError(
            `url excede ${MAX_URL_BYTES} bytes`,
            { byteLength, url: url.substring(0, 50) + '...'}
        );
    }
}

/**
 * Valida o método HTTP contra a lista permitida.
 * @private
 * @param {*} method
 * @throws {InvalidAuditLogError}
 */
_validateMethod(method) {
    if(!method || typeof method !== 'string') {
        throw new InvalidAuditLogError('method é obrigatório', { received: method });
    }
    const upper = method.toUpperCase();
    if(!ALLOWED_METHODS.has(upper)) {
        throw new InvalidAuditLogError(
            `method inválido: ${method}`,
            { allowed: [...ALLOWED_METHODS] }
        )
    }
}
/**
 * Valida o timestamp: deve ser Date válido, não muito no futuro e nem muito no passado.
 * @private
 * @param {*} timestamp
 * @throws {InvalidAuditLogError}
 */
_validateTimestamp(timestamp) {
    if (!timestamp) {
        throw new InvalidAuditLogError('timestamp é obrigatório', { received: timestamp });
    }

    const ts = timestamp instanceof Date ? timestamp : new Date(timestamp);

    if(isNaN(ts.getTime())) {
        throw new InvalidAuditLogError('timestamp inválido', { received: timestamp });
    }

    const now = Date.now();
    const diff = ts.getTime() - now;

    if(diff > MAX_FUTURE_MS) {
        throw new InvalidAuditLogError(
            'timestamp mais de 12h no futuro (possível erro de clock)',
            { timestamp: ts.toISOString()}
        );
    }

    if(now - ts.getTime() > MAX_PAST_MS) {
        throw new InvalidAuditLogError(
            'timestamp mais de 31 dias no passado',
            { timestamp: ts.toISOString() }
        );
    }
}
}


module.exports = { AuditLog };