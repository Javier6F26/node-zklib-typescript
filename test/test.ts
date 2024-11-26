import { ZKLib } from "@zklib/zklib";

const test = async () => {
    // Create an instance of the ZKLib class
    const zkInstance = new ZKLib('200.84.10.11', 4370, 10000, 4000);

    try {
        // Step 1: Create a socket connection to the device
        await zkInstance.createSocket();
        console.log('Socket connection established.');

        // Step 2: Retrieve general device information
        // This includes log capacity, user count, and log count
        const deviceInfo = await zkInstance.getInfo();
        console.log('Device Info:', deviceInfo);
    } catch (error) {
        console.error('Error during socket connection or retrieving device info:', error);
    }

    try {
        // Step 3: Fetch attendance logs from the device
        const attendances = await zkInstance.getAttendances();
        console.log('Attendance Logs:', attendances.data);

        // Step 4: Retrieve the list of registered users
        const users = await zkInstance.getUsers();
        console.log('Registered Users:', users.data);
    } catch (error) {
        console.error('Error during data retrieval:', error);
    } finally {
        // Step 5: Disconnect from the device
        // Note: Avoid disconnecting if you require real-time updates
        try {
            await zkInstance.disconnect();
            console.log('Disconnected from the device.');
        } catch (disconnectError) {
            console.error('Error during disconnection:', disconnectError);
        }
    }
};

// Execute the test function
test();
