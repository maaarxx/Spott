const BLOCKLIST = new Set([
  "test", "sample", "name", "firstname", "lastname", "asdf", "asdasd",
  "qwerty", "lorem", "ipsum", "xxx", "abc", "sdfsdf", "ewqewq"
]);

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function hasKeyboardMashing(str: string): boolean {
  const lower = str.toLowerCase();
  for (let i = 0; i <= lower.length - 3; i++) {
    const chunk = lower.substring(i, i + 3);
    const revChunk = chunk.split('').reverse().join('');
    
    for (const row of KEYBOARD_ROWS) {
      if (row.includes(chunk) || row.includes(revChunk)) {
        return true;
      }
    }
  }
  return false;
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
  const normalized = value.trim().replace(/\s+/g, ' ');
  
  if (normalized.length < 10) {
    return "Event title must be between 10 to 100 characters.";
  }
  
  if (normalized.length > 100) {
    return "Event title must be between 10 to 100 characters.";
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
