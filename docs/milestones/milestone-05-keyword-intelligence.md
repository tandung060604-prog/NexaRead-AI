# Milestone 5 — IT/AI Keyword Intelligence

## 1. Mục tiêu

Tạo lớp kiến thức kỹ thuật trên tài liệu bằng cách phát hiện và giải thích các thuật ngữ IT/AI mà không làm giao diện bị nhiễu.

Sau milestone này, người dùng có thể:

- Thấy keyword kỹ thuật được highlight tự động.
- Bấm keyword để xem định nghĩa.
- Xem category, độ khó và khái niệm liên quan.
- Xem các vị trí khác của keyword trong tài liệu.
- Tắt highlight hoặc lọc theo category.
- Chọn trình độ Beginner, Intermediate, Advanced.
- Báo keyword sai ngữ cảnh.

## 2. Phạm vi P0

- Taxonomy có version.
- Exact và alias matching.
- Context rule cơ bản.
- Confidence score.
- Suppression policy.
- Keyword occurrence theo `ContentBlock` và offsets.
- Tooltip/glossary.
- Other occurrences.
- Category filter.
- User level.
- User feedback.
- Evaluation dataset.

## 3. Phạm vi P1

- Named Entity Recognition.
- Embedding similarity.
- LLM validation chỉ cho candidate mơ hồ.
- AI explanation theo level.
- Learning resource recommendation.

Không dùng LLM cho mọi từ trong tài liệu.

## 4. Ngoài phạm vi

- RAG chat.
- Document summary.
- Flashcard và quiz.
- Knowledge graph production.
- Cross-document keyword recommendation.
- Tự động crawl Internet để bổ sung định nghĩa.

## 5. Taxonomy

### `keywords`

```text
id
canonical_name
slug
category
short_definition
beginner_explanation
intermediate_explanation
advanced_explanation
difficulty
aliases_json
related_keyword_ids_json
ambiguity_rules_json
taxonomy_version
status
created_at
updated_at
```

Categories ban đầu:

```text
PROGRAMMING_LANGUAGE
FRAMEWORK_LIBRARY
DATABASE
CLOUD_DEVOPS
MACHINE_LEARNING
DEEP_LEARNING
GENERATIVE_AI
LLM
RAG
AI_AGENT
COMPUTER_VISION
NLP
ROBOTICS
DATA_ENGINEERING
CYBERSECURITY
SOFTWARE_ARCHITECTURE
API_PROTOCOL
ALGORITHM_DATA_STRUCTURE
DEVELOPER_TOOL
MATH_STATISTICS
```

### `keyword_occurrences`

```text
id
keyword_id
document_id
document_version_id
content_block_id
start_offset
end_offset
surface_text
confidence
detection_method
context_hash
is_suppressed
created_at
```

### `keyword_feedback`

```text
id
user_id
document_id
keyword_occurrence_id
feedback_type
comment
created_at
```

Feedback:

```text
HELPFUL
NOT_TECHNICAL
WRONG_MEANING
TOO_BASIC
TOO_ADVANCED
```

## 6. Detection pipeline

```text
ContentBlock
→ Exact/alias matching
→ Context rules
→ Candidate scoring
→ Ambiguity check
→ Optional NER/embedding/LLM validation
→ Deduplication
→ Suppression
→ Store occurrence
```

Detection methods:

```text
EXACT
ALIAS
REGEX
CONTEXT_RULE
NER
EMBEDDING
LLM_VALIDATED
```

## 7. Chống highlight quá nhiều

Default policy:

- Chỉ highlight lần đầu trong một section.
- Suppress candidate confidence thấp.
- Suppress keyword xuất hiện quá dày trong viewport.
- Beginner thấy nhiều keyword hơn Advanced.
- Cho phép tắt category.
- Không highlight từ phổ thông khi thiếu ngữ cảnh.

Ví dụ:

- `agent` chỉ là AI Agent khi context có model, tool, planning hoặc action.
- `transformer` không phải luôn là mô hình Transformer.
- `pipeline` không phải lúc nào cũng cần highlight.

## 8. APIs

```http
GET /api/documents/{document_id}/keywords
GET /api/documents/{document_id}/keywords/{keyword_id}/occurrences
GET /api/keywords/{keyword_id}
POST /api/keyword-feedback
PUT /api/users/me/keyword-preferences
GET /api/users/me/keyword-preferences
```

Query filter:

```text
category
difficulty
min_confidence
include_suppressed=false
```

## 9. Frontend

- Render keyword từ offsets, không sửa source text.
- Keyword highlight phải khác user highlight.
- Không làm hỏng annotation Milestone 4.
- Tooltip không che nội dung quan trọng.
- Side panel có glossary và occurrences.
- Cho phép tắt toàn bộ keyword layer.
- Không chỉ dựa vào màu.
- Tooltip dùng keyboard được.
- Screen reader có label.

## 10. Evaluation dataset

Tạo dataset có:

- True positive.
- Alias.
- Ambiguous word.
- Common word.
- Vietnamese and English context.
- Beginner/intermediate/advanced relevance.
- Negative examples.

Metrics:

- Precision.
- Recall.
- F1.
- False highlights/1.000 words.
- User correction rate.
- Average highlights/section.

Ưu tiên Precision trước Recall trong MVP.

## 11. Acceptance criteria

```text
[ ] Taxonomy được seed và version
[ ] Exact/alias matching hoạt động
[ ] Occurrence có block và offsets
[ ] Không phá user highlights
[ ] Tooltip hiển thị đúng keyword
[ ] Other occurrences điều hướng đúng block
[ ] Category filter hoạt động
[ ] User level thay đổi density
[ ] Feedback được lưu
[ ] Candidate mơ hồ không bị highlight bừa
[ ] False-highlight benchmark được ghi nhận
[ ] Processing retry không tạo duplicate occurrence
[ ] Ownership được kiểm tra
[ ] Lint, type-check, test và build pass
```

## 12. Test bắt buộc

### Backend

- Exact match.
- Alias match.
- Case handling.
- Unicode tiếng Việt.
- Ambiguous negatives.
- Offset correctness.
- Duplicate prevention.
- Taxonomy version.
- User feedback ownership.
- Document deletion cascade.

### Frontend

- Keyword render.
- Tooltip keyboard access.
- Category filter.
- User level.
- Occurrence navigation.
- Toggle off.
- Coexistence với user highlight.
- Empty glossary.
- Loading/error states.

## 13. Prompt thực thi cho coding agent

```text
Đọc toàn bộ tài liệu dự án và file milestone này.

Chỉ triển khai Milestone 5 — IT/AI Keyword Intelligence.

Tạo taxonomy có version, keyword occurrence, exact/alias matching,
context rules, confidence, suppression, glossary, tooltip, occurrences,
filters, user level và feedback.

Ưu tiên precision. Không dùng LLM cho toàn bộ tài liệu.
Nếu triển khai LLM validation, chỉ dùng cho candidate mơ hồ và phải có cache,
structured output, timeout và fallback.

Không triển khai RAG, summary, flashcard, quiz hoặc format mới.

Viết migration, seed taxonomy, evaluation dataset, backend/frontend tests.
Chạy lint, type-check, test, benchmark và production build.
```
