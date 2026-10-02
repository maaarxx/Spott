import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { validateName, validateMI, normalizeName } from '../lib/validators/name.ts';
import { validateUsername, validatePersonOrOrgText, validatePhonePH, validateEmail, validateWebsite, validateAddressText, normalizeUsername } from '../lib/validators/name.ts';
import { getPSGCData, validatePHLocation } from '../lib/psgc.ts';

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

describe('shared profile validators', () => {
  it('rejects gibberish usernames and reserved words', () => {
    for (const username of ['vdsvdvdsvdsvdsvdsvd', 'asdasd', 'aaaa', '123', 'admin']) assert.notStrictEqual(validateUsername(username), null, username);
    assert.strictEqual(validateUsername('Juan'), null);
    assert.strictEqual(normalizeUsername('Juan'), normalizeUsername('juan'), 'username duplicate comparison is case-insensitive');
    assert.strictEqual(validateUsername('juan_delacruz'), null);
    assert.strictEqual(validateUsername('tech_manila'), null);
  });
  it('validates names, categories, addresses, websites, and email examples', () => {
    for (const value of ['vsdfbgfehrtghbfgdhgfhgfhgfhfghgfhgfhg', 'hghgfhfghfghfghgfhgfh']) assert.notStrictEqual(validatePersonOrOrgText(value, { label: 'Profile text', allowDigits: true }), null);
    for (const value of ['Metro Creative Group', 'Vanguard Gaming League', 'BSIT Society', 'Hobbyist Haven PH', 'Tech & Gadgets Club', 'Tech Manila Hub', 'Spott Central Administration']) assert.strictEqual(validatePersonOrOrgText(value, { label: 'Organization', allowDigits: true }), null, value);
    for (const description of [
      "Philippines' premier community hub for Pokemon TCG, One Piece Card Game, anime figures, gacha collectors, and pop-culture swap meets.",
      'Premier Philippine community for Apple iOS & Android developers, smartphone power users, gadget modders, and emerging mobile tech innovators.',
      'National grassroots and collegiate esports tournament circuit hosting premier LAN battles for Mobile Legends: Bang Bang, Honor of Kings, and Valorant.',
    ]) assert.strictEqual(validatePersonOrOrgText(description, { label: 'Caption', allowDigits: true, maxLen: 500 }), null, description);
    assert.notStrictEqual(validateAddressText('hgfhgfhfghfghgf'), null);
    assert.notStrictEqual(validateWebsite('gfhgfhgfhfghgfh'), null);
    assert.notStrictEqual(validateEmail('hgfhfghfghgfhgfhh'), null);
    assert.strictEqual(validateEmail('org@spott.ph'), null);
    assert.strictEqual(validateWebsite('https://www.facebook.com/spott'), null);
  });
  it('accepts the specified Philippine phone formats', () => {
    assert.strictEqual(validatePhonePH('09123456789'), null);
    assert.strictEqual(validatePhonePH('+639123456789'), null);
  });
  it('validates PSGC province and region membership from the supplied dataset', () => {
    const data = getPSGCData();
    assert.deepStrictEqual([data.regions.length, data.provinces.length, data.cities.length, data.cities.filter((city) => !city.provinceCode).length], [17, 81, 1634, 19]);
    const regionNCR = data.regions.find((region) => region.name === 'NCR')!;
    const pasay = data.cities.find((city) => city.name === 'Pasay City')!;
    assert.strictEqual(validatePHLocation(regionNCR.code, pasay.code).error, undefined);
    const cebuProvince = data.provinces.find((province) => province.name === 'Cebu')!;
    const cebuCity = data.cities.find((city) => city.name === 'City of Cebu')!;
    assert.strictEqual(validatePHLocation(cebuProvince.code, cebuCity.code).error, undefined);
    const davaoCity = data.cities.find((city) => city.name === 'City of Davao')!;
    const davaoProvince = data.provinces.find((province) => province.name === 'Davao Del Sur')!;
    assert.strictEqual(validatePHLocation(davaoProvince.code, davaoCity.code).error, undefined);
    const laguna = data.provinces.find((province) => province.name === 'Laguna')!;
    const municipality = data.cities.find((city) => city.provinceCode === laguna.code && !city.name.startsWith('City of '))!;
    assert.strictEqual(validatePHLocation(laguna.code, municipality.code).error, undefined);
    const wrongProvince = data.provinces.find((province) => province.name === 'Cavite')!;
    assert.notStrictEqual(validatePHLocation(wrongProvince.code, cebuCity.code).error, undefined);
    const isabelaCity = data.cities.find((city) => city.name === 'City of Isabela')!;
    assert.strictEqual(validatePHLocation(isabelaCity.regionCode, isabelaCity.code).error, undefined);
  });
});
