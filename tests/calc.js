// Shared by tests/check-data.js (and by the tool used to author questions): verifies dosage calculations.
// A numeric question stores its formula, inputs and ordered steps. This file recomputes them, so a wrong key
// or a wrong "working" line is caught by the tests. The app never evaluates expressions; it only shows the stored text.

// Only numbers, + - * / ( ) and names that exist in the calculation's own scope are allowed.
// No "." outside a number, no function calls, no other identifiers (so nothing like process.exit() can run).
function checkExpr(expr, scope) {
  if (typeof expr !== "string" || !/^[A-Za-z0-9_\s+\-*/().]*$/.test(expr)) throw new Error(`expression has characters that are not allowed: ${expr}`);
  const noNumbers = expr.replace(/\d+(\.\d+)?/g, "0");
  if (noNumbers.includes(".")) throw new Error(`"." is only allowed inside a number: ${expr}`);
  if (/[A-Za-z_]\w*\s*\(/.test(noNumbers)) throw new Error(`function calls are not allowed: ${expr}`);
  for (const n of noNumbers.match(/[A-Za-z_]\w*/g) || []) if (!Object.prototype.hasOwnProperty.call(scope, n)) throw new Error(`unknown name "${n}" in ${expr}`);
}

function evalExpr(expr, scope) {
  checkExpr(expr, scope);
  const names = Object.keys(scope);
  return Function(...names, `"use strict"; return (${expr});`)(...names.map(n => scope[n]));
}

const fmtNum = v => String(Number(Number(v).toFixed(4)));

// Round to `decimals` places (half up). Used for the key and, in js/qtypes.js, for the student's typed answer.
const roundTo = (x, decimals) => Number(Math.round(Number(x + "e" + decimals)) + "e-" + decimals);

// Readable working: "weightLb / 2.2" with weightLb = 33 becomes "33 ÷ 2.2 = 15".
function showOf(expr, scope, value) {
  const sub = expr.replace(/[A-Za-z_]\w*/g, n => { if (!(n in scope)) throw new Error(`unknown name "${n}" in ${expr}`); return fmtNum(scope[n]); });
  return sub.replace(/\*/g, "×").replace(/\//g, "÷").replace(/\s+/g, " ").trim() + " = " + fmtNum(value);
}

/* Runs a calc block: {formula, inputs, steps:[{name,label,expr}], result}. Returns {scope, steps:[{name,label,expr,value,show}], exact}. */
function runCalc(calc) {
  const scope = { ...calc.inputs }, steps = [];
  for (const s of calc.steps) {
    const value = evalExpr(s.expr, scope);
    if (!Number.isFinite(value)) throw new Error(`step "${s.name}" is not a finite number`);
    steps.push({ name: s.name, label: s.label, expr: s.expr, value, show: showOf(s.expr, scope, value) });
    scope[s.name] = value;
  }
  if (!(calc.result in scope)) throw new Error(`result "${calc.result}" is not a step`);
  return { scope, steps, exact: scope[calc.result] };
}

// The exact value must not sit on a rounding boundary (e.g. 2.5 when rounding to whole numbers).
const onBoundary = (exact, decimals) => { const x = exact * 10 ** decimals; return Math.abs((x - Math.floor(x)) - 0.5) < 1e-6; };

module.exports = { evalExpr, fmtNum, roundTo, showOf, runCalc, onBoundary };
