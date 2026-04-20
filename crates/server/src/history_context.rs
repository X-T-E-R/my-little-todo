use std::future::Future;

tokio::task_local! {
    static HISTORY_GROUP_ID: String;
}

pub fn new_history_group_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

pub async fn with_history_group<T>(group_id: String, future: impl Future<Output = T>) -> T {
    HISTORY_GROUP_ID.scope(group_id, future).await
}

pub fn current_history_group_id() -> Option<String> {
    HISTORY_GROUP_ID.try_with(Clone::clone).ok()
}
