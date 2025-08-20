from langchain_core.tools import tool
from data_model import Threat
from typing import List
from langgraph.types import interrupt


@tool(name_or_callable="add_threats", description=""" Used to add new threats to the existing catalog """)
def add_threats(threats: List[Threat]):
    response = interrupt(
            {
                "payload": [threat.model_dump() for threat in threats],
                "tool_name": "add_threats"
            }
        )
    errors = response.get("args").get("error")
    if response["type"] == "add_threats" and not errors:
        pass
    else:
        return {
            "error": errors
        }


@tool(name_or_callable="edit_threats", description=""" Used to update threats to the existing catalog """)
def edit_threats(threats: List[Threat]):
    response = interrupt(
            {
                "payload": [threat.model_dump() for threat in threats],
                "tool_name": "edit_threats"
            }
        )
    errors = response.get("args").get("error")
    if response["type"] == "edit_threats" and not errors:
        pass
    else:
        return {
            "error": errors
        }


@tool(name_or_callable="delete_threats", description=""" Used to delete threats from the  existing catalog """)
def delete_threats(threats: List[Threat]):
    response = interrupt(
            {
                "payload": [threat.model_dump() for threat in threats],
                "tool_name": "delete_threats"
            }
        )
    errors = response.get("args").get("error")
    if response["type"] == "delete_threats" and not errors:
        pass
    else:
        return {
            "error": errors
        }