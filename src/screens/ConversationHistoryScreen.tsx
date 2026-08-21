import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Animated,
  AppState,
  AppStateStatus,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Toast from 'react-native-simple-toast';
import LinearGradient from 'react-native-linear-gradient';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import Tts from 'react-native-tts';
import { RootStackParamList } from '../navigation/types';
import { COLORS, FONTS, LEARNING_URL } from '../constants';
import {
  GRADIENT_TAB_TOP_BAR,
  GRADIENT_TAB_HEADER_TITLE,
  GRADIENT_TAB_BODY_PADDING_TOP,
} from '../constants/screenHeader';
import { CrashlyticsHelper } from '../helpers';
import { useI18n } from '../localization';
import { SavedConversation, SavedMessage } from '../types';
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

type Props = NativeStackScreenProps<RootStackParamList, 'ConversationHistory'>;

// Language detection helper
const detectLanguage = (text: string): string => {
  if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
  if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN';
  if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
  if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN';
  if (/[\u0D00-\u0D7F]/.test(text)) return 'ml-IN';
  if (/[\u0B00-\u0B7F]/.test(text)) return 'or-IN';
  if (/[\u0980-\u09FF]/.test(text)) return 'bn-IN';
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh-CN';
  if (/[\u3040-\u309F]/.test(text)) return 'ja-JP';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko-KR';
  if (/[\u0600-\u06FF]/.test(text)) return 'ar-SA';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'th-TH';
  if (/[\u0400-\u04FF]/.test(text)) return 'ru-RU';
  return 'en-US';
};

// Global stop flag - survives component remounts
let globalStopFlag = false;
let globalSessionId = 0;

export function ConversationHistoryScreen({ navigation, route }: Props) {
  const { t } = useI18n();
  const { learningId, authToken } = route.params;

  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playingConversationId, setPlayingConversationId] = useState<string | null>(null);
  const [playingMessageIndex, setPlayingMessageIndex] = useState(-1);
  const [ttsReady, setTtsReady] = useState(false);

  const playPulse = useRef(new Animated.Value(1)).current;
  const isMounted = useRef(true);
  const ttsFinishResolver = useRef<(() => void) | null>(null);

  // Force stop everything
  const forceStopTTS = useCallback(() => {
    globalStopFlag = true;
    globalSessionId += 1;

    if (ttsFinishResolver.current) {
      ttsFinishResolver.current();
      ttsFinishResolver.current = null;
    }

    try { Tts.stop(); } catch (e) {}
    setTimeout(() => { try { Tts.stop(); } catch (e) {} }, 50);
    setTimeout(() => { try { Tts.stop(); } catch (e) {} }, 100);

    if (isMounted.current) {
      setIsPlaying(false);
      setPlayingConversationId(null);
      setPlayingMessageIndex(-1);
    }
  }, []);

  // Initialize TTS
  useEffect(() => {
    isMounted.current = true;
    globalStopFlag = false;

    const initTTS = async () => {
      try {
        await Tts.getInitStatus();
        setTtsReady(true);
      } catch (e) {
        console.log('TTS init failed:', e);
      }
    };

    initTTS();

    const onFinish = Tts.addEventListener('tts-finish', () => {
      if (ttsFinishResolver.current) {
        const resolver = ttsFinishResolver.current;
        ttsFinishResolver.current = null;
        resolver();
      }
    });

    const onCancel = Tts.addEventListener('tts-cancel', () => {
      if (ttsFinishResolver.current) {
        const resolver = ttsFinishResolver.current;
        ttsFinishResolver.current = null;
        resolver();
      }
    });

    const handleAppState = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        forceStopTTS();
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppState);

    return () => {
      isMounted.current = false;
      globalStopFlag = true;
      globalSessionId += 1;

      if (ttsFinishResolver.current) {
        ttsFinishResolver.current();
        ttsFinishResolver.current = null;
      }

      try { Tts.stop(); } catch (e) {}
      try { (onFinish as any)?.remove?.(); } catch (e) {}
      try { (onCancel as any)?.remove?.(); } catch (e) {}
      appStateSubscription?.remove();
    };
  }, [forceStopTTS]);

  // Stop when screen loses focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      forceStopTTS();
    });
    return unsubscribe;
  }, [navigation, forceStopTTS]);

  // Pulse animation
  useEffect(() => {
    if (isPlaying) {
      const anim = Animated.loop(
        Animated.sequence([
          Animated.timing(playPulse, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(playPulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      );
      anim.start();
      return () => anim.stop();
    } else {
      playPulse.setValue(1);
    }
  }, [isPlaying, playPulse]);

  // Fetch conversations
  const fetchConversations = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) setLoading(true);

    try {
      const response = await fetch(`${LEARNING_URL}/${learningId}/conversations`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) throw new Error('Failed to fetch');

      const data = await response.json();
      if (isMounted.current) {
        setConversations(data.conversations || []);
      }
    } catch (error: any) {
      CrashlyticsHelper.recordError(error, 'fetchConversations');
      Toast.show(t('history_failed_to_load_toast'), Toast.SHORT);
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [learningId, authToken]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Speak single text
  const speakText = useCallback((text: string, sessionId: number): Promise<boolean> => {
    return new Promise((resolve) => {
      if (globalStopFlag || globalSessionId !== sessionId || !isMounted.current) {
        resolve(false);
        return;
      }

      if (!text?.trim()) {
        resolve(true);
        return;
      }

      ttsFinishResolver.current = () => resolve(true);

      const timeout = setTimeout(() => {
        if (ttsFinishResolver.current) {
          ttsFinishResolver.current = null;
          resolve(true);
        }
      }, 30000);

      try {
        const language = detectLanguage(text);
        try { Tts.setDefaultLanguage(language); } catch (e) {}

        if (globalStopFlag || globalSessionId !== sessionId) {
          clearTimeout(timeout);
          ttsFinishResolver.current = null;
          resolve(false);
          return;
        }

        Tts.speak(text);
      } catch (error) {
        clearTimeout(timeout);
        ttsFinishResolver.current = null;
        resolve(false);
      }
    });
  }, []);

  // Play conversation
  const playConversation = useCallback(async (conversation: SavedConversation) => {
    if (!ttsReady) {
      Toast.show(t('history_tts_unavailable_toast'), Toast.SHORT);
      return;
    }

    if (isPlaying && playingConversationId === conversation.id) {
      forceStopTTS();
      return;
    }

    forceStopTTS();
    await new Promise(r => setTimeout(r, 200));

    if (!isMounted.current) return;

    globalStopFlag = false;
    const sessionId = ++globalSessionId;

    setIsPlaying(true);
    setPlayingConversationId(conversation.id);
    setPlayingMessageIndex(0);

    for (let i = 0; i < conversation.messages.length; i++) {
      if (globalStopFlag || globalSessionId !== sessionId || !isMounted.current) break;

      if (isMounted.current) setPlayingMessageIndex(i);

      const msg = conversation.messages[i];
      if (!msg.text?.trim()) continue;

      let text = msg.text;
      if (msg.role === 'user') text = `You said: ${msg.text}`;
      else if (msg.role === 'system') text = `System: ${msg.text}`;

      if (globalStopFlag || globalSessionId !== sessionId || !isMounted.current) break;

      const success = await speakText(text, sessionId);

      if (!success || globalStopFlag || globalSessionId !== sessionId || !isMounted.current) break;

      await new Promise(r => setTimeout(r, 400));
    }

    if (globalSessionId === sessionId && isMounted.current) {
      setIsPlaying(false);
      setPlayingConversationId(null);
      setPlayingMessageIndex(-1);
    }
  }, [ttsReady, isPlaying, playingConversationId, forceStopTTS, speakText]);

  // Play single message
  const playSingleMessage = useCallback(async (message: SavedMessage, convId: string, msgIndex: number) => {
    if (!ttsReady) {
      Toast.show(t('history_tts_unavailable_toast'), Toast.SHORT);
      return;
    }

    if (isPlaying && playingConversationId === convId && playingMessageIndex === msgIndex) {
      forceStopTTS();
      return;
    }

    forceStopTTS();
    await new Promise(r => setTimeout(r, 200));

    if (!isMounted.current) return;

    globalStopFlag = false;
    const sessionId = ++globalSessionId;

    setIsPlaying(true);
    setPlayingConversationId(convId);
    setPlayingMessageIndex(msgIndex);

    await speakText(message.text, sessionId);

    if (globalSessionId === sessionId && isMounted.current) {
      setIsPlaying(false);
      setPlayingConversationId(null);
      setPlayingMessageIndex(-1);
    }
  }, [ttsReady, isPlaying, playingConversationId, playingMessageIndex, forceStopTTS, speakText]);

  // Back handler
  const handleBack = useCallback(() => {
    forceStopTTS();
    navigation.goBack();
  }, [forceStopTTS, navigation]);

  // ─── FIX 1: MessageItem moved OUTSIDE render tree (plain function, not useCallback inside render)
  // This prevents stale closure / missed re-renders when isPlaying state changes
  const renderMessageItem = (msg: SavedMessage, index: number, convId: string) => {
    const isActive = isPlaying && playingConversationId === convId && playingMessageIndex === index;

    const lang = detectLanguage(msg.text);
    const isIndian = ['hi', 'gu', 'ta', 'te', 'kn', 'ml', 'bn', 'pa', 'or'].some(l => lang.startsWith(l));
    const flag = isIndian ? '🇮🇳'
      : lang.startsWith('zh') ? '🇨🇳'
      : lang.startsWith('ja') ? '🇯🇵'
      : lang.startsWith('ar') ? '🇸🇦'
      : '🇺🇸';

    // ─── FIX 2: Text color per bubble type for legibility
    const isUserOrSystem = msg.role === 'user' || msg.role === 'system';
    const textColor = isUserOrSystem ? '#FFFFFF' : COLORS.text;
    const subTextColor = isUserOrSystem ? 'rgba(255,255,255,0.75)' : COLORS.textMuted;

    // ─── FIX 3: Icon color matches bubble background
    const iconColor = isUserOrSystem ? '#FFFFFF' : COLORS.secondary;

    return (
      <View key={`${convId}-${index}`} style={styles.messageRow}>
        {/* ─── FIX 4: systemMessage centered via wrapping row */}
        <View style={[
          styles.messageRowInner,
          msg.role === 'user' && styles.rowRight,
          msg.role === 'system' && styles.rowCenter,
        ]}>
          <View style={[
            styles.messageBubble,
            msg.role === 'user' && styles.userMessage,
            msg.role === 'ai' && styles.aiMessage,
            msg.role === 'system' && styles.systemMessage,
            isActive && styles.playingMessage,
          ]}>
            {/* Role header row */}
            <View style={styles.messageMeta}>
              {msg.role === 'user' ? (
                <Ionicons name="person-circle-outline" size={14} color={iconColor} />
              ) : msg.role === 'ai' ? (
                <MaterialCommunityIcons name="robot-outline" size={14} color={iconColor} />
              ) : (
                <Ionicons name="megaphone-outline" size={14} color={iconColor} />
              )}
              {/* ─── FIX 5: Role label so user knows who is who */}
              <Text style={[styles.roleLabel, { color: subTextColor }]}>
                {msg.role === 'user' ? t('history_role_you') : msg.role === 'ai' ? t('history_role_ai') : t('history_role_system')}
              </Text>
            </View>

            {/* Message body */}
            <Text style={[styles.messageText, { color: textColor }]}>{msg.text}</Text>

            {/* Footer */}
            <View style={styles.messageFooter}>
              <View style={styles.messageFooterLeft}>
                <Text style={styles.languageIndicator}>{flag}</Text>
                <Text style={[styles.messageTime, { color: subTextColor }]}>
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.messagePlayButton, isActive && styles.messagePlayButtonActive]}
                onPress={() => playSingleMessage(msg, convId, index)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Animated.View style={isActive ? { transform: [{ scale: playPulse }] } : undefined}>
                  <Ionicons
                    name={isActive ? 'stop-circle-outline' : 'volume-high-outline'}
                    size={18}
                    color={isActive ? COLORS.error : iconColor}
                  />
                </Animated.View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  // Render conversation card
  const ConversationItem = useCallback(({ item }: { item: SavedConversation }) => {
    const date = new Date(item.created_at);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    const isActive = isPlaying && playingConversationId === item.id;

    return (
      <View style={styles.conversationCard}>
        {/* Card Header */}
        <View style={styles.conversationHeader}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{t('history_level_badge', { level: item.level })}</Text>
          </View>
          <View style={styles.conversationMeta}>
            <Text style={styles.conversationDate}>{dateStr}</Text>
            <Text style={styles.conversationTime}>{timeStr}</Text>
          </View>
        </View>

        {/* Stats + Play All */}
        <View style={styles.conversationStats}>
          <View style={styles.statsRow}>
            <Ionicons name="chatbubbles-outline" size={14} color={COLORS.textMuted} style={{ marginRight: 4 }} />
            {/* ─── FIX 6: statsText color was COLORS.textMuted — ensure contrast */}
            <Text style={styles.statsText}>{item.message_count} messages</Text>
          </View>
          <TouchableOpacity
            style={[styles.playAllBtn, isActive && styles.playAllBtnActive]}
            onPress={() => playConversation(item)}
            activeOpacity={0.7}
          >
            <Animated.View style={isActive ? { transform: [{ scale: playPulse }] } : undefined}>
              <View style={styles.playAllBtnInner}>
                <Ionicons name={isActive ? 'stop' : 'play'} size={14} color={COLORS.text} style={{ marginRight: 4 }} />
                <Text style={styles.playAllBtnText}>{isActive ? t('history_stop_button') : t('history_play_all_button')}</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>

        {/* Now Playing Indicator */}
        {isActive && (
          <View style={styles.nowPlaying}>
            <Ionicons name="musical-notes-outline" size={14} color={COLORS.primary} style={{ marginRight: 6 }} />
            <Text style={styles.nowPlayingText}>
              {t('history_playing_message', { current: playingMessageIndex + 1, total: item.messages.length })}
            </Text>
          </View>
        )}

        {/* ─── FIX 7: Separator line before messages for visual grouping */}
        <View style={styles.messageDivider} />

        {/* Messages */}
        <View style={styles.messagesContainer}>
          {item.messages.map((msg, idx) =>
            renderMessageItem(msg, idx, item.id)
          )}
        </View>
      </View>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, playingConversationId, playingMessageIndex, playConversation, playPulse, playSingleMessage]);

  return (
    <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('history_header_title')}</Text>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="arrow-back" size={20} color={COLORS.primary} />
            <Text style={styles.backBtnText}>{t('history_back_button')}</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        {loading ? (
          <View style={styles.loadingSection}>
            {[1, 2, 3].map((item) => (
              <View key={item} style={styles.loadingCard}>
                <View style={styles.loadingLineLg} />
                <View style={styles.loadingLineSm} />
                <View style={styles.loadingLineXs} />
              </View>
            ))}
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 6 }} />
            <Text style={styles.loadingText}>{t('history_loading_text')}</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.center}>
            {/* ─── FIX 9: Icon was near-invisible — use explicit opaque color */}
            <Ionicons name="book-outline" size={64} color={COLORS.textMuted} style={{ marginBottom: 16, opacity: 0.7 }} />
            <Text style={styles.emptyTitle}>{t('history_empty_title')}</Text>
            <Text style={styles.emptyDesc}>{t('history_empty_desc')}</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={({ item }) => <ConversationItem item={item} />}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContent}
            // ─── FIX 10: Add bottom padding so last card isn't clipped by safe area
            contentInsetAdjustmentBehavior="automatic"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); fetchConversations(true); }}
                tintColor={COLORS.primary}
              />
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },

  // ─── Header (aligned with tab screens — constants/screenHeader)
  header: {
    ...GRADIENT_TAB_TOP_BAR,
    minHeight: 48,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  backBtnText: { color: COLORS.primary, fontSize: 16, fontFamily: FONTS.semiBold },
  headerTitle: {
    ...GRADIENT_TAB_HEADER_TITLE,
    textAlign: 'center',
  },

  // ─── List
  listContent: {
    paddingHorizontal: 20,
    paddingTop: GRADIENT_TAB_BODY_PADDING_TOP,
    paddingBottom: 32,
  },

  // ─── Loading / Empty
  loadingSection: {
    paddingHorizontal: 20,
    paddingTop: GRADIENT_TAB_BODY_PADDING_TOP,
  },
  loadingCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 12,
  },
  loadingLineLg: {
    height: 13,
    borderRadius: 7,
    width: '55%',
    backgroundColor: COLORS.bgLighter,
    marginBottom: 10,
  },
  loadingLineSm: {
    height: 10,
    borderRadius: 6,
    width: '80%',
    backgroundColor: COLORS.bgLighter,
    marginBottom: 8,
  },
  loadingLineXs: {
    height: 10,
    borderRadius: 6,
    width: '40%',
    backgroundColor: COLORS.bgLighter,
  },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14, fontFamily: FONTS.regular },
  emptyTitle: { fontSize: 20, color: COLORS.text, fontFamily: FONTS.bold, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', fontFamily: FONTS.regular, lineHeight: 20 },

  // ─── Conversation Card
  conversationCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    // ─── FIX: shadow so card lifts off background and is clearly visible
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  levelBadge: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  levelBadgeText: { color: '#FFFFFF', fontSize: 14, fontFamily: FONTS.bold },
  conversationMeta: { alignItems: 'flex-end' },
  conversationDate: { color: COLORS.text, fontSize: 14, fontFamily: FONTS.semiBold },
  conversationTime: { color: COLORS.textMuted, fontSize: 12, fontFamily: FONTS.regular, marginTop: 2 },

  // ─── Stats row
  conversationStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  // ─── FIX: Ensure stats text has sufficient contrast
  statsText: { color: COLORS.textMuted, fontSize: 13, fontFamily: FONTS.regular },

  playAllBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 90,
    alignItems: 'center',
  },
  playAllBtnActive: { backgroundColor: COLORS.error },
  playAllBtnInner: { flexDirection: 'row', alignItems: 'center' },
  playAllBtnText: { color: COLORS.text, fontSize: 13, fontFamily: FONTS.semiBold },

  // ─── Now Playing
  nowPlaying: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(92,59,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  nowPlayingText: { color: COLORS.secondary, fontSize: 12, fontFamily: FONTS.semiBold },

  // ─── Divider before messages
  messageDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginBottom: 8,
  },

  // ─── Messages
  messagesContainer: { gap: 6 },

  messageRow: { width: '100%' },

  // ─── FIX: Alignment wrapper so bubbles go left / right / center correctly
  messageRowInner: {
    flexDirection: 'row',
    justifyContent: 'flex-start', // default: AI = left-aligned
  },
  rowRight: { justifyContent: 'flex-end' },
  rowCenter: { justifyContent: 'center' },

  messageBubble: {
    padding: 12,
    borderRadius: 14,
    // ─── FIX: maxWidth on the bubble itself (not the full-width row)
    maxWidth: '82%',
    minWidth: 80,
  },

  // ─── FIX: userMessage — strong primary color, white text ✓
  userMessage: {
    backgroundColor: COLORS.secondary,
    borderBottomRightRadius: 4,
  },
  // ─── FIX: aiMessage — use a dedicated card/surface color, NOT bgLight which may be near-white
  // Text color is now set dynamically (COLORS.text for AI, #fff for user/system)
  aiMessage: {
    backgroundColor: COLORS.bgSecondary,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  // ─── FIX: systemMessage centered, distinct teal/success color
  systemMessage: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    maxWidth: '92%',
  },
  // ─── Active/playing highlight
  playingMessage: {
    borderWidth: 2,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  // ─── Message internals
  messageMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  roleLabel: {
    fontSize: 10,
    fontFamily: FONTS.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FONTS.regular,
  },
  messageFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  messageFooterLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  languageIndicator: { fontSize: 12 },
  messageTime: { fontSize: 10, fontFamily: FONTS.light },
  messagePlayButton: {
    padding: 4,
    borderRadius: 12,
  },
  messagePlayButtonActive: {
    backgroundColor: 'rgba(229, 72, 77, 0.12)',
  },
});