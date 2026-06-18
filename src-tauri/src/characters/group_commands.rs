use crate::characters::group_db::{self as character_group_db, CharacterGroupDbState};
use crate::shared::db_utils::run_db_command;
use tauri::State;

#[tauri::command]
pub async fn create_character_group(
    input: String,
    state: State<'_, CharacterGroupDbState>,
) -> Result<character_group_db::CharacterGroupRow, String> {
    run_db_command(state.inner(), "character_group", move |conn| {
        character_group_db::create_character_group(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn get_character_group(
    id: String,
    state: State<'_, CharacterGroupDbState>,
) -> Result<character_group_db::CharacterGroupRow, String> {
    run_db_command(state.inner(), "character_group", move |conn| {
        character_group_db::get_character_group(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn update_character_group(
    input: String,
    state: State<'_, CharacterGroupDbState>,
) -> Result<character_group_db::CharacterGroupRow, String> {
    run_db_command(state.inner(), "character_group", move |conn| {
        character_group_db::update_character_group(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn list_character_groups(
    filter: String,
    state: State<'_, CharacterGroupDbState>,
) -> Result<Vec<character_group_db::CharacterGroupRow>, String> {
    run_db_command(state.inner(), "character_group", move |conn| {
        character_group_db::list_character_groups(conn, filter)
    })
    .await
}

#[tauri::command]
pub async fn delete_character_group(
    id: String,
    state: State<'_, CharacterGroupDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "character_group", move |conn| {
        character_group_db::delete_character_group(conn, id)
    })
    .await
}
