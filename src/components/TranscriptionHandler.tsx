/**
 * TranscriptionHandler Component
 * 
 * Handles all RPC events from the backend:
 * - onMicControl: Enable/disable mic
 * - onAgentSpeaking: Agent speech (streaming)
 * - onInterimTranscript: User interim speech
 * - onFinalTranscript: User final speech
 */

import React, { useEffect, useCallback } from 'react';
import { useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';
import { ConversationMessage } from '../types';

interface TranscriptionHandlerProps {
  onConversationUpdate?: (messages: ConversationMessage[]) => void;
  onMicControlChange?: (enabled: boolean) => void;
  conversation: ConversationMessage[];
  setConversation: React.Dispatch<React.SetStateAction<ConversationMessage[]>>;
  setIsMicEnabled: (enabled: boolean) => void;
  setIsListening: (listening: boolean) => void;
}

export const TranscriptionHandler: React.FC<TranscriptionHandlerProps> = ({
  onConversationUpdate,
  onMicControlChange,
  conversation,
  setConversation,
  setIsMicEnabled,
  setIsListening,
}) => {
  const room = useRoomContext();

  const handleRpcMessage = useCallback((payload: string, method: string) => {
    try {
      const data = JSON.parse(payload);
      console.log(`[RPC] Received ${method}:`, data);

      switch (method) {
        case 'onMicControl': {
          // Backend is commanding mic state change
          const { enabled, reason } = data;
          console.log(`[Mic Control] ${enabled ? '🎤 Enable' : '🔇 Disable'} - Reason: ${reason || 'N/A'}`);
          setIsMicEnabled(enabled);
          onMicControlChange?.(enabled);
          
          // Update listening state when mic is enabled
          if (enabled) {
            setIsListening(true);
          } else {
            setIsListening(false);
          }
          break;
        }

        case 'onAgentSpeaking': {
          // Agent speech - stream continuously, not waiting for end
          const { text, timestamp, type } = data;
          
          if (text && text.trim()) {
            console.log(`[Agent Speech Stream] 📝 "${text.substring(0, 60)}...${text.length > 60 ? '...' : ''}"`);
            
            // Check if we need to create a new agent message or append to existing
            setConversation(prevConversation => {
              const messages = [...prevConversation];
              
              // Find the last agent message that's still being built
              const lastMessage = messages[messages.length - 1];
              
              if (lastMessage && lastMessage.role === 'ai' && !lastMessage.isComplete) {
                // Append to existing incomplete agent message
                lastMessage.text = lastMessage.text + ' ' + text;
                console.log(`[Chat] Appended to agent message, now: "${lastMessage.text.substring(0, 60)}..."`);
              } else {
                // Create new agent message
                const newMessage: ConversationMessage = {
                  id: `agent_${Date.now()}`,
                  role: 'ai',
                  text: text,
                  timestamp: timestamp || new Date().toISOString(),
                  isComplete: false,
                };
                messages.push(newMessage);
                console.log(`[Chat] Created new agent message: "${text.substring(0, 60)}..."`);
              }
              
              onConversationUpdate?.(messages);
              return messages;
            });
          }
          break;
        }

        case 'onInterimTranscript': {
          // User interim transcription (while still speaking)
          const { text, timestamp } = data;
          
          if (text && text.trim()) {
            console.log(`[User Interim] 🎤 "${text.substring(0, 60)}...${text.length > 60 ? '...' : ''}"`);
            
            // Show interim transcription in a temporary message or update existing one
            setConversation(prevConversation => {
              const messages = [...prevConversation];
              
              // Find or create interim message
              let interimMessage = messages.find(msg => msg.role === 'user' && msg.id?.startsWith('interim_'));
              
              if (interimMessage) {
                // Update existing interim
                interimMessage.text = text;
                interimMessage.timestamp = timestamp || new Date().toISOString();
              } else {
                // Create new interim message
                const newMessage: ConversationMessage = {
                  id: `interim_${Date.now()}`,
                  role: 'user',
                  text: text,
                  timestamp: timestamp || new Date().toISOString(),
                  isInterim: true,
                  isComplete: false,
                };
                messages.push(newMessage);
              }
              
              onConversationUpdate?.(messages);
              return messages;
            });
          }
          break;
        }

        case 'onFinalTranscript': {
          // User final transcription (finished speaking)
          const { text, timestamp } = data;
          
          if (text && text.trim()) {
            console.log(`[User Final] ✅ "${text.substring(0, 60)}...${text.length > 60 ? '...' : ''}"`);
            
            setConversation(prevConversation => {
              const messages = [...prevConversation];
              
              // Find and remove any interim message
              const interimIndex = messages.findIndex(msg => msg.id?.startsWith('interim_'));
              if (interimIndex !== -1) {
                messages.splice(interimIndex, 1);
              }
              
              // Add final user message
              const newMessage: ConversationMessage = {
                id: `user_${Date.now()}`,
                role: 'user',
                text: text,
                timestamp: timestamp || new Date().toISOString(),
                isComplete: true,
              };
              messages.push(newMessage);
              console.log(`[Chat] Added final user message: "${text.substring(0, 60)}..."`);
              
              onConversationUpdate?.(messages);
              return messages;
            });
          }
          break;
        }

        case 'onAgentDoneSpeak': {
          // ✅ NEW: Agent finished speaking - mark last agent message as complete
          setConversation(prevConversation => {
            const messages = [...prevConversation];
            const lastMessage = messages[messages.length - 1];
            
            if (lastMessage && lastMessage.role === 'ai') {
              lastMessage.isComplete = true;
              console.log(`[Chat] Marked agent message as complete: "${lastMessage.text.substring(0, 60)}..."`);
            }
            
            onConversationUpdate?.(messages);
            return messages;
          });
          break;
        }

        default:
          console.log(`[RPC] Unknown method: ${method}`, data);
      }
    } catch (error) {
      console.error(`[RPC Error] Failed to parse ${method}:`, error);
    }
  }, [setConversation, setIsMicEnabled, setIsListening, onConversationUpdate, onMicControlChange]);

  // Register RPC listener
  useEffect(() => {
    if (!room) {
      console.warn('[TranscriptionHandler] Room not available');
      return;
    }

    console.log('[TranscriptionHandler] Setting up RPC listeners');

    // Listen for data received on room
    try {
      room.on(RoomEvent.DataReceived, (payload: any) => {
        try {
          if (payload?.topic) {
            // This is structured data
            const data = JSON.parse(new TextDecoder().decode(payload.payload));
            handleRpcMessage(JSON.stringify(data), payload.topic);
          }
        } catch (err) {
          console.debug('[DataReceived] Not RPC data or parse error:', err);
        }
      });
    } catch (err) {
      console.debug('[TranscriptionHandler] Could not set up data handler:', err);
    }

    // CRITICAL: Also listen on local participant for RPC calls directed to it
    // The backend uses perform_rpc which sends to a remote participant
    // We need to listen for messages that come back
    const methods = ['onMicControl', 'onAgentSpeaking', 'onInterimTranscript', 'onFinalTranscript', 'onAgentDoneSpeak'];
    
    // Try to register RPC handlers on local participant
    if (room.localParticipant) {
      methods.forEach(method => {
        try {
          const localParticipant = room.localParticipant;
          (localParticipant as any).on?.(method, (rpcPayload: string) => {
            handleRpcMessage(rpcPayload, method);
          });
        } catch (err) {
          console.debug(`[RPC] Could not register handler for ${method}:`, err);
        }
      });
    }

    return () => {
      // Cleanup: Room event listeners are automatically cleaned up on unmount
    };
  }, [room, handleRpcMessage]);

  return null; // This is a non-visual component
};

export default TranscriptionHandler;
