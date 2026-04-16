// src/adapters/extractors/RequestDataExtractor.js

/**
 * @fileoverview Extrai dados relevantes de uma requisição/resposta HTTP.
 *
 * Responsabilidade única: transformar os objetos req/res do Node.js
 * em um objeto plano com os dados necessários para criar um AuditLog.
 *
 * @module RequestDataExtractor
 */

"use strict";

const { extractIp } = require("../../domain/services/IpExtractor");

/**
 * Headers que devem ser capturados (whitelist da spec-v4).
 * Headers sensíveis (Authorization, Cookie) são explicitamente excluídos.
 * @constant {Set<string>}
 * @private
 */
const ALLOWED_HEADERS = new Set([
    "user-agent",
    "accept",
    "accept-language",
    "accept-encoding",
    "content-type",
    "content-length",
    "x-request-id",
    "x-correlation-id",
    "x-forwarded-for",
    "x-real-ip",
    "origin",
    "referer",
]);

/**
 * Métodos HTTP que podem ter body (spec-v4).
 * @constant {Set<string>}
 * @private
 */
const BODY_METHODS = new Set(["POST", "PUT", "PATCH"]);

/**
 * Extrai e normaliza dados de uma requisição HTTP Express.
 *
 * @param {import('express').Request} req - Objeto Request do Express
 * @param {import('express').Response} res - Objeto Response do Express
 * @param {number} startTime - Timestamp de início (Date.now())
 * @returns {Object} Dados normalizados para criar AuditLog
 */
function extract(req, res, startTime) {
    const method = (req.method ?? "GET").toUpperCase();
    const duration_ms = Date.now() - startTime;

    // Filtra headers pela whitelist e normaliza para lowercase
    const headers = extractHeaders(req.headers);

    // Body apenas para métodos que o suportam e content-type JSON
    const body = shouldCaptureBody(method, req) ? (req.body ?? null) : null;

    return {
        ip: extractIp(req),
        url: req.originalUrl ?? req.url ?? "/",
        method,
        statusCode: res.statusCode ?? 200,
        timestamp: new Date(startTime), // UTC implícito em Node.js
        duration_ms,
        user_agent: req.headers?.["user-agent"],
        headers: Object.keys(headers).length > 0 ? headers : null,
        body,
        // userId: injetado pelo middleware de autenticação da aplicação
        userId: extractUserId(req),
        // request_id: do header ou gerado pelo middleware
        request_id: req._auditRequestId,
    };
}

/**
 * Extrai apenas os headers da whitelist, normalizados para lowercase.
 *
 * @param {Object} rawHeaders - Headers brutos da requisição
 * @returns {Object} Headers filtrados
 * @private
 */
function extractHeaders(rawHeaders) {
    if (!rawHeaders || typeof rawHeaders !== "object") return {};

    return Object.entries(rawHeaders).reduce((acc, [key, value]) => {
        const normalized = key.toLowerCase();
        if (ALLOWED_HEADERS.has(normalized)) {
            acc[normalized] = value;
        }
        return acc;
    }, {});
}

/**
 * Determina se o body deve ser capturado.
 * Critérios: método com body + content-type JSON.
 *
 * @param {string} method - Método HTTP normalizado
 * @param {import('express').Request} req - Requisição
 * @returns {boolean}
 * @private
 */
function shouldCaptureBody(method, req) {
    if (!BODY_METHODS.has(method)) return false;

    const contentType = req.headers?.["content-type"] ?? "";
    return contentType.includes("application/json");
}

/**
 * Extrai o ID do usuário autenticado com fallback.
 *
 * Ordem de prioridade (spec-v4):
 * 1. Header X-User-ID (setado por API Gateway)
 * 2. req.user.id (passport.js, JWT middleware)
 * 3. req.locals.userId (custom middleware)
 * 4. undefined
 *
 * @param {import('express').Request} req
 * @returns {string|undefined}
 * @private
 */
function extractUserId(req) {
    return (
        req.headers?.["x-user-id"] ??
        req.user?.id ??
        req.locals?.userId ??
        undefined
    );
}

module.exports = { extract };