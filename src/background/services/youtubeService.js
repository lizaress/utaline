// ==================================================================================================
// EXTERNAL SERVICE - YOUTUBE
// ==================================================================================================

import { DataParser } from '../utils/dataParser.js';

export class YouTubeService {
  static async fetchSubtitles(songInfo) {
    try {
      let subtitleInfo = songInfo?.subtitle;

      if (!subtitleInfo?.captionTracks?.length && songInfo?.videoId) {
        try {
          const response = await fetch("https://www.youtube.com/youtubei/v1/player", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "accept-language": "en-US,en;q=0.9"
            },
            body: JSON.stringify({
              context: { client: { clientName: "WEB_REMIX", clientVersion: "1.20260204.03.00" } },
              videoId: songInfo.videoId
            })
          });
          if (response.ok) {
            const data = await response.json();
            subtitleInfo = data?.captions?.playerCaptionsTracklistRenderer;
          }
        } catch (fetchErr) {
          console.warn("YouTube player API fetch failed:", fetchErr);
        }
      }

      if (!subtitleInfo?.captionTracks?.length) return null;

      // Fetch all candidate tracks in parallel (up to 8 tracks)
      const tracksToFetch = subtitleInfo.captionTracks.slice(0, 8);
      const trackPromises = tracksToFetch.map(async (track) => {
        try {
          const trackUrl = track.baseUrl || track.url;
          if (!trackUrl) return null;

          const url = new URL(trackUrl);
          url.searchParams.set('fmt', 'json3');

          const response = await fetch(url.toString());
          if (!response.ok) return null;

          const json = await response.json();
          const parsed = DataParser.parseYouTubeSubtitles(json, songInfo);
          if (!parsed?.data?.length) return null;

          return {
            type: parsed.type || 'Line',
            languageCode: track.languageCode || track.vssId || 'unknown',
            name: track.name?.simpleText || track.name?.runs?.[0]?.text || track.languageCode || '',
            isDefault: !!track.isDefault,
            kind: track.kind || 'standard',
            data: parsed.data
          };
        } catch (err) {
          return null;
        }
      });

      const fetchedTracks = (await Promise.all(trackPromises)).filter(Boolean);
      if (fetchedTracks.length === 0) return null;

      // utaline: YouTube often lists an English translation track first. For lyrics we want the
      // original language, so prefer tracks written in a non-Latin script (Japanese, Chinese,
      // Korean, Russian...) and hand-made tracks over auto-generated ones.
      const NON_LATIN = /[぀-ヿ㐀-鿿가-힯\p{Script=Cyrillic}֐-ۿ฀-๿]/gu;
      const scoreTrack = (t) => {
        const text = (t.data || []).map(l => l.text || '').join(' ');
        const letters = text.replace(/[\s\p{P}\p{N}]/gu, '').length || 1;
        const nonLatinRatio = (text.match(NON_LATIN) || []).length / letters;
        let score = nonLatinRatio > 0.3 ? 10 : 0;
        if (t.kind === 'asr') score -= 3;
        if (t.isDefault) score += 1;
        return score;
      };
      fetchedTracks.sort((a, b) => scoreTrack(b) - scoreTrack(a));

      return {
        type: fetchedTracks[0].type || 'Line',
        tracks: fetchedTracks,
        data: fetchedTracks[0].data,
        metadata: {
          ...songInfo,
          source: "YouTube Captions",
          provider: "subtitles",
          ignoreSponsorblock: true
        },
        provider: "subtitles",
        ignoreSponsorblock: true
      };
    } catch (error) {
      console.error("YouTube subtitles error:", error);
      return null;
    }
  }
}
