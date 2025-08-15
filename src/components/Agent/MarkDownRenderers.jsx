import React from "react";
import { CodeBlock } from "./CodeBlock";
import "./styles.css";

export const CodeRenderer = ({ children, className = "" }) => {
  const match = /language-(\w+)/.exec(className);
  return match ? (
    <CodeBlock code={String(children).replace(/\n$/, "")} language={match[1]} />
  ) : (
    <CodeBlock code={String(children).replace(/\n$/, "")} language="default" />
  );
};

export const CustomTable = ({ node, ...props }) => (
  <table className="custom-table" {...props} />
);
