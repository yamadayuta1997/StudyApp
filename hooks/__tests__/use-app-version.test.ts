import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAppVersion } from '../use-app-version';

const mockCheckForUpdateAsync = jest.fn();

jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: (...args: unknown[]) => mockCheckForUpdateAsync(...args),
}));

describe('useAppVersion', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns a non-empty version string', () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const { result } = renderHook(() => useAppVersion());
    expect(typeof result.current.version).toBe('string');
    expect(result.current.version.length).toBeGreaterThan(0);
  });

  it('sets status to not-available when no update', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const { result } = renderHook(() => useAppVersion());
    await waitFor(() => {
      expect(result.current.updateStatus).toBe('not-available');
    });
  });

  it('sets status to available when update exists', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true });
    const { result } = renderHook(() => useAppVersion());
    await waitFor(() => {
      expect(result.current.updateStatus).toBe('available');
    });
  });

  it('sets status to not-available on network error', async () => {
    mockCheckForUpdateAsync.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useAppVersion());
    await waitFor(() => {
      expect(result.current.updateStatus).toBe('not-available');
    });
  });

  it('checkForUpdate can be called manually', async () => {
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: false });
    const { result } = renderHook(() => useAppVersion());
    await waitFor(() => expect(result.current.updateStatus).not.toBe('checking'));
    mockCheckForUpdateAsync.mockResolvedValue({ isAvailable: true });
    await act(async () => {
      await result.current.checkForUpdate();
    });
    expect(result.current.updateStatus).toBe('available');
  });
});
