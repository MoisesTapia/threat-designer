import { useContext, useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { ChatSessionContext } from './ChatContext';

export const useSessionInitializer = (sessionId) => {
  const context = useContext(ChatSessionContext);
  const initializationRef = useRef(false);
  const [isInitialized, setIsInitialized] = useState(false);
  
  if (!context) {
    throw new Error('useSessionInitializer must be used within a ChatSessionProvider');
  }
  
  // Auto-initialize session once on mount
  useEffect(() => {
    const initializeSessionOnMount = async () => {
      if (!sessionId || initializationRef.current) return;
      
      try {
        initializationRef.current = true;
        await context.initializeSession(sessionId);
        setIsInitialized(true);
        console.log(`Session ${sessionId} initialized on component mount`);
      } catch (error) {
        console.error(`Failed to initialize session ${sessionId} on mount:`, error);
        initializationRef.current = false; // Reset on error to allow retry
        setIsInitialized(false);
      }
    };

    initializeSessionOnMount();
  }, [context, sessionId]); // Only runs when sessionId changes

  // Memoize the updateSessionContext function
  const updateSessionContext = useCallback(async (targetSessionId, contextData) => {
    try {
      // Ensure session is initialized first
      if (!isInitialized || targetSessionId !== sessionId) {
        console.log(`Waiting for session ${targetSessionId} to initialize...`);
        await context.initializeSession(targetSessionId);
      }
      
      const session = context.getSession(targetSessionId);
      await session.setContext(contextData);
      return session;
    } catch (error) {
      console.error(`Failed to update context for session ${targetSessionId}:`, error);
      throw error;
    }
  }, [context, isInitialized, sessionId]); // Include dependencies
  
  // Memoize the returned object
  return useMemo(() => ({
    updateSessionContext,
    isInitialized, // Expose initialization state
  }), [updateSessionContext, isInitialized]);
};