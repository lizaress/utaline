// utils/titleCleaner.js
// ytlyric: user-uploaded YouTube videos often have titles like
//   "Closing Time (LYRICS) - Semisonic 🎧🎧🎧"  by channel "n3oMusic"
// so searching with that title + the channel name finds nothing. This builds cleaner
// title/artist variants to retry the search (ported and extended from the WPF prototype).

const JUNK_WORDS = [
  'official', 'video', 'music\\s*video', 'audio', 'lyrics?', 'lyric\\s*video', 'letra', 'letras',
  'con\\s*letra', 'sub(?:titulado|title[sd]?)?(?:\\s*(?:español|espanol|english|eng|esp))?',
  'traducida', 'traducción', 'traduccion', 'español', 'espanol', 'english', 'romaji', 'karaoke',
  'remaster(?:ed)?', 'visualizer', 'clip', 'hd', 'hq', '4k', '1080p', '720p', 'mv', 'pv', 'm/v',
  'full\\s*(?:version|album)?', 'video\\s*oficial', 'audio\\s*oficial', 'official\\s*(?:music\\s*)?video',
  'official\\s*audio', 'official\\s*lyric\\s*video', 'live', 'en\\s*vivo', 'explicit', 'clean',
  'sped\\s*up', 'slowed(?:\\s*\\+?\\s*reverb)?', 'nightcore', 'amv', 'tiktok(?:\\s*version)?'
];

// "(...)" / "[...]" / "（...）" containing any junk word.
const JUNK_BRACKETS = new RegExp(
  `\\s*[\\(\\[（【〖〔]([^\\)\\]）】〗〕]*\\b(?:${JUNK_WORDS.join('|')})\\b[^\\)\\]）】〗〕]*)[\\)\\]）】〗〕]`,
  'giu'
);
const BARE_JUNK_SUFFIX = new RegExp(`\\s*[-–—|]?\\s*\\b(?:${JUNK_WORDS.join('|')})\\b\\s*$`, 'iu');
const CHANNEL_HINT = /(?:music|vevo|\s-\s*topic$|lyrics?|records?|official|channel|\btv\b|entertainment|songs|tracks|sounds)/iu;
const FEAT = /\s*[\(\[]?\s*(?:ft\.?|feat\.?|featuring)\s+[^\)\]]+[\)\]]?\s*$/iu;

function stripDecorations(text) {
  return (text || '')
    .replace(/[\p{Extended_Pictographic}☀-➿️‍♪♫♬♩]/gu, ' ')
    .replace(/【[^】]*】|〖[^〗]*〗|〔[^〕]*〕/gu, ' ')
    .replace(JUNK_BRACKETS, ' ')
    .replace(/[「」『』《》〈〉"“”]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPart(text) {
  let t = stripDecorations(text);
  // Repeat: "Song - Lyrics" / "Song | Letra"
  for (let i = 0; i < 3; i++) {
    const next = t.replace(BARE_JUNK_SUFFIX, '').trim();
    if (next === t) break;
    t = next;
  }
  t = t.replace(FEAT, '').trim();
  return t.replace(/^[\s\-–—|:]+|[\s\-–—|:]+$/g, '').trim();
}

function cleanChannel(artist) {
  return (artist || '').replace(/\s*-\s*topic$/i, '').replace(/vevo$/i, '').trim();
}

/**
 * @param {{title: string, artist: string}} songInfo
 * @returns {Array<{title: string, artist: string}>} variants different from the original, best first.
 */
export function buildSearchVariants(songInfo) {
  const rawTitle = songInfo?.title || '';
  const rawArtist = songInfo?.artist || '';
  // Japanese style: 【MV】YOASOBI「アイドル」 → title inside the corner brackets, artist before them.
  const corner = rawTitle.match(/^(.*?)[「『]([^」』]+)[」』]/u);
  const title = stripDecorations(rawTitle);
  const channel = cleanChannel(rawArtist);
  const channelLooksFake = !channel || CHANNEL_HINT.test(rawArtist);

  const variants = [];
  const add = (t, a) => {
    t = cleanPart(t);
    a = cleanPart(a);
    if (!t) return;
    const key = `${t.toLowerCase()}|${a.toLowerCase()}`;
    if (variants.some(v => `${v.title.toLowerCase()}|${v.artist.toLowerCase()}` === key)) return;
    if (t === rawTitle && a === rawArtist) return;
    variants.push({ title: t, artist: a });
  };

  if (corner) {
    const before = cleanPart(corner[1]);
    add(corner[2], before || (channelLooksFake ? '' : channel));
    if (before && !channelLooksFake) add(corner[2], channel);
  }

  // "A - B" (also –, —, |): YouTube convention is "Artist - Title", but "Title - Artist" is common too.
  const parts = title.split(/\s+[-–—|]\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const [a, b] = [parts[0], parts.slice(1).join(' ')];
    const aMatchesChannel = channel && a.toLowerCase().includes(channel.toLowerCase());
    const bMatchesChannel = channel && b.toLowerCase().includes(channel.toLowerCase());
    // "(Lyrics)", "(Official Video)"... are attached to the song title, so that side is the title.
    const rawParts = (rawTitle || '').replace(/[\p{Extended_Pictographic}️]/gu, ' ').split(/\s+[-–—|]\s+/);
    const junkTest = new RegExp(JUNK_BRACKETS.source, 'iu');
    const aHasJunk = rawParts.length >= 2 && junkTest.test(rawParts[0]);
    const bHasJunk = rawParts.length >= 2 && junkTest.test(rawParts.slice(1).join(' - '));
    if ((bMatchesChannel && !aMatchesChannel) || (aHasJunk && !bHasJunk)) {
      add(a, b);
      add(b, a);
    } else {
      add(b, a); // Artist - Title
      add(a, b); // Title - Artist
    }
  }

  // Same title without junk, keeping the channel as artist when it looks like a real artist
  // (only when the title wasn't already split into artist / title).
  if (parts.length < 2) {
    add(title, channelLooksFake ? '' : channel);
    if (!channelLooksFake) add(title, '');
  }

  return variants.slice(0, 4);
}
