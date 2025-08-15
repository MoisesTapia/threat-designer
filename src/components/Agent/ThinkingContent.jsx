// import React, { useState, useCallback, useRef, useEffect } from "react";
// import TextContent from "./TextContent";
// import ThinkingComponent from "./ThinkingComponent";
// import { useTheme } from "../ThemeContext";
// import "./ThinkingContent.css";

// const ThinkingContent = ({ content, onToggle, thinkingLoading }) => {
//   const [expanded, setExpanded] = useState(false);
//   const [contentHeight, setContentHeight] = useState(0);
//   const contentRef = useRef(null);
//   const resizeObserverRef = useRef(null);
//   const { effectiveTheme } = useTheme();

//   const handleToggle = useCallback(
//     (newState) => {
//       setExpanded(newState);
//       onToggle?.(newState);
//     },
//     [onToggle]
//   );

//   const getTextColor = () => {
//     return effectiveTheme === "light" ? "#706D6C" : "#8b8b8c";
//   };

//   const getLineColor = () => {
//     return effectiveTheme === "light" ? "#706D6C" : "#3a3a3a";
//   };

//   const calculateHeight = useCallback(() => {
//     if (contentRef.current && expanded) {
//       const element = contentRef.current;
//       const wrapper = element.querySelector('.thinking-content-wrapper');
//       if (wrapper) {
//         const height = wrapper.scrollHeight;
//         setContentHeight(height);
//       }
//     }
//   }, [expanded]);

//   useEffect(() => {
//     if (contentRef.current) {
//       if (expanded) {
//         // Initial calculation
//         const timer = setTimeout(() => {
//           calculateHeight();
//         }, 150);

//         // Set up resize observer
//         if (window.ResizeObserver) {
//           resizeObserverRef.current = new ResizeObserver(() => {
//             calculateHeight();
//           });
//           resizeObserverRef.current.observe(contentRef.current);
//         }

//         return () => {
//           clearTimeout(timer);
//           if (resizeObserverRef.current) {
//             resizeObserverRef.current.disconnect();
//           }
//         };
//       } else {
//         setContentHeight(0);
//         if (resizeObserverRef.current) {
//           resizeObserverRef.current.disconnect();
//         }
//       }
//     }
//   }, [expanded, content, calculateHeight]);

//   const generateLineElements = () => {
//     if (contentHeight === 0) return null;
    
//     const dotSpacing = 120;
//     const dotSize = 6;
//     const gapSize = 20;
//     const elements = [];
    
//     // For short content, just show a simple line without dots
//     if (contentHeight < dotSpacing) {
//       elements.push(
//         <div
//           key="single-line"
//           className="thinking-line-segment"
//           style={{
//             position: 'absolute',
//             left: '5.5px',
//             width: '1px',
//             top: '0px',
//             height: `${contentHeight}px`,
//             backgroundColor: getLineColor(),
//             opacity: expanded ? 1 : 0,
//             transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
//           }}
//         />
//       );
//       return elements;
//     }
    
//     // For longer content, create segments with dots
//     const numDots = Math.floor(contentHeight / dotSpacing);
//     let currentTop = 0;
    
//     for (let i = 0; i <= numDots; i++) {
//       const segmentHeight = i === 0 ? 
//         (dotSpacing - gapSize/2) : 
//         (i === numDots ? (contentHeight - currentTop) : (dotSpacing - gapSize));
      
//       if (segmentHeight > 0) {
//         elements.push(
//           <div
//             key={`line-${i}`}
//             className="thinking-line-segment"
//             style={{
//               position: 'absolute',
//               left: '5.5px',
//               width: '1px',
//               top: `${currentTop}px`,
//               height: `${segmentHeight}px`,
//               backgroundColor: getLineColor(),
//               opacity: expanded ? 1 : 0,
//               transition: 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
//             }}
//           />
//         );
//       }
      
//       currentTop += segmentHeight;
      
//       if (i < numDots) {
//         elements.push(
//           <div
//             key={`dot-${i}`}
//             className={`thinking-line-dot ${expanded ? 'visible' : ''}`}
//             style={{
//               position: 'absolute',
//               left: '3px',
//               width: '6px',
//               height: '6px',
//               borderRadius: '50%',
//               top: `${currentTop + gapSize/2 - dotSize/2}px`,
//               backgroundColor: getLineColor(),
//               opacity: 0,
//               transform: 'scale(0)',
//               transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
//             }}
//           />
//         );
//         currentTop += gapSize;
//       }
//     }
    
//     return elements;
//   };

//   return (
//     <div className="thinking-container">
//       <ThinkingComponent
//         loading={thinkingLoading}
//         onClick={handleToggle}
//       />
//       <div className="thinking-content-area">
//         <div className={`thinking-line-container ${expanded ? 'expanded' : 'collapsed'}`}>
//           {generateLineElements()}
//         </div>
//         <div
//           ref={contentRef}
//           className={`thinking-content-container ${expanded ? 'expanded' : 'collapsed'}`}
//           style={{
//             color: getTextColor(),
//           }}
//         >
//           <div className="thinking-content-wrapper">
//             <TextContent content={content} />
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default ThinkingContent;


import React, { useState, useCallback, useRef, useEffect } from "react";
import TextContent from "./TextContent";
import ThinkingComponent from "./ThinkingComponent";
import { useTheme } from "../ThemeContext";
import "./ThinkingContent.css";

const ThinkingContent = ({ content, onToggle, thinkingLoading }) => {
  const [expanded, setExpanded] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef(null);
  const resizeObserverRef = useRef(null);
  const { effectiveTheme } = useTheme();

  const handleToggle = useCallback(
    (newState) => {
      setExpanded(newState);
      onToggle?.(newState);
    },
    [onToggle]
  );

  const getTextColor = () => {
    return effectiveTheme === "light" ? "#706D6C" : "#8b8b8c";
  };

  const getLineColor = () => {
    return effectiveTheme === "light" ? "#706D6C" : "#3a3a3a";
  };

  const calculateHeight = useCallback(() => {
    if (contentRef.current) {
      const element = contentRef.current;
      const wrapper = element.querySelector('.thinking-content-wrapper');
      if (wrapper) {
        const height = wrapper.scrollHeight;
        setContentHeight(height);
      }
    }
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      calculateHeight();

      if (window.ResizeObserver) {
        resizeObserverRef.current = new ResizeObserver(() => {
          calculateHeight();
        });
        resizeObserverRef.current.observe(contentRef.current);
      }

      return () => {
        if (resizeObserverRef.current) {
          resizeObserverRef.current.disconnect();
        }
      };
    }
  }, [content, calculateHeight]);

  const generateLineElements = () => {
    if (!contentHeight) return null;
    
    const dotSpacing = 120;
    const dotSize = 6;
    const gapSize = 20;
    const elements = [];
    
    // Create a growing line container that clips content
    elements.push(
      <div
        key="line-mask"
        className={`thinking-line-mask ${expanded ? 'expanded' : 'collapsed'}`}
        style={{
          height: expanded ? `${contentHeight}px` : '0px',
        }}
      >
        {/* For short content, just show a simple line */}
        {contentHeight < dotSpacing ? (
          <div
            className="thinking-line-segment-static"
            style={{
              position: 'absolute',
              left: '5.5px',
              width: '1px',
              top: '0px',
              height: `${contentHeight}px`,
              backgroundColor: getLineColor(),
            }}
          />
        ) : (
          <>
            {/* For longer content, create segments with dots */}
            {(() => {
              const numDots = Math.floor(contentHeight / dotSpacing);
              let currentTop = 0;
              const lineElements = [];
              
              for (let i = 0; i <= numDots; i++) {
                const segmentHeight = i === 0 ? 
                  (dotSpacing - gapSize/2) : 
                  (i === numDots ? (contentHeight - currentTop) : (dotSpacing - gapSize));
                
                if (segmentHeight > 0) {
                  lineElements.push(
                    <div
                      key={`line-${i}`}
                      className="thinking-line-segment-static"
                      style={{
                        position: 'absolute',
                        left: '5.5px',
                        width: '1px',
                        top: `${currentTop}px`,
                        height: `${segmentHeight}px`,
                        backgroundColor: getLineColor(),
                      }}
                    />
                  );
                }
                
                currentTop += segmentHeight;
                
                if (i < numDots) {
                  lineElements.push(
                    <div
                      key={`dot-${i}`}
                      className="thinking-line-dot-static"
                      style={{
                        position: 'absolute',
                        left: '3px',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        top: `${currentTop + gapSize/2 - dotSize/2}px`,
                        backgroundColor: getLineColor(),
                      }}
                    />
                  );
                  currentTop += gapSize;
                }
              }
              
              return lineElements;
            })()}
          </>
        )}
      </div>
    );
    
    return elements;
  };

  return (
    <div className="thinking-container">
      <ThinkingComponent
        loading={thinkingLoading}
        onClick={handleToggle}
      />
      <div className="thinking-content-area">
        <div className={`thinking-line-container ${expanded ? 'expanded' : 'collapsed'}`}>
          {generateLineElements()}
        </div>
        <div
          ref={contentRef}
          className={`thinking-content-container ${expanded ? 'expanded' : 'collapsed'}`}
          style={{
            color: getTextColor(),
            maxHeight: expanded ? `${contentHeight + 16}px` : '0px', // +16 for padding
          }}
        >
          <div className="thinking-content-wrapper">
            <TextContent content={content} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThinkingContent;