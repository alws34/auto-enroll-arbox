import { zonedTimeToUtc } from "date-fns-tz";
import { subHours, subMinutes } from "date-fns";
import { TIMEZONE } from "../arbox/constants.js";

export function classStartUtc(classDate, classTime) {
	return zonedTimeToUtc(`${classDate} ${classTime}:00`, TIMEZONE);
}

export function computeFireAt(classDate, classTime, enableRegistrationHours) {
	return subHours(classStartUtc(classDate, classTime), enableRegistrationHours);
}

export function computeReminderAt(classDate, classTime, minutesBefore) {
	return subMinutes(classStartUtc(classDate, classTime), minutesBefore);
}

export function classTimesToUtc(classDate, startTime, endTime) {
	return {
		startUtc: classStartUtc(classDate, startTime).toISOString(),
		endUtc: zonedTimeToUtc(`${classDate} ${endTime}:00`, TIMEZONE).toISOString(),
	};
}
