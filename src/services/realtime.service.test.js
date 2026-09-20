import { describe, it, expect, vi, beforeEach } from 'vitest';

const { channel, removeChannel, state } = vi.hoisted(() => {
  const state = { onEvent: null, onStatus: null, config: null, name: null };
  const chan = {
    on: vi.fn((type, config, handler) => { state.config = { type, ...config }; state.onEvent = handler; return chan; }),
    subscribe: vi.fn((cb) => { state.onStatus = cb; return chan; }),
  };
  return {
    state,
    channel: vi.fn((name) => { state.name = name; return chan; }),
    removeChannel: vi.fn(),
    chan,
  };
});

vi.mock('../lib/supabase', () => ({ supabase: { channel, removeChannel } }));

import { subscribeToHubActivity } from './realtime.service';

describe('realtime.service — subscribeToHubActivity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.onEvent = null; state.onStatus = null; state.config = null; state.name = null;
  });

  it('opens a per-hub channel on hub_activity, filtered to that hub', () => {
    subscribeToHubActivity('centre-1', vi.fn());
    expect(state.name).toBe('hub-activity:centre-1');
    expect(state.config).toMatchObject({
      type:   'postgres_changes',
      event:  '*',
      schema: 'public',
      table:  'hub_activity',
      filter: 'budget_centre_id=eq.centre-1',
    });
  });

  it('subscribes to hub_activity and to nothing else — no data table is watched', () => {
    subscribeToHubActivity('centre-1', vi.fn());
    expect(channel).toHaveBeenCalledTimes(1);
    expect(state.config.table).toBe('hub_activity');
  });

  it('calls back on an event, with no payload passed through', () => {
    const onActivity = vi.fn();
    subscribeToHubActivity('centre-1', onActivity);
    state.onEvent({ new: { budget_centre_id: 'centre-1', rev: 4 } });
    expect(onActivity).toHaveBeenCalledTimes(1);
    expect(onActivity).toHaveBeenCalledWith();   // deliberately argument-free
  });

  it('logs a channel error rather than throwing — freshness degrades, nothing breaks', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    subscribeToHubActivity('centre-1', vi.fn());
    expect(() => state.onStatus('CHANNEL_ERROR', new Error('socket closed'))).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs a timeout the same way', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    subscribeToHubActivity('centre-1', vi.fn());
    state.onStatus('TIMED_OUT');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('stays quiet on a healthy subscription', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    subscribeToHubActivity('centre-1', vi.fn());
    state.onStatus('SUBSCRIBED');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('returns an unsubscribe that removes the channel exactly once', () => {
    const unsubscribe = subscribeToHubActivity('centre-1', vi.fn());
    unsubscribe();
    unsubscribe();
    expect(removeChannel).toHaveBeenCalledTimes(1);
  });

  it('opens nothing without a hub, and still returns a callable unsubscribe', () => {
    const unsubscribe = subscribeToHubActivity(null, vi.fn());
    expect(channel).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
    expect(removeChannel).not.toHaveBeenCalled();
  });
});
