use rusqlite::Connection;

use super::threads::query_strings;

pub fn get_smart_view_thread_ids(
    conn: &Connection,
    account_id: &str,
    smart_view: &str,
) -> Result<Vec<String>, String> {
    match smart_view {
        "urgent" => query_strings(
            conn,
            "SELECT DISTINCT o.thread_id FROM email_ai_outputs o
             JOIN email_threads t ON t.id = o.thread_id
             WHERE t.account_id = ?1 AND t.is_archived = 0 AND o.task_type = 'urgency_score'
               AND json_extract(o.result_json, '$.level') IN ('critical', 'high')
             ORDER BY t.last_message_at DESC",
            rusqlite::params![account_id],
        ),
        "spam" => query_strings(
            conn,
            "SELECT DISTINCT o.thread_id FROM email_ai_outputs o
             JOIN email_threads t ON t.id = o.thread_id
             WHERE t.account_id = ?1 AND t.is_archived = 0 AND o.task_type = 'spam_score'
               AND CAST(json_extract(o.result_json, '$.spamScore') AS REAL) > 0.7
             ORDER BY t.last_message_at DESC",
            rusqlite::params![account_id],
        ),
        "marketing" => query_strings(
            conn,
            "SELECT DISTINCT o.thread_id FROM email_ai_outputs o
             JOIN email_threads t ON t.id = o.thread_id
             WHERE t.account_id = ?1 AND t.is_archived = 0 AND o.task_type = 'spam_score'
               AND (CAST(json_extract(o.result_json, '$.marketingScore') AS REAL) > 0.7
                    OR json_extract(o.result_json, '$.newsletter') = 1)
             ORDER BY t.last_message_at DESC",
            rusqlite::params![account_id],
        ),
        "needs_reply" => query_strings(
            conn,
            "SELECT DISTINCT o.thread_id FROM email_ai_outputs o
             JOIN email_threads t ON t.id = o.thread_id
             WHERE t.account_id = ?1 AND t.is_archived = 0 AND o.task_type = 'classification'
               AND json_extract(o.result_json, '$.needsReply') = 1
             ORDER BY t.last_message_at DESC",
            rusqlite::params![account_id],
        ),
        "has_attachments" => query_strings(
            conn,
            "SELECT DISTINCT t.id FROM email_threads t
             JOIN email_messages m ON m.thread_id = t.id
             JOIN email_attachments a ON a.message_id = m.id
             WHERE t.account_id = ?1 AND t.is_archived = 0
             ORDER BY t.last_message_at DESC",
            rusqlite::params![account_id],
        ),
        _ => Ok(vec![]),
    }
}
