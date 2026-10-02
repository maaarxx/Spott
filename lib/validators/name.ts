const BLOCKLIST = new Set([
  "test", "sample", "name", "firstname", "lastname", "asdf", "asdasd",
  "qwerty", "lorem", "ipsum", "xxx", "abc", "sdfsdf", "ewqewq"
]);

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const USERNAME_RESERVED = new Set(["admin", "administrator", "support", "spott", "root", "null", "undefined", "moderator"]);

function hasKeyboardMashing(str: string): boolean {
  const lower = str.toLowerCase();
  for (let i = 0; i <= lower.length - 4; i++) {
    const chunk = lower.substring(i, i + 4);
    const revChunk = chunk.split('').reverse().join('');
    
    for (const row of KEYBOARD_ROWS) {
      if (row.includes(chunk) || row.includes(revChunk)) {
        return true;
      }
    }
  }
  const compact = lower.replace(/[^a-z]/g, "");
  for (let i = 0; i <= compact.length - 3; i++) {
    const chunk = compact.slice(i, i + 3);
    const reversed = chunk.split("").reverse().join("");
    if (KEYBOARD_ROWS.some((row) => row.includes(chunk) || row.includes(reversed))) {
      if (compact === chunk || compact.indexOf(chunk, i + 1) >= 0 || compact.indexOf(reversed, i + 1) >= 0) return true;
    }
  }
  return false;
}

function hasRepeatedChunk(value: string, minimumRepeats = 3): boolean {
  const text = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (let size = 2; size <= 4; size++) {
    for (let start = 0; start + size * minimumRepeats <= text.length; start++) {
      const chunk = text.slice(start, start + size);
      let count = 1;
      while (text.slice(start + count * size, start + (count + 1) * size) === chunk) count++;
      if (count >= minimumRepeats) return true;
    }
  }
  return false;
}

export function isGibberishText(value: string): boolean {
  if (/^\d+$/.test(value.trim())) return true;
  const words = value.toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  if (/(.)\1{2,}/iu.test(value) || hasRepeatedChunk(value, 3)) return true;
  for (const word of words) {
    const letters = word.replace(/[^\p{L}]/gu, "");
    if (letters.length < 5) continue;
    const vowels = (letters.match(/[aeiouy]/giu) || []).length;
    if (vowels === 0 || (letters.length >= 8 && vowels / letters.length < 0.18)) return true;
    if (/[bcdfghjklmnpqrstvwxz]{5,}/iu.test(letters)) return true;
    if (hasKeyboardMashing(letters)) return true;
  }
  const compact = value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const unique = new Set(compact).size;
  return (compact.length >= 8 && unique <= 3) || (compact.length >= 12 && unique <= 4);
}

const USERNAME_BLOCKLIST = new Set(["test", "asdf", "asdasd", "qwerty", "lorem", "ipsum", "sample", "username", "abc", "ewqewq", "sdfsdf"]);
export function validateUsername(value: string): string | null {
  const username = value.trim();
  if (username.length < 4 || username.length > 20) return "Username must be 4–20 characters.";
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(username)) return "Username must start with a letter and contain only letters, numbers, and underscores.";
  const normalized = username.toLowerCase();
  if (USERNAME_RESERVED.has(normalized)) return "That username is reserved.";
  const letters = normalized.replace(/[^a-z]/g, "");
  const vowels = (letters.match(/[aeiouy]/g) || []).length;
  if (USERNAME_BLOCKLIST.has(normalized) || !vowels || (letters.length >= 8 && vowels / letters.length < 0.18) || isGibberishText(username)) return "Username appears to be gibberish or spam.";
  return null;
}

export function validatePersonOrOrgText(value: string, options: { label: string; allowDigits?: boolean; allowPunctuation?: boolean; minLen?: number; maxLen?: number }): string | null {
  const text = value.trim().replace(/\s+/g, " ");
  const { label, allowDigits = false, allowPunctuation = true, minLen = 2, maxLen = 5000 } = options;
  if (text.length < minLen) return `${label} must be at least ${minLen} characters.`;
  if (text.length > maxLen) return `${label} must be ${maxLen} characters or fewer.`;
  if (/^\d+$/.test(text)) return `${label} cannot be numbers only.`;
  if (!/\p{L}/u.test(text)) return `${label} must contain letters.`;
  const allowed = allowDigits ? "\\d" : "";
  const punctuation = allowPunctuation ? "\\p{P}\\p{S}" : "";
  if (!new RegExp(`^[\\p{L}\\p{M}\\s${allowed}${punctuation}]+$`, "u").test(text)) return `${label} contains invalid characters.`;
  const words = text.split(/\s+/);
  if (words.length > 1 && new Set(words.map((word) => word.toLowerCase())).size <= Math.max(1, Math.floor(words.length / 3))) return `${label} contains repeated-word spam.`;
  if (isGibberishText(text)) {
    const onlyAcronyms = words.every((word) => /^[A-Z]{2,6}$/.test(word));
    if (!onlyAcronyms) return `${label} appears to be gibberish.`;
  }
  if (/(?:https?:\/\/|www\.)\S+/gi.test(text) && [...text.matchAll(/(?:https?:\/\/|www\.)\S+/gi)].length >= 3) return `${label} cannot contain three or more URLs.`;
  return null;
}

export function normalizeProfileText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function validatePhonePH(value: string): string | null {
  const normalized = value.trim().replace(/[\s()-]/g, "");
  if (!/^(?:09\d{9}|\+639\d{9})$/.test(normalized)) return "Enter a Philippine mobile number as 09XXXXXXXXX or +639XXXXXXXXX.";
  return null;
}

export function validateAddressText(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  if (text.length > 500) return "Address must be 500 characters or fewer.";
  if (isGibberishText(text)) return "Please enter a valid, real address (gibberish/spam detected).";
  return null;
}
export const validateAddress = validateAddressText;

export function normalizeUsername(value: string): string { return value.trim().toLowerCase(); }

export function validateEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || isGibberishText(email.split("@")[0])) return "Enter a valid email address.";
  return null;
}

export function normalizeWebsite(value: string): string {
  const trimmed = value.trim();
  return trimmed && !/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? `https://${trimmed}` : trimmed;
}

export function validateWebsite(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  if (raw.length > 500) return "Website or social link must be 500 characters or fewer.";
  const normalized = normalizeWebsite(raw);
  try {
    const url = new URL(normalized);
    const host = url.hostname;
    if (!["http:", "https:"].includes(url.protocol) || !host.includes(".") || !/[a-z]{2,}$/i.test(host.split(".").at(-1) || "") || isGibberishText(host.replace(/^www\./i, "").replace(/\./g, ""))) return "Enter a valid http(s) website URL with a real hostname.";
    return null;
  } catch { return "Enter a valid http(s) website URL with a real hostname."; }
}

export function validateName(value: string, { label }: { label: string }): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  
  if (normalized.length < 2) {
    return `${label} must be at least 2 characters.`;
  }
  
  if (!/^[\p{L}\p{M} '.\-]+$/u.test(normalized)) {
    return `${label} contains invalid characters. Use letters, spaces, apostrophes, hyphens, or periods only.`;
  }
  
  const lower = normalized.toLowerCase();
  
  if (BLOCKLIST.has(lower.replace(/[\s'.\-]/g, ''))) {
    return `Please enter a valid ${label}.`;
  }
  
  if (!/[aeiouy]/i.test(lower)) {
    return `${label} must contain at least one vowel.`;
  }
  
  if (/(.)\1{2,}/i.test(lower)) {
    return `${label} contains too many repeating characters.`;
  }
  
  if (/[bcdfghjklmnpqrstvwxz]{5,}/i.test(lower.replace(/[\s'.\-]/g, ''))) {
    return `${label} contains too many consecutive consonants.`;
  }
  
  // Repeating patterns (e.g. abcabc, ewqewq)
  if (/^(.{2,})\1+$/i.test(lower.replace(/[\s'.\-]/g, ''))) {
    return `${label} appears to be a repeating pattern.`;
  }
  
  if (hasKeyboardMashing(lower.replace(/[\s'.\-]/g, ''))) {
    return `${label} appears to be gibberish.`;
  }
  
  const onlyAlpha = lower.replace(/[\s'.\-]/g, '');
  const uniqueChars = new Set(onlyAlpha).size;
  if (onlyAlpha.length >= 8 && uniqueChars <= 3) {
    return `${label} appears to be gibberish (too few unique characters).`;
  }
  if (onlyAlpha.length >= 12 && uniqueChars <= 4) {
    return `${label} appears to be gibberish (too few unique characters).`;
  }
  
  return null;
}

export function validateMI(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return "Middle initial is required.";
  if (!/^[A-Za-z]\.?$/.test(normalized)) {
    return "Middle initial must be exactly one letter, optionally followed by a period.";
  }
  return null;
}

export function validateOrganizerName(value: string): string | null {
  const normalized = value.trim().replace(/\s+/g, ' ');
  
  if (!/^[\p{L}\p{M}\d '&.,\-]+$/u.test(normalized)) {
    return "Organizer name contains invalid characters. Use letters, numbers, spaces, &, commas, periods, apostrophes, or hyphens.";
  }
  
  const lower = normalized.toLowerCase();
  
  if (/(.)\1{3,}/i.test(lower)) {
    return "Organizer name contains too many repeating characters.";
  }
  
  if (/^(.{3,})\1{2,}$/i.test(lower.replace(/[\s'.\-&,]/g, ''))) {
    return "Organizer name appears to be a repeating pattern.";
  }
  
  if (hasKeyboardMashing(lower.replace(/[\s'.\-&,]/g, ''))) {
    return "Organizer name appears to be gibberish.";
  }
  
  return null;
}

export function validateEventTitle(value: string): string | null {
  if (!value || value.trim().length === 0) {
    return "Event title is required and cannot be just spaces.";
  }

  const normalized = value.trim().replace(/\s+/g, ' ');
  
  if (normalized.length < 10) {
    return "Event title must contain at least 10 characters (excluding extra spaces).";
  }
  
  if (normalized.length > 100) {
    return "Event title cannot exceed 100 characters.";
  }

  const lower = normalized.toLowerCase();
  
  if (BLOCKLIST.has(lower.replace(/[\s'.\-&,]/g, ''))) {
    return "Please enter a valid event title.";
  }
  
  if (/(.)\1{4,}/i.test(lower)) {
    return "Event title contains too many repeating characters.";
  }
  
  if (/^(.{3,})\1{2,}$/i.test(lower.replace(/[\s'.\-&,]/g, ''))) {
    return "Event title appears to be a repeating pattern.";
  }
  
  if (hasKeyboardMashing(lower.replace(/[\s'.\-&,]/g, ''))) {
    return "Event title appears to be gibberish.";
  }
  
  return null;
}

export function normalizeName(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => {
      const parts = word.split('-');
      return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-');
    })
    .join(' ');
}
