use tauri_plugin_sql::{Builder as SqlBuilder, Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create_core_tables",
            sql: include_str!("../migrations/001_init.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "checkpoints_and_tags",
            sql: include_str!("../migrations/002_checkpoints_tags.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "burst_arc_notes",
            sql: include_str!("../migrations/003_burst_arc_notes.sql"),
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(
            SqlBuilder::default()
                .add_migrations("sqlite:pragmat.db", migrations)
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running Pragmat");
}
