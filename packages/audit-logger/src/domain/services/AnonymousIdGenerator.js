// src/domain/services/AnonymousIdGenerator.js

/**
 * @fileoverview Gera identificador anônimo para rastreamento sem PII.
 * @module AnonymousIdGenerator
 */

'use strict';

const { createHash } = require('crypto');

/**
 * Gera um ID anônimo e determinístico combinando IP e User-Agent.
 * 
 * Por que SHA-256?
 * - Determinístico: mesma entrada --> mesmo hash (detecta padrões)
 * - Irreversível: não é possível recuperar IP/UA do hash (proteção de privacidade)
 * - 64 chars hex: único o suficiente para distinção prática
 * 
 * Compliance: usado para detectar padrões sem armazenar PII diretamente.
 * Segue LGPD Art. 5 --- dados anonimizados não são considerados dados pessoais.
 * 
 * @param {string} ip - Endereço IP do cliente.
 * @param {string} [userAgent=''] - User-Agent header da requisição.
 * @returns {string} Hash SHA-256 de 64 caracteres hexadecimais.
 * 
 * @example
 * generate('203.0.113.42', 'Mozilla/5.0...');
 * // → "a1b2c3d4e5f6..." (64 chars, sempre o mesmo para mesma entrada)
 * 
 * generate('UNKNOWN', '');
 * // ->    "5e884898..." (ainda funciona com fallbacks)
 */

function generate(ip, userAgent = '') {
    return createHash('sha256')
    .update(`${ip}${userAgent}`)
    .digest('hex');
}

module.exports = { generate };