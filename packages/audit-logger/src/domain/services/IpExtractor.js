// src/domain/services/IpExtractor.js

/**
 * @fileoverview Extrai o IP real do cliente de uma requisição HTTP.
 * @module IpExtractor
 */

'use strict';

/**
 * Fallback quando o IP não pode ser determinado
 * @constant {string}
 */
const UNKNOWN_IP = 'UNKNOWN';

/**
 * Extrai o endereço IP do cliente real de uma requisição HTTP
 * 
 * Ordem de prioridade (spec-v4):
 * 1. `X-Forwarded-For` header (primeiro IP da lista, sem espaços)
 * 2. `X-Real-IP` header (nginx proxy)
 * 3. `req.socket.remoteAddress` (conexão direta)
 * 4. 'UNKNOWN' (fallback seguro)
 * 
 * @param {import('express').Request} req - Objeto de requisição Express/Node.js
 * @returns {string} IP do cliente ou 'UNKNOWN' (nunca null/undefined)
 * 
 * @example
 * // Sem proxy (conexão direta):
 * extractIp(req); // -> "203.0.113.42"
 * 
 * // Com proxy reverso (X-Forwarded-For):
 * // X-Forwarded-For: "203.0.113.42, 10.0.0.1, 172.16.0.5"
 * extractIp(req); // -> "203.0.113.42"
 */

function extractIp(req) {
    // Prioridade 1: X-Forwarded-For (proxy chain)
    const forwarded = req.headers?.['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
        // "203.0.113.42, 10.0.0.1" → ["203.0.113.42", "10.0.0.1"] → "203.0.113.42"
        const firstIp = forwarded.split(',')[0].trim();
        if (firstIp) return firstIp;
    }

    // Prioridade 2: X-Real-IP (nginx)
    const realIp = req.headers?.['x-real-ip'];
    if (realIp && typeof realIp === 'string' && realIp.trim()) {
        return realIp.trim();
    }

    // Prioridade 3: Socket (conexão direta)
    const socketIp = req.socket?.remoteAddress;
    if (socketIp && typeof socketIp === 'string' && socketIp.trim()) {
        return socketIp;
    }

    // Fallback seguro
    return UNKNOWN_IP;
}

module.exports = { extractIp, UNKNOWN_IP };

