import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import ScrollToBottomButton from './ScrollToBottomButton';
import { useScrollToBottom } from "./useScrollToBottom";
import ChatContent from './ChatContent';
import AgentLogo from './AgentLogo';
import ErrorContent from './ErrorContent';
import "./styles.css";
import ChatInput from "./ChatInput";
import { useChatSession } from './ChatContext';
import ThinkingBudgetWrapper from './ThinkingBudgetWrapper';
import ToolsConfigWrapper from './ToolsConfigWrapper';
import { useParams, useNavigate } from "react-router";


// localStorage keys
const THINKING_ENABLED_KEY = 'thinkingEnabled';
const THINKING_BUDGET_KEY = 'thinkingBudget';
const TOOLS_CONFIG_KEY = 'toolsConfig';

function ChatInterface({ user, inTools }) {
  const chatContainerRef = useRef(null);
  const { showButton, scrollToBottom } = useScrollToBottom(chatContainerRef);
  
  // Load preferences from localStorage on mount  
  const [budget, setBudget] = useState(() => {
    const savedBudget = localStorage.getItem(THINKING_BUDGET_KEY);
    return savedBudget || "1";
  });
  
  const [thinkingEnabled, setThinkingEnabled] = useState(() => {
    const savedEnabled = localStorage.getItem(THINKING_ENABLED_KEY);
    // If there's a saved preference, use it. Otherwise default to whether budget is not "0"
    if (savedEnabled !== null) {
      return savedEnabled === 'true';
    }
    return budget !== "0";
  });

  // State for managing tool items properly
  const [toolItems, setToolItems] = useState([]);
  const [toolsInitialized, setToolsInitialized] = useState(false);

  // Generate stable sessionId - only once on mount
  const sessionId = useParams()["*"];
  
  // Get the session from the context
  const session = useChatSession(sessionId);
    
  // Destructure session properties with defaults to prevent errors
  const { 
    chatTurns = [], 
    isStreaming = false, 
    error = null, 
    sendMessage = () => {}, 
    stopStreaming = () => {},
    getContext = () => {},
    dismissError = () => {},
    availableTools = []
  } = session || {};

  const context = getContext();


  // Initialize tool items when availableTools changes, but only once per availableTools reference
  useEffect(() => {
    if (availableTools && availableTools.length > 0) {
      // Create a stable key based on the actual tools to avoid reinitializing on every render
      const toolsKey = availableTools.map(tool => `${tool.id}-${tool.name || tool.content || tool.id}`).join(',');
      
      setToolItems(prevItems => {
        // Check if we already have items for these exact tools
        const prevToolsKey = prevItems.map(item => `${item.id}-${item.content}`).join(',');
        
        if (prevToolsKey === toolsKey && toolsInitialized) {
          return prevItems; // No change needed
        }

        // Load saved tool configurations from localStorage
        const savedToolsConfig = localStorage.getItem(TOOLS_CONFIG_KEY);
        let savedTools = {};
        
        try {
          if (savedToolsConfig) {
            savedTools = JSON.parse(savedToolsConfig);
          }
        } catch (e) {
          console.error('Error parsing saved tools config:', e);
        }

        // Create new tool items
        const newItems = availableTools.map(tool => ({
          id: tool.id,
          content: tool.name || tool.content || tool.id,
          enabled: savedTools[tool.id] !== undefined ? savedTools[tool.id] : true
        }));

        setToolsInitialized(true);
        return newItems;
      });
    }
  }, [availableTools, toolsInitialized]);

  const example = [
    {
      id: 1692123556788,
      userMessage: "Can you explain quantum computing?",
      aiMessage: [
        {
          type: 'thinking',
          content: 'This is a complex topic. \n \n \n I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially.'
        },
        {
          type: 'text',
          content: 'Quantum computing is a revolutionary approach to computation that uses quantum mechanical phenomena like superposition and entanglement.'
        },

        {
          type: 'text',
          content: 'Think of classical computers as very fast light switches - each bit is either on (1) or off (0). Quantum computers use quantum bits (qubits) that can be both on AND off at the same time, allowing them to process many possibilities simultaneously.'
        },
        {
          type: 'tool',
          tool: "Adding new threat",
          tool_start: true,
          content: "Foo"
        },
        {
          type: 'tool',
          tool: "Adding new threat",
          tool_start: false,
          content: "Foo"
        },
        {
          type: 'text',
          content: 'Think of classical computers as very fast light switches - each bit is either on (1) or off (0). Quantum computers use quantum bits (qubits) that can be both on AND off at the same time, allowing them to process many possibilities simultaneously.'
        },
        {
          end: true
        }
      ]
    },
    {
      id: 1692123556789,
      userMessage: "Can you explain quantum computing?",
      aiMessage: [
        {
          type: 'thinking',
          content: `This is a complex topic. 
          
          def hello_world():
              print("Hello, world!")
          
          I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially. This is a complex topic. I should break it down into understandable parts and avoid getting too technical initially.`
        },
        {
          type: 'text',
          content: 'Quantum computing \n-is a revolutionary approach to computation that uses quantum mechanical phenomena like superposition and entanglement.'
        },
        {
          type: 'thinking',
          content: 'Let me provide a simple analogy to make this clearer.'
        },
        {
          end: true
        }
      ]
    }
  ];

  // Save budget to localStorage when it changes
  const handleBudgetChange = useCallback((newBudget) => {
    setBudget(newBudget);
    localStorage.setItem(THINKING_BUDGET_KEY, newBudget);
    
    // If budget is set to something other than "0", also enable thinking
    if (newBudget !== "0") {
      setThinkingEnabled(true);
      localStorage.setItem(THINKING_ENABLED_KEY, 'true');
    }
  }, []);

  // Handle thinking toggle
  const handleThinkingToggle = useCallback((isToggled) => {
    setThinkingEnabled(isToggled);
    localStorage.setItem(THINKING_ENABLED_KEY, String(isToggled));
    
    // If toggling off and budget was "0", keep it at "0"
    // If toggling on and budget is "0", set a default budget
    if (isToggled && budget === "0") {
      const defaultBudget = "1"; // Or whatever default you prefer
      setBudget(defaultBudget);
      localStorage.setItem(THINKING_BUDGET_KEY, defaultBudget);
    }
  }, [budget]);


  // Handle tool items change and save to localStorage
  const handleToolItemsChange = useCallback((newItems) => {
    setToolItems(newItems);
    
    // Convert to a simple object for localStorage
    const toolsConfig = {};
    newItems.forEach(item => {
      toolsConfig[item.id] = item.enabled;
    });
    
    localStorage.setItem(TOOLS_CONFIG_KEY, JSON.stringify(toolsConfig));
  }, []);

  // Handle sending messages through the session
  const handleSendMessage = useCallback(async ({ message, sessionId: msgSessionId, timestamp }) => {
    if (message.trim()) {
      // Include thinking preferences and enabled tools with the message
      const enabledTools = toolItems.filter(tool => tool.enabled).map(tool => tool.id);
      const messageOptions = {
        thinkingEnabled,
        thinkingBudget: thinkingEnabled ? budget : "0",
        enabledTools
      };
      await sendMessage(message, messageOptions);
    }
  }, [sendMessage, thinkingEnabled, budget, toolItems]);

  // Handle stop streaming
  const handleStopStreaming = useCallback(({ sessionId: msgSessionId, timestamp }) => {
    stopStreaming();
  }, [stopStreaming]);

  // Handle action button clicks
  const handleActionButtonClick = useCallback((actionId, message, sessionId, isToggled) => {
    switch (actionId) {
      case 'thinking':
        handleThinkingToggle(isToggled);
        break;
      case 'tools':
        sendMessage(`Use tools to help with: ${message}`);
        break;
      default:
        sendMessage(message);
    }
  }, [sendMessage, handleThinkingToggle]);

  // Memoize actionButtons to prevent recreation on every render
  const actionButtons = useMemo(() => [
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
      isToggle: true,
      showDropdown: true,
      dropdownContent: () => (
        <ThinkingBudgetWrapper 
          initialBudget={budget} 
          onBudgetChange={handleBudgetChange} 
        />
      ),
      defaultToggled: thinkingEnabled,
      onClick: (message, sessionId, isToggled) => {
        handleActionButtonClick('thinking', message, sessionId, isToggled);
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
      isToggle: false,
      showDropdown: true,
      dropdownContent: () => (
        <ToolsConfigWrapper 
          items={toolItems}
          onItemsChange={handleToolItemsChange}
        />
      ),
      onClick: (message, sessionId) => {
        // handleActionButtonClick('tools', message, sessionId);
      },
    },
  ], [budget, thinkingEnabled, handleBudgetChange, handleActionButtonClick, toolItems, handleToolItemsChange]);

  // Handle toggle button callbacks
  const handleToggleButton = useCallback((buttonId, isToggled, sessionId) => {
    if (buttonId === 'thinking') {
      handleThinkingToggle(isToggled);
    }
  }, [handleThinkingToggle]);
  
  const handleDropdownClick = useCallback((buttonId, sessionId) => {
    // Handle dropdown opening logic here
  }, []);

  return (
    <div className={inTools ? 'tools-main-div' : 'main-div'}>
      <div className="tools-container-wrapper">
        <div 
          className="stick-to-bottom"
          ref={chatContainerRef}
        >
          {chatTurns.length === 0 ? (
            <AgentLogo />
          ) : (
            <div className="stick-to-bottom-content">
              <ChatContent 
                chatTurns={chatTurns} 
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
            onToggleButton={handleToggleButton}
            onDropdownClick={handleDropdownClick}
          />
        </div>
      </div>
    </div>
  );
}

export default ChatInterface;