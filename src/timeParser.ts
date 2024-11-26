/**
 * Decodes a time value (in seconds) into a JavaScript Date object.
 * The time is interpreted as the number of seconds since a hypothetical
 * start date based on a custom encoding scheme.
 *
 * @param time - The time value in seconds to decode.
 * @returns A Date object representing the decoded time.
 */
export const decode = (time: number): Date => {
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
 * Encodes a JavaScript Date object into a custom time value (in seconds).
 * The encoded value is derived from the year, month, day, hour, minute, and second
 * of the Date object using a custom encoding scheme.
 *
 * @param date - The Date object to encode.
 * @returns A number representing the encoded time in seconds.
 */
export const encode = (date: Date): number => {
	return (
		((date.getFullYear() % 100) * 12 * 31 +
			date.getMonth() * 31 +
			date.getDate() -
			1) *
		(24 * 60 * 60) +
		(date.getHours() * 60 + date.getMinutes()) * 60 +
		date.getSeconds()
	);
};
