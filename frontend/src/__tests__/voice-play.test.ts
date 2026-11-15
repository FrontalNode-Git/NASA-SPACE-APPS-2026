import { describe, expect, it } from 'vitest';
import { parseVoice } from '../lib/commands';
import { bundle } from './fixture';

describe('voice: play and pause the mission timeline', () => {
  it('understands play and pause, with or without the words around them', () => {
    for (const phrase of ['play', 'Play the mission timeline', 'resume', 'play story']) {
      expect(parseVoice(phrase, bundle), phrase).toEqual({ type: 'play', on: true });
    }
    for (const phrase of ['pause', 'Stop the timeline', 'pause mission']) {
      expect(parseVoice(phrase, bundle), phrase).toEqual({ type: 'play', on: false });
    }
  });

  it('does not take other sentences for it', () => {
    expect(parseVoice('please play me a song about mars', bundle)).not.toEqual({ type: 'play', on: true });
    expect(parseVoice('show gravity', bundle)).toEqual({ type: 'lens', hazard: 'gravity' });
  });
});
