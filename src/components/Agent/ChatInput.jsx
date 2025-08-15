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
  sessionId = null, // Optional: can be passed from parent or generated internally
}) => {
  const [message, setMessage] = useState("");
  const textareaRef = useRef(null);
  const { effectiveTheme } = useTheme();
  const [currentSessionId] = useState(() => {
    // Generate sessionId if not provided
    if (sessionId) return sessionId;
    
    const generateSessionId = () => {
      const uuid = crypto.randomUUID();
      const timestamp = Date.now().toString(36);
      const randomSuffix = Math.random().toString(36).substring(2);
      return `${uuid}-${timestamp}-${randomSuffix}`;
    };
    
    return generateSessionId();
  });

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
      // Call parent callback with message and sessionId
      onSendMessage({
        message: trimmedMessage,
        sessionId: currentSessionId,
        timestamp: new Date().toISOString()
      });
      // Reset message after sending
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

  useEffect(() => {
    if (autoFocus && textareaRef.current && !isStreaming) {
      textareaRef.current.focus();
    }
  }, [autoFocus, isStreaming]);

  const canSend = message.trim().length > 0 && !disabled && !isStreaming;
  const canStop = isStreaming && !disabled;

  return (
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
          {actionButtons.map((button, index) => (
            <button
              key={button.id || index}
              className="action-button"
              onClick={() => button.onClick?.(message, currentSessionId)}
              disabled={button.disabled || disabled || isStreaming}
              title={button.title}
            >
              {button.icon && (
                <span className="action-icon">{button.icon}</span>
              )}
              {button.label && <span>{button.label}</span>}
            </button>
          ))}
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
  );
};

export default ChatInput;