import { AuditLog } from "../../domain/entities/AuditLog";

export class SaveAuditLogUseCase {
    constructor(buffer, sanitizer) {
        this.buffer = buffer;
        this.sanitizer = sanitizer;
    }

    async execute(rawData) {
        const sanitized = this.sanitizer.sanitizer(rawData);
        const auditLog = new AuditLog(sanitized);
        this.buffer.add(auditLog)
    }
}