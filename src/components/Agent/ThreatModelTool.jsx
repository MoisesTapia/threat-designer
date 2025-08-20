import React, { useState, useEffect } from 'react';
import './ThreatModelTool.css';
import StatusIndicator from "@cloudscape-design/components/status-indicator";
import { useTheme } from '../ThemeContext';
import List from "@cloudscape-design/components/list";
import Button from "@cloudscape-design/components/button";

const ThreatModelTool = ({ 
  state: propState,
  expanded,
  onExpand,
  text: propText,
  children: propChildren 
}) => {
  const { effectiveTheme } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExpandButton, setShowExpandButton] = useState(false);
  const [prevState, setPrevState] = useState('loading');
  const [hasAutoExpanded, setHasAutoExpanded] = useState(false); // Track if auto-expansion happened
  
  // Simulation state
  const [simulationState, setSimulationState] = useState('loading');
  const [text, setSimText] = useState("Adding new threats");
  const [children, setChildren] = useState(null)
  const [textAnimating, setTextAnimating] = useState(false);

  const state = simulationState;
  const hasChildren = children != null; // Check if children exist

  // Simulation effect with smooth text transition
  useEffect(() => {
    const timer = setTimeout(() => {
      setTextAnimating(true);
      
      setTimeout(() => {
        setSimulationState('pending');
        setChildren(<ListComponent />)
        setSimText("3 threats added");
        setTextAnimating(false);
      }, 200);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  // Modified to handle expand prop and auto-expansion with delay
  useEffect(() => {
    if (hasChildren && prevState === 'loading' && state !== 'loading') {
      setTimeout(() => {
        setShowExpandButton(true);
        // Auto-expand if expanded prop is true and we haven't auto-expanded yet, with 0.5s delay
        if (expanded && !hasAutoExpanded) {
          setTimeout(() => {
            setIsExpanded(true);
            setHasAutoExpanded(true);
            if (onExpand) onExpand(true);
          }, 500);
        }
      }, 100);
    } else if (hasChildren && state !== 'loading') {
      setShowExpandButton(true);
      // Auto-expand if expanded prop is true and we haven't auto-expanded yet, with 0.5s delay
      if (expanded && !hasAutoExpanded) {
        setTimeout(() => {
          setIsExpanded(true);
          setHasAutoExpanded(true);
          if (onExpand) onExpand(true);
        }, 500);
      }
    } else {
      setShowExpandButton(false);
      setIsExpanded(false);
    }
    setPrevState(state);
  }, [state, prevState, hasChildren, expanded, hasAutoExpanded, onExpand]);

  const handleExpand = () => {
    setIsExpanded(!isExpanded);
    if (onExpand) onExpand(!isExpanded);
  };

  const getStateConfig = () => {
    switch (state) {
      case 'pending':
        return {
          icon: <StatusIndicator type="warning"/>,
          text: text,
          className: 'pending'
        };
      case 'error':
        return {
          icon: <StatusIndicator type="error" />,
          text: text,
          className: 'error'
        };
      case 'success':
        return {
          icon: <StatusIndicator type="success" />,
          text: text,
          className: 'success'
        };
      default:
        return {
          icon: <StatusIndicator type="loading" />,
          text: text,
          className: 'loading'
        };
    }
  };

  const config = getStateConfig();

  return (
    <div 
      className={`status-container ${config.className} ${effectiveTheme} ${isExpanded ? 'expanded' : ''} ${!hasChildren ? 'no-children' : ''}`}
    >
      <div className="status-main">
        <div className="status-indicator">
          {config.icon}
          <span className={`status-text ${textAnimating ? 'animating' : ''}`}>
            {config.text}
          </span>
        </div>
        
        <div className="status-content">
          {showExpandButton && hasChildren && state !== 'loading' && (
            <button 
              className={`expand-button ${effectiveTheme}`}
              onClick={handleExpand}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              <svg 
                className={`arrow-icon ${isExpanded ? 'rotated' : ''}`}
                width="20" 
                height="20" 
                viewBox="0 0 20 20"
              >
                <path 
                  d="M6 8l4 4 4-4" 
                  stroke="currentColor" 
                  strokeWidth="2" 
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      {isExpanded && hasChildren && (
        <div className={`expanded-content ${effectiveTheme}`}>
          {children}
        </div>
      )}
    </div>
  );
};

const ListComponent = ({ items = [] }) => {
  return (
    <List
      ariaLabel="List with icons and actions"
      items={[
        {
          id: "health",
          content: "CloudFront Origin Bucket Exposure",
          icon: "face-happy"
        },
        {
          id: "functions",
          content: "GitHub Repository Compromise",
          icon: "script"
        },
        {
          id: "network",
          content: "Cross-Site Scripting via Static Assets",
          icon: "globe"
        },
        {
          id: "CloudFront Configuration Exposure",
          content: "CloudFront Configuration Exposure",
          icon: "multiscreen"
        },
        {
          id: "Distributed Denial of Service Attack",
          content: "Distributed Denial of Service Attack Distributed Denial of Service Attack Distributed Denial of Service Attack",
          icon: "security"
        },
      ]}
      renderItem={item => ({
        id: item.id,
        content: item.content,
        actions: (
          <Button
            variant="link"
          >
            Review
          </Button>
        )
      })}
      sortable
      sortDisabled
    />
  );
};

export default ThreatModelTool;