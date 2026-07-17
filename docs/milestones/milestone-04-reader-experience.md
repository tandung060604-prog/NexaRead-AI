# Milestone 4 — Reader Experience & Annotation

## 1. Mục tiêu

Biến Reader cơ bản từ Milestone 3 thành trải nghiệm đọc hoàn chỉnh, ổn định và có khả năng lưu trạng thái.

Sau milestone này, người dùng có thể:

- Đọc tài liệu dài mượt mà.
- Tùy chỉnh giao diện đọc.
- Tiếp tục từ vị trí cũ.
- Bookmark nội dung.
- Highlight một đoạn trong một `ContentBlock`.
- Thêm, sửa và xóa ghi chú.
- Điều hướng từ TOC, search, bookmark và annotation đến đúng block.
- Đọc trên desktop và mobile.

## 2. Điều kiện đầu vào

```text
[ ] Upload PDF
[ ] Lưu object storage
[ ] Processing worker
[ ] Page và ContentBlock
[ ] TOC
[ ] Search lexical
[ ] Reader cơ bản
[ ] Original PDF fallback
[ ] Ownership checks
```

## 3. Phạm vi P0

### Reader

- Virtualized rendering.
- Stable block navigation.
- Light, dark và sepia themes.
- Font size, line height và reading width.
- Focus Mode.
- Responsive desktop/mobile.
- Khôi phục reading progress.
- Debounced autosave.

### Annotation

- Bookmark.
- Highlight trong một block.
- Năm màu semantic: yellow, green, blue, pink, purple.
- Note gắn với highlight.
- Annotation panel.
- Điều hướng đến annotation.
- Ownership isolation.

### Technical block renderer

- Code block: syntax highlighting, copy, horizontal scroll.
- Table: responsive overflow và fallback.
- Formula: KaTeX khi có source hợp lệ, fallback text.
- Image: lazy loading và protected URL.

## 4. Ngoài phạm vi

Không triển khai:

- Automatic IT/AI keyword detection.
- Embedding hoặc vector search.
- RAG hoặc LLM.
- AI summary.
- OCR.
- DOCX, EPUB hoặc URL import.
- Cross-block highlight.
- Page flip.
- Collaboration.

## 5. Database

### `reading_progress`

```text
id
user_id
document_id
document_version_id
last_block_id
page_number
progress_percent
scroll_offset
reading_mode
updated_at
```

Ràng buộc: `UNIQUE(user_id, document_id)`.

### `bookmarks`

```text
id
user_id
document_id
document_version_id
content_block_id
page_number
title
created_at
```

### `highlights`

```text
id
user_id
document_id
document_version_id
content_block_id
start_offset
end_offset
selected_text
prefix_text
suffix_text
color
status
created_at
updated_at
```

`status`: `ACTIVE`, `NEEDS_REVIEW`, `ORPHANED`.

### `notes`

```text
id
user_id
highlight_id
content
created_at
updated_at
```

### `user_reading_preferences`

```text
id
user_id
theme
font_size
line_height
reading_width
font_family
focus_mode
updated_at
```

## 6. APIs

```http
GET /api/documents/{document_id}/progress
PUT /api/documents/{document_id}/progress

GET    /api/documents/{document_id}/bookmarks
POST   /api/documents/{document_id}/bookmarks
DELETE /api/bookmarks/{bookmark_id}

GET    /api/documents/{document_id}/highlights
POST   /api/documents/{document_id}/highlights
PATCH  /api/highlights/{highlight_id}
DELETE /api/highlights/{highlight_id}

POST   /api/highlights/{highlight_id}/note
PATCH  /api/notes/{note_id}
DELETE /api/notes/{note_id}

GET /api/users/me/reading-preferences
PUT /api/users/me/reading-preferences
```

## 7. Virtualized navigation

Tạo hàm dùng chung:

```ts
navigateToBlock(blockId: string): Promise<void>
```

Hàm phải:

1. Xác định index/page của block.
2. Tải dữ liệu nếu chưa có.
3. Cuộn virtualizer tới block.
4. Chờ block mount.
5. Focus hoặc flash block.

TOC, search, bookmark, highlight, note, progress restoration và citation sau này phải dùng cùng cơ chế.

## 8. Highlight contract

Trong MVP, selection phải nằm trong một block.

Backend kiểm tra:

- Block thuộc đúng document.
- Document thuộc đúng user.
- Offset hợp lệ.
- `start_offset < end_offset`.
- `end_offset <= len(block.text)`.
- `selected_text` phù hợp đoạn text.
- Document version khớp.

Không dùng DOM Range làm định danh lưu trữ lâu dài.

## 9. Autosave

### Progress

- Debounce 1–3 giây.
- Lưu khi block hiện tại thay đổi.
- Lưu khi tab chuyển hidden.
- Không gửi request trên từng pixel scroll.

### Note

- Lưu khi bấm Save hoặc autosave sau khoảng một giây.
- Hiển thị `Saving`, `Saved`, `Failed`.

## 10. Acceptance criteria

```text
[ ] Reader không mount toàn bộ tài liệu dài
[ ] 1.000 ContentBlock vẫn cuộn mượt
[ ] TOC điều hướng đúng
[ ] Search điều hướng đúng
[ ] Progress được lưu và khôi phục
[ ] Bookmark được tạo, xóa và điều hướng
[ ] Highlight tồn tại sau reload
[ ] Note được tạo, sửa và xóa
[ ] Annotation của user khác không truy cập được
[ ] Theme và preferences được lưu
[ ] Focus Mode hoạt động
[ ] Mobile dùng drawer/bottom sheet
[ ] Code copy hoạt động
[ ] Table không phá layout
[ ] Formula có fallback
[ ] Original PDF vẫn hoạt động
[ ] Lint, type-check, test và build pass
```

## 11. Test bắt buộc

### Backend

- Create/update progress.
- Ownership của progress.
- Create/delete bookmark.
- Valid/invalid highlight offsets.
- Highlight sai document.
- Create/update/delete note.
- Cascade khi document bị xóa.
- Preference persistence.

### Frontend

- Virtualized reader.
- Restore position.
- Progress debounce.
- Theme và Focus Mode.
- Create/render/delete highlight.
- Add/edit/delete note.
- Bookmark navigation.
- Mobile drawers.
- Save failure.
- Code copy.
- Formula fallback.

### Performance

Benchmark với 100, 1.000 và 5.000 blocks. Xác nhận không mount toàn bộ 5.000 block cùng lúc.

## 12. Prompt thực thi cho coding agent

```text
Đọc README.md, AGENTS.md, docs/product-brief.md,
docs/mvp-requirements.md, docs/architecture.md và file milestone này.

Chỉ triển khai Milestone 4 — Reader Experience & Annotation.

Giữ nguyên các chức năng Milestone 1–3. Triển khai virtualized reader,
stable navigateToBlock, reading preferences, reading progress, bookmark,
single-block highlight, note, annotation panel và technical block renderers.

Không triển khai keyword intelligence, RAG, LLM, OCR hoặc format mới.

Tạo migration, APIs, backend tests, frontend tests và benchmark.
Chạy lint, type-check, toàn bộ test và production build.
Không bỏ qua test thất bại.

Báo cáo file thay đổi, migration, APIs, lệnh đã chạy, kết quả,
cách kiểm tra thủ công, hạn chế và xác nhận phần ngoài phạm vi.
```
