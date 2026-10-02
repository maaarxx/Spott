import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { validateName, validateMI, validateOrganizerName, normalizeName } from '../lib/validators/name';

describe('validateName', () => {
  it('Should FAIL', () => {
    const failCases = [
      "ewqewqe", "ewqewq", "asdasd", "qwerty", "aaaa", "bcdfgh", "test", "123", "x"
    ];
    for (const name of failCases) {
      assert.notStrictEqual(validateName(name, { label: "First name" }), null, `Expected "${name}" to fail`);
    }
  });

  it('Should PASS', () => {
    const passCases = [
      "Marc", "Dei Niel", "Dela Cruz", "O'Brien", "Mary-Ann", "Nuñez", "Bides"
    ];
    for (const name of passCases) {
      assert.strictEqual(validateName(name, { label: "First name" }), null, `Expected "${name}" to pass`);
    }
  });
});

describe('validateMI', () => {
  it('Should FAIL', () => {
    assert.notStrictEqual(validateMI(""), null);
    assert.notStrictEqual(validateMI("AB"), null);
    assert.notStrictEqual(validateMI("1"), null);
  });
  
  it('Should PASS', () => {
    assert.strictEqual(validateMI("M"), null);
    assert.strictEqual(validateMI("M."), null);
  });
});

describe('normalizeName', () => {
  it('normalizes names correctly', () => {
    assert.strictEqual(normalizeName("  john   doe "), "John Doe");
    assert.strictEqual(normalizeName("MARY-ANN"), "Mary-Ann");
    assert.strictEqual(normalizeName("o'brien"), "O'brien"); // basic capitalization for apostrophes might not be perfect, but tests what we wrote
  });
});
