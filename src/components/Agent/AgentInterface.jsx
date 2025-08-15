import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import SupportPromptGroup from "@cloudscape-design/chat-components/support-prompt-group";
import { Spinner } from '@cloudscape-design/components';
import ScrollToBottomButton from './ScrollToBottomButton';
import { useScrollToBottom } from "./useScrollToBottom";
import ChatContent from './ChatContent';
import AgentLogo from './AgentLogo';
import ErrorContent from './ErrorContent';
import "./styles.css";
import { useLocation } from 'react-router-dom';
import ChatInput from "./ChatInput";
import { useChatSession } from './ChatContext';

// Generate a UUID-based sessionId with at least 55 characters
const generateSessionId = () => {
  const uuid = crypto.randomUUID();
  const timestamp = Date.now().toString(36);
  const randomSuffix = Math.random().toString(36).substring(2);
  return `${uuid}-${timestamp}-${randomSuffix}`;
};

function ChatInterface({ user, inTools }) {

  const chatContainerRef = useRef(null);
  const { showButton, scrollToBottom } = useScrollToBottom(chatContainerRef);

  // Generate stable sessionId - only once on mount
  const sessionId = useMemo(() => {
    // You could also derive this from location if needed
    // For example: `${location.pathname}-${generateSessionId()}`
    return generateSessionId();
  }, []); // Empty deps means this only runs once
  
  // Get the session from the context
  const session = useChatSession(sessionId);

  
  
  // Initialize session on mount
  useEffect(() => {
    // The session will be initialized automatically by useChatSession
    // But if you need to do any additional setup, you can do it here
    console.log('Session initialized:', sessionId);
    
    // Cleanup on unmount if needed
    return () => {
      // The context provider handles cleanup automatically
    };
  }, [sessionId]);
  
  // Destructure session properties with defaults to prevent errors
  const { 
    chatTurns = [], 
    isStreaming = false, 
    error = null, 
    sendMessage = () => {}, 
    stopStreaming = () => {},
    dismissError = () => {}
  } = session || {};

  const example = [
    {
      id: 1692123556789,
      userMessage: "Can you explain quantum computing?",
      aiMessage: [
        {
          type: 'think',
          content: 'This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially.'
        },
        {
          type: 'text',
          content: 'Quantum computing is a revolutionary approach to computation that uses quantum mechanical phenomena like superposition and entanglement.'
        },
        {
          type: 'think',
          content: 'Let me provide a simple analogy to make this clearer.'
        },
        {
          type: 'text',
          content: 'Think of classical computers as very fast light switches - each bit is either on (1) or off (0). Quantum computers use quantum bits (qubits) that can be both on AND off at the same time, allowing them to process many possibilities simultaneously.'
        }
      ]
    },
    {
      id: 1692123556789,
      userMessage: "Can you explain quantum computing?",
      aiMessage: [
        {
          type: 'think',
          content: `This is a complex topic. 
          
          def hello_world():
              print("Hello, world!")
          


          I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially.`
        },
        {
          type: 'text',
          content: 'Quantum computing is a revolutionary approach to computation that uses quantum mechanical phenomena like superposition and entanglement.'
        },
        {
          type: 'think',
          content: 'Let me provide a simple analogy to make this clearer.'
        },
        {
          type: 'text',
          content: 'Think of classical computers as very fast light switches - each bit is either on (1) or off (0). Quantum computers use quantum bits (qubits) that can be both on AND off at the same time, allowing them to process many possibilities simultaneously.'
        }
      ]
    }
  ]

  // Handle sending messages through the session
  const handleSendMessage = useCallback(async ({ message, sessionId: msgSessionId, timestamp }) => {
    if (message.trim()) {
      await sendMessage(message);
    }
  }, [sendMessage]);


  // Handle stop streaming
  const handleStopStreaming = useCallback(({ sessionId: msgSessionId, timestamp }) => {
    stopStreaming();
  }, [stopStreaming]);

  // Handle action button clicks
  const handleActionButtonClick = useCallback((actionId, message, sessionId) => {
    switch (actionId) {
      case 'think':
        sendMessage(`Think about this: ${message}`);
        break;
      case 'tools':
        sendMessage(`Use tools to help with: ${message}`);
        break;
      default:
        sendMessage(message);
    }
  }, [sendMessage]);

  const actionButtons = [
    {
      id: "think",
      label: "Think",
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      ),
      onClick: (message, sessionId) => {
        handleActionButtonClick('think', message, sessionId);
      },
    },
    {
      id: "tools",
      label: "Tools",
      icon: (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      ),
      onClick: (message, sessionId) => {
        handleActionButtonClick('tools', message, sessionId);
      },
    },
  ];

  return (
    <div className={inTools ? 'tools-main-div' : 'main-div'}>
      <div className="tools-container-wrapper">
        <div 
          className="stick-to-bottom"
          ref={chatContainerRef}
        >
          {example.length === 0 ? (
            <AgentLogo />
          ) : (
            <div className="stick-to-bottom-content">
              <ChatContent 
                chatTurns={example} 
                user={user} 
                streaming={isStreaming}
                scroll={scrollToBottom}
              />
            </div>
          )}
        </div>
        
        {showButton && (
          <ScrollToBottomButton 
            scroll={scrollToBottom}
            className="scroll-to-bottom-button"
          />
        )}
      </div>
      
      <div>
        {error && (
          <ErrorContent 
            message={error} 
            dismiss={dismissError}
          />
        )}
        
        <div style={{padding: "5px"}}>
          <ChatInput
            onSendMessage={handleSendMessage}
            onStopStreaming={handleStopStreaming}
            actionButtons={actionButtons}
            placeholder="Ask Sentry..."
            maxHeight={200}
            autoFocus={true}
            isStreaming={isStreaming}
            sessionId={sessionId}
          />
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;