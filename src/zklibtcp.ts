import { Socket } from 'net';
import { MAX_CHUNK, COMMANDS, REQUEST_DATA } from './constants';
import {
    createTCPHeader,
    exportErrorMessage,
    removeTcpHeader,
    decodeUserData72,
    decodeRecordData40,
    decodeRecordRealTimeLog52,
    checkNotEventTCP,
    decodeTCPHeader
} from './utils';
import { log } from './helpers/errorLog';
import * as timeParser from './timeParser';

/**
 * Clase ZKLibTCP para manejar conexiones TCP con dispositivos ZK.
 */
export class ZKLibTCP {
    private ip: string;
    private port: number;
    private timeout: number;
    private sessionId: number | null = null;
    private replyId: number = 0;
    socket: Socket | null = null;

    /**
     * Constructor de la clase ZKLibTCP.
     * @param ip - Dirección IP del dispositivo ZK.
     * @param port - Puerto TCP para la conexión.
     * @param timeout - Tiempo de espera en milisegundos para las operaciones.
     */
    constructor(ip: string, port: number, timeout: number) {
        this.ip = ip;
        this.port = port;
        this.timeout = timeout;
    }

    /**
     * Creates a TCP socket and sets up event listeners.
     * @param cbError - Callback for handling socket errors.
     * @param cbClose - Callback for handling socket closure.
     * @returns Promise that resolves with the socket instance or rejects with an error.
     */
    createSocket(cbError?: (err: Error) => void, cbClose?: (connectionType: string) => void): Promise<Socket> {
        return new Promise((resolve, reject) => {
            this.socket = new Socket();

            this.socket.once('error', (err: Error) => {
                reject(err);
                cbError?.(err);
            });

            this.socket.once('connect', () => {
                resolve(this.socket as Socket);
            });

            this.socket.once('close', () => {
                this.socket = null;
                cbClose?.('tcp');
            });

            if (this.timeout) {
                this.socket.setTimeout(this.timeout);
            }

            this.socket.connect(this.port, this.ip);
        });
    }

    /**
     * Establishes a connection by sending a connect command to the device.
     * @returns Promise that resolves if the connection is successful or rejects on failure.
     */
    async connect(): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            try {
                const reply = await this.executeCmd(COMMANDS.CMD_CONNECT, '');
                if (reply) {
                    resolve(true);
                } else {
                    reject(new Error('NO_REPLY_ON_CMD_CONNECT'));
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Closes the current socket connection gracefully.
     * @returns Promise that resolves once the socket is closed or times out.
     */
    closeSocket(): Promise<boolean> {
        return new Promise((resolve) => {
            if (this.socket) {
                this.socket.removeAllListeners('data');
                this.socket.end(() => {
                    clearTimeout(timer);
                    resolve(true);
                });
            }

            const timer = setTimeout(() => {
                resolve(true);
            }, 2000);
        });
    }

    /**
     * Sends a message to the device and waits for a response.
     * @param msg - The message to send to the device.
     * @param connect - Boolean indicating whether this is a connect-related operation.
     * @returns Promise that resolves with the received data or rejects on timeout or write errors.
     */
    writeMessage(msg: Buffer, connect: boolean): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let timer: NodeJS.Timeout | null = null;

            this.socket?.once('data', (data) => {
                if (timer) clearTimeout(timer);
                resolve(data);
            });

            this.socket?.write(msg, (err) => {
                if (err) {
                    reject(err);
                } else if (this.timeout) {
                    timer = setTimeout(() => {
                        if (timer) clearTimeout(timer);
                        reject(new Error('TIMEOUT_ON_WRITING_MESSAGE'));
                    }, connect ? 2000 : this.timeout);
                }
            });
        });
    }

    /**
     * Sends a request to the device and processes the response.
     * @param msg - The request message to send.
     * @returns Promise that resolves with the response buffer or rejects on errors or timeout.
     */
    requestData(msg: Buffer): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            let timer: NodeJS.Timeout | null = null;
            let replyBuffer = Buffer.from([]);

            const internalCallback = (data: Buffer) => {
                this.socket?.removeListener('data', handleOnData);
                if (timer) clearTimeout(timer);
                resolve(data);
            };

            const handleOnData = (data: Buffer) => {
                replyBuffer = Buffer.concat([replyBuffer, data]);
                if (checkNotEventTCP(data)) return;

                if (timer) clearTimeout(timer);
                const header = decodeTCPHeader(replyBuffer.subarray(0, 16));

                if (header.commandId === COMMANDS.CMD_DATA) {
                    timer = setTimeout(() => internalCallback(replyBuffer), 1000);
                } else {
                    timer = setTimeout(() => reject(new Error('TIMEOUT_ON_RECEIVING_REQUEST_DATA')), this.timeout);
                    const packetLength = data.readUIntLE(4, 2);
                    if (packetLength > 8) {
                        internalCallback(data);
                    }
                }
            };

            this.socket?.on('data', handleOnData);

            this.socket?.write(msg, (err) => {
                if (err) {
                    reject(err);
                }

                timer = setTimeout(() => reject(new Error('TIMEOUT_IN_RECEIVING_RESPONSE_AFTER_REQUESTING_DATA')), this.timeout);
            });
        });
    }


    /**
     * Sends a command to the device and handles the response.
     *
     * @param command - The command to be sent to the device.
     * @param data - The payload data for the command.
     * @returns A promise that resolves with the device's response or rejects on error.
     */
    async executeCmd(command: number, data: Buffer | string): Promise<Buffer> {
        return new Promise(async (resolve, reject) => {
            // Initialize session and reply ID for CMD_CONNECT
            if (command === COMMANDS.CMD_CONNECT) {
                this.sessionId = 0;
                this.replyId = 0;
            } else {
                this.replyId++;
            }

            // Create the TCP header for the command
            const buf: Buffer = createTCPHeader(command, this.sessionId!, this.replyId, data);

            try {
                // Send the command and wait for a response
                const reply: Buffer = await this.writeMessage(buf, command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_EXIT);

                // Remove TCP header from the response
                const rReply: Buffer = removeTcpHeader(reply);

                // Update session ID if CMD_CONNECT was successful
                if (rReply && rReply.length > 0) {
                    if (command === COMMANDS.CMD_CONNECT) {
                        this.sessionId = rReply.readUInt16LE(4);
                    }
                }

                resolve(rReply);
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Sends a chunk request to the device for a specific range of data.
     * @param start - The starting byte of the chunk.
     * @param size - The size of the chunk to request.
     */
    sendChunkRequest(start: number, size: number): void {
        this.replyId++;
        const reqData = Buffer.alloc(8);
        reqData.writeUInt32LE(start, 0);
        reqData.writeUInt32LE(size, 4);
        const buf = createTCPHeader(COMMANDS.CMD_DATA_RDY, this.sessionId!, this.replyId, reqData);

        this.socket?.write(buf, (err) => {
            if (err) {
                log(`[TCP][SEND_CHUNK_REQUEST] ${err.toString()}`);
            }
        });
    }

    /**
     * Reads data from the device in buffered chunks and processes it.
     * @param reqData - The type of data to request (user or attendance logs).
     * @param cb - Optional callback triggered when receiving packets.
     * @returns Promise that resolves with the data and any errors encountered.
     */
    readWithBuffer(reqData: Buffer, cb: ((progress: number, total: number) => void) | null = null): Promise<{
        data: Buffer;
        err: Error | null
    }> {
        return new Promise(async (resolve, reject) => {
            this.replyId++;
            const buf = createTCPHeader(COMMANDS.CMD_DATA_WRRQ, this.sessionId!, this.replyId, reqData);

            try {
                const reply = await this.requestData(buf);
                const header = decodeTCPHeader(reply.subarray(0, 16));

                if (header.commandId === COMMANDS.CMD_DATA) {
                    resolve({data: reply.subarray(16), err: null});
                } else if (header.commandId === COMMANDS.CMD_PREPARE_DATA) {
                    const recvData = reply.subarray(16);
                    const size = recvData.readUIntLE(1, 4);

                    let remain = size % MAX_CHUNK;
                    let numberChunks = Math.floor(size / MAX_CHUNK);
                    let totalBuffer = Buffer.from([]);
                    let realTotalBuffer = Buffer.from([]);
                    let totalPackets = numberChunks + (remain > 0 ? 1 : 0);

                    const timeout = 10000;
                    let timer: NodeJS.Timeout | null = setTimeout(() => resolve({
                        data: totalBuffer,
                        err: new Error('TIMEOUT WHEN RECEIVING PACKET')
                    }), timeout);

                    const internalCallback = (replyData: Buffer, err: Error | null = null) => {
                        this.socket?.removeListener('data', handleOnData);
                        if (timer) clearTimeout(timer);
                        resolve({data: replyData, err});
                    };

                    const handleOnData = (reply: Buffer) => {
                        if (checkNotEventTCP(reply)) return;
                        if (timer) clearTimeout(timer);

                        timer = setTimeout(() => internalCallback(totalBuffer, new Error('TIMEOUT IN CHUNKED DATA')), timeout);
                        totalBuffer = Buffer.concat([totalBuffer, reply]);
                        const packetLength = totalBuffer.readUIntLE(4, 2);

                        if (totalBuffer.length >= 8 + packetLength) {
                            realTotalBuffer = Buffer.concat([realTotalBuffer, totalBuffer.subarray(16, 8 + packetLength)]);
                            totalBuffer = totalBuffer.subarray(8 + packetLength);

                            if ((totalPackets > 1 && realTotalBuffer.length === MAX_CHUNK + 8) || (totalPackets === 1 && realTotalBuffer.length === remain + 8)) {
                                totalBuffer = Buffer.from([]);
                                realTotalBuffer = Buffer.from([]);
                                totalPackets--;
                                cb?.(size - totalPackets * MAX_CHUNK, size);

                                if (totalPackets <= 0) {
                                    internalCallback(totalBuffer);
                                }
                            }
                        }
                    };

                    this.socket?.on('data', handleOnData);

                    for (let i = 0; i <= numberChunks; i++) {
                        if (i === numberChunks) {
                            this.sendChunkRequest(numberChunks * MAX_CHUNK, remain);
                        } else {
                            this.sendChunkRequest(i * MAX_CHUNK, MAX_CHUNK);
                        }
                    }
                } else {
                    reject(new Error('ERROR_IN_UNHANDLE_CMD ' + exportErrorMessage(header.commandId)));
                }
            } catch (err) {
                reject(err);
            }
        });
    }

    /**
     * Placeholder for retrieving small attendance logs.
     * This method is not yet implemented.
     */
    async getSmallAttendanceLogs(): Promise<void> {
        // Implementation placeholder
    }

    /**
     * Retrieves the list of users from the device.
     * @returns A promise that resolves with the list of users and potential errors.
     */
    async getUsers(): Promise<{ data: any[]; err: Error | null }> {
        if (this.socket) {
            try {
                await this.freeData();
            } catch (err) {
                return Promise.reject(err);
            }
        }

        let data: { data: Buffer; err: Error | null } | null = null;
        try {
            data = await this.readWithBuffer(REQUEST_DATA.GET_USERS);
        } catch (err) {
            return Promise.reject(err);
        }

        if (this.socket) {
            try {
                await this.freeData();
            } catch (err) {
                return Promise.reject(err);
            }
        }

        const USER_PACKET_SIZE = 72;
        let userData = data.data.subarray(4);
        const users: any[] = [];

        while (userData.length >= USER_PACKET_SIZE) {
            const user = decodeUserData72(userData.subarray(0, USER_PACKET_SIZE));
            users.push(user);
            userData = userData.subarray(USER_PACKET_SIZE);
        }

        return {data: users, err: data.err};
    }

    /**
     * Retrieves attendance records from the device.
     * @param callbackInProcess - A callback function triggered during the processing of records.
     * @returns A promise that resolves with the attendance records and potential errors.
     */
    async getAttendances(
        callbackInProcess: (progress: number, total: number) => void = () => {
        }
    ): Promise<{ data: any[]; err: Error | null }> {
        if (this.socket) {
            try {
                await this.freeData();
            } catch (err) {
                return Promise.reject(err);
            }
        }

        let data: { data: Buffer; err: Error | null } | null = null;
        try {
            data = await this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS, callbackInProcess);
        } catch (err) {
            return Promise.reject(err);
        }

        if (this.socket) {
            try {
                await this.freeData();
            } catch (err) {
                return Promise.reject(err);
            }
        }

        const RECORD_PACKET_SIZE = 40;
        let recordData = data.data.subarray(4);
        const records: any[] = [];

        while (recordData.length >= RECORD_PACKET_SIZE) {
            const record = decodeRecordData40(recordData.subarray(0, RECORD_PACKET_SIZE));
            records.push({...record, ip: this.ip});
            recordData = recordData.subarray(RECORD_PACKET_SIZE);
        }

        return {data: records, err: data.err};
    }

    /**
     * Retrieves the current time from the device.
     * Executes the CMD_GET_TIME command and decodes the result.
     *
     * @returns A promise that resolves to the current time on the device as a Date object.
     */
    async getTime(): Promise<Date> {
        const timeBuffer = await this.executeCmd(COMMANDS.CMD_GET_TIME, '');
        return timeParser.decode(timeBuffer.readUInt32LE(8));
    }

    /**
     * Frees up any reserved resources or buffers in the device.
     * Executes the CMD_FREE_DATA command to release any allocated memory or data in the device.
     *
     * @returns A promise that resolves when the operation is complete.
     */
    async freeData(): Promise<void> {
        await this.executeCmd(COMMANDS.CMD_FREE_DATA, '');
    }

    /**
     * Disables the device.
     * Executes the CMD_DISABLEDEVICE command with the required request data to disable the device.
     *
     * @returns A promise that resolves when the device has been successfully disabled.
     */
    async disableDevice(): Promise<void> {
        await this.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE);
    }

    /**
     * Enables the device.
     * Executes the CMD_ENABLEDEVICE command to re-enable the device.
     *
     * @returns A promise that resolves when the device has been successfully enabled.
     */
    async enableDevice(): Promise<void> {
        await this.executeCmd(COMMANDS.CMD_ENABLEDEVICE, '');
    }

    /**
     * Disconnects from the device.
     * Executes the CMD_EXIT command to notify the device of the disconnection and then closes the socket.
     *
     * @returns A promise that resolves when the disconnection process is complete.
     */
    async disconnect(): Promise<void> {
        try {
            await this.executeCmd(COMMANDS.CMD_EXIT, '');
        } catch (err) {
            // Ignoring errors during CMD_EXIT execution
        }
        await this.closeSocket();
    }

    /**
     * Retrieves device information.
     * Executes the CMD_GET_FREE_SIZES command and parses the response to extract user count, log count, and log capacity.
     *
     * @returns A promise resolving to an object containing the device's information.
     */
    async getInfo(): Promise<{ userCounts: number; logCounts: number; logCapacity: number }> {
        try {
            const data: Buffer = await this.executeCmd(COMMANDS.CMD_GET_FREE_SIZES, '');
            return {
                userCounts: data.readUIntLE(24, 4),
                logCounts: data.readUIntLE(40, 4),
                logCapacity: data.readUIntLE(72, 4),
            };
        } catch (err) {
            return Promise.reject(err);
        }
    }

    /**
     * Clears all attendance logs on the device.
     * Executes the CMD_CLEAR_ATTLOG command to remove all attendance logs.
     *
     * @returns A promise that resolves when the logs are successfully cleared.
     */
    async clearAttendanceLog(): Promise<void> {
        await this.executeCmd(COMMANDS.CMD_CLEAR_ATTLOG, '');
    }


    /**
     * Subscribes to real-time log events.
     * Sends a CMD_REG_EVENT command to the device to register for real-time log notifications and sets up
     * a listener on the socket to handle incoming log data.
     *
     * @param cb - Callback function invoked when a real-time log event is received.
     */
    async getRealTimeLogs(cb: (logData: any) => void = () => {
    }): Promise<void> {
        this.replyId++;

        // Create the command buffer for real-time event registration
        const buf: Buffer = createTCPHeader(
            COMMANDS.CMD_REG_EVENT,
            this.sessionId!,
            this.replyId,
            Buffer.from([0x01, 0x00, 0x00, 0x00])
        );

        // Send the command to the device
        this.socket!.write(buf, (err: any) => {
            if (err) {
                console.error(`Error writing to socket: ${err.message}`);
            }
        });

        // Attach a listener to the socket to process real-time log events
        if (this.socket!.listenerCount('data') === 0) {
            this.socket!.on('data', (data: Buffer) => {
                // Ignore data that is not a log event
                if (!checkNotEventTCP(data)) return;

                // Decode and process the log event if the data length is valid
                if (data.length > 16) {
                    cb(decodeRecordRealTimeLog52(data));
                }
            });
        }
    }

}




module.exports = ZKLibTCP
