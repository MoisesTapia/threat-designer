import React, { useEffect, useMemo } from "react";
import MessageAvatar from "./MessageAvatar";
import ChatButtons from "./ChatButtons";
import ContentResolver from "./ContentResolver";

const ChatMessage = React.memo(({ message, streaming, isLast, scroll }) => {
  const substract = "330px";

  const isEnd = message?.end === true;

  useEffect(() => {
    if(isLast){
      scroll();
    }
    
  }, []);
  

  const messageBlocks = useMemo(() => {
    if (!message || message.length === 0) return [];
    
    const blocks = [];
    let currentBlock = null;
    
    for (let i = 0; i < message.length; i++) {
      const item = message[i];
      const nextItem = message[i + 1];
      
      if (item.type === 'tool') {
        // Check if this completes an existing tool block
        const lastBlock = blocks[blocks.length - 1];
        const shouldUpdateExisting = lastBlock && 
          lastBlock.type === 'tool' && 
          lastBlock.toolName === item.tool && 
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
            toolName: item.tool,
            content: item.content,
            isComplete: !item.tool_start, // Complete when tool_start is false
            error: item.error,
            items: [item]
          });
        }
        currentBlock = null;
      } else if (item.type === 'text' || item.type === 'think') {
        // Group consecutive items of same type
        if (currentBlock && currentBlock.type === item.type) {
          // Continue current block
          currentBlock.content += item.content; // Changed from item.text to item.content
          currentBlock.items.push(item);
          // Block is complete if next item is different type or no next item
          currentBlock.isComplete = !nextItem || nextItem.type !== item.type;
        } else {
          // Start new block
          currentBlock = {
            type: item.type,
            content: item.content, // Changed from item.text to item.content
            isComplete: !nextItem || nextItem.type !== item.type,
            items: [item]
          };
          blocks.push(currentBlock);
        }
      }
    }
    
    return blocks;
  }, [message]);
  
  // Calculate if we're currently in a thinking phase
  const thinkingLoading = useMemo(() => {
    return messageBlocks.some(block => 
      block.type === 'think' && !block.isComplete
    );
  }, [messageBlocks]);


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
        isUser={thinkingLoading}
        loading={streaming && !isEnd}
      />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          overflow: "hidden",
          marginTop: "-14px",
        }}
      >
        <div
          style={{
            backgroundColor: "transparent",
            borderRadius: "8px",
          }}
        >
{messageBlocks.map((block, index) => (
  <div key={index} style={{ marginBottom: "2px" }}>
    <ContentResolver 
      msg={block} 
      type={block.type} 
      thinkingLoading={false}
      isBlockComplete={block.isComplete}
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