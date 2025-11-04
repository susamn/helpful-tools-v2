"""
Unified caching system for cross-tool source data sharing.
"""

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict


@dataclass
class SourceState:
    """Global source state for cross-tool sharing."""
    current_source: Optional[str] = None
    last_tool: Optional[str] = None
    opened_at: Optional[str] = None

    @classmethod
    def load(cls) -> 'SourceState':
        """Load global source state."""
        state_file = Path.home() / '.helpful-tools' / 'source_state.json'
        if state_file.exists():
            try:
                with open(state_file, 'r') as f:
                    data = json.load(f)
                return cls(**data)
            except Exception:
                pass
        return cls()

    def save(self):
        """Save global source state."""
        state_file = Path.home() / '.helpful-tools' / 'source_state.json'
        state_file.parent.mkdir(parents=True, exist_ok=True)
        try:
            with open(state_file, 'w') as f:
                json.dump(asdict(self), f, indent=2)
        except Exception:
            pass

    def set_current_source(self, source_id: str, tool_name: str):
        """Set the currently active source and tool."""
        self.current_source = source_id
        self.last_tool = tool_name
        self.opened_at = datetime.now().isoformat()
        self.save()

    def clear_current_source(self):
        """Clear the currently active source."""
        self.current_source = None
        self.last_tool = None
        self.opened_at = None
        self.save()


@dataclass
class PathCacheEntry:
    """Cache entry for a specific path in the source tree."""
    items: List[Dict[str, Any]]
    expanded: bool
    last_fetched: str

    def is_expired(self, ttl_seconds: int = 3600) -> bool:
        """Check if this cache entry is expired."""
        try:
            fetch_time = datetime.fromisoformat(self.last_fetched)
            age = (datetime.now() - fetch_time).total_seconds()
            return age > ttl_seconds
        except Exception:
            return True


@dataclass
class SourceCache:
    """Unified cache for a single source."""
    source_id: str
    active: bool
    last_accessed: str
    tree_cache: Dict[str, PathCacheEntry]

    @classmethod
    def create(cls, source_id: str) -> 'SourceCache':
        """Create a new source cache."""
        return cls(
            source_id=source_id,
            active=True,
            last_accessed=datetime.now().isoformat(),
            tree_cache={}
        )

    def get_path_cache(self, path: str) -> Optional[PathCacheEntry]:
        """Get cached data for a specific path."""
        normalized_path = path or ""
        entry = self.tree_cache.get(normalized_path)
        if entry and not entry.is_expired():
            return entry
        elif entry:
            # Remove expired entry
            del self.tree_cache[normalized_path]
        return None

    def set_path_cache(self, path: str, items: List[Dict[str, Any]], expanded: bool = True):
        """Cache data for a specific path."""
        normalized_path = path or ""
        self.tree_cache[normalized_path] = PathCacheEntry(
            items=items,
            expanded=expanded,
            last_fetched=datetime.now().isoformat()
        )
        self.last_accessed = datetime.now().isoformat()

    def expand_path(self, path: str, new_items: List[Dict[str, Any]]):
        """Add expanded directory data to cache without replacing existing data."""
        self.set_path_cache(path, new_items, expanded=True)

    def is_path_expanded(self, path: str) -> bool:
        """Check if a path has been expanded/cached."""
        entry = self.get_path_cache(path)
        return entry is not None and entry.expanded

    def clear(self):
        """Clear all cached data."""
        self.tree_cache.clear()
        self.last_accessed = datetime.now().isoformat()


class UnifiedSourceCache:
    """Unified cache manager for all sources with cross-tool sharing."""

    def __init__(self, source_id: str):
        self.source_id = source_id
        self.cache_file = Path.home() / '.helpful-tools' / 'sources' / source_id / 'cache.json'
        self.cache_file.parent.mkdir(parents=True, exist_ok=True)
        self._cache: Optional[SourceCache] = None
        self.state = SourceState.load()

    def _load_cache(self) -> SourceCache:
        """Load cache from disk."""
        if self.cache_file.exists():
            try:
                with open(self.cache_file, 'r') as f:
                    data = json.load(f)

                # Convert dict entries back to PathCacheEntry objects
                tree_cache = {}
                for path, entry_data in data.get('tree_cache', {}).items():
                    tree_cache[path] = PathCacheEntry(**entry_data)

                return SourceCache(
                    source_id=data['source_id'],
                    active=data.get('active', True),
                    last_accessed=data.get('last_accessed', datetime.now().isoformat()),
                    tree_cache=tree_cache
                )
            except Exception:
                pass

        return SourceCache.create(self.source_id)

    def _save_cache(self):
        """Save cache to disk."""
        if self._cache is None:
            return

        try:
            # Convert PathCacheEntry objects to dicts for JSON serialization
            tree_cache_dict = {}
            for path, entry in self._cache.tree_cache.items():
                tree_cache_dict[path] = asdict(entry)

            cache_data = {
                'source_id': self._cache.source_id,
                'active': self._cache.active,
                'last_accessed': self._cache.last_accessed,
                'tree_cache': tree_cache_dict
            }

            with open(self.cache_file, 'w') as f:
                json.dump(cache_data, f, indent=2)
        except Exception:
            pass

    def get_cache(self) -> SourceCache:
        """Get the source cache, loading from disk if needed."""
        if self._cache is None:
            self._cache = self._load_cache()
        return self._cache

    def get_path_data(self, path: str = "") -> Optional[List[Dict[str, Any]]]:
        """Get cached data for a specific path."""
        cache = self.get_cache()
        entry = cache.get_path_cache(path)
        if entry:
            return entry.items
        return None

    def cache_path_data(self, path: str, items: List[Dict[str, Any]], expanded: bool = True):
        """Cache data for a specific path."""
        cache = self.get_cache()
        cache.set_path_cache(path, items, expanded)
        self._save_cache()

    def is_path_cached(self, path: str = "") -> bool:
        """Check if path data is cached and not expired."""
        cache = self.get_cache()
        return cache.get_path_cache(path) is not None

    def activate_source(self, tool_name: str):
        """Mark this source as active and update global state."""
        cache = self.get_cache()
        cache.active = True
        cache.last_accessed = datetime.now().isoformat()
        self._save_cache()

        # Update global state
        self.state.set_current_source(self.source_id, tool_name)

    def deactivate_source(self):
        """Mark source as inactive and clear from global state."""
        cache = self.get_cache()
        cache.active = False
        self._save_cache()

        # Clear global state if this was the active source
        if self.state.current_source == self.source_id:
            self.state.clear_current_source()

    def clear_cache(self):
        """Clear all cached data for this source."""
        cache = self.get_cache()
        cache.clear()
        self._save_cache()

    def clear(self):
        """Clear all cached data for this source (alias for compatibility)."""
        self.clear_cache()

    def clear_path_cache(self, path: str):
        """Clear cached data for a specific path and its children."""
        cache = self.get_cache()
        normalized_path = path or ""

        # Remove the specific path from cache
        if normalized_path in cache.tree_cache:
            del cache.tree_cache[normalized_path]

        # Also remove any child paths that start with this path
        # (for nested directories)
        if normalized_path:
            prefix = normalized_path if normalized_path.endswith('/') else normalized_path + '/'
            paths_to_remove = [
                p for p in cache.tree_cache.keys()
                if p.startswith(prefix)
            ]
            for p in paths_to_remove:
                del cache.tree_cache[p]

        cache.last_accessed = datetime.now().isoformat()
        self._save_cache()

    def delete_cache(self):
        """Delete the cache file entirely."""
        if self.cache_file.exists():
            self.cache_file.unlink()
        self._cache = None

        # Clear from global state if active
        if self.state.current_source == self.source_id:
            self.state.clear_current_source()

    @classmethod
    def get_current_source_cache(cls, tool_name: str) -> Optional['UnifiedSourceCache']:
        """Get cache for the currently active source."""
        state = SourceState.load()
        if state.current_source:
            cache = cls(state.current_source)
            # Update that this tool is now accessing the source
            cache.activate_source(tool_name)
            return cache
        return None

    @classmethod
    def cleanup_inactive_caches(cls, max_age_hours: int = 24):
        """Clean up old inactive cache files."""
        sources_dir = Path.home() / '.helpful-tools' / 'sources'
        if not sources_dir.exists():
            return

        cutoff_time = datetime.now().timestamp() - (max_age_hours * 3600)

        for source_dir in sources_dir.iterdir():
            if source_dir.is_dir():
                cache_file = source_dir / 'cache.json'
                if cache_file.exists():
                    try:
                        # Check if cache is old and inactive
                        if cache_file.stat().st_mtime < cutoff_time:
                            with open(cache_file, 'r') as f:
                                data = json.load(f)

                            if not data.get('active', False):
                                cache_file.unlink()
                    except Exception:
                        pass