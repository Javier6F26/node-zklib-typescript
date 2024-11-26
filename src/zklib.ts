import {ZKLibTCP} from './zklibtcp';
import {ZKLibUDP} from './zklibudp';
import {ERROR_TYPES, ZKError} from './zkerror';

/**
 * ZKLib class for managing TCP and UDP connections with ZK devices.
 */
export class ZKLib {
    private connectionType: 'tcp' | 'udp' | null = null;
    private zklibTcp: ZKLibTCP;
    private zklibUdp: ZKLibUDP;
    private interval: NodeJS.Timeout | null = null;
    private timer: NodeJS.Timeout | null = null;
    private isBusy: boolean = false;
    private ip: string;

    /**
     * Constructor for ZKLib class.
     * @param ip - The IP address of the ZK device.
     * @param port - The port number for the connection.
     * @param timeout - The timeout value in milliseconds for operations.
     * @param inport - The local port number for UDP communication.
     */
    constructor(ip: string, port: number, timeout: number, inport: number) {
        this.zklibTcp = new ZKLibTCP(ip, port, timeout);
        this.zklibUdp = new ZKLibUDP(ip, port, timeout, inport);
        this.ip = ip;
    }

    /**
     * Wrapper function to handle operations based on the active connection type (TCP or UDP).
     *
     * @param tcpCallback - Callback function to execute when using the TCP connection.
     * @param udpCallback - Callback function to execute when using the UDP connection.
     * @param command - The command being executed, used for error tracking and logging.
     * @returns A promise that resolves with the result of the callback or rejects with a ZKError if the operation fails.
     */
    async functionWrapper(
        tcpCallback: () => Promise<any>,
        udpCallback: () => Promise<any>,
        command?: string
    ): Promise<any> {
        switch (this.connectionType) {
            case 'tcp':
                if (this.zklibTcp.socket) {
                    try {
                        return await tcpCallback();
                    } catch (err: any) {
                        return Promise.reject(
                            new ZKError(err, `[TCP] ${command}`, this.ip)
                        );
                    }
                } else {
                    return Promise.reject(
                        new ZKError(
                            new Error(`Socket isn't connected!`),
                            `[TCP]`,
                            this.ip
                        )
                    );
                }
            case 'udp':
                if (this.zklibUdp.socket) {
                    try {
                        return await udpCallback();
                    } catch (err: any) {
                        return Promise.reject(
                            new ZKError(err, `[UDP] ${command}`, this.ip)
                        );
                    }
                } else {
                    return Promise.reject(
                        new ZKError(
                            new Error(`Socket isn't connected!`),
                            `[UDP]`,
                            this.ip
                        )
                    );
                }
            default:
                return Promise.reject(
                    new ZKError(
                        new Error(`Socket isn't connected!`),
                        '',
                        this.ip
                    )
                );
        }
    }

    /**
     * Creates and establishes a socket connection (TCP or UDP) to the device.
     *
     * @param cbErr - Optional callback function to handle connection errors.
     * @param cbClose - Optional callback function to handle socket closure events.
     * @returns A promise that resolves when a socket connection is successfully established, or rejects with a ZKError if it fails.
     */
    async createSocket(
        cbErr?: (err: Error) => void,
        cbClose?: (type: string) => void
    ): Promise<void> {
        try {
            // Attempt TCP connection
            if (!this.zklibTcp.socket) {
                try {
                    await this.zklibTcp.createSocket(cbErr, cbClose);
                } catch (err) {
                    throw err;
                }

                try {
                    await this.zklibTcp.connect();
                    console.log('ok tcp');
                } catch (err) {
                    throw err;
                }
            }

            this.connectionType = 'tcp';
        } catch (err: any) {
            // Handle TCP connection failure
            try {
                await this.zklibTcp.disconnect();
            } catch (disconnectErr) {
                // Silently handle disconnect errors
            }

            if (err.code !== ERROR_TYPES.ECONNREFUSED) {
                return Promise.reject(new ZKError(err, 'TCP CONNECT', this.ip));
            }

            try {
                // Attempt UDP connection
                if (!this.zklibUdp.socket) {
                    await this.zklibUdp.createSocket(cbErr, cbClose);
                    await this.zklibUdp.connect();
                }

                console.log('ok udp');
                this.connectionType = 'udp';
            } catch (udpErr: any) {
                // Handle UDP connection failure
                if (udpErr.code !== 'EADDRINUSE') {
                    this.connectionType = null;
                    try {
                        await this.zklibUdp.disconnect();
                        this.zklibUdp.socket = null;
                        this.zklibTcp.socket = null;
                    } catch (disconnectErr) {
                        // Silently handle disconnect errors
                    }

                    return Promise.reject(new ZKError(udpErr, 'UDP CONNECT', this.ip));
                } else {
                    this.connectionType = 'udp';
                }
            }
        }
    }

    /**
     * Retrieves the list of users from the device.
     *
     * @returns A promise that resolves with the user data or rejects with an error.
     */
    async getUsers(): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.getUsers(),
            () => this.zklibUdp.getUsers()
        );
    }

    /**
     * Retrieves attendance records from the device.
     *
     * @param cb - Callback function to handle progress or data processing during the operation.
     * @returns A promise that resolves with the attendance records or rejects with an error.
     */
    async getAttendances(cb?: (progress: number, total: number) => void): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.getAttendances(cb),
            () => this.zklibUdp.getAttendances(cb)
        );
    }

    /**
     * Subscribes to real-time log updates from the device.
     *
     * @param cb - Callback function to handle real-time log events.
     * @returns A promise that resolves when the subscription is successfully established or rejects with an error.
     */
    async getRealTimeLogs(cb: (data: any) => void): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.getRealTimeLogs(cb),
            () => this.zklibUdp.getRealTimeLogs(cb)
        );
    }

    /**
     * Disconnects from the device by closing the active socket connection.
     *
     * @returns A promise that resolves when the disconnection is successful or rejects with an error.
     */
    async disconnect(): Promise<void> {
        return await this.functionWrapper(
            () => this.zklibTcp.disconnect(),
            () => this.zklibUdp.disconnect()
        );
    }

    /**
     * Frees the data buffer on the device.
     *
     * @returns A promise that resolves when the operation is successful or rejects with an error.
     */
    async freeData(): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.freeData(),
            () => this.zklibUdp.freeData()
        );
    }

    /**
     * Retrieves the current time from the device.
     *
     * @returns A promise that resolves with the current device time or rejects with an error.
     */
    async getTime(): Promise<Date> {
        return await this.functionWrapper(
            () => this.zklibTcp.getTime(),
            () => this.zklibUdp.getTime()
        );
    }

    /**
     * Disables the device, preventing further operations temporarily.
     *
     * @returns A promise that resolves when the device is successfully disabled or rejects with an error.
     */
    async disableDevice(): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.disableDevice(),
            () => this.zklibUdp.disableDevice()
        );
    }

    /**
     * Enables the device, allowing operations to resume.
     *
     * @returns A promise that resolves when the device is successfully enabled or rejects with an error.
     */
    async enableDevice(): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.enableDevice(),
            () => this.zklibUdp.enableDevice()
        );
    }


    /**
     * Retrieves information about the device, including user count, log count, and log capacity.
     *
     * @returns A promise that resolves with device information or rejects with an error.
     */
    async getInfo(): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.getInfo(),
            () => this.zklibUdp.getInfo()
        );
    }

    /**
     * Retrieves the current status of the socket connection.
     *
     * @returns A promise that resolves with the socket status or rejects with an error.
     */
    async getSocketStatus(): Promise<any> {
        /*   return await this.functionWrapper(
               () => this.zklibTcp.getSocketStatus(),
               () => this.zklibUdp.getSocketStatus()
           );*/
    }

    /**
     * Clears all attendance logs stored on the device.
     *
     * @returns A promise that resolves when the logs are successfully cleared or rejects with an error.
     */
    async clearAttendanceLog(): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.clearAttendanceLog(),
            () => this.zklibUdp.clearAttendanceLog()
        );
    }

    /**
     * Executes a custom command on the device.
     *
     * @param command - The command to be executed.
     * @param data - Optional data to be sent with the command.
     * @returns A promise that resolves with the command response or rejects with an error.
     */
    async executeCmd(command: number, data: string = ''): Promise<any> {
        return await this.functionWrapper(
            () => this.zklibTcp.executeCmd(command, data),
            () => this.zklibUdp.executeCmd(command, data)
        );
    }

    /**
     * Schedules a repeating task at a fixed interval.
     *
     * @param cb - The callback function to execute at each interval.
     * @param timer - The interval duration in milliseconds.
     */
    setIntervalSchedule(cb: () => void, timer: number): void {
        this.interval = setInterval(cb, timer);
    }

    /**
     * Schedules a one-time task to execute after a specified delay.
     *
     * @param cb - The callback function to execute after the delay.
     * @param timer - The delay duration in milliseconds.
     */
    setTimerSchedule(cb: () => void, timer: number): void {
        this.timer = setTimeout(cb, timer);
    }

}


module.exports = ZKLib
