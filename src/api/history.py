#!/usr/bin/env python3
"""
History API Backend
Manages tool history with memory storage and configurable limits
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

class HistoryManager:
    def __init__(self):
        self.history_data: Dict[str, List[Dict]] = {}
        self.global_history: List[Dict] = []  # Global history across all tools
        self.tool_colors: Dict[str, str] = {}  # Color assignments for tool labels
        self.config = self._load_config()
    
    def _load_config(self) -> Dict[str, Any]:
        """Load configuration from config.json"""
        config_path = Path("config.json")
        if config_path.exists():
            with open(config_path, 'r') as f:
                return json.load(f)
        return {"history_limits": {}}
    
    def _get_history_limit(self, tool_name: str) -> int:
        """Get history limit for a specific tool"""
        return self.config.get("history_limits", {}).get(tool_name, 20)
    
    def _get_tool_color(self, tool_name: str) -> str:
        """Get or assign a muted color for a tool label"""
        if tool_name not in self.tool_colors:
            # Predefined muted colors for different tools
            colors = [
                "#6b7280",  # Gray
                "#7c3aed",  # Purple  
                "#dc2626",  # Red
                "#ea580c",  # Orange
                "#ca8a04",  # Yellow
                "#16a34a",  # Green
                "#0284c7",  # Blue
                "#c2410c",  # Brown
                "#be185d",  # Pink
                "#0891b2"   # Teal
            ]
            # Assign color based on tool count to ensure uniqueness
            color_index = len(self.tool_colors) % len(colors)
            self.tool_colors[tool_name] = colors[color_index]
        
        return self.tool_colors[tool_name]
    
    def add_history_entry(self, tool_name: str, data: str, operation: str = "process") -> Dict[str, Any]:
        """Add a new history entry for a tool"""
        if tool_name not in self.history_data:
            self.history_data[tool_name] = []
        
        entry = {
            "id": str(uuid.uuid4())[:8],
            "timestamp": datetime.now().isoformat(),
            "data": data,
            "operation": operation,
            "preview": self._generate_preview(data),
            "starred": False
        }
        
        # Add to beginning of list (most recent first)
        self.history_data[tool_name].insert(0, entry)
        
        # Maintain history limit
        limit = self._get_history_limit(tool_name)
        if len(self.history_data[tool_name]) > limit:
            self.history_data[tool_name] = self.history_data[tool_name][:limit]
        
        # Also add to global history
        global_entry = {
            **entry,
            "tool_name": tool_name,
            "tool_color": self._get_tool_color(tool_name)
        }
        
        self.global_history.insert(0, global_entry)
        
        # Maintain global history limit (configurable, default 100)
        global_limit = self.config.get("global_history_limit", 100)
        if len(self.global_history) > global_limit:
            self.global_history = self.global_history[:global_limit]
        
        return {
            "success": True,
            "entry_id": entry["id"],
            "message": "History entry added"
        }
    
    def get_history(self, tool_name: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get history entries for a tool"""
        if tool_name not in self.history_data:
            return []
        
        history = self.history_data[tool_name]
        
        if limit:
            history = history[:limit]
        
        # Return formatted history
        return [
            {
                "id": entry["id"],
                "timestamp": entry["timestamp"],
                "preview": entry["preview"],
                "operation": entry.get("operation", "process"),
                "formatted_date": self._format_date(entry["timestamp"]),
                "starred": entry.get("starred", False)
            }
            for entry in history
        ]
    
    def get_history_entry(self, tool_name: str, entry_id: str) -> Optional[Dict[str, Any]]:
        """Get specific history entry data"""
        if tool_name not in self.history_data:
            return None
        
        for entry in self.history_data[tool_name]:
            if entry["id"] == entry_id:
                return {
                    "id": entry["id"],
                    "timestamp": entry["timestamp"],
                    "data": entry["data"],
                    "operation": entry.get("operation", "process"),
                    "preview": entry["preview"]
                }
        
        return None
    
    def clear_history(self, tool_name: str) -> Dict[str, Any]:
        """Clear all history for a tool"""
        if tool_name in self.history_data:
            del self.history_data[tool_name]
        
        return {
            "success": True,
            "message": f"History cleared for {tool_name}"
        }
    
    def get_all_history_stats(self) -> Dict[str, Any]:
        """Get statistics about all tool histories"""
        stats = {}
        total_entries = 0
        
        for tool_name, history in self.history_data.items():
            stats[tool_name] = {
                "count": len(history),
                "limit": self._get_history_limit(tool_name),
                "last_updated": history[0]["timestamp"] if history else None
            }
            total_entries += len(history)
        
        return {
            "tools": stats,
            "total_entries": total_entries,
            "tools_count": len(self.history_data)
        }
    
    def _generate_preview(self, data: str, max_length: int = 100) -> str:
        """Generate a preview of the data"""
        # Remove excessive whitespace and newlines
        preview = ' '.join(data.split())
        
        if len(preview) <= max_length:
            return preview
        
        return preview[:max_length] + "..."
    
    def _format_date(self, iso_timestamp: str) -> str:
        """Format ISO timestamp to readable format"""
        try:
            dt = datetime.fromisoformat(iso_timestamp.replace('Z', '+00:00'))
            now = datetime.now()
            diff = now - dt.replace(tzinfo=None)
            
            if diff.days > 0:
                return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
            elif diff.seconds > 3600:
                hours = diff.seconds // 3600
                return f"{hours} hour{'s' if hours > 1 else ''} ago"
            elif diff.seconds > 60:
                minutes = diff.seconds // 60
                return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
            else:
                return "Just now"
        except:
            return "Unknown"
    
    def get_global_history(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Get global history entries across all tools"""
        history = self.global_history
        
        if limit:
            history = history[:limit]
        
        # Return formatted global history
        return [
            {
                "id": entry["id"],
                "timestamp": entry["timestamp"],
                "preview": entry["preview"],
                "operation": entry.get("operation", "process"),
                "tool_name": entry["tool_name"],
                "tool_color": entry["tool_color"],
                "formatted_date": self._format_date(entry["timestamp"]),
                "starred": entry.get("starred", False)
            }
            for entry in history
        ]
    
    def get_global_history_entry(self, entry_id: str) -> Optional[Dict[str, Any]]:
        """Get specific global history entry data"""
        for entry in self.global_history:
            if entry["id"] == entry_id:
                return {
                    "id": entry["id"],
                    "timestamp": entry["timestamp"],
                    "data": entry["data"],
                    "operation": entry.get("operation", "process"),
                    "tool_name": entry["tool_name"],
                    "tool_color": entry["tool_color"],
                    "preview": entry["preview"]
                }
        
        return None
    
    def delete_history_entry(self, tool_name: str, entry_id: str) -> bool:
        """Delete specific history entry for a tool and from global history"""
        if tool_name not in self.history_data:
            return False
        
        # Delete from local history
        original_local_count = len(self.history_data[tool_name])
        self.history_data[tool_name] = [
            entry for entry in self.history_data[tool_name] 
            if entry["id"] != entry_id
        ]
        
        # Delete from global history (same ID)
        original_global_count = len(self.global_history)
        self.global_history = [
            entry for entry in self.global_history 
            if entry["id"] != entry_id
        ]
        
        # Return True if an entry was actually deleted from either location
        return (len(self.history_data[tool_name]) < original_local_count or 
                len(self.global_history) < original_global_count)
    
    def delete_global_history_entry(self, entry_id: str) -> bool:
        """Delete specific global history entry and from all local histories"""
        # Delete from global history
        original_global_count = len(self.global_history)
        self.global_history = [
            entry for entry in self.global_history 
            if entry["id"] != entry_id
        ]
        
        # Delete from all local histories (same ID might exist in any tool)
        deleted_from_local = False
        for tool_name in self.history_data:
            original_local_count = len(self.history_data[tool_name])
            self.history_data[tool_name] = [
                entry for entry in self.history_data[tool_name] 
                if entry["id"] != entry_id
            ]
            if len(self.history_data[tool_name]) < original_local_count:
                deleted_from_local = True
        
        # Return True if an entry was actually deleted from either location
        return (len(self.global_history) < original_global_count or deleted_from_local)

    def clear_global_history(self) -> Dict[str, Any]:
        """Clear all global history"""
        self.global_history = []

        return {
            "success": True,
            "message": "Global history cleared"
        }

    def update_star_status(self, tool_name: str, entry_id: str, starred: bool) -> bool:
        """Update star status for a local history entry and sync with global"""
        if tool_name not in self.history_data:
            return False

        # Update in local history
        local_updated = False
        for entry in self.history_data[tool_name]:
            if entry["id"] == entry_id:
                entry["starred"] = starred
                local_updated = True
                break

        # Update in global history
        global_updated = False
        for entry in self.global_history:
            if entry["id"] == entry_id:
                entry["starred"] = starred
                global_updated = True
                break

        return local_updated or global_updated

    def update_global_star_status(self, entry_id: str, starred: bool) -> bool:
        """Update star status for a global history entry and sync with local histories"""
        # Update in global history
        global_updated = False
        tool_name = None
        for entry in self.global_history:
            if entry["id"] == entry_id:
                entry["starred"] = starred
                tool_name = entry["tool_name"]
                global_updated = True
                break

        # Update in local history if tool exists
        local_updated = False
        if tool_name and tool_name in self.history_data:
            for entry in self.history_data[tool_name]:
                if entry["id"] == entry_id:
                    entry["starred"] = starred
                    local_updated = True
                    break

        return global_updated or local_updated

# Global instance
history_manager = HistoryManager()

def validate_tool_name(tool_name: str) -> bool:
    """Validate tool name format"""
    if not tool_name:
        return False
    
    # Allow alphanumeric, hyphens, and underscores
    allowed_chars = set('abcdefghijklmnopqrstuvwxyz0123456789-_')
    return all(c.lower() in allowed_chars for c in tool_name)

def sanitize_data(data: str, max_size: int = 1024 * 1024) -> str:
    """Sanitize and validate input data"""
    if not isinstance(data, str):
        data = str(data)
    
    # Limit data size (1MB default)
    if len(data) > max_size:
        raise ValueError(f"Data too large. Maximum size: {max_size} characters")
    
    return data