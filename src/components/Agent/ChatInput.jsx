import React, { useState, useRef, useEffect } from "react";
import "./ChatInput.css";
import { useTheme } from "../ThemeContext";

const ChatInput = ({
  onSendMessage,
  onStopStreaming,
  actionButtons = [],
  placeholder = "Ask anything...",
  maxHeight = 200,
  autoFocus = true,
  disabled = false,
  isStreaming = false,
  sessionId = null,
  onToggleButton = () => {},
  onDropdownClick = () => {},
}) => {
  const [message, setMessage] = useState("");
  const [toggleStates, setToggleStates] = useState({});
  const [dropdownStates, setDropdownStates] = useState({});
  const [activeDropdown, setActiveDropdown] = useState(null);
  const textareaRef = useRef(null);
  const containerRef = useRef(null);
  const dropdownRefs = useRef({});
  const buttonRefs = useRef({});
  const { effectiveTheme } = useTheme();
  
  const [currentSessionId] = useState(() => {
    if (sessionId) return sessionId;
    
    const generateSessionId = () => {
      const uuid = crypto.randomUUID();
      const timestamp = Date.now().toString(36);
      const randomSuffix = Math.random().toString(36).substring(2);
      return `${uuid}-${timestamp}-${randomSuffix}`;
    };
    
    return generateSessionId();
  });

  // Initialize toggle states
  useEffect(() => {
    const initialStates = {};
    const initialDropdownStates = {};
    actionButtons.forEach(button => {
      if (button.isToggle) {
        initialStates[button.id] = button.defaultToggled || false;
      }
      // Initialize dropdown states for all buttons with showDropdown
      if (button.showDropdown) {
        initialDropdownStates[button.id] = false;
      }
    });
    setToggleStates(initialStates);
    setDropdownStates(initialDropdownStates);
  }, [actionButtons]);
  

  // Handle click outside to close dropdowns
// Modify the handleClickOutside useEffect
useEffect(() => {
    const handleClickOutside = (event) => {
      if (!activeDropdown) return;
  
      const dropdownElement = dropdownRefs.current[activeDropdown];
      const buttonElement = buttonRefs.current[activeDropdown];
      
      // Get the actual content element
      const contentElement = dropdownElement?.querySelector('.dropdown-content');
      
      // Check if click is outside the actual content (not just the container)
      const isOutsideContent = contentElement ? !contentElement.contains(event.target) : true;
      const isOutsideButton = buttonElement ? !buttonElement.contains(event.target) : true;
      
      if (isOutsideContent && isOutsideButton) {
        setDropdownStates(prev => ({
          ...prev,
          [activeDropdown]: false
        }));
        setActiveDropdown(null);
      }
    };
  
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
  
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [activeDropdown]);

  // Auto-resize textarea
  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);
      textarea.style.height = `${newHeight}px`;
    }
  };

  useEffect(() => {
    adjustTextareaHeight();
  }, [message, maxHeight]);

  const handleInputChange = (e) => {
    setMessage(e.target.value);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        handleStopStreaming();
      } else {
        handleSend();
      }
    }
  };

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (trimmedMessage && onSendMessage && !disabled && !isStreaming) {
      onSendMessage({
        message: trimmedMessage,
        sessionId: currentSessionId,
        timestamp: new Date().toISOString(),
        toggleStates: { ...toggleStates },
      });
      setMessage("");
    }
  };

  const handleStopStreaming = () => {
    if (onStopStreaming && isStreaming) {
      onStopStreaming({
        sessionId: currentSessionId,
        timestamp: new Date().toISOString()
      });
    }
  };

  const handleToggleButton = (button) => {
    // Handle dropdown for non-toggle buttons - entire button click toggles dropdown
    if (!button.isToggle && button.showDropdown) {
      const newDropdownState = !dropdownStates[button.id];
      
      // Close all other dropdowns
      const newStates = {};
      Object.keys(dropdownStates).forEach(key => {
        newStates[key] = key === button.id ? newDropdownState : false;
      });
      
      setDropdownStates(newStates);
      setActiveDropdown(newDropdownState ? button.id : null);
      
      if (button.onClick) {
        button.onClick(message, currentSessionId);
      }
      return;
    }
    
    // Original toggle button logic remains the same
    if (button.isToggle) {
      const newState = !toggleStates[button.id];
      setToggleStates(prev => ({
        ...prev,
        [button.id]: newState
      }));
      
      // If toggling off, also close dropdown
      if (!newState) {
        setDropdownStates(prev => ({
          ...prev,
          [button.id]: false
        }));
        if (activeDropdown === button.id) {
          setActiveDropdown(null);
        }
      }
      
      onToggleButton(button.id, newState, currentSessionId);
      
      if (button.onClick) {
        button.onClick(message, currentSessionId, newState);
      }
    } else {
      // Non-toggle button without dropdown
      if (button.onClick) {
        button.onClick(message, currentSessionId);
      }
    }
  };
  

  const handleDropdownClick = (button, event) => {
    event.stopPropagation();
    
    // For non-toggle buttons, clicking the dropdown arrow should toggle the dropdown
    // without affecting any toggle state (since there isn't one)
    const newDropdownState = !dropdownStates[button.id];
    
    // Close all other dropdowns
    const newStates = {};
    Object.keys(dropdownStates).forEach(key => {
      newStates[key] = key === button.id ? newDropdownState : false;
    });
    
    setDropdownStates(newStates);
    setActiveDropdown(newDropdownState ? button.id : null);
    onDropdownClick(button.id, currentSessionId, newDropdownState);
  };

  useEffect(() => {
    if (autoFocus && textareaRef.current && !isStreaming) {
      textareaRef.current.focus();
    }
  }, [autoFocus, isStreaming]);

  const canSend = message.trim().length > 0 && !disabled && !isStreaming;
  const canStop = isStreaming && !disabled;

  // Get the active dropdown component
  const activeDropdownButton = actionButtons.find(
    button => button.id === activeDropdown && dropdownStates[button.id]
  );
  

  return (
    <div className={`chat-input-wrapper ${effectiveTheme}`} ref={containerRef}>
      {/* Dropdown Content Area */}
      {activeDropdownButton && activeDropdownButton.dropdownContent && (
  <div 
    className="dropdown-content-container"
    ref={(el) => dropdownRefs.current[activeDropdownButton.id] = el}
  >
    <div className="dropdown-content">
      {typeof activeDropdownButton.dropdownContent === 'function' 
        ? activeDropdownButton.dropdownContent({
            message,
            sessionId: currentSessionId,
            isToggled: toggleStates[activeDropdownButton.id] || false, // Default to false for non-toggle buttons
            onClose: () => {
              setDropdownStates(prev => ({
                ...prev,
                [activeDropdownButton.id]: false
              }));
              setActiveDropdown(null);
            }
          })
        : activeDropdownButton.dropdownContent
      }
    </div>
  </div>

      )}
      
      {/* Main Chat Input */}
      <div className={`chat-input-container ${effectiveTheme}`}>
        <textarea
          ref={textareaRef}
          className="chat-textarea"
          placeholder={isStreaming ? "Streaming response..." : placeholder}
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled || isStreaming}
          rows={1}
        />
        <div className="button-row">
          <div className="optional-buttons">
{actionButtons.map((button, index) => {
  const isToggled = button.isToggle && toggleStates[button.id];
  const isDropdownOpen = dropdownStates[button.id];
  
  return (
    <button
      key={button.id || index}
      ref={(el) => buttonRefs.current[button.id] = el}
      className={`action-button ${button.isToggle ? 'toggle-button' : ''} ${isToggled ? 'toggled' : ''} ${isDropdownOpen ? 'dropdown-open' : ''}`}
      onClick={() => handleToggleButton(button)}
      disabled={button.disabled || disabled || isStreaming}
      title={button.title}
      data-theme={effectiveTheme}
    >
      <span className="button-main-content">
        {button.icon && (
          <span className="action-icon">{button.icon}</span>
        )}
        {button.label && <span className="button-label">{button.label}</span>}
      </span>
      
      {/* Only show dropdown arrow for toggle buttons that are toggled on */}
      {button.isToggle && isToggled && button.showDropdown && (
        <>
          <span className="button-separator"></span>
          <span 
            className="dropdown-arrow"
            onClick={(e) => handleDropdownClick(button, e)}
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s ease'
              }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </>
      )}
    </button>
  );
})}


          </div>
          
          {isStreaming ? (
            <button
              className="stop-button"
              onClick={handleStopStreaming}
              disabled={!canStop}
              aria-label="Stop streaming"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                stroke="none"
              >
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className="send-button"
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 19V5" />
                <path d="M5 12l7-7 7 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatInput;