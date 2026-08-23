import { useEffect, useRef } from 'react';
import { CFPaymentGatewayService, CFErrorResponse } from 'react-native-cashfree-pg-sdk';

export type CashfreeSubscriptionHandlers = {
  onVerify: (orderID: string) => void;
  onError: (error: CFErrorResponse, orderID: string) => void;
};

/**
 * Subscribes to the Cashfree native SDK's payment callback for the lifetime
 * of the screen. Handlers should be stable or read from refs inside your callbacks.
 */
export function useCashfreeSubscription(handlers: CashfreeSubscriptionHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    CFPaymentGatewayService.setCallback({
      onVerify: (orderID: string) => handlersRef.current.onVerify(orderID),
      onError: (error: CFErrorResponse, orderID: string) =>
        handlersRef.current.onError(error, orderID),
    });

    return () => {
      CFPaymentGatewayService.removeCallback();
    };
  }, []);
}
