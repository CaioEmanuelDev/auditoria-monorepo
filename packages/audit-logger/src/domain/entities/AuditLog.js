import { randomUUID, createHash } from 'node:crypto';
import { InvalidAuditLogError } from '../exceptions/invalidAuditLogError';


/**
 * @class AuditLog
 * @description Entidade responsável por centralizar e validar logs de auditoria
 */

export class AuditLog{
    // Identificadores Privados
    #id; #request_id; #anonymous_id;
    // Dados da Requisição
    #ip; #url; #method; #statusCode; #severity; #timestamp;
    // Payloads e Metadados
    #userId; #body; #headers; #response_body; #duration_ms; #user_agent;

/**
 * 
 * @param {Object} props - Propriedades do log de auditoria
 * @param {string} props.ip - IP do cliente (obrigatório, ou "UNKNOWN")
 * @param {string} props.url - URL da requisição (obrigatório, max 2048 bytes)
 * @param {string} props.method - Método HTTP (obrigatório, GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)
 * @param {number} props.statusCode - Código de status HTTP (obrigatório, 100-599)
 * @param {Date|string} props.timestamp - Timestamp da requisição (obrigatório, UTC)
 * @param {string} [props.userId] - ID do usuário (opcional)
 * @param {object|null} [props.body] - Corpo da requisição (opcional, max 64KB)
 * @param {object|null} [props.headers] - Cabeçalhos da requisição (opcional, max 16KB)
 * @param {object|null} [props.response_body] - Corpo da resposta (opcional, max 64KB)
 * @param {number} [props.duration_ms] - Duração da requisição em ms (opcional, >= 0)
 * @param {string} [props.user_agent] - User-Agent da requisição (opcional)
 * @throws {Error} Lança erros de validação se os dados forem inválidos 
 */

    constructor(data) {
        this.#validateTotalSize(data);
        const { 
            ip, url, method, statusCode, timestamp, userId, 
            body, headers, response_body, duration_ms, user_agent,
            request_id 
        } = data;

        // Validação de presença e tipagem
        if (!url || url.length > 2048) throw new InvalidAuditLogError("URL inválida ou excede 2048 bytes");

        const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
        if (!method || !validMethods.includes(method.toUpperCase())) {
            throw new InvalidAuditLogError("Método HTTP inválido ou ausente.");
        }

        if (Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
            throw new InvalidAuditLogError("Status Code deve ser inteiro entre 100-599");
        }

        // Validação de Janela de Tempo (Regra de 12h / 31 dias)
        const logTime = new Date(timestamp);
        const now = Date.now();
        if (isNaN(logTime.getTime())) throw new InvalidAuditLogError("Timestamp inválido");
        if (logTime > now + (12 * 60 * 60 * 1000)) throw new InvalidAuditLogError("Timestamp não pode estar mais que 12 horas no futuro");
        if (logTime < now - (31 * 24 * 60 * 60 * 1000)) throw new InvalidAuditLogError("Timestamp não pode estar mais que 31 dias no passado");

        // Validação de Tamanho dos Payloads
        this.#validatePayloadSize(body, 64 * 1024, "Body");
        this.#validatePayloadSize(headers, 16 * 1024, "Headers");
        this.#validatePayloadSize(response_body, 64 * 1024, "Response Body");

        // Atribuições e lógica derivada
        this.#request_id = request_id || randomUUID();
        this.#ip = ip || 'UNKNOWN';
        this.#user_agent = user_agent;
        this.#anonymous_id = createHash('sha256')
            .update(this.#ip + (this.#user_agent || ''))
            .digest('hex');
        
        this.#url = url;
        this.#method = method.toUpperCase();
        this.#statusCode = statusCode;
        this.#timestamp = new Date(logTime);
        this.#severity = this.#classifySeverity(statusCode);
        
        this.#userId = userId;
        this.#body = body;
        this.#headers = headers;
        this.#response_body = response_body;
        this.#duration_ms = Math.max(0, duration_ms || 0);

    }

    #classifySeverity(statusCode) {
        if (statusCode >= 100 && statusCode <= 399) return "INFO";
        if (statusCode >= 400 && statusCode <= 499) return "WARN";
        if (statusCode >= 500 && statusCode <= 599) return "ERROR";
        return "UNKNOWN";
    }

    #validateTotalSize(data) {
        if (JSON.stringify(data).length > 256 * 1024) {
            throw new InvalidAuditLogError("Log total excede o limite de 256KB");
        }
    }

    #validatePayloadSize(payload, limit, name) {
        if (payload && JSON.stringify(payload).length > limit) {
            throw new InvalidAuditLogError(`${name} excede o limite permitido`);
        }
    }

    // Getters
    toJSON() {
        return {
            request_id: this.#request_id,
            anonymous_id: this.#anonymous_id,
            ip: this.#ip,
            url: this.#url,
            method: this.#method,
            statusCode: this.#statusCode,
            severity: this.#severity,
            timestamp: this.#timestamp.toISOString(),
            userId: this.#userId,
            body: this.#body,
            headers: this.#headers,
            response_body: this.#response_body,
            duration_ms: this.#duration_ms,
            user_agent: this.#user_agent
        }
    }
}