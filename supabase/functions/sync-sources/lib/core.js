//#region src/sync/alert.ts
function nextSide(prev, outcome, now) {
	if (outcome.kind === "ok") return {
		state: {
			ok_at: now,
			problem: null,
			problem_since: null,
			alerted: false,
			changed_at: outcome.changed ? now : prev?.changed_at ?? null
		},
		email: prev?.problem && prev.alerted ? { kind: "recovered" } : null
	};
	const same = prev?.problem === outcome.reason;
	const state = {
		ok_at: prev?.ok_at ?? null,
		problem: outcome.reason,
		problem_since: prev?.problem ? prev.problem_since : now,
		alerted: same ? Boolean(prev?.alerted) : false,
		changed_at: prev?.changed_at ?? null
	};
	return {
		state,
		email: state.alerted ? null : {
			kind: "problem",
			reason: outcome.reason
		}
	};
}
/** "Sep 30, 4:15 PM". ICU puts a narrow no-break space before PM; mail clients don't need it. */
var stamp = (iso) => new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York",
	month: "short",
	day: "numeric",
	hour: "numeric",
	minute: "2-digit"
}).format(new Date(iso)).replace(/[  ]/g, " ");
var PANEL = "https://roster.scottforge.ai/oh/?manage";
function emailFor(t, side, email, state) {
	const what = `${t.slug} ${t.sport} ${side}`;
	if (email.kind === "recovered") return {
		subject: `Syncing again: ${what}`,
		text: `${what} is syncing again.\n\n${PANEL}`
	};
	const kept = state.ok_at ? `Fans still see the ${side} from ${stamp(state.ok_at)}.` : `Nothing has synced from this link yet, so fans see the ${side} that was there before.`;
	return {
		subject: `Sync refused: ${what}`,
		text: `${what}: sync refused — ${email.reason}.\n\n${kept}\n\n${PANEL}`
	};
}
//#endregion
//#region src/schedule/icalParse.ts
/** "Salem Jr/Sr High School" -> "Salem". Also the key used to match schools. */
var tidyOpponent = (raw) => raw.replace(/\((?:scrimmage|jamboree)\)/gi, "").replace(/\b(jr\.?\/sr\.?|senior|junior)\b/gi, "").replace(/\b(high\s+school|high|school|hs)\b/gi, "").replace(/\s{2,}/g, " ").replace(/[\s,\-–]+$/, "").trim();
//#endregion
//#region src/sync/calendar.ts
var DB_SCHEDULE_ROW_LIMIT = 100;
var unfold = (text) => text.replace(/\r?\n[ \t]/g, "");
var field = (body, key) => {
	const m = body.match(new RegExp(`^${key}[^:\\r\\n]*:(.*)$`, "m"));
	return m ? m[1].trim().replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ").trim() : "";
};
var clock = (hh, mm) => `${hh % 12 || 12}:${String(mm).padStart(2, "0")} ${hh < 12 ? "AM" : "PM"}`;
/**
* A DTSTART value as an Ohio fan reads it. A zoned or floating stamp is the
* wall clock the school typed, printed as is. A UTC stamp is moved to Eastern,
* because a 7pm Friday game is midnight Saturday in UTC.
*/
function readStart(value) {
	const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})\d{2}(Z)?)?$/);
	if (!m) return null;
	const [, y, mo, d, hh, mm, z] = m;
	if (!hh) return { date: `${y}-${mo}-${d}` };
	if (!z) return {
		date: `${y}-${mo}-${d}`,
		time: clock(+hh, +mm)
	};
	const at = new Date(Date.UTC(+y, +mo - 1, +d, +hh, +mm));
	const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
		timeZone: "America/New_York",
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit"
	}).formatToParts(at).map((p) => [p.type, p.value]));
	return {
		date: `${parts.year}-${parts.month}-${parts.day}`,
		time: clock(+parts.hour, +parts.minute)
	};
}
var EVENTLINK = /^.+?\([^)]*\)\s*([-@])\s*(.+)$/;
var NAMES_A_SCHOOL = /\b(high\s+school|hs|academy|college|school)\b/i;
var PLAIN = /(?:^|\s)(vs\.?|versus|at|@)\s+(.+)$/i;
function readOpponent(summary) {
	const el = summary.match(EVENTLINK);
	if (el) {
		if (!NAMES_A_SCHOOL.test(el[2])) return null;
		return {
			opponent: tidyOpponent(el[2]),
			home: el[1] === "-"
		};
	}
	if (summary.includes("|")) {
		const [matchup = "", , venue = ""] = summary.split("|").map((s) => s.trim());
		const sides = matchup.split(/\s+(?:vs\.?|at|@)\s+/i);
		if (sides.length < 2) return null;
		return {
			opponent: tidyOpponent(sides[1]),
			home: /^home/i.test(venue)
		};
	}
	const plain = summary.match(PLAIN);
	if (!plain) return null;
	const opponent = tidyOpponent(plain[2]);
	return opponent ? {
		opponent,
		home: !/^(at|@)$/i.test(plain[1])
	} : null;
}
function calendarToSchedule(text, opts) {
	const from = `${opts.seasonYear}-08-01`;
	const to = `${opts.seasonYear + 1}-07-31`;
	const season = `${opts.seasonYear}–${String((opts.seasonYear + 1) % 100).padStart(2, "0")}`;
	const filter = opts.filter?.trim() || null;
	const needle = filter?.toLowerCase() ?? null;
	const rows = [];
	let considered = 0;
	let skipped = 0;
	for (const chunk of unfold(text).split("BEGIN:VEVENT").slice(1)) {
		const body = chunk.split("END:VEVENT")[0];
		const summary = field(body, "SUMMARY");
		if (needle) {
			if (!`${summary} ${field(body, "CATEGORIES")} ${field(body, "DESCRIPTION")}`.toLowerCase().includes(needle)) continue;
		}
		if (/^STATUS:CANCELLED/im.test(body)) continue;
		const dt = body.match(/^DTSTART[^:\r\n]*:(\S+)/m);
		const start = dt ? readStart(dt[1]) : null;
		if (!start || start.date < from || start.date > to) continue;
		considered += 1;
		const who = readOpponent(summary);
		if (!who) {
			skipped += 1;
			continue;
		}
		rows.push({
			date: start.date,
			opponent: who.opponent,
			home: who.home,
			...start.time ? { time: start.time } : {}
		});
	}
	if (considered === 0) return {
		ok: false,
		reason: filter ? `no ${season} events match “${filter}” — check the filter` : `the calendar has no ${season} events`
	};
	if (skipped * 2 > considered) return {
		ok: false,
		reason: `${skipped} of ${considered} events don’t name an opponent`
	};
	if (rows.length > DB_SCHEDULE_ROW_LIMIT) return {
		ok: false,
		reason: `the calendar has ${rows.length} games this season — more than one team’s; add or narrow the filter`
	};
	rows.sort((a, b) => a.date.localeCompare(b.date));
	return {
		ok: true,
		rows,
		skipped
	};
}
//#endregion
//#region src/sync/canon.ts
/**
* JSON with its keys sorted, for asking "is this the same data?".
*
* Postgres stores jsonb with its keys reordered, so a roster read back from the
* database never stringifies the way the same roster just parsed does. Without
* this every sync would look like a change.
*/
function canon(value) {
	if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
	if (value && typeof value === "object") {
		const obj = value;
		return `{${Object.keys(obj).filter((k) => obj[k] !== void 0).sort().map((k) => `${JSON.stringify(k)}:${canon(obj[k])}`).join(",")}}`;
	}
	return JSON.stringify(value);
}
//#endregion
//#region src/parse/rosterParse.ts
var OFFENSE = /* @__PURE__ */ new Set([
	"QB",
	"RB",
	"HB",
	"FB",
	"TB",
	"SB",
	"WR",
	"SE",
	"FL",
	"TE",
	"OL",
	"OT",
	"OG",
	"OC",
	"C",
	"G",
	"T",
	"LT",
	"RT",
	"LG",
	"RG"
]);
var DEFENSE = /* @__PURE__ */ new Set([
	"DL",
	"DE",
	"DT",
	"NT",
	"NG",
	"LB",
	"ILB",
	"OLB",
	"MLB",
	"WLB",
	"SLB",
	"DB",
	"CB",
	"S",
	"FS",
	"SS",
	"SAF",
	"SAFETY",
	"EDGE"
]);
var SPECIAL = /* @__PURE__ */ new Set([
	"K",
	"PK",
	"P",
	"LS",
	"H",
	"KR",
	"PR",
	"KOS"
]);
var OTHER_POS = /* @__PURE__ */ new Set(["ATH", "UTIL"]);
var ALL_POS = /* @__PURE__ */ new Set([
	...OFFENSE,
	...DEFENSE,
	...SPECIAL,
	...OTHER_POS
]);
var NAME_SUFFIXES = /* @__PURE__ */ new Set([
	"JR",
	"JR.",
	"SR",
	"SR.",
	"II",
	"III",
	"IV",
	"V"
]);
var clean = (s) => s.replace(/\s+/g, " ").trim();
/** Strip the wrapping quotes a spreadsheet adds around a field. */
var unquote = (s) => {
	const t = s.trim();
	if (t.length >= 2 && t.startsWith("\"") && t.endsWith("\"")) return t.slice(1, -1).replace(/""/g, "\"");
	return t;
};
var splitPositions = (s) => clean(s).toUpperCase().split(/[\/,\-|&]|\s+or\s+/i).map((t) => t.trim()).filter(Boolean);
var isPositionValue = (s) => {
	const parts = splitPositions(s);
	return parts.length > 0 && parts.length <= 3 && parts.every((p) => ALL_POS.has(p));
};
/** The side one position belongs to. '' for ATH, UTIL and anything unrecognised. */
var sideOfPosition = (position) => {
	const p = position.trim().toUpperCase();
	if (OFFENSE.has(p)) return "O";
	if (DEFENSE.has(p)) return "D";
	if (SPECIAL.has(p)) return "ST";
	return "";
};
/**
* The single side to record for a player, for the roster's own column.
*
* Deliberately gives up on a two-way player: one value cannot hold WR and CB,
* and guessing which matters more would be wrong half the time. Filtering
* doesn't use this — see sidesOf in roster/filters, which keeps both.
*/
var sideFromPosition = (position) => {
	const parts = splitPositions(position);
	if (parts.length === 0) return "";
	const sides = /* @__PURE__ */ new Set();
	for (const p of parts) {
		const side = sideOfPosition(p);
		if (side) sides.add(side);
	}
	if (sides.size === 1) return [...sides][0];
	if (sides.size === 2 && sides.has("ST")) return [...sides].find((s) => s !== "ST") ?? "";
	return "";
};
var parseSide = (s) => {
	const t = clean(s).toUpperCase().replace(/[.\s]/g, "");
	if ([
		"O",
		"OFF",
		"OFFENSE"
	].includes(t)) return "O";
	if ([
		"D",
		"DEF",
		"DEFENSE"
	].includes(t)) return "D";
	if ([
		"ST",
		"ST.",
		"SPECIAL",
		"SPECIALTEAMS",
		"STEAMS",
		"K"
	].includes(t)) return "ST";
	return "";
};
var isSideValue = (s) => parseSide(s) !== "";
/** `6'1"`, `6-1`, `6 1`, `6ft1`, or bare inches like `73` -> 73. */
var parseHeight = (input) => {
	const s = clean(input).replace(/[”″]/g, "\"").replace(/[’′]/g, "'");
	if (!s) return void 0;
	const ftIn = s.match(/^(\d)\s*(?:'|-|ft\.?|feet|\s)\s*(\d{1,2})\s*(?:"|''|in\.?|inches)?$/i);
	if (ftIn) {
		const ft = Number(ftIn[1]);
		const inch = Number(ftIn[2]);
		if (inch < 12) return ft * 12 + inch;
	}
	const ftOnly = s.match(/^(\d)\s*(?:'|ft\.?|feet)$/i);
	if (ftOnly) return Number(ftOnly[1]) * 12;
	const bare = s.match(/^(\d{2,3})$/);
	if (bare) {
		const n = Number(bare[1]);
		if (n >= 48 && n <= 90) return n;
	}
};
var isHeightValue = (s) => parseHeight(s) !== void 0;
var parseWeight = (input) => {
	const m = clean(input).match(/^(\d{2,3})\s*(?:lbs?\.?|#)?$/i);
	if (!m) return void 0;
	const n = Number(m[1]);
	return n >= 80 && n <= 450 ? n : void 0;
};
var isWeightValue = (s) => parseWeight(s) !== void 0;
var GRADE_WORDS = {
	FR: "Fr",
	FRESH: "Fr",
	FRESHMAN: "Fr",
	F: "Fr",
	SO: "So",
	SOPH: "So",
	SOPHOMORE: "So",
	JR: "Jr",
	JUN: "Jr",
	JUNIOR: "Jr",
	SR: "Sr",
	SEN: "Sr",
	SENIOR: "Sr"
};
var parseGrade = (input) => {
	const t = clean(input).toUpperCase().replace(/\./g, "");
	if (!t) return void 0;
	if (GRADE_WORDS[t]) return GRADE_WORDS[t];
	const num = t.match(/^(9|10|11|12)(TH)?$/);
	if (num) return num[1];
};
var isGradeValue = (s) => parseGrade(s) !== void 0;
/** Digits only, with '#' and leading zeros tolerated. */
var isJerseyValue = (s) => /^#?\s*\d{1,2}$/.test(clean(s));
var normalizeNumber = (s) => clean(s).replace(/^#\s*/, "");
/** How much a value looks like a person's name. */
var nameScore = (s) => {
	const t = clean(s);
	if (t.length < 2) return 0;
	if ((t.match(/[A-Za-z]/g) ?? []).length / t.length < .7) return 0;
	if (isPositionValue(t) || isGradeValue(t)) return 0;
	return /[,\s]/.test(t) ? 1 : .5;
};
/**
* Rosters mark players with footnote symbols — an asterisk per varsity letter,
* a dagger for a captain. They belong to the printed sheet, not the name.
*/
var stripNameMarks = (s) => clean(s.replace(/[*†‡^~+]+/g, ""));
/** "Smith, John" / "John Smith" / "Smith" -> first + last. */
var splitName = (input) => {
	const s = clean(input).replace(/\s+,/, ",");
	if (!s) return {
		firstName: "",
		lastName: ""
	};
	if (s.includes(",")) {
		const [last, ...rest] = s.split(",");
		return {
			firstName: clean(rest.join(" ")),
			lastName: clean(last)
		};
	}
	const parts = s.split(" ");
	if (parts.length === 1) return {
		firstName: "",
		lastName: parts[0]
	};
	let suffix = "";
	if (parts.length >= 3 && NAME_SUFFIXES.has(parts[parts.length - 1].toUpperCase())) suffix = ` ${parts.pop()}`;
	const last = parts.pop() ?? "";
	return {
		firstName: parts.join(" "),
		lastName: `${last}${suffix}`
	};
};
var detectDelimiter = (lines) => {
	const sample = lines.slice(0, 20);
	const consistent = (re) => {
		const counts = sample.map((l) => (l.match(re) ?? []).length);
		return counts.filter((c) => c > 0).length / Math.max(1, counts.length);
	};
	if (consistent(/\t/g) > .8) return "tab";
	if (consistent(/\|/g) > .8) return "pipe";
	if (consistent(/,/g) > .8) return "comma";
	if (consistent(/;/g) > .8) return "semicolon";
	return "spaces";
};
/** Comma/semicolon split that respects double-quoted fields. */
var splitQuoted = (line, sep) => {
	const out = [];
	let cur = "";
	let inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (ch === "\"") {
			if (inQuotes && line[i + 1] === "\"") {
				cur += "\"";
				i++;
			} else inQuotes = !inQuotes;
		} else if (ch === sep && !inQuotes) {
			out.push(cur);
			cur = "";
		} else cur += ch;
	}
	out.push(cur);
	return out.map((c) => clean(c));
};
var splitLine = (line, delimiter) => {
	switch (delimiter) {
		case "tab": return line.split("	").map((c) => clean(unquote(c)));
		case "pipe": {
			const cells = line.split("|").map((c) => clean(unquote(c)));
			if (cells.length > 1 && cells[0] === "") cells.shift();
			if (cells.length > 1 && cells[cells.length - 1] === "") cells.pop();
			return cells;
		}
		case "comma": return splitQuoted(line, ",");
		case "semicolon": return splitQuoted(line, ";");
		case "spaces": return line.split(/\s{2,}/).map((c) => clean(unquote(c)));
	}
};
var HEADER_TOKENS = [
	[/^#$|^(no|num|number|jersey|jsy|jer)\b\.?\s*#?$|^#\s*$/i, "number"],
	[/^(first|first\s*name|fname|f\.?\s*name)$/i, "firstName"],
	[/^(last|last\s*name|lname|l\.?\s*name|surname)$/i, "lastName"],
	[/^(name|player|player\s*name|athlete|student)$/i, "name"],
	[/^(pos|position|pos\.)$/i, "position"],
	[/^(ht|ht\.|height)$/i, "height"],
	[/^(wt|wt\.|weight|lbs?)$/i, "weight"],
	[/^(gr|grade|yr|year|class|cl|gr\.)$/i, "grade"],
	[/^(side|unit|squad|o\/d)$/i, "side"]
];
var headerKind = (cell) => {
	const t = clean(cell).replace(/\.$/, "");
	if (!t) return void 0;
	for (const [re, kind] of HEADER_TOKENS) if (re.test(t)) return kind;
};
var looksLikeHeader = (cells) => {
	const named = cells.filter((c) => headerKind(c) !== void 0).length;
	const nonEmpty = cells.filter((c) => clean(c) !== "").length;
	return nonEmpty > 0 && named >= 2 && named / nonEmpty >= .5;
};
var CLASSIFIERS = [
	{
		kind: "height",
		test: isHeightValue,
		priority: 6
	},
	{
		kind: "weight",
		test: isWeightValue,
		priority: 5
	},
	{
		kind: "side",
		test: isSideValue,
		priority: 4
	},
	{
		kind: "position",
		test: isPositionValue,
		priority: 4
	},
	{
		kind: "grade",
		test: isGradeValue,
		priority: 3
	},
	{
		kind: "number",
		test: isJerseyValue,
		priority: 2
	}
];
/**
* Score every column against every field kind, then assign greedily by
* confidence. Each column and each kind is used at most once.
*/
var inferColumns = (rows, width) => {
	const columns = new Array(width).fill("ignore");
	const cols = [];
	for (let c = 0; c < width; c++) cols.push(rows.map((r) => r[c] ?? "").filter((v) => v !== ""));
	const candidates = [];
	for (let c = 0; c < width; c++) {
		const values = cols[c];
		if (values.length === 0) continue;
		const distinct = new Set(values.map((v) => v.toUpperCase()));
		for (const { kind, test, priority } of CLASSIFIERS) {
			let score = values.filter(test).length / values.length;
			if (score < .6) continue;
			const gradeShaped = distinct.size <= 5 && [...distinct].every((v) => isGradeValue(v));
			if (kind === "number" && gradeShaped) score -= .5;
			if (kind === "grade" && gradeShaped) score += .3;
			if (kind === "number" && distinct.size / values.length > .8) score += .3;
			if (score >= .6) candidates.push({
				col: c,
				kind,
				score,
				priority
			});
		}
	}
	candidates.sort((a, b) => b.score - a.score || b.priority - a.priority);
	const usedCols = /* @__PURE__ */ new Set();
	const usedKinds = /* @__PURE__ */ new Set();
	for (const cand of candidates) {
		if (usedCols.has(cand.col) || usedKinds.has(cand.kind)) continue;
		columns[cand.col] = cand.kind;
		usedCols.add(cand.col);
		usedKinds.add(cand.kind);
	}
	if (!usedKinds.has("name") && !usedKinds.has("lastName")) {
		let best = -1;
		let bestScore = 0;
		for (let c = 0; c < width; c++) {
			if (usedCols.has(c) || cols[c].length === 0) continue;
			const score = cols[c].reduce((sum, v) => sum + nameScore(v), 0) / cols[c].length;
			if (score > bestScore) {
				bestScore = score;
				best = c;
			}
		}
		if (best >= 0 && bestScore >= .4) {
			columns[best] = "name";
			usedCols.add(best);
			usedKinds.add("name");
		}
	}
	if (usedKinds.has("name")) for (let c = 0; c < width; c++) {
		if (usedCols.has(c) || cols[c].length === 0) continue;
		if (cols[c].reduce((sum, v) => sum + nameScore(v), 0) / cols[c].length >= .4) {
			const nameCol = columns.indexOf("name");
			columns[nameCol] = c < nameCol ? "lastName" : "firstName";
			columns[c] = c < nameCol ? "firstName" : "lastName";
			break;
		}
	}
	return columns;
};
/** Fixed layout used when a paste has no real delimiter to split on. */
var LOOSE_COLUMNS = [
	"number",
	"name",
	"position",
	"height",
	"weight",
	"grade",
	"side"
];
/**
* Last resort for lines like `7 John Smith WR 6-1 175 Jr`, where a plain space
* separates fields but also separates first and last name. Peels the jersey
* number off the front and the typed fields off the back; whatever survives in
* the middle is the name.
*/
var looseSplit = (line) => {
	const out = [
		"",
		"",
		"",
		"",
		"",
		"",
		""
	];
	const tokens = clean(line).split(" ");
	if (tokens.length > 1 && isJerseyValue(tokens[0])) out[0] = normalizeNumber(tokens.shift());
	while (tokens.length > 1) {
		const last = tokens[tokens.length - 1];
		if (tokens.length > 2 && !out[3]) {
			const pair = `${tokens[tokens.length - 2]} ${last}`;
			if (isHeightValue(pair)) {
				out[3] = pair;
				tokens.splice(-2, 2);
				continue;
			}
		}
		if (!out[5] && isGradeValue(last)) {
			out[5] = last;
			tokens.pop();
			continue;
		}
		if (!out[4] && isWeightValue(last)) {
			out[4] = last;
			tokens.pop();
			continue;
		}
		if (!out[3] && isHeightValue(last)) {
			out[3] = last;
			tokens.pop();
			continue;
		}
		if (!out[2] && isPositionValue(last)) {
			out[2] = last;
			tokens.pop();
			continue;
		}
		if (!out[6] && isSideValue(last)) {
			out[6] = last;
			tokens.pop();
			continue;
		}
		break;
	}
	out[1] = tokens.join(" ");
	return out;
};
var newId = () => typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
var blankPlayer = () => ({
	id: newId(),
	number: "",
	firstName: "",
	lastName: "",
	position: "",
	side: ""
});
/** Turn one row of raw cells into a player, given what each column holds. */
var buildRow = (raw, columns) => {
	const player = blankPlayer();
	let explicitSide = "";
	let nameCombined = "";
	const issues = [];
	columns.forEach((kind, i) => {
		const value = raw[i] ?? "";
		if (!value) return;
		switch (kind) {
			case "number":
				player.number = normalizeNumber(value);
				break;
			case "name":
				nameCombined = stripNameMarks(value);
				break;
			case "firstName":
				player.firstName = stripNameMarks(value);
				break;
			case "lastName":
				player.lastName = stripNameMarks(value);
				break;
			case "position":
				player.position = clean(value).toUpperCase();
				break;
			case "side":
				explicitSide = parseSide(value);
				break;
			case "height": {
				const h = parseHeight(value);
				if (h === void 0) issues.push(`Couldn't read height "${value}"`);
				else player.heightIn = h;
				break;
			}
			case "weight": {
				const w = parseWeight(value);
				if (w === void 0) issues.push(`Couldn't read weight "${value}"`);
				else player.weightLb = w;
				break;
			}
			case "grade": player.grade = parseGrade(value) ?? clean(value);
		}
	});
	if (nameCombined) {
		const { firstName, lastName } = splitName(nameCombined);
		player.firstName = firstName;
		player.lastName = lastName;
	}
	player.side = explicitSide || sideFromPosition(player.position);
	if (!player.number) issues.push("No jersey number");
	if (!player.firstName && !player.lastName) issues.push("No name");
	return {
		player,
		issues,
		raw
	};
};
var parseRoster = (text) => {
	const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim() !== "" && !/^[\s|:+-]*[-|][\s|:+-]*$/.test(l));
	if (lines.length === 0) return {
		rows: [],
		columns: [],
		delimiter: "tab"
	};
	const delimiter = detectDelimiter(lines);
	let cells = lines.map((l) => splitLine(l, delimiter));
	let header;
	if (looksLikeHeader(cells[0])) {
		header = cells[0];
		cells = cells.slice(1);
	}
	const unsplit = cells.filter((r) => r.length < 2).length / Math.max(1, cells.length);
	if (delimiter === "spaces" && unsplit > .6) {
		let loose = cells.map((r) => r.join(" "));
		if (!header && looksLikeHeader(clean(loose[0]).split(" "))) {
			header = clean(loose[0]).split(" ");
			loose = loose.slice(1);
		}
		return {
			rows: loose.map((line) => buildRow(looseSplit(line), LOOSE_COLUMNS)),
			columns: LOOSE_COLUMNS,
			delimiter,
			header
		};
	}
	const width = cells.reduce((w, r) => Math.max(w, r.length), header?.length ?? 0);
	cells = cells.map((r) => {
		const padded = r.slice();
		while (padded.length < width) padded.push("");
		return padded;
	});
	let columns;
	if (header) {
		columns = new Array(width).fill("ignore");
		header.forEach((cell, i) => {
			const kind = headerKind(cell);
			if (kind && !columns.includes(kind)) columns[i] = kind;
		});
		if (columns.every((c) => c === "ignore")) columns = inferColumns(cells, width);
	} else columns = inferColumns(cells, width);
	return {
		rows: cells.map((raw) => buildRow(raw, columns)),
		columns,
		delimiter,
		header
	};
};
/** Matching key for a jersey number: digits, leading zeros dropped. */
var numberKey = (s) => {
	return s.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
};
//#endregion
//#region src/sync/rosterCheck.ts
var MAX_ROWS = 300;
var stripBom = (text) => text.replace(/^﻿/, "");
var isEmptyRow = (line) => /^[\s,;\t]*$/.test(line);
/** Fewer than two filled cells: "2026 Varsity Roster" sitting above the header. */
var isTitleRow = (line) => line.split(",").filter((c) => c.replace(/"/g, "").trim() !== "").length < 2;
function tidySheet(text) {
	const lines = stripBom(text).replace(/\r\n?/g, "\n").split("\n").filter((l) => !isEmptyRow(l));
	let start = 0;
	while (start < lines.length - 1 && isTitleRow(lines[start])) start += 1;
	return lines.slice(start).join("\n");
}
var label = (p, raw) => {
	return [p.firstName, p.lastName].filter(Boolean).join(" ") || raw.filter(Boolean).join(" ") || "(blank row)";
};
function checkRoster(text, previousCount) {
	const { rows } = parseRoster(tidySheet(text));
	if (rows.length === 0) return {
		ok: false,
		reason: "the sheet has no player rows"
	};
	if (rows.length > MAX_ROWS) return {
		ok: false,
		reason: `the sheet has ${rows.length} rows, and a roster stops at ${MAX_ROWS}`
	};
	const unnamed = rows.filter((r) => !r.player.number || !r.player.firstName && !r.player.lastName);
	if (unnamed.length) return {
		ok: false,
		reason: `${unnamed.length === 1 ? "a row is" : `${unnamed.length} rows are`} missing a number or a name (“${label(unnamed[0].player, unnamed[0].raw)}”)`
	};
	if (previousCount > 0 && rows.length < previousCount / 2) return {
		ok: false,
		reason: `the sheet has ${rows.length} players where it had ${previousCount} — was it cleared, or the wrong tab published?`
	};
	const players = rows.map((r) => ({ ...r.player }));
	const warnings = [];
	for (const r of rows) for (const issue of r.issues) warnings.push(`#${r.player.number} ${label(r.player, r.raw)}: ${issue}`);
	const worn = /* @__PURE__ */ new Map();
	for (const p of players) worn.set(numberKey(p.number), (worn.get(numberKey(p.number)) ?? 0) + 1);
	for (const [n, count] of worn) if (count > 1) warnings.push(`#${n} is worn by ${count} players`);
	return {
		ok: true,
		players,
		warnings
	};
}
var withoutId = (p) => {
	const { id, ...rest } = p;
	return rest;
};
/** The same roster, ignoring the ids the parser makes up fresh on every read. */
var sameRoster = (a, b) => a.length === b.length && canon(a.map(withoutId)) === canon(b.map(withoutId));
//#endregion
//#region src/sync/run.ts
var isWebPage = (f) => /text\/html/i.test(f.contentType) || /^\s*<(!doctype|html)/i.test(f.text);
var NOT_A_SHEET = "the link opens a web page, not a sheet — publish the roster tab to the web as CSV";
var NOT_A_CALENDAR = "the link opens a web page, not a calendar — copy the calendar’s iCal or subscribe link";
async function rosterOutcome(t, fetchText) {
	const got = await fetchText(t.roster_source_url);
	if (!got.ok) return {
		outcome: {
			kind: "problem",
			reason: `the sheet didn’t answer (${got.reason})`
		},
		players: null
	};
	if (isWebPage(got)) return {
		outcome: {
			kind: "problem",
			reason: NOT_A_SHEET
		},
		players: null
	};
	const v = checkRoster(got.text, t.players.length);
	if (!v.ok) return {
		outcome: {
			kind: "problem",
			reason: v.reason
		},
		players: null
	};
	const changed = !sameRoster(t.players, v.players);
	return {
		outcome: {
			kind: "ok",
			changed
		},
		players: changed ? v.players : null
	};
}
async function scheduleOutcome(t, fetchText) {
	const got = await fetchText(t.schedule_source_url);
	if (!got.ok) return {
		outcome: {
			kind: "problem",
			reason: `the calendar didn’t answer (${got.reason})`
		},
		schedule: null
	};
	if (isWebPage(got)) return {
		outcome: {
			kind: "problem",
			reason: NOT_A_CALENDAR
		},
		schedule: null
	};
	const v = calendarToSchedule(got.text, {
		filter: t.schedule_source_filter,
		seasonYear: t.season
	});
	if (!v.ok) return {
		outcome: {
			kind: "problem",
			reason: v.reason
		},
		schedule: null
	};
	const changed = !t.schedule || canon(t.schedule) !== canon(v.rows);
	return {
		outcome: {
			kind: "ok",
			changed
		},
		schedule: changed ? v.rows : null
	};
}
async function syncTarget(t, fetchText, now) {
	const state = { ...t.sync_state };
	const emails = [];
	let players = null;
	let schedule = null;
	if (t.roster_source_url) {
		const r = await rosterOutcome(t, fetchText);
		const next = nextSide(t.sync_state.roster, r.outcome, now);
		state.roster = next.state;
		players = r.players;
		if (next.email) emails.push({
			side: "roster",
			email: next.email
		});
	}
	if (t.schedule_source_url && t.sport !== "football") {
		const s = await scheduleOutcome(t, fetchText);
		const next = nextSide(t.sync_state.schedule, s.outcome, now);
		state.schedule = next.state;
		schedule = s.schedule;
		if (next.email) emails.push({
			side: "schedule",
			email: next.email
		});
	}
	return {
		players,
		schedule,
		state,
		emails
	};
}
/** The panel's Check link: the same reading, no history, nothing written. */
async function previewSource(req, fetchText) {
	const got = await fetchText(req.url);
	if (!got.ok) return {
		ok: false,
		reason: `the link didn’t answer (${got.reason})`
	};
	if (req.kind === "roster") {
		if (isWebPage(got)) return {
			ok: false,
			reason: NOT_A_SHEET
		};
		const v = checkRoster(got.text, 0);
		return v.ok ? {
			ok: true,
			players: v.players,
			warnings: v.warnings,
			skipped: 0
		} : v;
	}
	if (isWebPage(got)) return {
		ok: false,
		reason: NOT_A_CALENDAR
	};
	const v = calendarToSchedule(got.text, {
		filter: req.filter,
		seasonYear: req.season
	});
	return v.ok ? {
		ok: true,
		rows: v.rows,
		warnings: [],
		skipped: v.skipped
	} : v;
}
//#endregion
export { emailFor, previewSource, syncTarget };
