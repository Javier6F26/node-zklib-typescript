import {COMMANDS, USHRT_MAX} from './constants'
import {log} from './helpers/errorLog'

/**
 * Converts a time value from the ZK device format to a JavaScript Date object.
 *
 * @param time - The time value encoded in ZK's proprietary format.
 * @returns A JavaScript Date object representing the decoded time.
 */
export const parseTimeToDate = (time: number): Date => {
    const second = time % 60;
    time = (time - second) / 60;
    const minute = time % 60;
    time = (time - minute) / 60;
    const hour = time % 24;
    time = (time - hour) / 24;
    const day = (time % 31) + 1;
    time = (time - (day - 1)) / 31;
    const month = time % 12;
    time = (time - month) / 12;
    const year = time + 2000;

    return new Date(year, month, day, hour, minute, second);
};

/**
 * Parses a hexadecimal buffer containing time data and converts it to a JavaScript Date object.
 *
 * @param hex - A Buffer containing the time information in hex format.
 * @returns A JavaScript Date object representing the decoded time.
 */
export const parseHexToTime = (hex: Buffer): Date => {
    const time = {
        year: hex.readUIntLE(0, 1),
        month: hex.readUIntLE(1, 1),
        date: hex.readUIntLE(2, 1),
        hour: hex.readUIntLE(3, 1),
        minute: hex.readUIntLE(4, 1),
        second: hex.readUIntLE(5, 1)
    };

    return new Date(2000 + time.year, time.month - 1, time.date, time.hour, time.minute, time.second);
};

/**
 * Calculates a checksum for a given buffer according to the ZK device's checksum algorithm.
 *
 * @param buf - The buffer containing the data for which the checksum will be calculated.
 * @returns The computed checksum value as a number.
 */
export const createChkSum = (buf: Buffer): number => {
    let chksum = 0;
    for (let i = 0; i < buf.length; i += 2) {
        if (i === buf.length - 1) {
            chksum += buf[i];
        } else {
            chksum += buf.readUInt16LE(i);
        }
        chksum %= USHRT_MAX;
    }
    chksum = USHRT_MAX - chksum - 1;

    return chksum;
};


/**
 * Creates a UDP header for communication with a ZK device.
 *
 * @param command - The command to be sent to the device.
 * @param sessionId - The session ID for the current communication.
 * @param replyId - The reply ID for tracking responses.
 * @param data - The data to include in the payload.
 * @returns A Buffer representing the complete UDP packet.
 */
export const createUDPHeader = (
    command: number,
    sessionId: number,
    replyId: number,
    data: Buffer | string
): Buffer => {
    const dataBuffer = Buffer.from(data);
    const buf = Buffer.alloc(8 + dataBuffer.length);

    buf.writeUInt16LE(command, 0); // Command code
    buf.writeUInt16LE(0, 2); // Placeholder for checksum
    buf.writeUInt16LE(sessionId, 4); // Session ID
    buf.writeUInt16LE(replyId, 6); // Reply ID
    dataBuffer.copy(buf, 8); // Copy data into the buffer

    const chksum2 = createChkSum(buf); // Calculate checksum
    buf.writeUInt16LE(chksum2, 2); // Write checksum into the buffer

    replyId = (replyId + 1) % USHRT_MAX; // Increment and wrap reply ID
    buf.writeUInt16LE(replyId, 6); // Update reply ID in the buffer

    return buf;
};

/**
 * Creates a TCP header for communication with a ZK device.
 *
 * @param command - The command to be sent to the device.
 * @param sessionId - The session ID for the current communication.
 * @param replyId - The reply ID for tracking responses.
 * @param data - The data to include in the payload.
 * @returns A Buffer representing the complete TCP packet.
 */
export const createTCPHeader = (
    command: number,
    sessionId: number,
    replyId: number,
    data: Buffer | string
): Buffer => {
    const dataBuffer = Buffer.from(data);
    const buf = Buffer.alloc(8 + dataBuffer.length);

    buf.writeUInt16LE(command, 0); // Command code
    buf.writeUInt16LE(0, 2); // Placeholder for checksum
    buf.writeUInt16LE(sessionId, 4); // Session ID
    buf.writeUInt16LE(replyId, 6); // Reply ID
    dataBuffer.copy(buf, 8); // Copy data into the buffer

    const chksum2 = createChkSum(buf); // Calculate checksum
    buf.writeUInt16LE(chksum2, 2); // Write checksum into the buffer

    replyId = (replyId + 1) % USHRT_MAX; // Increment and wrap reply ID
    buf.writeUInt16LE(replyId, 6); // Update reply ID in the buffer

    const prefixBuf = Buffer.from([0x50, 0x50, 0x82, 0x7d, 0x13, 0x00, 0x00, 0x00]); // TCP prefix
    prefixBuf.writeUInt16LE(buf.length, 4); // Update the length in the prefix

    return Buffer.concat([prefixBuf, buf]); // Combine prefix and data
};

/**
 * Removes the TCP header from a buffer if it matches the expected prefix.
 *
 * @param buf - The Buffer to process, potentially containing a TCP header.
 * @returns A new Buffer with the TCP header removed, or the original Buffer if no header is detected.
 */
export const removeTcpHeader = (buf: Buffer): Buffer => {
    // If the buffer length is less than 8, return the original buffer.
    if (buf.length < 8) {
        return buf;
    }

    // Check if the first 4 bytes of the buffer match the expected TCP prefix.
    const prefix = Buffer.from([0x50, 0x50, 0x82, 0x7d]);
    if (buf.compare(prefix, 0, 4, 0, 4) !== 0) {
        return buf; // Return the original buffer if the prefix doesn't match.
    }

    // Return the buffer with the first 8 bytes (TCP header) removed.
    return buf.slice(8);
};

/**
 * Decodes user data from a 28-byte buffer.
 *
 * @param userData - The buffer containing user data in the 28-byte format.
 * @returns An object representing the user with decoded fields.
 */
export const decodeUserData28 = (userData: Buffer): { uid: number; role: number; name: string; userId: number } => {
    return {
        uid: userData.readUIntLE(0, 2), // User unique ID
        role: userData.readUIntLE(2, 1), // User role
        name: userData
            .slice(8, 16) // Extract name bytes
            .toString('ascii')
            .split('\0')[0], // Convert to string and trim null characters
        userId: userData.readUIntLE(24, 4), // User ID as an integer
    };
};

/**
 * Decodes user data from a 72-byte buffer.
 *
 * @param userData - The buffer containing user data in the 72-byte format.
 * @returns An object representing the user with decoded fields.
 */
export const decodeUserData72 = (userData: Buffer): {
    uid: number;
    role: number;
    password: string;
    name: string;
    cardno: number;
    userId: string
} => {
    return {
        uid: userData.readUIntLE(0, 2), // User unique ID
        role: userData.readUIntLE(2, 1), // User role
        password: userData
            .subarray(3, 11) // Extract password bytes
            .toString('ascii')
            .split('\0')[0], // Convert to string and trim null characters
        name: userData
            .slice(11) // Extract name bytes
            .toString('ascii')
            .split('\0')[0], // Convert to string and trim null characters
        cardno: userData.readUIntLE(35, 4), // Card number
        userId: userData
            .slice(48, 57) // Extract user ID bytes
            .toString('ascii')
            .split('\0')[0], // Convert to string and trim null characters
    };
};

/**
 * Decodes a record from a 40-byte buffer.
 *
 * @param recordData - The buffer containing record data in the 40-byte format.
 * @returns An object representing the record with decoded fields.
 */
export const decodeRecordData40 = (recordData: Buffer): { userSn: number; deviceUserId: string; recordTime: Date } => {
    return {
        userSn: recordData.readUIntLE(0, 2), // User serial number
        deviceUserId: recordData
            .slice(2, 11) // Extract device user ID bytes
            .toString('ascii')
            .split('\0')[0], // Convert to string and trim null characters
        recordTime: parseTimeToDate(recordData.readUInt32LE(27)), // Convert record time to Date
    };
};

/**
 * Decodes a record from a 16-byte buffer.
 *
 * @param recordData - The buffer containing record data in the 16-byte format.
 * @returns An object representing the record with decoded fields.
 */
export const decodeRecordData16 = (recordData: Buffer): { deviceUserId: number; recordTime: Date } => {
    return {
        deviceUserId: recordData.readUIntLE(0, 2), // Device user ID
        recordTime: parseTimeToDate(recordData.readUInt32LE(4)), // Convert record time to Date
    };
};

/**
 * Decodes a real-time log record from an 18-byte buffer.
 *
 * @param recordData - The buffer containing the 18-byte real-time log record data.
 * @returns An object containing the user ID and the attendance time as a Date.
 */
export const decodeRecordRealTimeLog18 = (recordData: Buffer): { userId: number; attTime: Date } => {
    const userId = recordData.readUIntLE(8, 1); // Extract user ID from byte 8
    const attTime = parseHexToTime(recordData.subarray(12, 18)); // Convert attendance time bytes to a Date
    return {userId, attTime};
};

/**
 * Decodes a real-time log record from a 52-byte buffer, including a TCP header.
 *
 * @param recordData - The buffer containing the 52-byte real-time log record data.
 * @returns An object containing the user ID and the attendance time as a Date.
 */
export const decodeRecordRealTimeLog52 = (recordData: Buffer): { userId: string; attTime: Date } => {
    const payload = removeTcpHeader(recordData); // Remove the TCP header from the buffer
    const recvData = payload.subarray(8); // Extract payload data starting after the 8-byte header

    const userId = recvData
        .slice(0, 9) // Extract user ID bytes
        .toString('ascii') // Convert to ASCII string
        .split('\0')[0]; // Remove null characters and trim

    const attTime = parseHexToTime(recvData.subarray(26, 32)); // Convert attendance time bytes to a Date

    return {userId, attTime};
};

/**
 * Decodes a UDP header.
 *
 * @param header - The buffer containing the UDP header.
 * @returns An object with command ID, checksum, session ID, and reply ID.
 */
export const decodeUDPHeader = (header: Buffer): { commandId: number; checkSum: number; sessionId: number; replyId: number } => {
    const commandId = header.readUIntLE(0, 2); // Read the command ID from the first 2 bytes.
    const checkSum = header.readUIntLE(2, 2); // Read the checksum from bytes 2 to 4.
    const sessionId = header.readUIntLE(4, 2); // Read the session ID from bytes 4 to 6.
    const replyId = header.readUIntLE(6, 2); // Read the reply ID from bytes 6 to 8.
    return { commandId, checkSum, sessionId, replyId };
};

/**
 * Decodes a TCP header, including the payload information.
 *
 * @param header - The buffer containing the TCP header and payload.
 * @returns An object with command ID, checksum, session ID, reply ID, and payload size.
 */
export const decodeTCPHeader = (header: Buffer): { commandId: number; checkSum: number; sessionId: number; replyId: number; payloadSize: number } => {
    const recvData = header.subarray(8); // Extract the payload starting from the 8th byte.
    const payloadSize = header.readUIntLE(4, 2); // Read the payload size from bytes 4 to 6.

    const commandId = recvData.readUIntLE(0, 2); // Read the command ID from the first 2 bytes of the payload.
    const checkSum = recvData.readUIntLE(2, 2); // Read the checksum from bytes 2 to 4 of the payload.
    const sessionId = recvData.readUIntLE(4, 2); // Read the session ID from bytes 4 to 6 of the payload.
    const replyId = recvData.readUIntLE(6, 2); // Read the reply ID from bytes 6 to 8 of the payload.
    return { commandId, checkSum, sessionId, replyId, payloadSize };
};

/**
 * Returns the string representation of a command value, if available.
 * If the command value is not found, returns 'AN UNKNOWN ERROR'.
 *
 * @param commandValue - The numeric command value to translate into a string.
 * @returns The string representation of the command value or an error message.
 */
export const exportErrorMessage = (commandValue: number): string => {
    const keys = Object.keys(COMMANDS);
    for (let i = 0; i < keys.length; i++) {
        // @ts-ignore
        if (COMMANDS[keys[i]] === commandValue) {
            return keys[i].toString();
        }
    }
    return 'AN UNKNOWN ERROR';
};

/**
 * Checks whether a TCP data packet corresponds to an attendance event.
 *
 * @param data - The TCP data packet as a Buffer.
 * @returns `true` if the packet is an attendance log event, otherwise `false`.
 */
export const checkNotEventTCP = (data: Buffer): boolean => {
    try {
        data = removeTcpHeader(data); // Remove the TCP header for easier parsing.
        const commandId = data.readUIntLE(0, 2); // Extract the command ID from the first 2 bytes.
        const event = data.readUIntLE(4, 2); // Extract the event type from bytes 4 to 6.
        return event === COMMANDS.EF_ATTLOG && commandId === COMMANDS.CMD_REG_EVENT;
    } catch (err:any) {
        log(`[228] : ${err.toString()}, ${data.toString('hex')} `); // Log errors with hexadecimal representation of data.
        return false;
    }
};

/**
 * Checks whether a UDP data packet corresponds to a registered event.
 *
 * @param data - The UDP data packet as a Buffer.
 * @returns `true` if the packet contains a registered event, otherwise `false`.
 */
export const checkNotEventUDP = (data: Buffer): boolean => {
    const commandId = decodeUDPHeader(data.subarray(0, 8)).commandId; // Decode the command ID from the UDP header.
    return commandId === COMMANDS.CMD_REG_EVENT;
};
