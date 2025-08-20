import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { eventBus } from './eventBus';
import { fetchAuthSession } from "aws-amplify/auth";


const getAuthToken = async () => {
  try {
    const session = await fetchAuthSession();
    return session.tokens?.accessToken?.toString();
  } catch (error) {
    console.error('Failed to get auth token:', error);
    throw new Error('Authentication required');
  }
};

const BUFFER_DELAY_MS = 5;

export const ChatSessionContext = createContext(null);

export const useChatSession = (sessionId) => {
  // Get the auth session and token
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error('useChatSession must be used within a ChatSessionProvider');
  }
  
  // Initialize session when hook is first used
  useEffect(() => {
    context.initializeSession(sessionId);
  }, [context, sessionId]);

  return context.getSession(sessionId);
};

// Replace the current endpoint constants with:
const API_ENDPOINT = 'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A541020177866%3Aruntime%2Fagent-UUfBGsBktn/invocations?qualifier=DEFAULT';
const TOOLS_ENDPOINT = 'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A541020177866%3Aruntime%2Fagent-UUfBGsBktn/invocations?qualifier=DEFAULT'; 
const SESSION_HISTORY_ENDPOINT = '/invocations';
const SESSION_PREPARE_ENDPOINT = '/invocations';
const SESSION_CLEAR_ENDPOINT = '/invocations'; // For future clear functionality
const PING_ENDPOINT = 'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A541020177866%3Aruntime%2Fagent-UUfBGsBktn/invocations?qualifier=DEFAULT'; 

// Helper functions for interrupt detection
const checkForInterruptInTurn = (turn) => {
  if (!turn || !turn.aiMessage || !Array.isArray(turn.aiMessage)) {
    return null;
  }
  
  return turn.aiMessage.find(message => message.type === 'interrupt');
};

const checkForInterruptInChatTurns = (chatTurns) => {
  if (!chatTurns || chatTurns.length === 0) {
    return null;
  }
  
  const lastTurn = chatTurns[chatTurns.length - 1];
  return checkForInterruptInTurn(lastTurn);
};

export const ChatSessionProvider = ({ children }) => {
  const [sessions, setSessions] = useState(new Map());
  const sessionRefs = useRef(new Map());
  const [loadingStates, setLoadingStates] = useState(new Map());
  const initializedSessions = useRef(new Set());
  const initializingPromises = useRef(new Map());
  const sessionLastAccess = useRef(new Map());
  const cleanupInterval = useRef(null);
  
  // Available tools state - shared across all sessions
  const [availableTools, setAvailableTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState(null);
  const toolsFetched = useRef(false);

  // Configuration
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000; // 30 minutes
  const MAX_SESSIONS = 50; // Maximum sessions to keep in memory
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

  // Event emission for interrupts
  const emitInterruptEvent = useCallback((sessionId, interruptMessage, source = 'unknown') => {
    eventBus.emit(
      'CHAT_INTERRUPT',
      {
        sessionId,
        interruptMessage,
        source, // 'memory' or 'sse'
        timestamp: Date.now()
      },
      sessionId, // targetId is the sessionId
      `interrupt_${sessionId}_${Date.now()}`
    );
  }, []);

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

  // Fetch available tools - called once on mount
  const fetchAvailableTools = useCallback(async (sessionId) => {
    if (toolsFetched.current) return;
    const token = await getAuthToken();
  
    setToolsLoading(true);
    setToolsError(null);
  
    try {
      const response = await fetch(TOOLS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId
        },
        body: JSON.stringify({
          input: {
            type: 'tools'
          }
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tools: ${response.status}`);
      }
      
      const data = await response.json();
      setAvailableTools(data.available_tools || []);
      toolsFetched.current = true;
    } catch (error) {
      console.error('Failed to fetch available tools:', error);
      setToolsError(error.message || 'Failed to load tools');
      setAvailableTools([]);
    } finally {
      setToolsLoading(false);
    }
  }, []);


  const prepareSession = useCallback(async (sessionId, toolPreferences = null, context = null, diagramPath = null) => {
    try {
      const requestBody = {
        input: {
          type: 'prepare'
        }
      };
  
      // Add optional parameters if provided
      if (toolPreferences) {
        requestBody.input.tool_preferences = toolPreferences;
      }
      if (context) {
        requestBody.input.context = context;
      }
      if (diagramPath) {
        requestBody.input.diagram_path = diagramPath;
      }
  
      const response = await fetch(SESSION_PREPARE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
        },
        body: JSON.stringify(requestBody),
      });
  
      if (!response.ok) {
        throw new Error(`Failed to prepare session: ${response.status}`);
      }
      
      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`Failed to prepare session ${sessionId}:`, error);
      throw error;
    }
  }, []);

  const clearSession = useCallback(async (sessionId) => {
    try {
      const response = await fetch(SESSION_CLEAR_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
        },
        body: JSON.stringify({
          input: {
            type: 'clear'
          }
        }),
      });
  
      if (!response.ok) {
        throw new Error(`Failed to clear session: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update local state to reflect cleared session
      updateSession(sessionId, { 
        chatTurns: [], 
        error: null,
        context: { diagram: null, threatModel: null }
      });
      
      return data;
    } catch (error) {
      console.error(`Failed to clear session ${sessionId}:`, error);
      throw error;
    }
  }, [updateSession]);


  // Update last access time for a session
  const updateLastAccess = useCallback((sessionId) => {
    sessionLastAccess.current.set(sessionId, Date.now());
  }, []);

  // Update loading state for a session
  const setSessionLoading = useCallback((sessionId, isLoading) => {
    setLoadingStates(prev => {
      const newStates = new Map(prev);
      if (isLoading) {
        newStates.set(sessionId, true);
      } else {
        newStates.delete(sessionId);
      }
      return newStates;
    });
  }, []);

  // Fetch session history from backend
  const fetchSessionHistory = async (sessionId) => {
    try {
      const response = await fetch(`${SESSION_HISTORY_ENDPOINT}/${sessionId}/history`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch history: ${response.status}`);
      }
      
      const data = await response.json();
      return data.chatTurns || [];
    } catch (error) {
      console.warn(`Failed to fetch session ${sessionId} history:`, error);
      return null;
    }
  };

  // Set session context
  const setSessionContext = useCallback(async (sessionId, context) => {
    // Validate context structure
    if (context && typeof context === 'object') {
      // Allow partial updates - merge with existing context
      setSessions(prev => {
        const newSessions = new Map(prev);
        const session = newSessions.get(sessionId);
        
        if (session) {
          const updatedContext = {
            ...session.context,
            ...context
          };
          newSessions.set(sessionId, {
            ...session,
            context: updatedContext
          });
        }
        else {
        }
        return newSessions;
      });
      
      updateLastAccess(sessionId);
    }
  }, [updateLastAccess]);

  // Clear session context
  const clearSessionContext = useCallback(async (sessionId) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId);
      
      if (session) {
        newSessions.set(sessionId, {
          ...session,
          context: {
            diagram: null,
            threatModel: null
          }
        });
        
        // Async save to backend (fire and forget)
        // saveSessionContext(sessionId, null);
      }
      
      return newSessions;
    });
    
    updateLastAccess(sessionId);
  }, [updateLastAccess]);

  // Get session context
  const getSessionContext = useCallback((sessionId) => {
    const session = sessions.get(sessionId);
    return session?.context || { diagram: null, threatModel: null };
  }, [sessions]);

  // Remove session from memory
  const removeSession = useCallback((sessionId) => {
    setSessions(prev => {
      const newSessions = new Map(prev);
      newSessions.delete(sessionId);
      return newSessions;
    });
    
    setLoadingStates(prev => {
      const newStates = new Map(prev);
      newStates.delete(sessionId);
      return newStates;
    });
    
    // Clean up refs
    const refs = sessionRefs.current.get(sessionId);
    if (refs) {
      if (refs.eventSource) {
        refs.eventSource.close();
      }
      if (refs.bufferTimeout) {
        clearTimeout(refs.bufferTimeout);
      }
      sessionRefs.current.delete(sessionId);
    }
    
    // Clean up tracking
    initializedSessions.current.delete(sessionId);
    sessionLastAccess.current.delete(sessionId);
    initializingPromises.current.delete(sessionId);
    
    console.log(`Session ${sessionId} removed from memory`);
  }, []);

  // Clean up old/unused sessions
  const cleanupOldSessions = useCallback(() => {
    const now = Date.now();
    const sessionsToRemove = [];
    
    // Find sessions that haven't been accessed recently
    sessionLastAccess.current.forEach((lastAccess, sessionId) => {
      if (now - lastAccess > SESSION_TIMEOUT_MS) {
        // Don't remove if currently streaming
        const session = sessions.get(sessionId);
        if (!session?.isStreaming) {
          sessionsToRemove.push(sessionId);
        }
      }
    });
    
    // If we have too many sessions, remove the oldest ones
    if (sessions.size > MAX_SESSIONS) {
      const sortedSessions = Array.from(sessionLastAccess.current.entries())
        .sort((a, b) => a[1] - b[1]) // Sort by last access time
        .slice(0, sessions.size - MAX_SESSIONS)
        .map(entry => entry[0]);
      
      sessionsToRemove.push(...sortedSessions);
    }
    
    // Remove duplicate session IDs
    const uniqueSessionsToRemove = [...new Set(sessionsToRemove)];
    
    if (uniqueSessionsToRemove.length > 0) {
      console.log(`Cleaning up ${uniqueSessionsToRemove.length} old sessions:`, uniqueSessionsToRemove);
      uniqueSessionsToRemove.forEach(removeSession);
    }
  }, [sessions, removeSession]);

  // Initialize session with backend check
  const initializeSession = useCallback(async (sessionId, forceCheck = false) => {
    // Prevent duplicate initialization requests
    if (!forceCheck && initializingPromises.current.has(sessionId)) {
      return initializingPromises.current.get(sessionId);
    }

    if (!toolsFetched.current) {
      await fetchAvailableTools(sessionId);
    }
  

    // Check if already initialized in this app lifecycle
    if (!forceCheck && initializedSessions.current.has(sessionId)) {
      return;
    }

    // Check if session already exists in state with data
    setSessions(currentSessions => {
      const existingSession = currentSessions.get(sessionId);
      if (!forceCheck && existingSession && existingSession.chatTurns.length > 0) {
        initializedSessions.current.add(sessionId);
        return currentSessions;
      }
      return currentSessions;
    });

    // If already marked as initialized, return
    if (!forceCheck && initializedSessions.current.has(sessionId)) {
      return;
    }

    // Create initialization promise
    const initPromise = (async () => {
      try {
        // Set loading state
        setSessionLoading(sessionId, true);

        // Fetch session history and context in parallel
        const [chatTurns, context] = await Promise.all([
          fetchSessionHistory(sessionId),
        ]);
        
        if (chatTurns !== null) {
          // Successfully fetched history
          setSessions(prev => {
            const newSessions = new Map(prev);
            newSessions.set(sessionId, {
              id: sessionId,
              chatTurns: chatTurns,
              isStreaming: false,
              error: null,
              restoredFromBackend: true,
              context: { diagram: null, threatModel: null },
            });
            return newSessions;
          });

          // Check for interrupt in the loaded chat turns (only if it's the last item)
          const interruptMessage = checkForInterruptInChatTurns(chatTurns);
          if (interruptMessage) {
            console.log(`Interrupt found in session ${sessionId} loaded from memory:`, interruptMessage);
            emitInterruptEvent(sessionId, interruptMessage, 'memory');
          }
          
          // Initialize refs for this session
          if (!sessionRefs.current.has(sessionId)) {
            sessionRefs.current.set(sessionId, {
              eventSource: null,
              buffer: [],
              bufferTimeout: null,
            });
          }
          
          initializedSessions.current.add(sessionId);
          updateLastAccess(sessionId);
          setSessionLoading(sessionId, false);
          return;
        }

        // Fallback: Create new session if backend check fails or session doesn't exist
        setSessions(prev => {
          const existingSession = prev.get(sessionId);
          if (existingSession && existingSession.chatTurns.length > 0) {
            return prev; // Don't overwrite existing session with data
          }
          
          const newSession = {
            id: sessionId,
            chatTurns: [],
            isStreaming: false,
            error: null,
            restoredFromBackend: false,
            context: { diagram: null, threatModel: null },
          };
          
          const newSessions = new Map(prev);
          newSessions.set(sessionId, newSession);
          return newSessions;
        });

        // Initialize refs for this session
        if (!sessionRefs.current.has(sessionId)) {
          sessionRefs.current.set(sessionId, {
            eventSource: null,
            buffer: [],
            bufferTimeout: null,
          });
        }
        
        initializedSessions.current.add(sessionId);
        updateLastAccess(sessionId);
        setSessionLoading(sessionId, false);

      } catch (error) {
        console.error(`Error initializing session ${sessionId}:`, error);
        setSessionLoading(sessionId, false);
        
        // Create fallback session on error
        setSessions(prev => {
          if (prev.has(sessionId)) return prev;
          
          const newSessions = new Map(prev);
          newSessions.set(sessionId, {
            id: sessionId,
            chatTurns: [],
            isStreaming: false,
            error: null,
            restoredFromBackend: false,
            context: { diagram: null, threatModel: null },
          });
          return newSessions;
        });
        
        initializedSessions.current.add(sessionId);
        updateLastAccess(sessionId);
      } finally {
        // Clean up the promise reference
        initializingPromises.current.delete(sessionId);
      }
    })();

    // Store the promise to prevent duplicate requests
    initializingPromises.current.set(sessionId, initPromise);
    
    return initPromise;
  }, [setSessionLoading, updateLastAccess, emitInterruptEvent]);

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
  
    updateLastAccess(sessionId);
    const currentSession = await sessions.get(sessionId);
    if (!currentSession) {
      console.warn(`Session ${sessionId} not ready yet`);
      return;
    }
  
    if (currentSession.isStreaming) return;
  
    cleanupSSE(sessionId);

      // FIX: Generate a unique turn ID
  const turnId = `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  // Or you could use: const turnId = crypto.randomUUID();
  
    const newTurn = {
      id: turnId,
      userMessage: userMessage,
      aiMessage: []
    };
  
    setSessions(prev => {
      const newSessions = new Map(prev);
      const session = newSessions.get(sessionId);
      
      if (!session) {
        console.warn(`Session ${sessionId} not found when sending message`);
        return prev;
      }
      
      newSessions.set(sessionId, {
        ...session,
        chatTurns: [...session.chatTurns, newTurn],
        isStreaming: true,
        error: null
      });
      
      return newSessions;
    });
  
    try {
      const requestBody = {
        input: {
          prompt: userMessage
        }
      };
      const token = await getAuthToken();
      
      const response = await fetch(API_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
        },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Request failed (${response.status}): ${errorText || 'Unknown error'}`);
      }
      
      // Handle streaming response from backend
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'interrupt') {
                console.log(`Interrupt received for session ${sessionId}:`, data);
                emitInterruptEvent(sessionId, data, 'sse');
                addAiMessage(sessionId, data);
                cleanupSSE(sessionId);
                return;
              }
              
              if (data.end) {
                addAiMessage(sessionId, data);
                cleanupSSE(sessionId);
                return;
              }
              
              addAiMessage(sessionId, data);
            } catch (err) {
              console.error('Error parsing streaming response:', err);
            }
          }
        }
      }
      
    } catch (err) {
      console.error('Error sending message:', err);
      updateSession(sessionId, { 
        error: err.message || 'Failed to send message. Please try again.' 
      });
      cleanupSSE(sessionId);
    }
  }, [updateLastAccess, cleanupSSE, addAiMessage, updateSession, emitInterruptEvent, sessions]);
  // Session-specific clear chat
  const clearChat = useCallback((sessionId) => {
    cleanupSSE(sessionId);
    updateSession(sessionId, { 
      chatTurns: [], 
      error: null
    });
    
    const refs = getSessionRefs(sessionId);
    refs.buffer = [];
  }, [cleanupSSE, updateSession, getSessionRefs]);

  // Session-specific stop streaming
  const stopStreaming = useCallback((sessionId) => {
    cleanupSSE(sessionId);
  }, [cleanupSSE]);

  // Refresh session from backend
  const refreshSession = useCallback(async (sessionId) => {
    // Clear the initialized flag to force re-initialization
    initializedSessions.current.delete(sessionId);
    await initializeSession(sessionId, true);
  }, [initializeSession]);

  // Add method to manually flush all sessions
  const flushAllSessions = useCallback(() => {
    console.log(`Flushing all ${sessions.size} sessions from memory`);
    Array.from(sessions.keys()).forEach(removeSession);
  }, [sessions, removeSession]);

  // Handle auth changes - expose this method for auth system to call
  const handleAuthChange = useCallback((newUser = null, oldUser = null) => {
    // Flush all sessions when user logs out or switches accounts
    if (!newUser || (oldUser && newUser?.id !== oldUser?.id)) {
      console.log('User auth changed, flushing all sessions');
      flushAllSessions();
    }
  }, [flushAllSessions]);

  // Get session interface
  const getSession = useCallback((sessionId) => {
    updateLastAccess(sessionId); // Track access
    
    const session = sessions.get(sessionId) || {
      id: sessionId,
      chatTurns: [],
      isStreaming: false,
      error: null,
      context: { diagram: null, threatModel: null },
    };
    
    const isLoading = loadingStates.get(sessionId) || false;
    
    return {
      ...session,
      isLoading,
      availableTools,
      sendMessage: (message) => sendMessage(sessionId, message),
      clearChat: () => clearChat(sessionId),
      stopStreaming: () => stopStreaming(sessionId),
      dismissError: () => dismissError(sessionId),
      refreshSession: () => refreshSession(sessionId),
      removeSession: () => removeSession(sessionId), // Allow manual removal
      setContext: (context) => setSessionContext(sessionId, context), // New: Set context
      getContext: () => getSessionContext(sessionId), // New: Get context  
      clearContext: () => clearSessionContext(sessionId), // New: Clear context
    };
  }, [sessions, loadingStates, updateLastAccess, clearChat, stopStreaming, dismissError, refreshSession, removeSession, setSessionContext, getSessionContext, clearSessionContext, availableTools]);


  // Start cleanup interval
  useEffect(() => {
    cleanupInterval.current = setInterval(cleanupOldSessions, CLEANUP_INTERVAL_MS);
    
    return () => {
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
      }
    };
  }, [cleanupOldSessions]);

  // Auto-flush on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      console.log('Page unloading, flushing all sessions');
      flushAllSessions();
    };

    const handleUnload = () => {
      flushAllSessions();
    };

    // Add event listeners
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [flushAllSessions]);

  // Enhanced cleanup on unmount (component unmount)
  useEffect(() => {
    return () => {
      console.log('ChatSessionProvider unmounting, flushing all sessions');
      
      // Stop cleanup interval
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
      }
      
      // Clean up all sessions
      sessionRefs.current.forEach((refs) => {
        if (refs.eventSource) {
          refs.eventSource.close();
        }
        if (refs.bufferTimeout) {
          clearTimeout(refs.bufferTimeout);
        }
      });
      
      // Clear all maps and sets
      sessionRefs.current.clear();
      initializedSessions.current.clear();
      initializingPromises.current.clear();
      sessionLastAccess.current.clear();
    };
  }, []);

  // MEMOIZE the context value
  const value = useMemo(() => ({
    getSession,
    initializeSession,
    prepareSession, // Add prepare functionality
    sessions: Array.from(sessions.values()),
    flushAllSessions,
    handleAuthChange,
    availableTools,
    toolsLoading,
    toolsError,
  }), [getSession, initializeSession, prepareSession, sessions, flushAllSessions, handleAuthChange, availableTools, toolsLoading, toolsError]);

  return <ChatSessionContext.Provider value={value}>{children}</ChatSessionContext.Provider>;
};

// Export a hook specifically for accessing tools
export const useAvailableTools = () => {
  const context = useContext(ChatSessionContext);
  if (!context) {
    throw new Error('useAvailableTools must be used within a ChatSessionProvider');
  }
  
  return {
    tools: context.availableTools,
    loading: context.toolsLoading,
    error: context.toolsError,
  };
};