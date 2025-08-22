import React, { useEffect, useMemo, useRef } from "react";
import MessageAvatar from "./MessageAvatar";
import ChatButtons from "./ChatButtons";
import ContentResolver from "./ContentResolver";

const ChatMessage = React.memo(({ message, streaming, isLast, scroll, isParentFirstMount }) => {
  const substract = "330px";
  const isEnd = message?.[message.length - 1]?.end === true;
  const hasScrolled = useRef(false);

  useEffect(() => {
    if(isLast && !hasScrolled.current){
      hasScrolled.current = true;
      const timeout = 60;
      
      setTimeout(() => {
        scroll();
      }, timeout);
    }
  }, [isLast, scroll]);

  const messageBlocks = useMemo(() => {
    if (!message || message.length === 0) return [];
    
    const blocks = [];
    let currentBlock = null;
    
    for (let i = 0; i < message.length; i++) {
      const item = message[i];
      
      // Skip interrupt messages - they don't influence block calculation
      if (item.type === 'interrupt') {
        continue;
      }
      
      const nextItem = message[i + 1];
      
      if (item.type === 'tool') {
        // Check if this completes an existing tool block
        const lastBlock = blocks[blocks.length - 1];
        const shouldUpdateExisting = lastBlock && 
          lastBlock.type === 'tool' && 
          lastBlock.toolName === item.tool_name && 
          !lastBlock.isComplete && // Previous block was incomplete (tool_start: true)
          !item.tool_start; // Current item completes it (tool_start: false)
        
        if (shouldUpdateExisting) {
          // Update the existing tool block with completion data
          lastBlock.content = item.content;
          lastBlock.isComplete = true;
          lastBlock.error = item.error;
          lastBlock.items.push(item);
        } else {
          // Create new tool block
          blocks.push({
            type: 'tool',
            toolName: item.tool_name,
            content: item.content,
            isComplete: !item.tool_start, // FIXED: Complete when tool_start is false
            error: item.error,
            items: [item]
          });
        }
        currentBlock = null;
      } else if ((item.type === 'text' || item.type === 'thinking') && item.content != null) {
        // Group consecutive items of same type
        if (currentBlock && currentBlock.type === item.type) {
          // Continue current block
          currentBlock.content += item.content;
          currentBlock.items.push(item);
          // Block is complete if next item is different type or no next item
          currentBlock.isComplete = !nextItem || nextItem.type !== item.type;
        } else {
          // Start new block
          currentBlock = {
            type: item.type,
            content: item.content,
            isComplete: nextItem != null && nextItem.type !== item.type,
            items: [item]
          };
          blocks.push(currentBlock);
        }
      }
    }
    
    return blocks;
  }, [message]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        columnGap: "8px",
        width: "100%",
        marginBottom: "50px",
        height: isLast && `calc(100vh - ${substract})`,
      }}
    >
      <MessageAvatar
        isUser={false}
        loading={streaming && !isEnd}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            backgroundColor: "transparent",
            borderRadius: "8px",
            marginTop: "-14px",
          }}
        >
          {messageBlocks.map((block, index) => (
            <div key={index} style={{ marginBottom: "2px" }}>
              <ContentResolver 
                msg={block} 
                type={block.type} 
                isBlockComplete={block.isComplete}
                isParentFirstMount={isParentFirstMount}
              />
            </div>
          ))}

          {isEnd && <ChatButtons content={message} />}
        </div>
      </div>
    </div>
  );
});

export default ChatMessage;