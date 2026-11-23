import { LANE_WIDTH } from './constants.js';
import type { RiverSpec } from './types.js';

/** 三套编好的河道，难度递增 */
export const RIVERS: RiverSpec[] = [
  {
    id: 'miluo',
    name: '汨罗江国际静水赛道',
    length: 500,
    laneCount: 6,
    laneWidth: LANE_WIDTH,
    baseFlow: 0.6,
    meanderAmplitude: 0.15,
    meanderWavelength: 400,
    turbulence: 0.04,
    adverseZones: [],
  },
  {
    id: 'zhujiang',
    name: '珠江后航道',
    length: 500,
    laneCount: 6,
    laneWidth: LANE_WIDTH,
    baseFlow: 1.1,
    meanderAmplitude: 0.35,
    meanderWavelength: 260,
    turbulence: 0.09,
    adverseZones: [{ x0: 220, x1: 300, laneBias: 2, strength: 0.55 }],
  },
  {
    id: 'jialing',
    name: '嘉陵江石门急流段',
    length: 500,
    laneCount: 6,
    laneWidth: LANE_WIDTH,
    baseFlow: 1.7,
    meanderAmplitude: 0.55,
    meanderWavelength: 180,
    turbulence: 0.16,
    adverseZones: [
      { x0: 140, x1: 200, laneBias: -2, strength: 0.7 },
      { x0: 330, x1: 400, laneBias: 1, strength: 0.5 },
    ],
  },
];

export function getRiver(id: string): RiverSpec {
  return RIVERS.find((r) => r.id === id) ?? RIVERS[0];
}
