import React from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeRenderer, CustomTable } from "./MarkdownRenderers";

const TextContent = ({ content, fontSize }) => (
  <div style={{ marginBottom: "16px"}}>
    <Markdown
      children={content}
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeRenderer,
        table: CustomTable,
      }}
    />
    </div>
);

export default TextContent;
