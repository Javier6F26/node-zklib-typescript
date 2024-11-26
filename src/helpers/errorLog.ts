import * as fs from 'fs';

/**
 * Obtiene el tiempo actual en un formato estructurado.
 * @returns Un objeto con el año, mes, día, hora y segundos actuales.
 */
const parseCurrentTime = (): {
    year: number;
    month: number;
    day: number;
    hour: number;
    second: number;
} => {
    const currentTime = new Date();
    return {
        year: currentTime.getFullYear(),
        month: currentTime.getMonth() + 1,
        day: currentTime.getDate(),
        hour: currentTime.getHours(),
        second: currentTime.getSeconds(),
    };
};

/**
 * Escribe un mensaje de error en un archivo log.
 * El nombre del archivo sigue el formato `DDMMYYYY.err.log`.
 * @param text Mensaje de texto a registrar en el archivo log.
 */
export const log = (text: string): void => {
    const currentTime = parseCurrentTime();
    const logFileName = `${String(currentTime.day).padStart(2, '0')}${String(
        currentTime.month
    ).padStart(2, '0')}${currentTime.year}.err.log`;

    const logMessage = `\n[${String(currentTime.hour).padStart(2, '0')}:${String(
        currentTime.second
    ).padStart(2, '0')}] ${text}`;

    fs.appendFile(logFileName, logMessage, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
};
