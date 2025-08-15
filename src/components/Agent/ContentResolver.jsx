import React from "react";
import TextContent from "./TextContent";
import ToolContent from "./ToolContent";
import ThinkingContent from "./ThinkingContent";

const ContentResolver = ({ msg, thinkingLoading, type }) => {
  console.log(msg);
  console.log(type);
  switch (type) {
    case "tool":
      return (
        <ToolContent toolName={msg.tool} content={msg.content} loading={msg.tool_start} error={msg.error}/>
      );
    case "text":
      return <TextContent content={msg.content} />;
    case "think":
      return <ThinkingContent content={msg.content} thinkingLoading={thinkingLoading} />;
    default:
      return null;
  }
};

export default ContentResolver;
