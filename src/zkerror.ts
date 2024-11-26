/**
 * Enum representing common error types for device connections.
 */
export enum ERROR_TYPES {
    ECONNRESET = 'ECONNRESET',
    ECONNREFUSED = 'ECONNREFUSED',
    EADDRINUSE = 'EADDRINUSE',
    ETIMEDOUT = 'ETIMEDOUT',
}

/**
 * Class representing a custom error for ZK device interactions.
 */
export class ZKError {
    private err: { message: string; code?: string };
    private ip: string;
    private command: string;

    /**
     * Creates a new ZKError instance.
     * @param err - The original error object containing a message and optionally a code.
     * @param command - The command being executed when the error occurred.
     * @param ip - The IP address of the device causing the error.
     */
    constructor(err: { message: string; code?: string }, command: string, ip: string) {
        this.err = err;
        this.ip = ip;
        this.command = command;
    }

    /**
     * Provides a user-friendly description of the error.
     * @returns A string describing the error cause.
     */
    toast(): string {
        if (this.err.code === ERROR_TYPES.ECONNRESET) {
            return 'Another device is connecting to the device so the connection is interrupted';
        } else if (this.err.code === ERROR_TYPES.ECONNREFUSED) {
            return 'IP of the device is refused';
        } else {
            return this.err.message;
        }
    }

    /**
     * Returns a detailed error object.
     * @returns An object containing the error message, code, IP, and command.
     */
    getError(): { err: { message: string; code?: string }; ip: string; command: string } {
        return {
            err: {
                message: this.err.message,
                code: this.err.code,
            },
            ip: this.ip,
            command: this.command,
        };
    }
}
