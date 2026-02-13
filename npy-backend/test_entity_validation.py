"""
Test entity type validation in knowledge_base module
"""
import asyncio
from modules.module_C.knowledge_base import KnowledgeBaseModule, EntityType, VALID_ENTITY_TYPES

def test_entity_type_validation():
    module = KnowledgeBaseModule()
    
    print("=" * 80)
    print("Testing Entity Type Validation")
    print("=" * 80)
    
    # Test cases
    test_cases = [
        ("Person", "Person"),  # Already valid
        ("person", "Person"),  # Lowercase
        ("PERSON", "Person"),  # Uppercase
        ("people", "Person"),  # Variation
        ("individual", "Person"),  # Variation
        ("Product", "Product"),  # Already valid
        ("app", "Product"),  # Variation
        ("messaging app", "Unknown"),  # Invalid (multi-word not in mapping)
        ("company", "Organization"),  # Variation
        ("Organization", "Organization"),  # Already valid
        ("business", "Organization"),  # Variation
        ("Location", "Location"),  # Already valid
        ("place", "Location"),  # Variation
        ("Concept", "Concept"),  # Already valid
        ("technology", "Concept"),  # Variation
        ("Event", "Event"),  # Already valid
        ("random_type", "Unknown"),  # Invalid
        ("", "Unknown"),  # Empty
    ]
    
    print(f"\nValid entity types: {VALID_ENTITY_TYPES}\n")
    
    passed = 0
    failed = 0
    
    for input_type, expected in test_cases:
        result = module._validate_and_normalize_entity_type(input_type)
        status = "✅" if result == expected else "❌"
        
        if result == expected:
            passed += 1
        else:
            failed += 1
        
        print(f"{status} Input: '{input_type:20s}' -> Expected: '{expected:15s}' | Got: '{result:15s}'")
    
    print(f"\n" + "=" * 80)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 80)

if __name__ == "__main__":
    test_entity_type_validation()
