# MVP Requirements

## Must Have

- User can upload PDF or text documents.
- System extracts text and stores document metadata.
- System chunks and indexes document content for retrieval.
- User can ask questions over uploaded documents.
- Answers include citations or source references.
- Basic ingestion status is visible to the user.

## Should Have

- Document library view with search and filters.
- Conversation history per document or collection.
- Evaluation set for retrieval and answer grounding quality.
- Worker process for asynchronous ingestion.

## Out of Scope

- Collaborative editing
- Mobile native apps
- Complex role-based permissions
- Enterprise SSO

## Success Criteria

- End-to-end local smoke test passes for upload, ingestion, retrieval, and grounded answer generation.
- Evaluation fixtures cover common answerable, unanswerable, and citation-required questions.
