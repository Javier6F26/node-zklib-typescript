
# node-zklib-typescript

A TypeScript adaptation of the lightweight library for connecting to ZKTeco biometric devices. This version is fully typed and includes a comprehensive list of device commands for better development and integration experience.

## Features
- Fully typed with TypeScript for improved developer experience.
- Comprehensive export of device commands as an enum for easy access and readability.
- Compatible with ZKTeco biometric devices for managing attendance and user data.

## Installation

```bash
npm install node-zklib-typescript
```

or

```bash
yarn add node-zklib-typescript
```

## Example Usage

```typescript
import { ZKLib } from 'node-zklib-typescript';

const test = async () => {
    const zkInstance = new ZKLib('200.84.10.11', 4370, 10000, 4000);

    try {
        await zkInstance.createSocket();
        console.log('Socket connection established.');

        const deviceInfo = await zkInstance.getInfo();
        console.log('Device Info:', deviceInfo);
    } catch (error) {
        console.error('Error during socket connection or retrieving device info:', error);
    }

    try {
        const attendances = await zkInstance.getAttendances();
        console.log('Attendance Logs:', attendances.data);

        const users = await zkInstance.getUsers();
        console.log('Registered Users:', users.data);
    } catch (error) {
        console.error('Error during data retrieval:', error);
    } finally {
        try {
            await zkInstance.disconnect();
            console.log('Disconnected from the device.');
        } catch (disconnectError) {
            console.error('Error during disconnection:', disconnectError);
        }
    }
};

test();
```

## Device Commands

The library exports a comprehensive set of commands as an enum for easy access:

```typescript
export enum COMMANDS {
    CMD_CONNECT = 1000,
    CMD_EXIT = 1001,
    CMD_ENABLEDEVICE = 1002,
    CMD_DISABLEDEVICE = 1003,
    CMD_RESTART = 1004,
    CMD_POWEROFF = 1005,
    CMD_SLEEP = 1006,
    CMD_RESUME = 1007,
    CMD_CAPTUREFINGER = 1009,
    CMD_TEST_TEMP = 1011,
    CMD_CAPTUREIMAGE = 1012,
    CMD_REFRESHDATA = 1013,
    CMD_REFRESHOPTION = 1014,
    CMD_TESTVOICE = 1017,
    CMD_GET_VERSION = 1100,
    CMD_CHANGE_SPEED = 1101,
    CMD_AUTH = 1102,
    CMD_PREPARE_DATA = 1500,
    CMD_DATA = 1501,
    CMD_FREE_DATA = 1502,
    CMD_DATA_WRRQ = 1503,
    CMD_DATA_RDY = 1504,
    CMD_DB_RRQ = 7,
    CMD_USER_WRQ = 8,
    CMD_USERTEMP_RRQ = 9,
    CMD_USERTEMP_WRQ = 10,
    CMD_OPTIONS_RRQ = 11,
    CMD_OPTIONS_WRQ = 12,
    CMD_ATTLOG_RRQ = 13,
    CMD_CLEAR_DATA = 14,
    CMD_CLEAR_ATTLOG = 15,
    CMD_DELETE_USER = 18,
    CMD_DELETE_USERTEMP = 19,
    CMD_CLEAR_ADMIN = 20,
    CMD_USERGRP_RRQ = 21,
    CMD_USERGRP_WRQ = 22,
    CMD_USERTZ_RRQ = 23,
    CMD_USERTZ_WRQ = 24,
    CMD_GRPTZ_RRQ = 25,
    CMD_GRPTZ_WRQ = 26,
    CMD_TZ_RRQ = 27,
    CMD_TZ_WRQ = 28,
    CMD_ULG_RRQ = 29,
    CMD_ULG_WRQ = 30,
    CMD_UNLOCK = 31,
    CMD_CLEAR_ACC = 32,
    CMD_CLEAR_OPLOG = 33,
    CMD_OPLOG_RRQ = 34,
    CMD_GET_FREE_SIZES = 50,
    CMD_ENABLE_CLOCK = 57,
    CMD_STARTVERIFY = 60,
    CMD_STARTENROLL = 61,
    CMD_CANCELCAPTURE = 62,
    CMD_STATE_RRQ = 64,
    CMD_WRITE_LCD = 66,
    CMD_CLEAR_LCD = 67,
    CMD_GET_PINWIDTH = 69,
    CMD_SMS_WRQ = 70,
    CMD_SMS_RRQ = 71,
    CMD_DELETE_SMS = 72,
    CMD_UDATA_WRQ = 73,
    CMD_DELETE_UDATA = 74,
    CMD_DOORSTATE_RRQ = 75,
    CMD_WRITE_MIFARE = 76,
    CMD_EMPTY_MIFARE = 78,
    CMD_VERIFY_WRQ = 79,
    CMD_VERIFY_RRQ = 80,
    CMD_TMP_WRITE = 87,
    CMD_CHECKSUM_BUFFER = 119,
    CMD_DEL_FPTMP = 134,
    CMD_GET_TIME = 201,
    CMD_SET_TIME = 202,
    CMD_REG_EVENT = 500,
    CMD_ACK_OK = 2000,
    CMD_ACK_ERROR = 2001,
    CMD_ACK_DATA = 2002,
    CMD_ACK_RETRY = 2003,
    CMD_ACK_REPEAT = 2004,
    CMD_ACK_UNAUTH = 2005,
    CMD_ACK_UNKNOWN = 65535,
    CMD_ACK_ERROR_CMD = 65533,
    CMD_ACK_ERROR_INIT = 65532,
    CMD_ACK_ERROR_DATA = 65531,
    EF_ATTLOG = 1,
    EF_FINGER = 2,
    EF_ENROLLUSER = 4,
    EF_ENROLLFINGER = 8,
    EF_BUTTON = 16,
    EF_UNLOCK = 32,
    EF_VERIFY = 128,
    EF_FPFTR = 256,
    EF_ALARM = 512,
}
```

## License

This project is licensed under the MIT License. See the LICENSE file for details.
