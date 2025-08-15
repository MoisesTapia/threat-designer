import React from "react";
import { RenderCode } from "./CodeBlock";

const ToolContent = ({ toolName, content, loading, error }) => {
  switch (toolName) {
    case "security-logs":
      return <RenderCode output={content} loading={loading} error={error} />;
    default:
      return null;
  }
};

export default ToolContent;
