# Milestone 7 — DOCX, EPUB & URL Import

## 1. Mục tiêu

Mở rộng pipeline từ PDF sang DOCX, EPUB và bài viết web trong khi giữ cùng một canonical `ContentBlock` contract.

Sau milestone này:

- Người dùng upload DOCX.
- Người dùng upload EPUB.
- Người dùng nhập URL bài viết công khai.
- Tất cả format hiển thị trong cùng Reader.
- Keyword, annotation và RAG dùng lại được.

## 2. Nguyên tắc

Mỗi parser là adapter:

```text
Input format
→ Parser-specific extraction
→ Normalized document contract
→ ContentBlock
→ Existing Reader/Keyword/RAG
```

Không tạo Reader hoặc RAG riêng cho từng format.

## 3. Phạm vi P0

### DOCX

- Heading styles.
- Paragraph.
- List.
- Table.
- Image reference.
- Basic code-style paragraph.
- Metadata và source order.

### EPUB

- Package metadata.
- Spine order.
- Chapters.
- Headings.
- Paragraphs.
- Images.
- Internal links cơ bản.
- DRM detection và refusal.

### URL article

- HTTP/HTTPS.
- SSRF protection.
- Redirect/size/timeout limit.
- Main-content extraction.
- Heading, paragraph, list, code, image.
- Store source URL.
- Sanitize HTML.

## 4. Ngoài phạm vi

- Login-required websites.
- Bypass paywall.
- Browser automation phức tạp.
- Full JavaScript rendering.
- DRM removal.
- Arbitrary website crawling.
- Slide/PPTX.
- Google Drive connector.
- Batch import.

## 5. Parser contract

Mọi parser trả:

```json
{
  "metadata": {
    "title": "",
    "author": "",
    "language": "",
    "source_type": "",
    "page_count": null
  },
  "outline": [],
  "blocks": [],
  "assets": [],
  "warnings": []
}
```

Mỗi block:

```text
local_id
parent_local_id
sequence_number
block_type
text
html
chapter_index
section_index
paragraph_index
page_number
source_url
metadata
```

PDF-specific bounding box có thể null với DOCX, EPUB và URL.

## 6. Document type và layout

Classifier sử dụng:

- Native format.
- Heading depth.
- Code ratio.
- Image ratio.
- Abstract/references.
- Chapter metadata.

Layout:

```text
BOOK
PAPER
TECHNICAL_DOCUMENTATION
BLOG_ARTICLE
GENERAL_DOCUMENT
```

Người dùng có quyền override.

## 7. URL security

Bắt buộc:

- Chỉ HTTP/HTTPS.
- Block localhost, private IP, link-local, metadata endpoints.
- Revalidate sau redirect.
- Giới hạn redirect.
- Giới hạn response bytes.
- Timeout.
- Content-type allowlist.
- Sanitize HTML.
- Không execute remote JavaScript.
- Không tải resource không cần thiết.
- Không vượt cơ chế bảo vệ website.

## 8. APIs

Upload endpoint hiện có mở rộng MIME allowlist.

```http
POST /api/documents/upload
POST /api/documents/import-url
GET  /api/documents/{document_id}/processing-status
```

Import URL request:

```json
{
  "url": "https://example.com/article",
  "title": null
}
```

## 9. Fallback

### DOCX phức tạp

- Simplified reading mode.
- Cảnh báo formatting có thể khác bản gốc.
- Cho phép tải/xem file gốc.

### EPUB lỗi

- Báo package/spine không hợp lệ.
- Không cố bypass DRM.

### URL bị chặn

- Yêu cầu upload file hoặc dán nội dung được phép.
- Không vượt cơ chế bảo vệ website.

## 10. Acceptance criteria

```text
[ ] DOCX heading/paragraph/list được giữ thứ tự
[ ] EPUB chapter/spine đúng thứ tự
[ ] URL article loại bỏ navigation/quảng cáo chính
[ ] Tất cả format dùng ContentBlock contract
[ ] Existing Reader hoạt động
[ ] Existing keyword layer hoạt động
[ ] Existing RAG và citation hoạt động
[ ] Annotation ổn định theo document version
[ ] URL import chống SSRF
[ ] HTML được sanitize
[ ] DRM/paywall không bị bypass
[ ] Parser retry không duplicate
[ ] Lint, type-check, test và build pass
```

## 11. Test bắt buộc

### DOCX

- Heading nhiều cấp.
- List.
- Table.
- Image.
- Unicode tiếng Việt.
- File hỏng.

### EPUB

- Chapter order.
- Metadata.
- Internal image.
- Missing spine.
- DRM marker.
- File hỏng.

### URL

- Valid article.
- Redirect.
- Private IP.
- Oversized response.
- Unsupported content type.
- Malicious HTML.
- Timeout.
- Blocked site.

### Regression

- PDF vẫn hoạt động.
- Keyword, RAG, annotation không lỗi.

## 12. Prompt thực thi cho coding agent

```text
Đọc toàn bộ tài liệu dự án và file milestone này.

Chỉ triển khai Milestone 7 — DOCX, EPUB & URL Import.

Tạo parser adapters dùng chung normalized contract.
Không tạo Reader/RAG riêng theo format.
Mở rộng upload, processing status và import-url API.

Triển khai SSRF protection, redirect/size/timeout limits,
HTML sanitization và DRM refusal.

Chạy regression test cho PDF, Reader, annotation, keyword và RAG.

Không triển khai PPTX, crawler nhiều trang, paywall bypass,
browser automation phức tạp hoặc Google Drive.

Chạy lint, type-check, test và production build.
```
