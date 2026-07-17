# Milestone 8 — Evaluation, Security & Production Deployment

## 1. Mục tiêu

Đưa NexaRead AI từ bản chạy local/staging thành MVP production có:

- Evaluation baseline.
- Security controls.
- Observability.
- Cost tracking.
- Deployment repeatable.
- Runbook và rollback.
- Demo ổn định.

## 2. Phạm vi P0

### Evaluation

- Document parser metrics.
- Keyword benchmark.
- RAG golden dataset.
- Citation validation metrics.
- No-answer accuracy.
- Latency và cost.
- Regression report.

### Security

- Upload validation.
- Malware scanning strategy.
- Parser isolation.
- SSRF protection.
- Authorization audit.
- Prompt-injection red team.
- Secret management.
- Rate limiting.
- Data deletion.
- Audit log.
- Dependency scanning.

### Production

- Staging và production.
- Managed PostgreSQL.
- Redis.
- S3/R2.
- Backend deployment.
- Worker deployment.
- Frontend deployment.
- Migration workflow.
- Monitoring.
- Error tracking.
- Backup.
- Rollback.
- Health/readiness endpoints.

## 3. Evaluation outputs

Tạo thư mục:

```text
evaluation/
├── datasets/
├── parser/
├── keywords/
├── rag/
├── security/
└── reports/
```

Báo cáo release:

```text
release-version
commit-sha
dataset-version
model
embedding-model
parser-version
metrics
latency
cost
known-limitations
timestamp
```

Không so sánh benchmark giữa hai phiên bản nếu dataset, model hoặc config khác mà không ghi rõ.

## 4. Metrics

### Parser

- Parse success rate theo format.
- Heading accuracy.
- TOC accuracy.
- Block source-location coverage.
- Processing p50/p95.
- Failure category.

### Keyword

- Precision.
- Recall.
- F1.
- False highlights/1.000 words.
- User correction rate.

### RAG

- Retrieval Recall@K.
- Context precision.
- Faithfulness.
- Answer relevance.
- Citation accuracy.
- Citation coverage.
- No-answer accuracy.
- Latency p50/p95.
- Token và cost/request.

### Product

- Upload completion.
- Readable conversion rate.
- Return-to-document.
- AI usage/document.
- Citation click rate.
- Error rate.

## 5. Security checklist

### File upload

```text
[ ] MIME sniffing
[ ] Size limit
[ ] Empty file rejection
[ ] Random storage key
[ ] No path traversal
[ ] Executable rejection
[ ] Parser timeout
[ ] CPU/memory limit
[ ] Malware scan hoặc compensating control
```

### Authorization

```text
[ ] Document
[ ] Object
[ ] ContentBlock
[ ] Chunk
[ ] Annotation
[ ] Chat
[ ] Citation
[ ] Processing status
```

### URL import

```text
[ ] SSRF
[ ] DNS rebinding considerations
[ ] Redirect validation
[ ] Response size
[ ] Timeout
[ ] Protocol allowlist
[ ] HTML sanitization
```

### AI

```text
[ ] Document is untrusted data
[ ] Prompt injection tests
[ ] No secret disclosure
[ ] No cross-user retrieval
[ ] Citation validation
[ ] No-answer
[ ] Provider timeout
[ ] Token limit
[ ] Rate limit
```

### Privacy

```text
[ ] Private by default
[ ] Signed URL
[ ] Delete original and derived data
[ ] Delete embedding
[ ] Minimize provider context
[ ] No training on private documents
[ ] Logs avoid full private text
```

## 6. Deployment topology

Khuyến nghị MVP:

```text
Frontend: Vercel
API: Railway hoặc Cloud Run
Worker: Railway worker hoặc Cloud Run Job/worker
Database: Managed PostgreSQL
Vector: pgvector
Redis: Managed Redis
Storage: Cloudflare R2 hoặc S3
Monitoring: provider metrics + error tracking
```

Tách environment:

```text
local
staging
production
```

Mỗi environment có database, storage prefix/bucket, Redis namespace và secret riêng.

## 7. CI/CD

Pipeline tối thiểu:

1. Install.
2. Lint.
3. Type-check.
4. Unit tests.
5. Integration tests.
6. Frontend build.
7. Backend container build.
8. Security/dependency scan.
9. Migration dry check.
10. Deploy staging.
11. Smoke tests.
12. Manual production approval.
13. Deploy production.
14. Post-deploy smoke tests.

Không auto-deploy production nếu evaluation hoặc security gate thất bại.

## 8. Health checks

### Liveness

```http
GET /health/live
```

### Readiness

```http
GET /health/ready
```

Readiness kiểm tra:

- Database.
- Redis.
- Storage.
- Queue.
- Migration compatibility.

AI dependency status nên tách riêng nếu provider không ổn định.

## 9. Observability

Log structured:

- request_id.
- safe user identifier.
- document_id.
- job_id.
- stage.
- duration.
- status.
- error_code.
- model.
- token usage.
- cost estimate.

Không log full private document text mặc định.

Alert:

- API error spike.
- Worker queue depth.
- Processing failure.
- Storage failure.
- DB connection failure.
- Citation validation failure.
- AI cost spike.
- Rate-limit spike.

## 10. Backup và rollback

### Database

- Automated backup.
- Point-in-time recovery nếu provider hỗ trợ.
- Migration có rollback hoặc documented forward fix.

### Storage

- Versioning/lifecycle phù hợp.
- Xóa theo privacy policy.

### Release

- Tag.
- Commit SHA.
- Image version.
- Environment config version.
- Rollback runbook.

## 11. Production acceptance criteria

```text
[ ] Staging deploy tự động
[ ] Production deploy có approval
[ ] Migration chạy an toàn
[ ] Smoke test pass
[ ] Health/readiness pass
[ ] Upload và processing pass
[ ] Reader pass
[ ] Keyword pass
[ ] RAG citation pass
[ ] Delete data pass
[ ] Authorization red-team pass
[ ] Prompt injection pass
[ ] Evaluation report có baseline
[ ] Latency/cost được ghi nhận
[ ] Monitoring và alert hoạt động
[ ] Backup và rollback được tài liệu hóa
[ ] README và runbook cập nhật
```

## 12. Demo production

1. Upload PDF kỹ thuật.
2. Processing status.
3. Reader.
4. Theme/progress/bookmark/highlight.
5. Keyword tooltip.
6. Hỏi AI.
7. Citation về đúng đoạn.
8. Unsupported question → no-answer.
9. Library.
10. Delete document.
11. Metrics report.

## 13. Prompt thực thi cho coding agent

```text
Đọc toàn bộ tài liệu dự án và file milestone này.

Chỉ triển khai Milestone 8 — Evaluation, Security & Production Deployment.

Không thêm tính năng sản phẩm mới. Tập trung benchmark, security hardening,
observability, cost tracking, CI/CD, staging/production, backup và rollback.

Tạo evaluation datasets/versioning, automated runner và release report.
Thực hiện authorization audit, prompt-injection red team, SSRF/file-upload
security tests, rate limits và deletion verification.

Thiết lập health/live, health/ready, structured logs, metrics và alerts.
Tạo staging deployment trước production. Production phải có approval gate.

Không giả lập benchmark hoặc báo pass khi test chưa chạy.
Ghi lại command, commit, dataset, model, latency và cost thực tế.

Cập nhật README, deployment guide, runbook và rollback procedure.
```
