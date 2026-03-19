export class InvalidAuditLogError extends Error {
    constructor(message) {
        super(message);
        this.name = 'InvalidAuditLogError';
    }
}