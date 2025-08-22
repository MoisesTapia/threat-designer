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

const BUFFER_DELAY_MS = 20;

// Split contexts
export const ChatSessionFunctionsContext = createContext(null);
export const ChatSessionDataContext = createContext(null);

// Replace the current endpoint constants
const API_ENDPOINT = 'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A541020177866%3Aruntime%2Fagent-UUfBGsBktn/invocations?qualifier=DEFAULT';
const TOOLS_ENDPOINT = 'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A541020177866%3Aruntime%2Fagent-UUfBGsBktn/invocations?qualifier=DEFAULT'; 
const SESSION_HISTORY_ENDPOINT = 'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A541020177866%3Aruntime%2Fagent-UUfBGsBktn/invocations?qualifier=DEFAULT'; 
const SESSION_PREPARE_ENDPOINT = 'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A541020177866%3Aruntime%2Fagent-UUfBGsBktn/invocations?qualifier=DEFAULT';
const SESSION_CLEAR_ENDPOINT = '/invocations';
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
  const [loadingStates, setLoadingStates] = useState(new Map());
  const [availableTools, setAvailableTools] = useState([]);
  const [toolsLoading, setToolsLoading] = useState(true);
  const [toolsError, setToolsError] = useState(null);
  
  // Refs for stable data
  const sessionsRef = useRef(new Map());
  const sessionRefs = useRef(new Map());
  const initializedSessions = useRef(new Set());
  const initializingPromises = useRef(new Map());
  const sessionLastAccess = useRef(new Map());
  const cleanupInterval = useRef(null);
  const toolsFetched = useRef(false);

  // Configuration
  const SESSION_TIMEOUT_MS = 60 * 60 * 1000;
  const MAX_SESSIONS = 50;
  const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

  // Update sessionsRef whenever sessions state changes
  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  // Create stable functions that don't depend on state directly
  const stableFunctions = useMemo(() => {
    // Event emission for interrupts
    const emitInterruptEvent = (sessionId, interruptMessage, source = 'unknown') => {
      eventBus.emit(
        'CHAT_INTERRUPT',
        {
          sessionId,
          interruptMessage,
          source,
          timestamp: Date.now()
        },
        sessionId,
        `interrupt_${sessionId}_${Date.now()}`
      );
    };

    // Update session using callback pattern
    const updateSession = (sessionId, updates) => {
      setSessions(prev => {
        const newSessions = new Map(prev);
        const currentSession = newSessions.get(sessionId);
        if (currentSession) {
          newSessions.set(sessionId, { ...currentSession, ...updates });
        }
        return newSessions;
      });
    };

    // Fetch available tools
    const fetchAvailableTools = async (sessionId) => {
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
    };

    // Prepare session
    const prepareSession = async (sessionId, toolPreferences = null, context = null, diagramPath = null, thinking = 0) => {
      try {
        const token = await getAuthToken();

        const requestBody = {
          input: {
            type: 'prepare',
            budget_level: thinking
          }
        };
    
        if (toolPreferences) {
          requestBody.input.tool_preferences = toolPreferences;
        }
        if (context) {
          requestBody.input.context = context;
        }
        if (diagramPath) {
          requestBody.input.diagram = diagramPath;
        }
    
        const response = await fetch(SESSION_PREPARE_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
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
    };

    // Clear session
    const clearSession = async (sessionId) => {
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
    };

    // Update last access time
    const updateLastAccess = (sessionId) => {
      sessionLastAccess.current.set(sessionId, Date.now());
    };

    // Set loading state
    const setSessionLoading = (sessionId, isLoading) => {
      setLoadingStates(prev => {
        const newStates = new Map(prev);
        if (isLoading) {
          newStates.set(sessionId, true);
        } else {
          newStates.delete(sessionId);
        }
        return newStates;
      });
    };

    // Fetch session history
    const fetchSessionHistory = async (sessionId) => {
      try {

        let requestBody = {
          input: {
            type: "history"
          }
        };

        const token = await getAuthToken();
        
        const response = await fetch(SESSION_HISTORY_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id': sessionId,
          },
          body: JSON.stringify(requestBody),
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch history: ${response.status}`);
        }
        
        const data = await response.json();
        return data || [];
      } catch (error) {
        console.warn(`Failed to fetch session ${sessionId} history:`, error);
        return null;
      }
    };

    // Set session context
    const setSessionContext = async (sessionId, context) => {
      if (context && typeof context === 'object') {
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
          return newSessions;
        });
        
        updateLastAccess(sessionId);
      }
    };

    // Clear session context
    const clearSessionContext = async (sessionId) => {
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
        }
        
        return newSessions;
      });
      
      updateLastAccess(sessionId);
    };

    // Get session context (uses ref)
    const getSessionContext = (sessionId) => {
      const session = sessionsRef.current.get(sessionId);
      return session?.context || { diagram: null, threatModel: null };
    };

    // Remove session
    const removeSession = (sessionId) => {
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
      
      initializedSessions.current.delete(sessionId);
      sessionLastAccess.current.delete(sessionId);
      initializingPromises.current.delete(sessionId);
      
      console.log(`Session ${sessionId} removed from memory`);
    };

    // Clean up old sessions
    const cleanupOldSessions = () => {
      const now = Date.now();
      const sessionsToRemove = [];
      
      sessionLastAccess.current.forEach((lastAccess, sessionId) => {
        if (now - lastAccess > SESSION_TIMEOUT_MS) {
          const session = sessionsRef.current.get(sessionId);
          if (!session?.isStreaming) {
            sessionsToRemove.push(sessionId);
          }
        }
      });
      
      if (sessionsRef.current.size > MAX_SESSIONS) {
        const sortedSessions = Array.from(sessionLastAccess.current.entries())
          .sort((a, b) => a[1] - b[1])
          .slice(0, sessionsRef.current.size - MAX_SESSIONS)
          .map(entry => entry[0]);
        
        sessionsToRemove.push(...sortedSessions);
      }
      
      const uniqueSessionsToRemove = [...new Set(sessionsToRemove)];
      
      if (uniqueSessionsToRemove.length > 0) {
        console.log(`Cleaning up ${uniqueSessionsToRemove.length} old sessions:`, uniqueSessionsToRemove);
        uniqueSessionsToRemove.forEach(removeSession);
      }
    };

    // Initialize session
    const initializeSession = async (sessionId, forceCheck = false) => {
      if (!forceCheck && initializingPromises.current.has(sessionId)) {
        return initializingPromises.current.get(sessionId);
      }

      if (!toolsFetched.current) {
        await fetchAvailableTools(sessionId);
      }

      if (!forceCheck && initializedSessions.current.has(sessionId)) {
        return;
      }

      const existingSession = sessionsRef.current.get(sessionId);
      if (!forceCheck && existingSession && existingSession.chatTurns.length > 0) {
        initializedSessions.current.add(sessionId);
        return;
      }

      const initPromise = (async () => {
        try {
          setSessionLoading(sessionId, true);

          const chatTurns = await fetchSessionHistory(sessionId);
          
          if (chatTurns !== null) {
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

            const interruptMessage = checkForInterruptInChatTurns(chatTurns);
            if (interruptMessage) {
              console.log(`Interrupt found in session ${sessionId} loaded from memory:`, interruptMessage);
              emitInterruptEvent(sessionId, interruptMessage, 'memory');
            }
            
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

          setSessions(prev => {
            const existingSession = prev.get(sessionId);
            if (existingSession && existingSession.chatTurns.length > 0) {
              return prev;
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
          initializingPromises.current.delete(sessionId);
        }
      })();

      initializingPromises.current.set(sessionId, initPromise);
      
      return initPromise;
    };

    // Get session refs
    const getSessionRefs = (sessionId) => {
      if (!sessionRefs.current.has(sessionId)) {
        sessionRefs.current.set(sessionId, {
          eventSource: null,
          buffer: [],
          bufferTimeout: null,
        });
      }
      return sessionRefs.current.get(sessionId);
    };

    // Dismiss error
    const dismissError = (sessionId) => {
      updateSession(sessionId, { error: null });
    };

    // Flush buffer
    const flushBuffer = (sessionId) => {
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
    };

    // Add AI message
// Add AI message - FIXED VERSION
  const addAiMessage = (sessionId, message) => {
    const refs = getSessionRefs(sessionId);
    
    // Buffer ALL message types to maintain order
    refs.buffer = refs.buffer || [];
    refs.buffer.push(message);
    
    if (refs.bufferTimeout) {
      clearTimeout(refs.bufferTimeout);
    }
    
    // For non-text messages, use a much shorter delay to maintain responsiveness
    // but still preserve order
    const messageType = message.type || 'text';
    const delay = (messageType === 'text' || messageType === 'think') ? BUFFER_DELAY_MS : 5; // 5ms for tools/other types
    
    refs.bufferTimeout = setTimeout(() => {
      flushBuffer(sessionId);
    }, delay);
  };

    // Cleanup SSE
    const cleanupSSE = (sessionId) => {
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
    };

    // Send message
    const sendMessage = async (sessionId, userMessage, interrupt = false, interruptResponse = null) => {
      if (!userMessage.trim()) {
        return;
      }
    
      updateLastAccess(sessionId);
      const currentSession = sessionsRef.current.get(sessionId);
      if (!currentSession) {
        console.warn(`Session ${sessionId} not ready yet`);
        return;
      }
    
      // Only block regular messages if streaming, allow interrupts to proceed
      if (!interrupt && currentSession.isStreaming) return;
    
      // For regular messages (not interrupts), clean up SSE and update session state
      if (!interrupt) {
        cleanupSSE(sessionId);
    
        const turnId = `turn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
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
      }
    
      try {
        let requestBody;
        
        if (interrupt && interruptResponse) {
          // Interrupt response payload
          requestBody = {
            input: {
              prompt: interruptResponse,
              type: "resume_interrupt"
            }
          };
        } else {
          // Regular message payload
          requestBody = {
            input: {
              prompt: userMessage
            }
          };
        }
        
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
                  console.log(`Interrupt received for session ${sessionId}:`, data.content);
                  emitInterruptEvent(sessionId, data, 'sse');
                  return;
                }
                
                if (data.end) {
                  // Always handle normally regardless of interrupt flag
                  addAiMessage(sessionId, data);
                  cleanupSSE(sessionId);
                  return;
                }
                
                // Always handle normally regardless of interrupt flag
                addAiMessage(sessionId, data);
              } catch (err) {
                console.error('Error parsing streaming response:', err);
              }
            }
          }
        }
        
      } catch (err) {
        console.error('Error sending message:', err);
        // Only update session error for regular messages, not interrupts
        if (!interrupt) {
          updateSession(sessionId, { 
            error: err.message || 'Failed to send message. Please try again.' 
          });
          cleanupSSE(sessionId);
        }
      }
    };
    

    // Clear chat
    const clearChat = (sessionId) => {
      cleanupSSE(sessionId);
      updateSession(sessionId, { 
        chatTurns: [], 
        error: null
      });
      
      const refs = getSessionRefs(sessionId);
      refs.buffer = [];
    };

    // Stop streaming
    const stopStreaming = (sessionId) => {
      cleanupSSE(sessionId);
    };

    // Refresh session
    const refreshSession = async (sessionId) => {
      initializedSessions.current.delete(sessionId);
      await initializeSession(sessionId, true);
    };

    // Flush all sessions
    const flushAllSessions = () => {
      console.log(`Flushing all ${sessionsRef.current.size} sessions from memory`);
      Array.from(sessionsRef.current.keys()).forEach(removeSession);
    };

    // Handle auth change
    const handleAuthChange = (newUser = null, oldUser = null) => {
      if (!newUser || (oldUser && newUser?.id !== oldUser?.id)) {
        console.log('User auth changed, flushing all sessions');
        flushAllSessions();
      }
    };

    return {
      initializeSession,
      prepareSession,
      clearSession,
      setSessionContext,
      clearSessionContext,
      getSessionContext,
      sendMessage,
      clearChat,
      stopStreaming,
      dismissError,
      refreshSession,
      removeSession,
      flushAllSessions,
      handleAuthChange,
      cleanupOldSessions,
      updateLastAccess,
    };
  }, []); // Empty deps - these functions never change

  // Start cleanup interval
  useEffect(() => {
    cleanupInterval.current = setInterval(stableFunctions.cleanupOldSessions, CLEANUP_INTERVAL_MS);
    
    return () => {
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
      }
    };
  }, [stableFunctions]);

  // Auto-flush on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = (event) => {
      console.log('Page unloading, flushing all sessions');
      stableFunctions.flushAllSessions();
    };

    const handleUnload = () => {
      stableFunctions.flushAllSessions();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
    };
  }, [stableFunctions]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log('ChatSessionProvider unmounting, flushing all sessions');
      
      if (cleanupInterval.current) {
        clearInterval(cleanupInterval.current);
      }
      
      sessionRefs.current.forEach((refs) => {
        if (refs.eventSource) {
          refs.eventSource.close();
        }
        if (refs.bufferTimeout) {
          clearTimeout(refs.bufferTimeout);
        }
      });
      
      sessionRefs.current.clear();
      initializedSessions.current.clear();
      initializingPromises.current.clear();
      sessionLastAccess.current.clear();
    };
  }, []);

  // Combine functions with tools data
  const functionsValue = useMemo(() => ({
    ...stableFunctions,
    availableTools,
    toolsLoading,
    toolsError,
  }), [stableFunctions, availableTools, toolsLoading, toolsError]);

  // Data value includes sessions and loading states
  const dataValue = useMemo(() => ({
    sessions,
    loadingStates,
  }), [sessions, loadingStates]);

  return (
    <ChatSessionFunctionsContext.Provider value={functionsValue}>
      <ChatSessionDataContext.Provider value={dataValue}>
        {children}
      </ChatSessionDataContext.Provider>
    </ChatSessionFunctionsContext.Provider>
  );
};

// Export a hook specifically for accessing tools
export const useAvailableTools = () => {
  const context = useContext(ChatSessionFunctionsContext);
  if (!context) {
    throw new Error('useAvailableTools must be used within a ChatSessionProvider');
  }
  
  return {
    tools: context.availableTools,
    loading: context.toolsLoading,
    error: context.toolsError,
  };
};