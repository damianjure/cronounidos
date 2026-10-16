-- Recipient lookups and Auth FK checks need user_id as the leading column.
-- The unique (meeting_id,user_id) index does not cover that access path.
create index feedback_requests_recipient on private.feedback_requests(user_id,org_id) where user_id is not null;
-- Include recipients without accounts too: the uniqueness index is partial.
create index feedback_requests_meeting on private.feedback_requests(meeting_id);
