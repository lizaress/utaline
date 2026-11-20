/**
 * Cyrillic Romanizer (transliteration to Latin).
 * Supports Russian, Ukrainian, Belarusian, and Bulgarian characters.
 *
 * utaline: context-aware rules for Russian (simplified BGN/PCGN, no diacritics so lyrics
 * stay easy to sing along):
 *   - е → "ye" at the start of a word, after a vowel, or after ь/ъ (ель → yel', поехал → poyekhal);
 *     otherwise "e" (нет → net).
 *   - ё → "yo" (ёлка → yolka, пьёт → pyot), but "o" after ж/ч/ш/щ (жёлтый → zholtyy).
 *   - ь / ъ are dropped.
 *   - ALL-CAPS words stay all caps (ЕЛЬ → YEL).
 * Ukrainian (detected by і/ї/є/ґ) uses г → h, и → y, е → e.
 * Context also works across karaoke syllables: the previous syllable's last letter is used.
 */

const BASE_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'і': 'i', 'ї': 'yi', 'є': 'ye', 'ґ': 'g', 'ў': 'u'
};

const UKRAINIAN_OVERRIDES = { 'г': 'h', 'и': 'y', 'е': 'e' };

const VOWELS = new Set(['а', 'е', 'ё', 'и', 'о', 'у', 'ы', 'э', 'ю', 'я', 'і', 'ї', 'є']);
const SIGNS = new Set(['ь', 'ъ']);
const HUSHING = new Set(['ж', 'ч', 'ш', 'щ']);
const UKRAINIAN_HINT = /[іїєґІЇЄҐ]/u;
const CYRILLIC_LETTER = /\p{Script=Cyrillic}/u;

function detectLang(text) {
  return UKRAINIAN_HINT.test(text || '') ? 'uk' : 'ru';
}

function isUpper(ch) {
  return !!ch && ch !== ch.toLowerCase() && ch === ch.toUpperCase();
}

function applyCase(latin, original, prevChar, nextChar) {
  if (!latin || !isUpper(original)) return latin;
  // Whole word in caps → keep caps ("ШУМ" → "SHUM"); otherwise capitalize ("Шум" → "Shum").
  const shouting = isUpper(nextChar) || (isUpper(prevChar) && !CYRILLIC_LETTER.test(nextChar || '') );
  return shouting ? latin.toUpperCase() : latin[0].toUpperCase() + latin.slice(1);
}

function romanizeChar(ch, prevChar, nextChar, lang) {
  const lower = ch.toLowerCase();
  if (BASE_MAP[lower] === undefined) return ch;

  const prevLower = (prevChar || '').toLowerCase();
  const atWordStart = !prevChar || !CYRILLIC_LETTER.test(prevChar);
  let latin;

  if (lang === 'uk' && UKRAINIAN_OVERRIDES[lower] !== undefined) {
    latin = UKRAINIAN_OVERRIDES[lower];
  } else if (lower === 'е') {
    latin = (atWordStart || VOWELS.has(prevLower) || SIGNS.has(prevLower)) ? 'ye' : 'e';
  } else if (lower === 'ё') {
    latin = HUSHING.has(prevLower) ? 'o' : 'yo';
  } else {
    latin = BASE_MAP[lower];
  }

  return applyCase(latin, ch, prevChar, nextChar);
}

export class CyrillicRomanizer {
  /**
   * @param {string} text
   * @param {Object} [options]
   * @param {string} [options.prevChar] - Last character before `text` (for syllable chunks).
   * @param {string} [options.nextChar] - First character after `text`.
   * @param {'ru'|'uk'} [options.lang] - Defaults to auto-detect from `text`.
   */
  static romanize(text, options = {}) {
    if (!text) return '';
    const lang = options.lang || detectLang(text);
    const chars = Array.from(text);
    let result = '';
    for (let i = 0; i < chars.length; i++) {
      const prev = i > 0 ? chars[i - 1] : (options.prevChar || '');
      const next = i < chars.length - 1 ? chars[i + 1] : (options.nextChar || '');
      result += romanizeChar(chars[i], prev, next, lang);
    }
    return result;
  }

  /**
   * Romanizes karaoke syllables of one line, keeping one output chunk per syllable and
   * using neighbouring syllables as context.
   * @param {Array<{text: string}>} syllables
   * @param {string} [lineContext]
   * @returns {Array<{text: string}>}
   */
  static romanizeSyllables(syllables, lineContext = '') {
    if (!Array.isArray(syllables)) return [];
    const texts = syllables.map((s) => (s && s.text) || '');
    const lang = detectLang(lineContext || texts.join(''));
    return texts.map((text, i) => {
      const before = texts.slice(0, i).join('');
      const after = texts.slice(i + 1).join('');
      return {
        text: this.romanize(text, {
          lang,
          prevChar: before ? Array.from(before).pop() : '',
          nextChar: after ? Array.from(after)[0] : '',
        }),
      };
    });
  }
}
