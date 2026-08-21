import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { sha512 } from 'js-sha512';
import { PAYU_MERCHANT } from './payuConfig';

const { PayUBizSdk } = NativeModules;

export type PayUCheckoutHandlers = {
  onPaymentSuccess: (event: unknown) => void;
  onPaymentFailure: (event: unknown) => void;
  onPaymentCancel: (event: unknown) => void;
  onError: (event: unknown) => void;
};

/**
 * Subscribes to PayU native SDK events and Android merchant init.
 * Handlers should be stable or read from refs inside your callbacks.
 */
export function usePayUCheckout(handlers: PayUCheckoutHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!PayUBizSdk) {
      console.warn('[PayU] PayUBizSdk not available');
      return;
    }

    if (Platform.OS === 'android' && PayUBizSdk.setMerchantInfo) {
      try {
        PayUBizSdk.setMerchantInfo(PAYU_MERCHANT.key, PAYU_MERCHANT.merchantSalt);
        console.log('[PayU] Merchant info initialized for Android');
      } catch (error) {
        console.error('[PayU] Failed to initialize merchant info:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!PayUBizSdk) {
      return;
    }

    const eventEmitter = new NativeEventEmitter(PayUBizSdk);

    const payUOnPaymentSuccess = eventEmitter.addListener('onPaymentSuccess', (e) =>
      handlersRef.current.onPaymentSuccess(e)
    );
    const payUOnPaymentFailure = eventEmitter.addListener('onPaymentFailure', (e) =>
      handlersRef.current.onPaymentFailure(e)
    );
    const payUOnPaymentCancel = eventEmitter.addListener('onPaymentCancel', (e) =>
      handlersRef.current.onPaymentCancel(e)
    );
    const payUOnError = eventEmitter.addListener('onError', (e) => handlersRef.current.onError(e));
    const payUGenerateHash = eventEmitter.addListener('generateHash', (e: { hashName: string; hashString: string }) => {
      try {
        const hashValue = sha512(e.hashString + PAYU_MERCHANT.merchantSalt);
        PayUBizSdk.hashGenerated({ [e.hashName]: hashValue });
      } catch (error) {
        console.error('[PayU] Hash generation error:', error);
      }
    });

    return () => {
      payUOnPaymentSuccess.remove();
      payUOnPaymentFailure.remove();
      payUOnPaymentCancel.remove();
      payUOnError.remove();
      payUGenerateHash.remove();
    };
  }, []);
}

export function getPayUBizSdk(): typeof PayUBizSdk | undefined {
  return PayUBizSdk;
}
