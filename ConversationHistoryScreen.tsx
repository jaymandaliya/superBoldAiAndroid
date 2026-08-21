// ConversationHistoryScreen.tsx
// Add this new screen component to your React Native app

import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Toast from 'react-native-simple-toast';

// Use the same COLORS and FONTS from your main App
const COLORS = {
  primary: '#00B4E6',
  bg: '#000000',
  bgLight: '#0A0A0A',
  bgLighter: '#1A1A1A',
  bgCard: '#141414',
  text: '#FFFFFF',
  textMuted: '#8899AA',
  success: '#00C853',
  error: '#FF3D57',
};

const FONTS = {
  regular: 'Montserrat-Regular',
  medium: 'Montserrat-Medium',
  semiBold: 'Montserrat-SemiBold',
  bold: 'Montserrat-Bold',
};

interface Message {
  role: 'user' | 'ai' | 'system';
  text: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  learning_id: string;
  user_id: string;
  level: number;
  messages: Message[];
  message_count: number;
  created_at: string;
}

interface Props {
  learningId: string;
  authToken: string;
  onBack: () => void;
}

const LEARNING_URL = 'https://learning-backend.scaleu.ai/api/learnings';

export function ConversationHistoryScreen({ learningId, authToken, onBack }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

  const fetchConversations = useCallback(async (isRefreshing = false) => {
    if (!isRefreshing) {
      setLoading(true);
    }

    try {
      const url = selectedLevel 
        ? `${LEARNING_URL}/${learningId}/conversations?level=${selectedLevel}`
        : `${LEARNING_URL}/${learningId}/conversations`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch conversation history');
      }

      const data = await response.json();
      setConversations(data.conversations || []);
    } catch (error: any) {
      console.error('Error fetching conversations:', error);
      Toast.show(error.message || 'Failed to load history', Toast.SHORT);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [learningId, authToken, selectedLevel]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchConversations(true);
  };

  const renderMessage = ({ item }: { item: Message }) => (
    <View
      style={[
        styles.messageBubble,
        item.role === 'user' && styles.userMessage,
        item.role === 'ai' && styles.aiMessage,
        item.role === 'system' && styles.systemMessage,
      ]}
    >
      <Text style={styles.messageText}>
        {item.role === 'user' ? '👤 ' : item.role === 'ai' ? '🤖 ' : '📢 '}
        {item.text}
      </Text>
      <Text style={styles.messageTime}>
        {new Date(item.timestamp).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </Text>
    </View>
  );

  const renderConversation = ({ item }: { item: Conversation }) => {
    const date = new Date(item.created_at);
    const formattedDate = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const formattedTime = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <View style={styles.conversationCard}>
        <View style={styles.conversationHeader}>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Level {item.level}</Text>
          </View>
          <View style={styles.conversationMeta}>
            <Text style={styles.conversationDate}>{formattedDate}</Text>
            <Text style={styles.conversationTime}>{formattedTime}</Text>
          </View>
        </View>

        <View style={styles.conversationStats}>
          <Text style={styles.conversationStatsText}>
            💬 {item.message_count} messages
          </Text>
        </View>

        <View style={styles.messagesContainer}>
          <FlatList
            data={item.messages}
            renderItem={renderMessage}
            keyExtractor={(msg, index) => `${item.id}-${index}`}
            scrollEnabled={false}
          />
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={[COLORS.bg, COLORS.bgLight]} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Conversation History</Text>
          <View style={styles.headerSpacer} />
        </View>

        {loading ? (
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={COLORS.primary} />
            <Text style={styles.loadingText}>Loading history...</Text>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.centerContent}>
            <Text style={styles.emptyEmoji}>📚</Text>
            <Text style={styles.emptyTitle}>No History Yet</Text>
            <Text style={styles.emptyText}>
              Complete levels to save your conversation history
            </Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            renderItem={renderConversation}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
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
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.bgLighter,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: COLORS.primary,
    fontSize: 16,
    fontFamily: FONTS.semiBold,
  },
  headerTitle: {
    fontSize: 18,
    color: COLORS.text,
    fontFamily: FONTS.bold,
  },
  headerSpacer: {
    width: 60,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
    fontFamily: FONTS.regular,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    color: COLORS.text,
    fontFamily: FONTS.bold,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    fontFamily: FONTS.regular,
  },
  listContent: {
    padding: 16,
  },
  conversationCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.bgLighter,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  levelBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  levelBadgeText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: FONTS.bold,
  },
  conversationMeta: {
    alignItems: 'flex-end',
  },
  conversationDate: {
    color: COLORS.text,
    fontSize: 14,
    fontFamily: FONTS.semiBold,
  },
  conversationTime: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
    marginTop: 2,
  },
  conversationStats: {
    marginBottom: 12,
  },
  conversationStatsText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.regular,
  },
  messagesContainer: {
    marginTop: 8,
  },
  messageBubble: {
    padding: 12,
    borderRadius: 12,
    marginVertical: 4,
    maxWidth: '85%',
  },
  userMessage: {
    backgroundColor: COLORS.primary,
    alignSelf: 'flex-end',
  },
  aiMessage: {
    backgroundColor: COLORS.bgLight,
    alignSelf: 'flex-start',
  },
  systemMessage: {
    backgroundColor: COLORS.success,
    alignSelf: 'center',
    maxWidth: '90%',
  },
  messageText: {
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONTS.regular,
  },
  messageTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 4,
    textAlign: 'right',
    fontFamily: FONTS.regular,
  },
});