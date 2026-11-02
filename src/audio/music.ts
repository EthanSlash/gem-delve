import type { MusicTrack } from '../types';

export interface MusicNote {
  beat: number;
  length: number;
  pitch: number;
  voice: 'pluck' | 'lead' | 'bass' | 'drum';
  strength: number;
}

export interface MusicPiece { bpm: number; beats: number; notes: readonly MusicNote[] }

// Sixteen four-beat bars per piece: eight-bar question and eight-bar answer.
// Pitch is MIDI; drum pitch distinguishes the low pulse from the brushed accent.
function compose(track: MusicTrack): MusicPiece {
  const bpm = track === 'title' ? 76 : track === 'combat' ? 112 : 132;
  const roots = track === 'title'
    ? [45, 41, 48, 43, 45, 40, 41, 43, 45, 48, 41, 43, 45, 41, 43, 45]
    : track === 'combat'
      ? [38, 34, 41, 36, 38, 43, 34, 36, 38, 41, 34, 36, 38, 34, 36, 38]
      : [40, 41, 38, 40, 40, 43, 41, 38, 40, 38, 41, 40, 43, 41, 38, 40];
  const melody = track === 'title'
    ? [[69, 72, 76, 72], [67, 69, 72, 64], [72, 74, 76, 79], [71, 67, 69, 64],
      [69, 72, 76, 79], [67, 64, 72, 67], [65, 69, 72, 69], [67, 71, 74, 71],
      [76, 74, 72, 69], [79, 76, 72, 74], [77, 72, 69, 72], [74, 71, 67, 71],
      [76, 72, 69, 72], [72, 67, 64, 67], [71, 74, 67, 71], [69, 72, 69, 64]]
    : track === 'combat'
      ? [[62, 65, 69, 65], [65, 69, 70, 65], [69, 72, 69, 65], [67, 65, 62, 60],
        [62, 69, 72, 69], [70, 74, 70, 67], [65, 69, 65, 62], [67, 64, 60, 64],
        [74, 72, 69, 65], [72, 69, 65, 69], [70, 69, 65, 62], [67, 72, 67, 64],
        [69, 74, 72, 69], [70, 65, 69, 65], [67, 64, 67, 72], [62, 65, 62, 57]]
      : [[64, 67, 71, 65], [65, 71, 72, 65], [62, 65, 69, 65], [64, 71, 67, 65],
        [71, 76, 72, 71], [67, 74, 71, 67], [65, 72, 71, 65], [69, 65, 62, 65],
        [76, 74, 71, 65], [74, 71, 69, 62], [72, 71, 65, 71], [76, 71, 67, 64],
        [79, 76, 72, 71], [77, 72, 71, 65], [74, 71, 65, 62], [64, 67, 65, 64]];
  const notes: MusicNote[] = [];
  const add = (beat: number, length: number, pitch: number, voice: MusicNote['voice'], strength: number) =>
    notes.push({ beat, length, pitch, voice, strength });
  roots.forEach((root, bar) => {
    const at = bar * 4;
    const phrase = melody[bar]!;
    if (track === 'title') {
      const chord = [root + 12, root + 19, root + (bar === 5 ? 15 : 16), root + 24];
      for (let step = 0; step < 8; step++) add(at + step * .5, .45, chord[step % 4]!, 'pluck', .65);
      add(at, 2, root, 'bass', .48);
      if (bar % 2 === 0) add(at + 1, 1.75, phrase[0]!, 'lead', .6);
      add(at + 3, .85, phrase[bar % 2 ? 2 : 1]!, 'lead', .52);
    } else {
      const boss = track === 'boss';
      for (let step = 0; step < 4; step++) {
        add(at + step, .75, root + (step === 1 ? 7 : step === 3 ? (boss ? 1 : 3) : 0), 'bass', boss ? .85 : .67);
        add(at + step, .11, step % 2 ? 2 : 1, 'drum', boss ? .75 : .42);
        if (boss && step % 2 === 1) add(at + step + .5, .08, 2, 'drum', .3);
      }
      for (let step = 0; step < 4; step++) {
        if (step === 2 && bar % 4 === 3) continue; // a breath at each cadence
        add(at + step + (step % 2 ? .25 : 0), boss ? .65 : .85, phrase[step]!, 'lead', .65);
      }
      if (bar % 2 === 0) for (let step = 0; step < 4; step++)
        add(at + step, .3, root + 12 + (step % 2 ? 7 : 0), 'pluck', .35);
    }
  });
  return { bpm, beats: 64, notes };
}

export const MUSIC: Readonly<Record<MusicTrack, MusicPiece>> = {
  title: compose('title'), combat: compose('combat'), boss: compose('boss'),
};

// Half-open absolute beat interval. Returns absolute start beats so the caller can
// schedule seamlessly through any number of loop boundaries.
export function notesBetween(track: MusicTrack, fromBeat: number, toBeat: number): MusicNote[] {
  if (!Number.isFinite(fromBeat) || !Number.isFinite(toBeat) || toBeat <= fromBeat) return [];
  const piece = MUSIC[track];
  const result: MusicNote[] = [];
  for (let loop = Math.floor(fromBeat / piece.beats); loop <= Math.floor(toBeat / piece.beats); loop++) {
    for (const note of piece.notes) {
      const beat = note.beat + loop * piece.beats;
      if (beat >= fromBeat && beat < toBeat) result.push({ ...note, beat });
    }
  }
  return result.sort((a, b) => a.beat - b.beat);
}
