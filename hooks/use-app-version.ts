import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useCallback, useEffect, useState } from 'react';

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'error';

export type UseAppVersionResult = {
  version: string;
  updateStatus: UpdateStatus;
  checkForUpdate: () => Promise<void>;
};

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export function useAppVersion(): UseAppVersionResult {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');

  const checkForUpdate = useCallback(async () => {
    // expo-updates does not support web or Expo Go
    if (!Updates.isEnabled) {
      setUpdateStatus('not-available');
      return;
    }
    setUpdateStatus('checking');
    try {
      const result = await Updates.checkForUpdateAsync();
      setUpdateStatus(result.isAvailable ? 'available' : 'not-available');
    } catch {
      setUpdateStatus('not-available');
    }
  }, []);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  return { version: APP_VERSION, updateStatus, checkForUpdate };
}
