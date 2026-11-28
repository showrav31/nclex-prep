/* Synthetic ECG rhythm strips for rhythm-recognition questions (drawn as SVG, no images needed).
   A question uses it as  exhibit.ecg = {rhythm, rate}  or  rows[i].ecg / items[i].ecg.
   Rhythms: nsr, sinus-tach, sinus-brady, afib, pvc, vtach, vfib, asystole.
   The model is deterministic (same strip every time) and tested for the key features of each rhythm
   (regularity, rate, P waves, QRS width). These are teaching drawings, not real patient recordings. */

const ECG_RHYTHMS = ["nsr", "sinus-tach", "sinus-brady", "afib", "pvc", "vtach", "vfib", "asystole"];
const ECG_FS = 200; // samples per second

function ecgRand(seed) { // small deterministic random numbers
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/* Returns {rhythm, rate, seconds, fs, v (millivolts), beats (R-peak times), ectopic (flags), qrs (QRS width in seconds)} */
function ecgModel(rhythm, rate, seconds = 6, seed = 7) {
  const n = Math.round(seconds * ECG_FS), v = new Array(n).fill(0), rnd = ecgRand(seed);
  const g = (t, mu, sd, amp) => amp * Math.exp(-((t - mu) * (t - mu)) / (2 * sd * sd));
  const rr = 60 / rate, beats = [], ectopic = [];
  let qrs = 0.09;

  if (rhythm === "nsr" || rhythm === "sinus-tach" || rhythm === "sinus-brady") {
    for (let t = 0.3 + rnd() * 0.2; t < seconds + 1; t += rr) { beats.push(t); ectopic.push(false); }
  } else if (rhythm === "pvc") {
    let t = 0.4 + rnd() * 0.2, k = 0;
    while (t < seconds + 1) {
      if (k === 3 || k === 7) { beats.push(t + 0.6 * rr); ectopic.push(true); t += 2 * rr; } // premature beat, then a pause
      else { beats.push(t); ectopic.push(false); t += rr; }
      k++;
    }
  } else if (rhythm === "afib") {
    for (let t = 0.25; t < seconds + 1; ) { beats.push(t); ectopic.push(false); t += Math.max(0.28, rr * (0.45 + 1.1 * rnd())); } // irregularly irregular
  } else if (rhythm === "vtach") {
    qrs = 0.16;
    for (let t = 0.2 + rnd() * 0.1; t < seconds + 1; t += rr) { beats.push(t); ectopic.push(true); }
  }

  const tOff = 0.30 * Math.sqrt(Math.min(rr, 1));
  const comp = [[1.1, 3.1, 4.9], [0.9, 2.6, 5.7], [1.0, 3.9, 6.3]].map(a => ({ f: a[1] + rnd(), p: rnd() * 6.28, a: 0.05 + rnd() * 0.03 })); // fibrillatory baseline
  const vf = [0, 1, 2, 3, 4].map(() => ({ f: 2.5 + rnd() * 4, p: rnd() * 6.28, a: 0.12 + rnd() * 0.12, m: 0.2 + rnd() * 0.4, mp: rnd() * 6.28 }));
  const ph = rnd() * 6.28;

  for (let i = 0; i < n; i++) {
    const t = i / ECG_FS;
    let y = 0.02 * Math.sin(2 * Math.PI * 0.33 * t + ph) + 0.004 * (rnd() - 0.5);
    if (rhythm === "vfib") {
      vf.forEach(c => { y += c.a * (1 + 0.6 * Math.sin(2 * Math.PI * c.m * t + c.mp)) * Math.sin(2 * Math.PI * c.f * t + c.p); });
    } else if (rhythm === "asystole") {
      y *= 0.6;
    } else if (rhythm === "vtach") {
      beats.forEach(b => { if (Math.abs(t - b) < 0.5) y += g(t, b, 0.055, 0.9) + g(t, b + rr / 2, 0.055, -0.85); });
    } else {
      if (rhythm === "afib") comp.forEach(c => { y += c.a * Math.sin(2 * Math.PI * c.f * t + c.p); });
      beats.forEach((b, k) => {
        if (Math.abs(t - b) > 0.7) return;
        if (ectopic[k]) { y += g(t, b, 0.035, 1.25) + g(t, b + 0.07, 0.04, -0.35) + g(t, b + 0.26, 0.07, -0.45); qrs = Math.max(qrs, 0.14); }
        else {
          if (rhythm !== "afib") y += g(t, b - 0.16, 0.025, 0.13);          // P wave
          y += g(t, b - 0.04, 0.010, -0.12) + g(t, b, 0.012, 1.0) + g(t, b + 0.04, 0.012, -0.25); // Q R S
          y += g(t, b + tOff, 0.045, 0.28);                                 // T wave
        }
      });
    }
    v[i] = y;
  }
  const inside = beats.map((b, k) => [b, ectopic[k]]).filter(x => x[0] >= 0 && x[0] <= seconds);
  return { rhythm, rate, seconds, fs: ECG_FS, v, beats: inside.map(x => x[0]), ectopic: inside.map(x => x[1]), qrs };
}

/* Rate (from the R-R intervals) and how irregular the rhythm is (coefficient of variation of R-R). */
function ecgStats(m) {
  const rr = m.beats.slice(1).map((b, i) => b - m.beats[i]);
  if (!rr.length) return { rate: 0, cv: 0, rr };
  const mean = rr.reduce((a, b) => a + b, 0) / rr.length, sd = Math.sqrt(rr.reduce((a, b) => a + (b - mean) ** 2, 0) / rr.length);
  return { rate: 60 / mean, cv: sd / mean, rr };
}

/* The strip as an SVG: ECG grid (small box 0.04 s, big box 0.2 s) and the trace. Colours come from the theme tokens. */
function ecgSvg(spec) {
  const m = ecgModel(spec.rhythm, spec.rate, spec.seconds || 6, spec.seed || 7), W = 600, H = 190, base = 112, sc = 66, ux = W / m.seconds;
  const clamp = y => Math.max(3, Math.min(H - 3, y));
  const d = m.v.map((val, i) => `${i ? "L" : "M"}${(i / ECG_FS * ux).toFixed(1)} ${clamp(base - val * sc).toFixed(1)}`).join("");
  const small = [], big = [];
  for (let k = 0; k * ux * 0.04 <= W; k++) { const x = (k * ux * 0.04).toFixed(1); (k % 5 ? small : big).push(`M${x} 0V${H}`); }
  for (let k = 0; k * ux * 0.04 <= H; k++) { const y = (k * ux * 0.04).toFixed(1); (k % 5 ? small : big).push(`M0 ${y}H${W}`); }
  return `<svg class="ecg" viewBox="0 0 ${W} ${H}" role="img" aria-label="ECG rhythm strip, ${m.seconds} seconds" preserveAspectRatio="xMidYMid meet"><path class="gs" d="${small.join("")}"/><path class="gb" d="${big.join("")}"/><path class="tr" d="${d}"/></svg>`;
}
