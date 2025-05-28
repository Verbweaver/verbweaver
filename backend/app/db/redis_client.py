import redis.asyncio as redis
from typing import Optional, Union, Any, Dict
import json

from app.core.config import settings

_redis_client: Optional[redis.Redis] = None

def get_redis_client() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        if not settings.REDIS_URL:
            raise ConnectionError("REDIS_URL is not configured. Cannot connect to Redis for Passkey challenge storage.")
        _redis_client = redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=False)
    return _redis_client

async def close_redis_client():
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None

# --- Specific functions for Passkey Challenge Storage ---

WEBAUTHN_CHALLENGE_PREFIX = "webauthn_challenge:"

async def store_webauthn_challenge(
    challenge: str, 
    user_info: Dict[str, Any], 
    ttl_seconds: int = settings.WEBAUTHN_CHALLENGE_TIMEOUT_SECONDS
):
    """Stores WebAuthn challenge data in Redis.
    
    Args:
        challenge: The base64url encoded challenge string.
        user_info: A dictionary containing user-related info to store with the challenge (e.g., user_id, email).
        ttl_seconds: Time-to-live for the challenge in Redis.
    """
    client = get_redis_client()
    redis_key = f"{WEBAUTHN_CHALLENGE_PREFIX}{challenge}"
    # Store user_info as JSON string
    await client.set(redis_key, json.dumps(user_info), ex=ttl_seconds)
    print(f"Stored challenge {challenge} for user_info {user_info} in Redis with TTL {ttl_seconds}s")

async def retrieve_webauthn_challenge_data(challenge: str) -> Optional[Dict[str, Any]]:
    """Retrieves and deletes WebAuthn challenge data from Redis.
    
    Args:
        challenge: The base64url encoded challenge string.
        
    Returns:
        The user_info dictionary if found and valid, otherwise None.
    """
    client = get_redis_client()
    redis_key = f"{WEBAUTHN_CHALLENGE_PREFIX}{challenge}"
    
    # Use a transaction to get and delete atomically
    pipe = client.pipeline()
    pipe.get(redis_key)
    pipe.delete(redis_key)
    results = await pipe.execute()
    
    user_info_json = results[0]
    
    if user_info_json:
        print(f"Retrieved and deleted challenge {challenge} from Redis.")
        return json.loads(user_info_json) # user_info_json will be bytes if decode_responses=False for client
    
    print(f"Challenge {challenge} not found in Redis or already used.")
    return None

async def clear_webauthn_challenge(challenge: str):
    """Explicitly clears a WebAuthn challenge from Redis if needed (e.g., on error)."""
    client = get_redis_client()
    redis_key = f"{WEBAUTHN_CHALLENGE_PREFIX}{challenge}"
    await client.delete(redis_key)
    print(f"Explicitly cleared challenge {challenge} from Redis.")

# Add to startup/shutdown events in main.py if you want to manage connection lifecycle
# app.add_event_handler("startup", get_redis_client) # To connect on startup
# app.add_event_handler("shutdown", close_redis_client) 