import { zonedTimeToUtc } from "date-fns-tz";
import { subHours } from "date-fns";
import { TIMEZONE } from "../arbox/constants.js";

export function computeFireAt(classDate, classTime, enableRegistrationHours) {
	const classStartUtc = zonedTimeToUtc(`${classDate} ${classTime}:00`, TIMEZONE);
	return subHours(classStartUtc, enableRegistrationHours);
}

export function classTimesToUtc(classDate, startTime, endTime) {
	return {
		startUtc: zonedTimeToUtc(`${classDate} ${startTime}:00`, TIMEZONE).toISOString(),
		endUtc: zonedTimeToUtc(`${classDate} ${endTime}:00`, TIMEZONE).toISOString(),
	};
}
