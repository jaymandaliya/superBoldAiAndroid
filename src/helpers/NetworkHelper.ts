import NetInfo from '@react-native-community/netinfo';
import { CrashlyticsHelper } from './CrashlyticsHelper';

// ============================================
// NETWORK HELPER
// ============================================
export const NetworkHelper = {
  async checkConnection(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      return state.isConnected === true && state.isInternetReachable !== false;
    } catch (error) {
      CrashlyticsHelper.recordError(error as Error, 'NetworkHelper.checkConnection');
      return false;
    }
  },

  async waitForConnection(timeoutMs: number = 10000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        resolve(false);
      }, timeoutMs);

      const unsubscribe = NetInfo.addEventListener((state) => {
        if (state.isConnected && state.isInternetReachable !== false) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(true);
        }
      });
    });
  },
};