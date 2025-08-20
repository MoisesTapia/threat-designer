import React from "react";
import TextContent from "./TextContent";
import ThinkingContent from "./ThinkingContent";
import ThreatModelTool from "./ThreatModelTool";

const ContentResolver = React.memo(({ msg, type, isBlockComplete }) => {
  switch (type) {
    case "tool":
      return (
        // <ThreatModelTool loading={msg.isComplete} text={msg.toolName} />
        <ThreatModelTool 
        state={"loading"}
        onExpand={(expanded) => console.log('Expanded:', expanded)}
        text={"Adding new threat"}
        expanded={true}
        />
      );
    case "text":
      return <TextContent content={msg.content} />;
    case "thinking":
      return <ThinkingContent content={msg.content} thinkingLoading={!isBlockComplete} />;
    default:
      return null;
  }
});

export default ContentResolver;
