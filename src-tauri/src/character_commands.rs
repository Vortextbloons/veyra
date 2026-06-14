use crate::character_db::{self, CharacterDbState};
use crate::db_utils::run_db_command;
use tauri::State;

#[tauri::command]
pub async fn create_character(
    input: String,
    state: State<'_, CharacterDbState>,
) -> Result<character_db::CharacterRow, String> {
    run_db_command(state.inner(), "character", move |conn| {
        character_db::create_character(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn get_character(
    id: String,
    state: State<'_, CharacterDbState>,
) -> Result<character_db::CharacterRow, String> {
    run_db_command(state.inner(), "character", move |conn| {
        character_db::get_character(conn, id)
    })
    .await
}

#[tauri::command]
pub async fn update_character(
    input: String,
    state: State<'_, CharacterDbState>,
) -> Result<character_db::CharacterRow, String> {
    run_db_command(state.inner(), "character", move |conn| {
        character_db::update_character(conn, input)
    })
    .await
}

#[tauri::command]
pub async fn list_characters(
    filter: String,
    state: State<'_, CharacterDbState>,
) -> Result<Vec<character_db::CharacterRow>, String> {
    run_db_command(state.inner(), "character", move |conn| {
        character_db::list_characters(conn, filter)
    })
    .await
}

#[tauri::command]
pub async fn delete_character(
    id: String,
    state: State<'_, CharacterDbState>,
) -> Result<(), String> {
    run_db_command(state.inner(), "character", move |conn| {
        character_db::delete_character(conn, id)
    })
    .await
}
