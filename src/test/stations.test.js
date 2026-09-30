import { describe, it, expect } from 'vitest';
import { getKitchenStations, DEFAULT_KITCHEN_STATIONS } from '../utils/stations';

describe('getKitchenStations', () => {
  it('returns default stations when restaurant has no kitchenConfig', () => {
    expect(getKitchenStations(null)).toEqual(DEFAULT_KITCHEN_STATIONS);
    expect(getKitchenStations({})).toEqual(DEFAULT_KITCHEN_STATIONS);
  });

  it('returns default stations when kitchenConfig.stations is empty', () => {
    expect(getKitchenStations({ kitchenConfig: { stations: [] } })).toEqual(DEFAULT_KITCHEN_STATIONS);
    expect(getKitchenStations({ kitchenConfig: { stations: ['', '   '] } })).toEqual(DEFAULT_KITCHEN_STATIONS);
  });

  it('returns custom stations deduplicated and trimmed', () => {
    const custom = ['Pizza Oven', 'Bar', ' Pizza Oven ', 'Cold', ''];
    expect(getKitchenStations({ kitchenConfig: { stations: custom } })).toEqual(['Pizza Oven', 'Bar', 'Cold']);
  });
});
