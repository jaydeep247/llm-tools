"""
Colytics AI — Recommendation Engine (Moat #4)
recommendation_engine.py — SHIM MODULE

BUG FIX: This file previously contained a duplicate, older implementation of
generate_prompt_recommendations() and _compute_urgency_multiplier() that:

  BUG 1 (overwrite): runner.py imported this file and patched its older version
    onto ClaudeService, silently replacing the richer implementation already on
    the class (which includes LOW_CITATION_RATE, LOW_SHARE_OF_VOICE, and
    POOR_POSITION_RANK rules that fire on real SOP-002 citation data).

  BUG 2 (signature mismatch): _compute_urgency_multiplier() here took two
    arguments (metrics, account_context) while contentAnylsisMatrix.py's
    version correctly takes one (account_context). The patched method would
    raise TypeError at runtime on every call from runner.py.

FIX: All logic lives exclusively in contentAnylsisMatrix.py.
This module re-exports generate_prompt_recommendations from ClaudeService so
runner.py's import and patch line work without any changes to runner.py.
The patch becomes a harmless identity assignment — it sets the method to the
same function already defined on the class.
"""

from .contentAnylsisMatrix import ClaudeService  # noqa: F401

# Re-export the method so runner.py's
#   from .recommendation_engine import generate_prompt_recommendations
#   ClaudeService.generate_prompt_recommendations = generate_prompt_recommendations
# continues to work and is a no-op identity assignment.
generate_prompt_recommendations = ClaudeService.generate_prompt_recommendations