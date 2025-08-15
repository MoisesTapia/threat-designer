import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';

const ChatSessionContext = createContext(null);

export const useChatSession = (sessionId) => {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error('useChatSession must be used within a ChatSessionProvider');
  }
  return context.getSession(sessionId);
};

const BUFFER_DELAY_MS = 100;
const API_ENDPOINT = '/api/chat';

export const ChatSessionProvider = ({ children }) => {
  const [sessions, setSessions] = useState(new Map());
  const sessionRefs = useRef(new Map());


  // Initialize session if it doesn't exist - REMOVED sessions dependency
  const initializeSession = useCallback((sessionId) => {
    setSessions(prev => {
      if (prev.has(sessionId)) {
        return prev; // No change needed
      }
      
      const newSession = {
        id: sessionId,
        chatTurns: [],
        isStreaming: false,
        error: null,
      };
      
      // Initialize refs for this session
      if (!sessionRefs.current.has(sessionId)) {
        sessionRefs.current.set(sessionId, {
          eventSource: null,
          buffer: [],
          bufferTimeout: null,
        });
      }
      
      return new Map(prev).set(sessionId, newSession);
    });
  }, []); // No dependencies needed

  // Get session-specific refs
  const getSessionRefs = useCallback((sessionId) => {
    if (!sessionRefs.current.has(sessionId)) {
      sessionRefs.current.set(sessionId, {
        eventSource: null,
        buffer: [],
        bufferTimeout: null,
      });
    }
    return sessionRefs.current.get(sessionId);
  }, []);

  // Update specific session
  const updateSession = useCallback((sessionId, updates) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      const currentSession = newSessions.get(sessionId);
      if (currentSession) {
        newSessions.set(sessionId, { ...currentSession, ...updates });
      }
      return newSessions;
    });
  }, []);


  // Dismiss error for a specific session
  const dismissError = useCallback((sessionId) => {
    updateSession(sessionId, { error: null });
  }, [updateSession]);

  // Session-specific buffer management
  const flushBuffer = useCallback((sessionId) => {
    const refs = getSessionRefs(sessionId);
    if (!refs.buffer || refs.buffer.length === 0) return;
    
    const bufferedMessages = [...refs.buffer];
    refs.buffer = [];
    
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId);
      if (session && session.chatTurns.length > 0) {
        const updatedTurns = [...session.chatTurns];
        const lastTurnIndex = updatedTurns.length - 1;
        updatedTurns[lastTurnIndex] = {
          ...updatedTurns[lastTurnIndex],
          aiMessage: [...updatedTurns[lastTurnIndex].aiMessage, ...bufferedMessages]
        };
        newSessions.set(sessionId, { ...session, chatTurns: updatedTurns });
      }
      return newSessions;
    });
  }, [getSessionRefs]);

  // Session-specific message adding
  const addAiMessage = useCallback((sessionId, message) => {
    const refs = getSessionRefs(sessionId);
    const messageType = message.type || 'text';
    
    if (messageType === 'text' || messageType === 'think') {
      refs.buffer = refs.buffer || [];
      refs.buffer.push(message);
      
      if (refs.bufferTimeout) {
        clearTimeout(refs.bufferTimeout);
      }
      
      refs.bufferTimeout = setTimeout(() => {
        flushBuffer(sessionId);
      }, BUFFER_DELAY_MS);
    } else {
      setSessions(prev => {
        const newSessions = new Map(prev);
        const session = newSessions.get(sessionId);
        if (session && session.chatTurns.length > 0) {
          const updatedTurns = [...session.chatTurns];
          const lastTurnIndex = updatedTurns.length - 1;
          updatedTurns[lastTurnIndex] = {
            ...updatedTurns[lastTurnIndex],
            aiMessage: [...updatedTurns[lastTurnIndex].aiMessage, message]
          };
          newSessions.set(sessionId, { ...session, chatTurns: updatedTurns });
        }
        return newSessions;
      });
    }
  }, [getSessionRefs, flushBuffer]);

  // Session-specific cleanup
  const cleanupSSE = useCallback((sessionId) => {
    const refs = getSessionRefs(sessionId);
    
    if (refs.eventSource) {
      refs.eventSource.close();
      refs.eventSource = null;
    }
    
    if (refs.bufferTimeout) {
      clearTimeout(refs.bufferTimeout);
      flushBuffer(sessionId);
    }
    
    updateSession(sessionId, { isStreaming: false });
  }, [getSessionRefs, flushBuffer, updateSession]);

  // Session-specific send message
  const sendMessage = useCallback(async (sessionId, userMessage) => {
    if (!userMessage.trim()) return;
    
    // Initialize session if needed
    initializeSession(sessionId);
    
    // Get current session state
    const currentSession = sessions.get(sessionId);
    if (currentSession?.isStreaming) return;
    
    cleanupSSE(sessionId);
    
    const turnId = Date.now();
    const newTurn = {
      id: turnId,
      userMessage: userMessage,
      aiMessage: []
    };
    
    // Update session with new turn and clear any existing errors
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId) || {
        id: sessionId,
        chatTurns: [],
        isStreaming: false,
        error: null,
      };
      
      newSessions.set(sessionId, {
        ...session,
        chatTurns: [...session.chatTurns, newTurn],
        isStreaming: true,
        error: null // Clear error when sending new message
      });
      
      return newSessions;
    });
    
    try {
      const requestBody = {
        message: userMessage,
        history: currentSession ? currentSession.chatTurns.map(turn => ({
          user: turn.userMessage,
          assistant: turn.aiMessage
        })) : []
      };
      
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-id': sessionId,
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed (${response.status}): ${errorText || 'Unknown error'}`);
      }
      
      const { streamUrl } = await response.json();
      const eventSource = new EventSource(streamUrl || `${API_ENDPOINT}/stream`);
      
      const refs = getSessionRefs(sessionId);
      refs.eventSource = eventSource;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.done) {
            cleanupSSE(sessionId);
            return;
          }
          
          if (data.error) {
            updateSession(sessionId, { error: data.error });
            cleanupSSE(sessionId);
            return;
          }
          
          addAiMessage(sessionId, data);
        } catch (err) {
          console.error('Error parsing SSE message:', err);
          updateSession(sessionId, { error: 'Failed to parse server response' });
        }
      };
      
      eventSource.onerror = (err) => {
        console.error('SSE error:', err);
        updateSession(sessionId, { 
          error: 'Connection lost. Please check your internet connection and try again.' 
        });
        cleanupSSE(sessionId);
      };
      
    } catch (err) {
      console.error('Error sending message:', err);
      updateSession(sessionId, { 
        error: err.message || 'Failed to send message. Please try again.' 
      });
      cleanupSSE(sessionId);
    }
  }, [sessions, initializeSession, cleanupSSE, getSessionRefs, addAiMessage, updateSession]);

  // Session-specific clear chat
  const clearChat = useCallback((sessionId) => {
    cleanupSSE(sessionId);
    updateSession(sessionId, { 
      chatTurns: [], 
      error: null // Clear error when clearing chat
    });
    
    const refs = getSessionRefs(sessionId);
    refs.buffer = [];
  }, [cleanupSSE, updateSession, getSessionRefs]);

  // Session-specific stop streaming
  const stopStreaming = useCallback((sessionId) => {
    cleanupSSE(sessionId);
  }, [cleanupSSE]);

  // Get session interface - MEMOIZED
  const getSession = useCallback((sessionId) => {
    // Don't initialize here - let sendMessage handle it
    const session = sessions.get(sessionId) || {
      id: sessionId,
      chatTurns: [],
      isStreaming: false,
      error: null,
    };
    
    return {
      ...session,
      sendMessage: (message) => sendMessage(sessionId, message),
      clearChat: () => clearChat(sessionId),
      stopStreaming: () => stopStreaming(sessionId),
      dismissError: () => dismissError(sessionId), // Add dismiss error function
    };
  }, [sessions, sendMessage, clearChat, stopStreaming, dismissError]);

  // Cleanup all sessions on unmount
  useEffect(() => {
    return () => {
      sessionRefs.current.forEach((refs, sessionId) => {
        if (refs.eventSource) {
          refs.eventSource.close();
        }
        if (refs.bufferTimeout) {
          clearTimeout(refs.bufferTimeout);
        }
      });
    };
  }, []);

  // MEMOIZE the context value
  const value = useMemo(() => ({
    getSession,
    sessions: Array.from(sessions.values()),
  }), [getSession, sessions]);

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
};