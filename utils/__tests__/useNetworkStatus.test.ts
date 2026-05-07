import { renderHook, act } from '@testing-library/react-native';
import { useNetworkStatus } from '../useNetworkStatus';

// NetInfo をモック
let netInfoCallback: ((state: { isConnected: boolean | null }) => void) | null = null;

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((cb: (state: { isConnected: boolean | null }) => void) => {
    netInfoCallback = cb;
    return jest.fn(); // unsubscribe
  }),
}));

describe('useNetworkStatus', () => {
  beforeEach(() => {
    netInfoCallback = null;
  });

  test('初期状態はオンライン', () => {
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current.isOnline).toBe(true);
  });

  test('ネットワーク切断時に isOnline が false になる', () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => {
      netInfoCallback?.({ isConnected: false });
    });
    expect(result.current.isOnline).toBe(false);
  });

  test('再接続時に isOnline が true に戻る', () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => {
      netInfoCallback?.({ isConnected: false });
    });
    expect(result.current.isOnline).toBe(false);
    act(() => {
      netInfoCallback?.({ isConnected: true });
    });
    expect(result.current.isOnline).toBe(true);
  });

  test('isConnected が null のとき isOnline は true', () => {
    const { result } = renderHook(() => useNetworkStatus());
    act(() => {
      netInfoCallback?.({ isConnected: null });
    });
    expect(result.current.isOnline).toBe(true);
  });
});
