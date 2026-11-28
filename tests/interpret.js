// Small lookups used by tests/check-data.js to verify the interpretation questions in the question banks:
//   abgInterpret(pH, PaCO2, HCO3)  ->  e.g. "respiratory acidosis, uncompensated"
//   labFlag(name, value)            ->  "low" | "normal" | "high"
//   rhythm names and the expected priority action for each rhythm.
// They are an independent second opinion: the question's keyed answer must agree with them.

/* ---------- arterial blood gas ----------
   Normal: pH 7.35 to 7.45, PaCO2 35 to 45 mmHg (4.7 to 6.0 kPa), HCO3 22 to 26 mmol/L.
   Step 1 the pH (acidosis or alkalosis), step 2 which of PaCO2 / HCO3 matches it (respiratory or metabolic),
   step 3 compensation: the other value has moved the opposite way (partly if the pH is still abnormal, fully if the pH is back to normal). */
function abgInterpret({ pH, paco2, hco3 }) {
  const acid = pH < 7.35, alk = pH > 7.45;
  const co2 = paco2 > 45 ? "high" : paco2 < 35 ? "low" : "normal";
  const hc = hco3 > 26 ? "high" : hco3 < 22 ? "low" : "normal";
  const out = (primary, compensation) => ({ primary, compensation, label: compensation ? `${primary}, ${compensation}` : primary });
  if (!acid && !alk) {
    if (co2 === "normal" && hc === "normal") return out("normal", "");
    if (pH < 7.40) { // normal pH on the acid side
      if (co2 === "high" && hc === "high") return out("respiratory acidosis", "fully compensated");
      if (co2 === "low" && hc === "low") return out("metabolic acidosis", "fully compensated");
    } else {         // normal pH on the alkaline side
      if (co2 === "low" && hc === "low") return out("respiratory alkalosis", "fully compensated");
      if (co2 === "high" && hc === "high") return out("metabolic alkalosis", "fully compensated");
    }
    return { invalid: "normal pH with only one abnormal value cannot be interpreted" };
  }
  if (acid) {
    if (co2 === "high" && hc === "low") return out("mixed respiratory and metabolic acidosis", "");
    if (co2 === "high") return out("respiratory acidosis", hc === "high" ? "partially compensated" : "uncompensated");
    if (hc === "low") return out("metabolic acidosis", co2 === "low" ? "partially compensated" : "uncompensated");
    return { invalid: "acid pH but PaCO2 and HCO3 do not explain it" };
  }
  if (co2 === "low" && hc === "high") return out("mixed respiratory and metabolic alkalosis", "");
  if (co2 === "low") return out("respiratory alkalosis", hc === "low" ? "partially compensated" : "uncompensated");
  if (hc === "high") return out("metabolic alkalosis", co2 === "high" ? "partially compensated" : "uncompensated");
  return { invalid: "alkaline pH but PaCO2 and HCO3 do not explain it" };
}

/* ---------- laboratory values (adult, SI units; ranges differ a little between laboratories) ---------- */
const LAB_RANGES = {
  sodium: [135, 145, "mmol/L"], potassium: [3.5, 5.0, "mmol/L"], chloride: [98, 107, "mmol/L"], bicarbonate: [22, 26, "mmol/L"],
  calcium: [2.15, 2.60, "mmol/L"], magnesium: [0.70, 1.00, "mmol/L"], lactate: [0.5, 2.0, "mmol/L"],
  glucose: [3.9, 5.6, "mmol/L"], urea: [2.5, 7.1, "mmol/L"], creatinine: [45, 110, "µmol/L"],
  platelets: [150, 400, "× 10⁹/L"], wbc: [4.0, 11.0, "× 10⁹/L"], hemoglobin: [120, 175, "g/L"]
};
function labFlag(name, value) {
  const r = LAB_RANGES[name];
  if (!r) return { invalid: `unknown lab "${name}"` };
  const [lo, hi] = r, width = hi - lo;
  if (Math.min(Math.abs(value - lo), Math.abs(value - hi)) < 0.03 * width) return { invalid: `${name} ${value} is too close to its limit (${lo} to ${hi}) to be an unambiguous example` };
  return { flag: value < lo ? "low" : value > hi ? "high" : "normal", unit: r[2] };
}

/* ---------- ECG rhythms ---------- */
const RHYTHM_NAME = {
  "nsr": "normal sinus rhythm", "sinus-tach": "sinus tachycardia", "sinus-brady": "sinus bradycardia", "afib": "atrial fibrillation",
  "pvc": "premature ventricular", "vtach": "ventricular tachycardia", "vfib": "ventricular fibrillation", "asystole": "asystole"
};
// What the answer must say, for a rhythm in a given situation (the question states the situation in the item text).
const RHYTHM_ACTION = {
  "vtach:pulseless": /defibrillat/i, "vfib:pulseless": /defibrillat/i, "asystole:pulseless": /epinephrine/i,
  "sinus-brady:symptomatic": /atropine|pacing/i, "afib:stable": /rate control/i
};

module.exports = { abgInterpret, LAB_RANGES, labFlag, RHYTHM_NAME, RHYTHM_ACTION };
