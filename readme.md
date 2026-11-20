# Utaline

> *Uta* (歌) means "song" in Japanese. Utaline shows you every line of the song as it plays.

Real-time karaoke lyrics for **YouTube Music**, in a **floating always-on-top window**, with romanization for Japanese, Chinese and Russian songs.

Utaline is a fork of [YouLy+](https://github.com/ibratabian17/YouLyPlus) by Ibra Al Tabian. YouLy+ handles the lyrics: it finds them, syncs them word by word and romanizes them. Utaline adds a floating window that shows those lyrics outside the browser tab, plus fixes for the languages and songs it was built for.

> **Status:** personal project, tested on Microsoft Edge on Windows. It is not published in any extension store.

---

## Features

### Added in Utaline
- **Floating lyrics window.** Shows the lyrics on top of other apps and games running in windowed or borderless mode. Open it with the **⧉** button in the player bar or press **Alt+L**.
  - Mini player: artwork, title, artist, previous / play-pause / next.
  - **A- / A+** to change the lyrics size.
  - **Aa** turns romanization on or off; **文A** turns translation on or off. The choice is remembered for the next songs.
  - **🎨** lyrics color palette (7 colors + automatic).
  - Keeps playing in sync when you switch tabs or minimize the browser.
  - Remembers its size.
- **Better Russian romanization**, using simplified BGN/PCGN rules that depend on the surrounding letters (`ель → yel`, `нет → net`, `пьёт → pyot`, `жёлтый → zholtyy`). This also works across karaoke syllables. Ukrainian is detected automatically.
- **Japanese romanization works out of the box.** If the offline Kuromoji dictionary isn't installed, Utaline falls back to Google instead of leaving kanji untranslated.
- **Romanization and translation for unsynced lyrics.** They now appear under each line.
- **Smarter search for user-uploaded videos.** Titles like `Closing Time (LYRICS) - Semisonic 🎧` uploaded by a channel are cleaned up and searched again as *Closing Time / Semisonic*.
- **Original-language subtitles.** When YouTube subtitles are the only source, Utaline picks the original-language track instead of an English translation.

### From YouLy+
- Word-by-word and syllable-synced lyrics with smooth CSS animations.
- Multiple lyrics sources: Lyrics+ (Apple Music / QQ Music), lrc.red, Unison and LRCLIB.
- Offline romanization (Japanese, Chinese pinyin, Korean, Russian, Arabic, Hebrew, Greek, Thai, Hindi). Romanization with Google or **Gemini AI** is optional.
- Translation with Google, DeepL or Gemini AI.
- Per-song timing offset, dynamic colors from the album art, custom CSS, and a lightweight mode.

---

## Installation (Edge / Chrome)

1. Download or clone this repository:
   ```bash
   git clone https://github.com/lizaress/utaline.git
   ```
2. Open `edge://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode**.
4. If you have YouLy+ installed from the store, turn it off so the two don't conflict.
5. Click **Load unpacked** and select the `utaline` folder.
6. Open [YouTube Music](https://music.youtube.com), play a song and open the **Lyrics** tab once.
7. Press **⧉** in the player bar or **Alt+L** to open the floating window.

To update, pull the latest changes and press **Reload** on the extension in `edge://extensions`.

> The floating window uses the [Document Picture-in-Picture API](https://developer.chrome.com/docs/web-platform/document-picture-in-picture), available in Edge and Chrome 116+. Firefox doesn't support it.

### Optional: Gemini AI for better romanization
Gemini reads kanji more accurately than the offline dictionary or Google. It uses one request per song, and the free tier is enough for normal listening.

1. Create a free API key at [Google AI Studio](https://aistudio.google.com/apikey).
2. Open the extension popup → **More Settings** → **Translation**.
3. Paste the key in **Gemini AI API Key** and set **Transliteration Provider** to **Gemini AI**.
4. Under **Cache**, click **Clear Transliteration Cache** so songs are romanized again.

If Gemini fails or the daily quota runs out, Utaline falls back to the other providers automatically.

---

## Known limitations
- The floating window **cannot be transparent or click-through**, and it probably won't show over games in exclusive fullscreen. These are browser limits.
- It closes when the YouTube Music tab is closed, and it has to be opened with a click or with Alt+L.
- Songs whose lyrics only exist without timestamps (common for less-known Russian songs) can't be synced. They are shown as plain text with romanization.
- User-uploaded videos may be out of sync with the lyrics because they often have intros or edits. Prefer the official tracks in YouTube Music.

---

## Development

Plain JavaScript (Manifest V3), no build step. Load the folder unpacked and reload the extension after changes.

Main Utaline additions:

| File | Purpose |
|---|---|
| `src/modules/popout/popout.js` | Floating window, mini player and quick controls |
| `src/modules/popout/timerHost.js` | Keeps timers running while the tab is hidden and the popout is open |
| `src/background/services/romanization/cyrillicRomanizer.js` | Context-aware Russian / Ukrainian romanization |
| `src/background/utils/titleCleaner.js` | Title cleanup for user-uploaded videos |

To keep merging fixes from the original project:
```bash
git remote add upstream https://github.com/ibratabian17/YouLyPlus.git
git fetch upstream
git merge upstream/main
```

Packaging: `./bundle.ps1` (Windows) or `./bundle.sh` (Linux/macOS) creates `.zip` files in `dist/`. Both need `jq` and a zip tool.

---

## Credits and license

- **[YouLy+](https://github.com/ibratabian17/YouLyPlus)** by [Ibra Al Tabian](https://github.com/ibratabian17) and its contributors. It provides the lyrics engine, the sources, the romanizers and the settings UI. If you like this, please support the original project on [Ko-fi](https://ko-fi.com/ibratabian17) or [Patreon](https://patreon.com/ibratabian17).
- Lyrics come from third-party services (Lyrics+, lrc.red, Unison, LRCLIB, YouTube), each under its own terms.

Released under the [MIT License](LICENSE), the same as YouLy+. The original copyright notice is kept.
