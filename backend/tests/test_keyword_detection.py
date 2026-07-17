from uuid import UUID

from app.services.keyword_detection import BlockSpec, KeywordSpec, detect_keyword_candidates

PYTHON_ID = UUID("50000000-0000-0000-0000-000000000001")
AGENT_ID = UUID("50000000-0000-0000-0000-000000000010")


def test_exact_alias_offsets_and_first_occurrence_suppression() -> None:
    blocks = [
        BlockSpec(
            id=UUID("60000000-0000-0000-0000-000000000001"),
            text="Python 3 is Python.",
            sequence_number=1,
            section_index=1,
        )
    ]
    keywords = [KeywordSpec(PYTHON_ID, "Python", ("Python 3",))]

    matches = detect_keyword_candidates(blocks, keywords)

    assert [(item.surface_text, item.start_offset, item.end_offset) for item in matches] == [
        ("Python 3", 0, 8),
        ("Python", 12, 18),
    ]
    assert matches[0].detection_method == "ALIAS"
    assert matches[0].is_suppressed is False
    assert matches[1].is_suppressed is True


def test_ambiguous_term_requires_technical_context() -> None:
    keyword = KeywordSpec(
        AGENT_ID,
        "AI agent",
        ("agent",),
        ambiguity_required_any=("AI", "model", "tool"),
    )
    blocks = [
        BlockSpec(
            id=UUID("60000000-0000-0000-0000-000000000002"),
            text="The travel agent booked a hotel.",
            sequence_number=1,
            section_index=1,
        ),
        BlockSpec(
            id=UUID("60000000-0000-0000-0000-000000000003"),
            text="An AI agent can call a tool.",
            sequence_number=2,
            section_index=2,
        ),
    ]

    matches = detect_keyword_candidates(blocks, [keyword])

    assert matches[0].surface_text == "agent"
    assert matches[0].confidence == 0.55
    assert matches[0].is_suppressed is True
    assert matches[1].surface_text == "AI agent"
    assert matches[1].detection_method == "CONTEXT_RULE"
    assert matches[1].is_suppressed is False


def test_density_limit_prioritizes_earlier_terms() -> None:
    block = BlockSpec(
        id=UUID("60000000-0000-0000-0000-000000000004"),
        text="One Two Three Four Five Six Seven",
        sequence_number=1,
        section_index=1,
    )
    keywords = [
        KeywordSpec(UUID(f"70000000-0000-0000-0000-{index:012d}"), term, ())
        for index, term in enumerate(block.text.split(), start=1)
    ]

    matches = detect_keyword_candidates([block], keywords)

    assert sum(not item.is_suppressed for item in matches) == 6
    assert matches[-1].is_suppressed is True
