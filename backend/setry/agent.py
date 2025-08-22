from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
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
from langgraph.types import Command

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
current_budget_level = 0  # Default to level 1 (8000 tokens)

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


def extract_budget_level(input_data: Dict[str, Any]) -> Optional[int]:
    """Extract budget level from input data"""
    return int(input_data.get("budget_level"))


def create_model_config(budget_level: int = 1):
    """Create model configuration based on budget level"""
    base_config = {
        "max_tokens": 64000,
        "model_id": model_id,
        "client": boto_client,
    }
    
    # Budget level mapping
    budget_mapping = {
        1: 8000,
        2: 16000,
        3: 31999
    }
    
    # If budget_level is 0, don't add thinking at all
    if budget_level == 0:
        return base_config
    
    # For other levels, add thinking configuration
    budget_tokens = budget_mapping.get(budget_level, 8000)  # Default to 8000 if invalid level
    
    base_config["additional_model_request_fields"] = {
        "thinking": {
            "type": "enabled",
            "budget_tokens": budget_tokens,
        },
        "anthropic_beta": ["interleaved-thinking-2025-05-14"],
    }
    
    return base_config


async def get_agent_with_preferences(tool_preferences: Optional[List[str]], context: Optional[Dict[str, Any]] = None, diagram_path: Optional[str] = None, budget_level: int = 1):
    global cached_agent, current_tool_preferences, current_tools_hash, current_context_hash, current_diagram_hash, current_diagram_data, current_context, current_budget_level
    
    # Check if budget level changed - if so, we need to recreate the agent
    budget_level_changed = current_budget_level != budget_level
    if budget_level_changed:
        logger.info(f"Budget level changed from {current_budget_level} to {budget_level}, recreating agent...")
        current_budget_level = budget_level
        cached_agent = None  # Force recreation
    
    # Create new LLM with updated config
    config = create_model_config(budget_level)
    llm = ChatBedrockConverse(**config)
    
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
        # Initialize with all available tools, no context, no diagram, and default budget level
        await get_agent_with_preferences(None, None, None, 1)
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
            budget_level = extract_budget_level(request.input)
            
            # Use current budget level if not provided
            if budget_level is None:
                budget_level = current_budget_level
            
            logger.info("Preparing environment with updated preferences, context, and budget...")
            if tool_preferences:
                logger.info(f"Updating tool preferences: {tool_preferences}")
            if context:
                logger.info(f"Updating context: {context if context else 'None'}")
            if diagram_path:
                logger.info(f"Updating diagram path: {diagram_path}")
            
            # Log budget level information
            if budget_level == 0:
                logger.info("Budget level 0: Thinking disabled")
            else:
                budget_mapping = {1: 8000, 2: 16000, 3: 31999}
                budget_tokens = budget_mapping.get(budget_level, 8000)
                logger.info(f"Budget level {budget_level}: Thinking enabled with {budget_tokens} tokens")
            
            agent = await get_agent_with_preferences(tool_preferences, context, diagram_path, budget_level)
            
            return JSONResponse(
                {
                    'type': 'prepare_complete',
                    'message': 'Environment warmed up successfully',
                    'active_tools': current_tool_preferences or [tool.name for tool in ALL_AVAILABLE_TOOLS],
                    'context_loaded': context is not None,
                    'diagram_loaded': current_diagram_data is not None,
                    'budget_level': current_budget_level,
                    'thinking_enabled': current_budget_level > 0
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

executor = ThreadPoolExecutor(max_workers=2)


@sse_stream()
async def streaming_invoke(request: InvocationRequest, http_request: Request, session_header: str):
    """Handle streaming responses with yields using ThreadPoolExecutor for sync stream"""
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
                budget_level = extract_budget_level(request.input)
                
                # Use current budget level if not provided
                if budget_level is None:
                    budget_level = current_budget_level
                
                if tool_preferences:
                    logger.info(f"Extracted tool preferences: {tool_preferences}")
                if diagram_path:
                    logger.info(f"Extracted diagram path: {diagram_path}")
                if budget_level is not None:
                    logger.info(f"Extracted budget level: {budget_level}")
                
                # Get or create agent based on preferences, context, diagram, and budget level
                agent = await get_agent_with_preferences(tool_preferences, context, diagram_path, budget_level)
            
            if current_diagram_data:
                image_data = current_diagram_data.get("image_url", {}).get("url")
            else:
                image_data = None
            
            request_type = request.input.get("type")
            if request_type == "resume_interrupt":
                tmp_msg = Command(resume={"type": request.input.get("prompt")})
            else:
                content = [{"type": "text", "text": request.input.get("prompt", "No prompt found in input")}]
                tmp_msg = {"messages": [{"role": "user", "content": content}]}
            
            # Helper function to run sync stream in thread
            def sync_stream_wrapper():
                """Run the synchronous stream in a thread"""
                results = []
                try:
                    for mode, data in cached_agent.stream(
                        tmp_msg,
                        {"configurable": {"thread_id": session_header}, "recursion_limit": 50, "image_data": image_data}, 
                        stream_mode=["messages", "updates"]
                    ):
                        results.append((mode, data))
                except Exception as e:
                    results.append(("error", e))
                return results
            
            # Convert sync stream to async generator
            async def async_stream_generator():
                """Convert synchronous stream to async generator using ThreadPoolExecutor"""
                loop = asyncio.get_event_loop()
                
                # Create a queue to handle streaming
                queue = asyncio.Queue()
                
                # Function to process items in thread
                def process_stream():
                    try:
                        for mode, data in cached_agent.stream(
                            tmp_msg,
                            {"configurable": {"thread_id": session_header}, "recursion_limit": 50, "image_data": image_data}, 
                            stream_mode=["messages", "updates"]
                        ):
                            # Put each item in the queue
                            asyncio.run_coroutine_threadsafe(
                                queue.put((mode, data)), 
                                loop
                            )
                    except Exception as e:
                        asyncio.run_coroutine_threadsafe(
                            queue.put(("error", e)), 
                            loop
                        )
                    finally:
                        # Signal end of stream
                        asyncio.run_coroutine_threadsafe(
                            queue.put(("done", None)), 
                            loop
                        )
                
                # Start processing in thread
                future = loop.run_in_executor(executor, process_stream)
                
                # Yield items from queue as they arrive
                while True:
                    mode, data = await queue.get()
                    
                    if mode == "done":
                        break
                    elif mode == "error":
                        raise data
                    else:
                        yield mode, data
                
                # Ensure the thread completes
                await future
            
            # Process the async stream
            async for mode, data in async_stream_generator():
                if mode == "updates" and "__interrupt__" in data:
                    logger.info("Interrupt")
                    yield {
                        'type': 'interrupt',
                        'content': data["__interrupt__"][0].value
                    }

                elif mode == "messages":
                    chunk, metadata = data
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
                            'type': 'tool', 
                            'tool_name': chunk.name, 
                            'tool_start': False, 
                            'content': content,
                            'error': chunk.status == "error"
                        }
                        continue

                    content = chunk.content[0]
                    msg_type = content.get("type")

                    if msg_type == "tool_use" and content.get("name"):
                        yield {
                            'type': 'tool',
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