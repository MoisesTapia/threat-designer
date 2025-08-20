from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import json
import asyncio
import os
from contextlib import asynccontextmanager
from langgraph.checkpoint.memory import InMemorySaver
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import ToolMessage
from utils import log_error, logger, create_bedrock_client, sse_stream
from exceptions import MissingHeader
from tools import add_threats, edit_threats, delete_threats
from utils import (
    extract_tool_preferences, extract_context, extract_diagram_path,
    get_or_create_agent,
    diagram_cache, get_history
)
from langgraph.prebuilt import create_react_agent

boto_client = create_bedrock_client()

MODEL_ID = os.environ.get("MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
S3_BUCKET = os.environ.get("S3_BUCKET", "threat-designer-architecture-541020177866-apx0st")

# Global variables to store reusable components
cached_agent = None
current_tool_preferences = None
current_tools_hash = None
current_context = None
current_context_hash = None
current_diagram_path = None
current_diagram_hash = None
current_diagram_data = None

# All available tools - by default all are enabled
ALL_AVAILABLE_TOOLS = [add_threats, edit_threats, delete_threats]

# Create a mapping of tool names to tool objects for easy lookup
TOOL_NAME_MAP = {tool.name: tool for tool in ALL_AVAILABLE_TOOLS}

# Optimized semaphore - allow multiple read operations, single write
request_semaphore = asyncio.Semaphore(1)


class InvocationRequest(BaseModel):
    input: Dict[str, Any]


checkpointer = InMemorySaver()

model_id = MODEL_ID
config = {
    "max_tokens": 64000,
    "model_id": model_id,
    "additional_model_request_fields": {
        "thinking": {
            "type": "enabled",
            "budget_tokens": 8000,
        },
        "anthropic_beta": ["interleaved-thinking-2025-05-14"],
    },
    "client": boto_client,
}

llm = ChatBedrockConverse(**config)


async def get_agent_with_preferences(tool_preferences: Optional[List[str]], context: Optional[Dict[str, Any]] = None, diagram_path: Optional[str] = None):
    global cached_agent, current_tool_preferences, current_tools_hash, current_context_hash, current_diagram_hash, current_diagram_data, current_context
    
    result = await get_or_create_agent(
        tool_preferences, context, diagram_path,
        ALL_AVAILABLE_TOOLS, TOOL_NAME_MAP, llm, checkpointer,
        boto_client, S3_BUCKET, logger,
        current_tool_preferences, current_tools_hash, 
        current_context_hash, current_diagram_hash, cached_agent, current_context
    )
    
    # Update global state - now 7 values returned
    (cached_agent, current_tool_preferences, current_tools_hash, 
     current_context_hash, current_diagram_hash, current_diagram_data, current_context) = result
    
    return cached_agent



@asynccontextmanager
async def lifespan(app: FastAPI):
    global cached_agent, current_tool_preferences
    logger.info("Initializing with all available tools, no context, and no diagram...")

    try:
        # Initialize with all available tools, no context, and no diagram
        await get_agent_with_preferences(None, None, None)
        logger.info(f"Default agent initialized successfully with all tools: {[tool.name for tool in ALL_AVAILABLE_TOOLS]}")
    except Exception as e:
        logger.error(f"Failed to initialize default agent: {e}")
        raise

    yield

    logger.info("Shutting down...")
    
    # Clean up cached diagrams
    for cache_key, file_path in diagram_cache.items():
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.info(f"Cleaned up cached diagram: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up cached diagram {file_path}: {e}")

app = FastAPI(title="Operator Agent Server", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET, POST, OPTIONS"],
    allow_headers=["*"],
)

def to_friendly_name(tool_name):
    # Replace - and _ with spaces, then capitalize first letter
    return tool_name.replace('-', ' ').replace('_', ' ').capitalize()

@app.options("/invocations")
async def handle_options():
    return {"message": "OK"}


@app.post("/invocations")
async def invoke(request: InvocationRequest, http_request: Request):
    """Process user input and return appropriate response type"""

    # Early validation - fail fast before any processing
    session_header = http_request.headers.get("X-Amzn-Bedrock-AgentCore-Runtime-Session-Id")
    if not session_header:
        raise MissingHeader

    request_type = request.input.get("type")
    
    # Handle immediate response types with normal returns
    if request_type == "ping":
        return JSONResponse(
            {'type': 'pong', 'message': 'pong'},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    
    if request_type == "tools":
        return JSONResponse(
            {"available_tools": [
                {"id": tool.name, "tool_name": to_friendly_name(tool.name)} 
                for tool in ALL_AVAILABLE_TOOLS
            ]},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    
    if request_type == "history":
        return JSONResponse(
            get_history(cached_agent, session_header),
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            }
        )
    
    if request_type == "prepare":
        try:
            tool_preferences = extract_tool_preferences(request.input)
            context = extract_context(request.input)
            diagram_path = extract_diagram_path(request.input)
            
            logger.info("Preparing environment with updated preferences and context...")
            if tool_preferences:
                logger.info(f"Updating tool preferences: {tool_preferences}")
            if context:
                logger.info(f"Updating context: {context if context else 'None'}")
            if diagram_path:
                logger.info(f"Updating diagram path: {diagram_path}")
            
            agent = await get_agent_with_preferences(tool_preferences, context, diagram_path)
            
            return JSONResponse(
                {
                    'type': 'prepare_complete',
                    'message': 'Environment warmed up successfully',
                    'active_tools': current_tool_preferences or [tool.name for tool in ALL_AVAILABLE_TOOLS],
                    'context_loaded': context is not None,
                    'diagram_loaded': current_diagram_data is not None
                },
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                }
            )
        except Exception as e:
            logger.error(f"Failed to prepare environment: {e}")
            return JSONResponse(
                {
                    'type': 'prepare_error',
                    'error': str(e)
                },
                status_code=500,
                headers={
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "*",
                }
            )

    # For streaming requests, call the streaming function
    return await streaming_invoke(request, http_request, session_header)


@sse_stream()
async def streaming_invoke(request: InvocationRequest, http_request: Request, session_header: str):
    """Handle streaming responses with yields"""
    
    # Check semaphore availability
    if request_semaphore.locked():
        raise HTTPException(status_code=429, 
                           detail="Agent is currently processing another request. Please wait for it to complete.")

    async with request_semaphore:
        try:
            if not cached_agent:
                # Extract preferences using utility functions
                tool_preferences = extract_tool_preferences(request.input)
                context = extract_context(request.input)
                diagram_path = extract_diagram_path(request.input)
                
                if tool_preferences:
                    logger.info(f"Extracted tool preferences: {tool_preferences}")
                if diagram_path:
                    logger.info(f"Extracted diagram path: {diagram_path}")
                
                # Get or create agent based on preferences, context, and diagram
                agent = await get_agent_with_preferences(tool_preferences, context, diagram_path)
            
            
            tmp_msg = {"messages": [{"role": "user", "content": request.input.get("prompt", "No prompt found in input")}]}

            processing_task = cached_agent.astream(
                tmp_msg,
                {"configurable": {"thread_id": session_header}, "recursion_limit": 50}, 
                stream_mode=["messages", "updates"]
            )
            
            async for mode, data in processing_task:
                if mode == "updates" and "__interrupt__" in data:
                    logger.info("Interrupt")
                    logger.info(data["__interrupt__"][0].value)
                elif mode == "messages":
                    chunk, metadata = data
                    logger.info(chunk)
                    logger.info(metadata)
                    if chunk.response_metadata.get('stopReason') == 'end_turn':
                        yield {'end': True}
                        continue

                    if not chunk.content:
                        continue

                    if isinstance(chunk, ToolMessage):
                        try:
                            content = json.loads(chunk.content) if chunk.content else {}
                        except json.JSONDecodeError:
                            content = chunk.content

                        yield {
                            'type': 'tool_use', 
                            'tool_name': chunk.name, 
                            'tool_start': False, 
                            'content': content,
                        }
                        continue

                    content = chunk.content[0]
                    msg_type = content.get("type")

                    if msg_type == "tool_use" and content.get("name"):
                        yield {
                            'type': 'tool_use',
                            'tool_name': content.get('name'),
                            'tool_start': True,
                        }
                    elif msg_type == "text":
                        yield {
                            'type': 'text',
                            'content': content.get('text')
                        }
                    elif msg_type == "reasoning_content":
                        yield {
                            'type': 'thinking',
                            'content': content.get('reasoning_content').get('text')
                        }
                    
        except Exception as e:
            log_error(e)
            yield {'error': str(e)}


@app.get("/ping")
async def ping():
    return {"status": "healthy"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        loop="uvloop",
        http="httptools",
        timeout_keep_alive=75,
        access_log=False
    )