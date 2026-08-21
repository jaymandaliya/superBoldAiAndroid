import React, { useState } from 'react';
import {
  Modal,
  SafeAreaView,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  StyleSheet,
} from 'react-native';
import { WebView } from 'react-native-webview';
import LinearGradient from 'react-native-linear-gradient';
import { COLORS, FONTS } from '../constants';
import { CrashlyticsHelper } from '../helpers';
import Ionicons from 'react-native-vector-icons/Ionicons';

interface WebViewModalProps {
  visible: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export function WebViewModal({ visible, onClose, url, title }: WebViewModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleError = () => {
    setError(true);
    setLoading(false);
    CrashlyticsHelper.log(`WebView error loading: ${url}`);
  };

  const handleOpenInBrowser = () => {
    Linking.openURL(url).catch((err) => {
      CrashlyticsHelper.recordError(err as Error, 'WebViewModal.openInBrowser');
      Alert.alert('Error', 'Unable to open link');
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.webViewContainer}>
      <SafeAreaView style={styles.webViewContainer}>
        <View style={styles.webViewHeader}>
          <Text style={styles.webViewTitle}>{title}</Text>
          <View style={styles.webViewHeaderButtons}>
            <TouchableOpacity onPress={handleOpenInBrowser} style={styles.webViewOpenButton}>
              <Text style={styles.webViewOpenText}>Open in Browser</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.webViewCloseButton}>
              <Ionicons name="close" size={18} color={COLORS.text} />
            </TouchableOpacity>
          </View>
        </View>
        
        {loading && !error && (
          <View style={styles.webViewLoading}>
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        )}

        {error && (
          <View style={styles.webViewError}>
            <Text style={styles.errorText}>Unable to load page</Text>
            <TouchableOpacity style={styles.openBrowserButton} onPress={handleOpenInBrowser}>
              <Text style={styles.openBrowserButtonText}>Open in Browser</Text>
            </TouchableOpacity>
          </View>
        )}
        
        {!error && (
          <WebView
            source={{ uri: url }}
            style={styles.webView}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={handleError}
            startInLoadingState={true}
          />
        )}
      </SafeAreaView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  webViewContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  webViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  webViewTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
    flex: 1,
  },
  webViewHeaderButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  webViewOpenButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.secondary,
    borderRadius: 6,
  },
  webViewOpenText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: FONTS.semiBold,
  },
  webViewCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.card,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webViewCloseText: {
    fontSize: 18,
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },
  webViewLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
    zIndex: 1,
  },
  webViewError: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: COLORS.error,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
    marginBottom: 16,
  },
  openBrowserButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  openBrowserButtonText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  webView: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
});