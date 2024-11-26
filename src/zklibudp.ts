import dgram from 'dgram';
import {
  checkNotEventUDP,
  createUDPHeader,
  decodeRecordData16,
  decodeRecordRealTimeLog18,
  decodeUDPHeader,
  decodeUserData28,
  exportErrorMessage
} from './utils';
import {COMMANDS, MAX_CHUNK, REQUEST_DATA} from './constants';
import {log} from './helpers/errorLog';
import * as timeParser from './timeParser';

/**
 * Class ZKLibUDP is responsible for managing UDP connections with ZK devices.
 */
export class ZKLibUDP {
  socket: dgram.Socket | null = null;
  private ip: string;
  private port: number;
  private timeout: number;
  private inport: number;
  private sessionId: number | null = null;
  private replyId: number = 0;

  /**
   * Constructor for the ZKLibUDP class.
   *
   * @param ip - The IP address of the ZK device.
   * @param port - The UDP port to communicate with the device.
   * @param timeout - Timeout in milliseconds for requests.
   * @param inport - Local port to bind the UDP socket.
   */
  constructor(ip: string, port: number, timeout: number, inport: number) {
    this.ip = ip;
    this.port = port;
    this.timeout = timeout;
    this.inport = inport;
  }


  /**
   * Creates a UDP socket and binds it to the specified port.
   *
   * @param cbError - Callback function triggered on socket error.
   * @param cbClose - Callback function triggered when the socket is closed.
   * @returns A promise that resolves with the created socket.
   */
  createSocket(cbError?: (err: Error) => void, cbClose?: (protocol: string) => void): Promise<dgram.Socket> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');
      this.socket.setMaxListeners(Infinity);

      // Handle socket errors
      this.socket.once('error', (err: Error) => {
        reject(err);
        cbError && cbError(err);
      });

      // Handle socket closure
      this.socket.on('close', () => {
        this.socket = null;
        cbClose && cbClose('udp');
      });

      // Handle successful listening
      this.socket.once('listening', () => {
        resolve(this.socket!);
      });

      try {
        this.socket.bind(this.inport);
      } catch (err) {
        // Silent catch to handle potential binding issues
      }
    });
  }

  /**
   * Connects to the ZK device and initializes the session.
   *
   * @returns A promise that resolves to `true` if the connection is successful.
   */
  connect(): Promise<boolean> {
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
   * Closes the UDP socket and clears all event listeners.
   *
   * @returns A promise that resolves when the socket is successfully closed.
   */
  closeSocket(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket) {
        resolve(true);
        return;
      }

      this.socket.removeAllListeners('message');

      // Close the socket
      this.socket.close(() => {
        clearTimeout(timer);
        resolve(true);
      });

      // Handle cases where the socket doesn't close properly
      const timer = setTimeout(() => {
        resolve(true);
      }, 2000);
    });
  }

  /**
   * Sends a message over the UDP socket and waits for a response.
   *
   * @param msg - The message to send as a `Buffer`.
   * @param connect - Indicates if this is a connection-related message.
   * @returns A promise that resolves with the received data or rejects on timeout or error.
   */
  writeMessage(msg: Buffer, connect: boolean): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let sendTimeoutId: NodeJS.Timeout | undefined;

      // Listener for the response message
      this.socket?.once('message', (data: Buffer) => {
        if (sendTimeoutId) clearTimeout(sendTimeoutId);
        resolve(data);
      });

      // Send the message
      this.socket?.send(msg, 0, msg.length, this.port, this.ip, (err: Error | null) => {
        if (err) {
          reject(err);
          return;
        }

        // Set timeout for the response
        if (this.timeout) {
          sendTimeoutId = setTimeout(() => {
            clearTimeout(sendTimeoutId);
            reject(new Error('TIMEOUT_ON_WRITING_MESSAGE'));
          }, connect ? 2000 : this.timeout);
        }
      });
    });
  }

  /**
   * Sends a message to the device and waits for a full response.
   *
   * @param msg - The message to send as a `Buffer`.
   * @returns A promise that resolves with the received data or rejects on timeout or error.
   */
  requestData(msg: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      let sendTimeoutId: NodeJS.Timeout | undefined;

      // Internal callback to handle data reception
      const internalCallback = (data: Buffer) => {
        if (sendTimeoutId) clearTimeout(sendTimeoutId);
        this.socket?.removeListener('message', handleOnData);
        resolve(data);
      };

      // Data handler for incoming messages
      const handleOnData = (data: Buffer) => {
        if (checkNotEventUDP(data)) return;
        if (sendTimeoutId) clearTimeout(sendTimeoutId);

        sendTimeoutId = setTimeout(() => {
          reject(new Error('TIMEOUT_ON_RECEIVING_REQUEST_DATA'));
        }, this.timeout);

        if (data.length >= 13) {
          internalCallback(data);
        }
      };

      // Attach the data handler to the socket
      this.socket?.on('message', handleOnData);

      // Send the message
      this.socket?.send(msg, 0, msg.length, this.port, this.ip, (err: Error | null) => {
        if (err) {
          reject(err);
          return;
        }

        // Set timeout for the response
        sendTimeoutId = setTimeout(() => {
          reject(new Error('TIMEOUT_IN_RECEIVING_RESPONSE_AFTER_REQUESTING_DATA'));
        }, this.timeout);
      });
    });
  }

  /**
   * Executes a command by sending a UDP packet and processes the response.
   *
   * @param command - The command identifier to execute.
   * @param data - The payload data to include in the command.
   * @returns A promise that resolves with the response `Buffer` or rejects if an error occurs.
   */
  executeCmd(command: number, data: string | Buffer): Promise<Buffer> {
    return new Promise(async (resolve, reject) => {
      try {
        // Reset session and reply IDs for connection command
        if (command === COMMANDS.CMD_CONNECT) {
          this.sessionId = 0;
          this.replyId = 0;
        } else {
          this.replyId++;
        }

        // Create UDP header with the given command and data
        const buf = createUDPHeader(command, this.sessionId || 0, this.replyId, data);

        // Send the command and await response
        const reply = await this.writeMessage(
            buf,
            command === COMMANDS.CMD_CONNECT || command === COMMANDS.CMD_EXIT
        );

        // If the command is a connection, update the session ID from the response
        if (reply && reply.length && reply.length >= 0) {
          if (command === COMMANDS.CMD_CONNECT) {
            this.sessionId = reply.readUInt16LE(4);
          }
        }

        resolve(reply);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Sends a chunk request to the device to retrieve a portion of the data.
   *
   * @param start - The starting offset of the data chunk.
   * @param size - The size of the data chunk to retrieve.
   */
  sendChunkRequest(start: number, size: number): void {
    this.replyId++;
    const reqData = Buffer.alloc(8);
    reqData.writeUInt32LE(start, 0);
    reqData.writeUInt32LE(size, 4);

    // Create the chunk request header
    const buf = createUDPHeader(COMMANDS.CMD_DATA_RDY, this.sessionId || 0, this.replyId, reqData);

    // Send the request
    this.socket?.send(buf, 0, buf.length, this.port, this.ip, (err: Error | null) => {
      if (err) {
        log(`[UDP][SEND_CHUNK_REQUEST] ${err.toString()}`);
      }
    });
  }

  /**
   * Reads data from the buffer by sending a data request command.
   *
   * @param reqData - Specifies the type of data to be retrieved (e.g., user data or attendance logs).
   * @param cb - Optional callback triggered for progress tracking when receiving packets.
   * @returns A promise that resolves to an object containing the received data, mode, and any potential error.
   */
  readWithBuffer(
      reqData: Buffer,
      cb: (progress: number, total: number) => void = () => {
      }
  ): Promise<{ data: Buffer; mode: number; err: Error | null }> {
    return new Promise(async (resolve, reject) => {
      this.replyId++;
      const buf = createUDPHeader(COMMANDS.CMD_DATA_WRRQ, this.sessionId || 0, this.replyId, reqData);

      let reply: Buffer | null = null;
      try {
        reply = await this.requestData(buf);
      } catch (err) {
        return reject(err);
      }

      const header = decodeUDPHeader(reply.subarray(0, 8));

      switch (header.commandId) {
        case COMMANDS.CMD_DATA:
          return resolve({data: reply.subarray(8), mode: 8, err: null});

        case COMMANDS.CMD_ACK_OK:
        case COMMANDS.CMD_PREPARE_DATA: {
          const recvData = reply.subarray(8);
          const size = recvData.readUIntLE(1, 4);

          let remain = size % MAX_CHUNK;
          let numberChunks = Math.floor(size / MAX_CHUNK);
          let totalBuffer = Buffer.from([]);

          const timeout = 3000;
          let timer: NodeJS.Timeout;

          const internalCallback = (replyData: Buffer, err: Error | null = null) => {
            this.socket?.removeListener('message', handleOnData);
            clearTimeout(timer);
            resolve({data: replyData, mode: 8, err});
          };

          const handleOnData = (reply: Buffer) => {
            if (checkNotEventUDP(reply)) return;
            clearTimeout(timer);

            timer = setTimeout(() => {
              internalCallback(totalBuffer, new Error(`TIMEOUT!! Remaining ${(size - totalBuffer.length) / size}%`));
            }, timeout);

            const header = decodeUDPHeader(reply);
            switch (header.commandId) {
              case COMMANDS.CMD_PREPARE_DATA:
                break;
              case COMMANDS.CMD_DATA:
                totalBuffer = Buffer.concat([totalBuffer, reply.subarray(8)]);
                cb(totalBuffer.length, size);
                break;
              case COMMANDS.CMD_ACK_OK:
                if (totalBuffer.length === size) {
                  internalCallback(totalBuffer);
                }
                break;
              default:
                internalCallback(Buffer.from([]), new Error(`ERROR: ${exportErrorMessage(header.commandId)}`));
            }
          };

          this.socket?.on('message', handleOnData);

          for (let i = 0; i <= numberChunks; i++) {
            if (i === numberChunks) {
              this.sendChunkRequest(numberChunks * MAX_CHUNK, remain);
            } else {
              this.sendChunkRequest(i * MAX_CHUNK, MAX_CHUNK);
            }
          }

          break;
        }

        default:
          reject(new Error(`UNHANDLED COMMAND: ${exportErrorMessage(header.commandId)}`));
      }
    });
  }

  /**
   * Retrieves user data from the device.
   *
   * @returns A promise that resolves to an object containing user information or rejects if any error occurs.
   */
  async getUsers(): Promise<{ data: any[]; err: Error | null }> {
    // Free buffer data before requesting new data
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

    // Free buffer data after retrieving the requested data
    if (this.socket) {
      try {
        await this.freeData();
      } catch (err) {
        return Promise.reject(err);
      }
    }

    const USER_PACKET_SIZE = 28;
    let userData = data.data.subarray(4);
    const users: any[] = [];

    while (userData.length >= USER_PACKET_SIZE) {
      const user = decodeUserData28(userData.subarray(0, USER_PACKET_SIZE));
      users.push(user);
      userData = userData.subarray(USER_PACKET_SIZE);
    }

    return {data: users, err: data.err};
  }

  /**
   * Retrieves attendance records from the device.
   *
   * @param callbackInProcess - Optional callback function triggered during data retrieval to monitor progress.
   * @returns A promise that resolves to an object containing the attendance records or rejects with an error.
   */
  async getAttendances(
      callbackInProcess: (progress: number, total: number) => void = () => {
      }
  ): Promise<{ data: any[]; err: Error | null }> {
    // Ensure buffer is freed before requesting new data
    if (this.socket) {
      try {
        await this.freeData();
      } catch (err) {
        return Promise.reject(err);
      }
    }

    let data: { data: Buffer; mode: number | null; err: Error | null } | null = null;

    try {
      data = await this.readWithBuffer(REQUEST_DATA.GET_ATTENDANCE_LOGS, callbackInProcess);
    } catch (err) {
      return Promise.reject(err);
    }

    // Ensure buffer is freed after data retrieval
    if (this.socket) {
      try {
        await this.freeData();
      } catch (err) {
        return Promise.reject(err);
      }
    }

    const RECORD_PACKET_SIZE = data?.mode ? 8 : 16; // Determine record size based on the data mode
    let recordData = data.data.subarray(4);
    const records: any[] = [];

    // Parse record data based on packet size
    while (recordData.length >= RECORD_PACKET_SIZE) {
      const record = decodeRecordData16(recordData.subarray(0, RECORD_PACKET_SIZE));
      records.push({...record, ip: this.ip});
      recordData = recordData.subarray(RECORD_PACKET_SIZE);
    }

    return {data: records, err: data.err};
  }

  /**
   * Frees any residual data in the device's buffer.
   *
   * @returns A promise that resolves when the command is executed successfully or rejects with an error.
   */
  async freeData(): Promise<Buffer> {
    return await this.executeCmd(COMMANDS.CMD_FREE_DATA, '');
  }

  /**
   * Retrieves the current time from the device.
   *
   * @returns A promise that resolves to a Date object representing the device's current time or rejects with an error.
   */
  async getTime(): Promise<Date> {
    const timeBuffer = await this.executeCmd(COMMANDS.CMD_GET_TIME, '');
    return timeParser.decode(timeBuffer.readUInt32LE(8));
  }

  /**
   * Fetches detailed information about the device, including user count, log count, and log capacity.
   *
   * @returns A promise that resolves to an object containing the device information or rejects with an error.
   */
  async getInfo(): Promise<{ userCounts: number; logCounts: number; logCapacity: number }> {
    const data = await this.executeCmd(COMMANDS.CMD_GET_FREE_SIZES, '');
    try {
      return {
        userCounts: data.readUIntLE(24, 4),
        logCounts: data.readUIntLE(40, 4),
        logCapacity: data.readUIntLE(72, 4)
      };
    } catch (err) {
      return Promise.reject(err);
    }
  }

  /**
   * Clears the attendance log stored on the device.
   *
   * @returns A promise that resolves when the log is successfully cleared or rejects with an error.
   */
  async clearAttendanceLog(): Promise<Buffer> {
    return await this.executeCmd(COMMANDS.CMD_CLEAR_ATTLOG, '');
  }

  /**
   * Disables the device, preventing it from interacting with users temporarily.
   *
   * @returns A promise that resolves when the device is successfully disabled or rejects with an error.
   */
  async disableDevice(): Promise<Buffer> {
    return await this.executeCmd(COMMANDS.CMD_DISABLEDEVICE, REQUEST_DATA.DISABLE_DEVICE);
  }

  /**
   * Enables the device, allowing it to interact with users after being disabled.
   *
   * @returns A promise that resolves when the device is successfully enabled or rejects with an error.
   */
  async enableDevice(): Promise<Buffer> {
    return await this.executeCmd(COMMANDS.CMD_ENABLEDEVICE, '');
  }

  /**
   * Disconnects from the device by sending an exit command and closing the socket connection.
   *
   * @returns A promise that resolves when the device is disconnected successfully or rejects with an error.
   */
  async disconnect(): Promise<boolean> {
    try {
      await this.executeCmd(COMMANDS.CMD_EXIT, '');
    } catch (err) {
      // Silent catch to ensure socket closure even if the exit command fails.
    }
    return await this.closeSocket();
  }

  /**
   * Listens for real-time logs from the device and triggers a callback with the parsed data.
   *
   * @param cb - A callback function triggered when new real-time log data is received.
   *             The callback receives the decoded log data as its parameter.
   */
  async getRealTimeLogs(cb: (logData: any) => void = () => {
  }): Promise<void> {
    // Increment the replyId for the current session
    this.replyId++;

    // Create the UDP header for the CMD_REG_EVENT command
    const buf = createUDPHeader(
        COMMANDS.CMD_REG_EVENT,
        this.sessionId ?? 0,
        this.replyId,
        REQUEST_DATA.GET_REAL_TIME_EVENT
    );

    // Send the command to the device
    this.socket?.send(buf, 0, buf.length, this.port, this.ip, (err) => {
      if (err) {
        console.error(`[UDP][SEND_ERROR]: ${err.message}`);
      }
    });

    // Add a message listener if not already added
    if (this.socket?.listenerCount('message')! < 2) {
      this.socket?.on('message', (data: Buffer) => {
        // Ignore non-event data
        if (!checkNotEventUDP(data)) return;

        // Parse and process event logs
        if (data.length === 18) {
          cb(decodeRecordRealTimeLog18(data));
        }
      });
    }
  }

}




module.exports = ZKLibUDP
