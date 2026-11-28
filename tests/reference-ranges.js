// Age-based reference ranges and growth / development facts used to double-check the question banks (see tests/check-data.js).
// They are an independent second opinion: if a question says something that contradicts these tables, the test fails.
//
// SOURCES (approximate textbook values; sources differ by a few units, so each range has a CORE (clearly normal) and an
// OUTER limit (clearly abnormal beyond it). A value between the two is rejected as ambiguous: write questions with values that are clearly in or out):
//  - Pediatric vital signs: Hockenberry & Wilson, Wong's Nursing Care of Infants and Children (11th ed.), vital sign tables;
//    Harriet Lane Handbook (22nd ed.); AHA Pediatric Advanced Life Support (PALS) 2020, normal and hypotension limits
//    (hypotension below 70 + 2 x age in years for ages 1 to 10); Canadian Paediatric Society / SickKids resources agree to within the margins used here.
//  - Fetal heart rate: baseline 110 to 160 beats/min (SOGC 2020 intrapartum fetal surveillance guideline; ACOG/NICHD 2008 use the same limits).
//  - Growth: birth weight doubles at about 4 to 6 months and triples by about 12 months (Wong's; WHO growth standards give the same pattern);
//    healthy term newborns lose up to about 7 to 10% of birth weight in the first days and regain it by about 10 to 14 days (Canadian Paediatric Society, Health Canada / WHO joint statement; AAP).
//  - Development: Denver II / CDC milestones (2022 revision) and Wong's; windows below cover both. Erikson and Piaget stages: standard nursing-textbook ages.
//  - APGAR: Apgar 1953; AAP/ACOG: 7 to 10 reassuring, 4 to 6 moderately abnormal, 0 to 3 low.
//  - Expected date of delivery: Naegele's rule (first day of last menstrual period + 7 days - 3 months + 1 year).

// age group (by age in months): [core low, core high, outer low, outer high]
const PEDS_VITALS = {
  newborn:      { label: "newborn (birth to 1 month)", hr: [120, 160, 100, 180], rr: [35, 55, 30, 60], sbp: [65, 85, 55, 95] },
  infant:       { label: "infant (1 to 12 months)",    hr: [110, 150, 90, 170],  rr: [25, 45, 20, 50], sbp: [75, 100, 70, 106] },
  toddler:      { label: "toddler (1 to 3 years)",     hr: [100, 135, 80, 150],  rr: [22, 32, 20, 40], sbp: [85, 100, 75, 110] },
  preschool:    { label: "preschooler (3 to 6 years)", hr: [85, 120, 70, 140],   rr: [20, 28, 18, 34], sbp: [90, 105, 80, 112] },
  "school-age": { label: "school-age (6 to 12 years)", hr: [75, 105, 60, 120],   rr: [16, 24, 14, 30], sbp: [95, 115, 85, 125] },
  adolescent:   { label: "adolescent (12 to 18 years)", hr: [65, 90, 55, 105],  rr: [12, 20, 10, 22], sbp: [105, 125, 95, 135] }
};
function pedsGroup(months) {
  if (!(months >= 0)) return null;
  return months < 1 ? "newborn" : months < 12 ? "infant" : months < 36 ? "toddler" : months < 72 ? "preschool" : months < 144 ? "school-age" : months < 216 ? "adolescent" : null;
}
function pedsFlag(months, name, value) {
  const g = pedsGroup(months), t = g && PEDS_VITALS[g], r = t && t[name];
  if (!r) return { invalid: `no pediatric ${name} range for age ${months} months` };
  if (value >= r[0] && value <= r[1]) return { flag: "normal", group: g };
  if (value < r[2]) return { flag: "low", group: g };
  if (value > r[3]) return { flag: "high", group: g };
  return { invalid: `${name} ${value} for a ${t.label} is in the grey zone between the core range (${r[0]} to ${r[1]}) and the outer limits (${r[2]} to ${r[3]}); use a clearly normal or clearly abnormal value` };
}
// milestones: typical age window in months in which the skill is expected (covers Denver II and CDC 2022)
const MILESTONES = {
  "social-smile": [1, 3], "holds-head-steady": [3, 5], "rolls-over": [4, 7], "sits-without-support": [6, 9], "crawls": [7, 11],
  "pulls-to-stand": [8, 12], "pincer-grasp": [8, 12], "first-words": [9, 13], "walks-alone": [11, 15], "two-word-phrases": [18, 26]
};
const ERIKSON = { // [from, to] in years
  "trust versus mistrust": [0, 1], "autonomy versus shame and doubt": [1, 3], "initiative versus guilt": [3, 6], "industry versus inferiority": [6, 12],
  "identity versus role confusion": [12, 19], "intimacy versus isolation": [19, 40], "generativity versus stagnation": [40, 65], "integrity versus despair": [65, 120]
};
const PIAGET = { "sensorimotor": [0, 2], "preoperational": [2, 7], "concrete operational": [7, 11], "formal operational": [11, 18] };
const FETAL_HR = [110, 160];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const fmtDate = d => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
const iso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null; };
function naegele(lmp) { // lmp: Date (UTC). Add 7 days, subtract 3 months, add 1 year == add 9 months and 7 days
  const d = new Date(Date.UTC(lmp.getUTCFullYear(), lmp.getUTCMonth() + 9, lmp.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 7);
  return d;
}

// Verifies one check object against the tables. ctx = { text (the whole question text), a (the keyed answer, lower case, or "") , ans (raw keyed answer or undefined) }.
// Returns a list of problem messages (empty = fine).
function verify(c, ctx) {
  const out = [], has = (s) => ctx.text.includes(String(s));
  const needAns = (s, what) => { if (ctx.ans !== undefined && !ctx.a.includes(String(s).toLowerCase())) out.push(`the keyed answer "${ctx.ans}" does not say ${what || `"${s}"`}`); };
  if (c.kind === "peds-vital") {
    const f = pedsFlag(c.ageMonths, c.name, c.value);
    if (f.invalid) return [f.invalid];
    if (f.flag !== c.flag) out.push(`for a ${PEDS_VITALS[f.group].label}, ${c.name} ${c.value} is ${f.flag}, but the check says ${c.flag}`);
    if (!c.ageText || !has(c.ageText)) out.push(`the question text does not show the child's age "${c.ageText || ""}"`);
    if (!has(c.value)) out.push(`the question text does not show "${c.value}"`);
    needAns(c.flag);
  } else if (c.kind === "fhr") {
    const b = c.baseline, near = Math.min(Math.abs(b - FETAL_HR[0]), Math.abs(b - FETAL_HR[1])) < 3;
    if (!Number.isFinite(b)) return ["needs a baseline number"];
    if (near) return [`a baseline of ${b} is too close to the limits ${FETAL_HR[0]} to ${FETAL_HR[1]} to be a clear example`];
    const flag = b < FETAL_HR[0] ? "bradycardia" : b > FETAL_HR[1] ? "tachycardia" : "normal";
    if (flag !== c.flag) out.push(`a baseline of ${b} beats/min is ${flag}, but the check says ${c.flag}`);
    if (!has(b)) out.push(`the question text does not show "${b}"`);
    needAns(c.flag);
  } else if (c.kind === "weight-milestone") {
    const m = c.milestone === "double" ? 2 : c.milestone === "triple" ? 3 : 0, win = m === 2 ? [4, 6] : [11, 13];
    if (!m) return ['milestone must be "double" or "triple"'];
    if (Math.abs(c.birthKg * m - c.value) > 0.06) out.push(`birth weight ${c.birthKg} kg x ${m} is ${+(c.birthKg * m).toFixed(2)} kg, but the check says ${c.value} kg`);
    if (!(c.ageMonths >= win[0] && c.ageMonths <= win[1])) out.push(`birth weight ${c.milestone}s at about ${win[0]} to ${win[1]} months, not ${c.ageMonths}`);
    if (!has(c.birthKg)) out.push(`the question text does not show the birth weight "${c.birthKg}"`);
    needAns(c.value);
  } else if (c.kind === "newborn-weight") {
    if (![c.birthG, c.weightG, c.day].every(Number.isFinite) || c.day < 1 || c.day > 14) return ["needs birthG, weightG and a day from 1 to 14"];
    const loss = (c.birthG - c.weightG) / c.birthG * 100;
    if (loss > 7 && loss < 10.5) return [`a loss of ${loss.toFixed(1)}% sits between 7% and 10%, where sources differ; use a clearer example`];
    const status = loss > 10 ? "excessive" : "expected";
    if (status !== c.status) out.push(`a loss of ${loss.toFixed(1)}% is ${status}, but the check says ${c.status}`);
    if (!has(c.weightG)) out.push(`the question text does not show "${c.weightG}"`);
    needAns(c.status);
  } else if (c.kind === "milestone") {
    const w = MILESTONES[c.skill];
    if (!w) return [`unknown milestone "${c.skill}"`];
    if (!(c.months >= w[0] && c.months <= w[1])) out.push(`"${c.skill}" is expected at ${w[0]} to ${w[1]} months, not ${c.months}`);
    needAns(c.months, `"${c.months}"`);
  } else if (c.kind === "stage") {
    const t = c.theory === "erikson" ? ERIKSON : c.theory === "piaget" ? PIAGET : null, w = t && t[c.stage];
    if (!t) return ['theory must be "erikson" or "piaget"'];
    if (!w) return [`unknown ${c.theory} stage "${c.stage}"`];
    if (!(c.ageYears > w[0] && c.ageYears < w[1])) out.push(`${c.stage} covers ${w[0]} to ${w[1]} years, so ${c.ageYears} is not clearly inside it`);
    if (!has(c.ageText || c.ageYears)) out.push(`the question text does not show the age "${c.ageText || c.ageYears}"`);
    needAns(c.stage);
  } else if (c.kind === "apgar") {
    const parts = [c.appearance, c.pulse, c.grimace, c.activity, c.respiration];
    if (!parts.every(p => Number.isInteger(p) && p >= 0 && p <= 2)) return ["each APGAR part must be 0, 1 or 2"];
    const total = parts.reduce((s, p) => s + p, 0), band = total >= 7 ? "reassuring" : total >= 4 ? "moderate" : "low";
    if (total !== c.total) out.push(`the APGAR parts add up to ${total}, but the check says ${c.total}`);
    if (c.band !== undefined && band !== c.band) out.push(`an APGAR of ${total} is ${band}, but the check says ${c.band}`);
    if (!has(c.total)) out.push(`the question text does not show the total "${c.total}"`);
    needAns(c.what === "band" ? band : String(total));
  } else if (c.kind === "edd") {
    const l = iso(c.lmp), e = iso(c.edd);
    if (!l || !e) return ["lmp and edd must be dates like 2026-03-14"];
    if (l.getUTCDate() > 28) return ["use a last menstrual period on day 28 or earlier, so that Naegele's rule has no month-end ambiguity"];
    const want = naegele(l);
    if (want.getTime() !== e.getTime()) out.push(`Naegele's rule gives ${fmtDate(want)}, but the check says ${fmtDate(e)}`);
    if (!has(fmtDate(l))) out.push(`the question text does not show the last menstrual period as "${fmtDate(l)}"`);
    needAns(fmtDate(e).toLowerCase(), `"${fmtDate(e)}"`);
  } else if (c.kind === "gestational-age") {
    const l = iso(c.lmp), d = iso(c.onDate);
    if (!l || !d) return ["lmp and onDate must be dates like 2026-03-14"];
    const days = Math.round((d - l) / 86400000), w = Math.floor(days / 7), r = days % 7;
    if (w !== c.weeks || r !== c.days) out.push(`from ${c.lmp} to ${c.onDate} is ${w} weeks and ${r} days, but the check says ${c.weeks} weeks and ${c.days} days`);
    if (!has(fmtDate(l)) || !has(fmtDate(d))) out.push(`the question text must show both dates as "${fmtDate(l)}" and "${fmtDate(d)}"`);
    needAns(`${c.weeks} weeks`);
  } else return null; // not one of ours
  return out;
}
const KINDS = ["peds-vital", "fhr", "weight-milestone", "newborn-weight", "milestone", "stage", "apgar", "edd", "gestational-age"];

module.exports = { PEDS_VITALS, pedsGroup, pedsFlag, MILESTONES, ERIKSON, PIAGET, FETAL_HR, naegele, fmtDate, verify, KINDS };
