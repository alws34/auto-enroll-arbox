// Deep links to CrossFit's own official technique library
// (crossfit.com/crossfit-movements) for the movement keywords our dictionary
// recognizes (server/training/movementDictionary.js). Link out only — never
// download or embed their photos/gifs here, that would be a real copyright
// problem even for a personal app. Only keywords with a confirmed, real URL
// on that page are listed; anything else silently gets no link rather than
// a guessed-and-possibly-broken one.
const MOVEMENT_LINKS = {
	"back squat": "https://www.crossfit.com/essentials/the-back-squat",
	deadlift: "https://www.crossfit.com/essentials/the-deadlift",
	"step-up": "https://www.crossfit.com/essentials/the-box-step-up",
	"box jump": "https://www.crossfit.com/essentials/the-box-jump",
	"wall ball": "https://www.crossfit.com/essentials/the-wall-ball",
	thruster: "https://www.crossfit.com/essentials/the-thruster",
	clean: "https://www.crossfit.com/essentials/the-clean-2",
	snatch: "https://www.crossfit.com/essentials/the-snatch",
	jerk: "https://www.crossfit.com/essentials/foundational-movement-jerk-what-is-a-jerk",
	"push press": "https://www.crossfit.com/essentials/the-push-press",
	"strict press": "https://www.crossfit.com/essentials/the-shoulder-press",
	"kb swing": "https://www.crossfit.com/essentials/the-kettlebell-swing",
	"pull-up": "https://www.crossfit.com/essentials/the-kipping-pull-up",
	"muscle-up": "https://www.crossfit.com/essentials/the-kipping-muscle-up",
	"rope climb": "https://www.crossfit.com/essentials/the-rope-climb-basket",
	row: "https://www.crossfit.com/essentials/rowing",
	"push-up": "https://www.crossfit.com/essentials/the-push-up",
	"bench press": "https://www.crossfit.com/essentials/the-bench-press",
	dip: "https://www.crossfit.com/essentials/the-dip",
	"handstand push-up": "https://www.crossfit.com/essentials/handstand-push-up-variations",
	"sit-up": "https://www.crossfit.com/essentials/the-abmat-sit-up",
	"toes-to-bar": "https://www.crossfit.com/essentials/the-kipping-toes-to-bar",
	ghd: "https://www.crossfit.com/essentials/the-ghd-sit-up",
	burpee: "https://www.crossfit.com/essentials/the-burpee-2",
	"double under": "https://www.crossfit.com/essentials/the-double-under",
	"farmer carry": "https://www.crossfit.com/essentials/the-farmer-carry",
	"knees-to-elbows": "https://www.crossfit.com/essentials/the-strict-knees-to-elbow",
	"handstand walk": "https://www.crossfit.com/essentials/the-handstand-walk",
};

export function movementLink(keyword) {
	return MOVEMENT_LINKS[keyword] || null;
}
