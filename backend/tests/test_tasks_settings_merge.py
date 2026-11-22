"""Saving one tasks setting must not reset the others (issue #106)."""

from app.api.v1.endpoints.projects import merge_tasks_settings

SAVED = {
    "columns": [{"id": "todo", "title": "To Do", "color": "bg-gray-500"}],
    "defaultColumnId": "todo",
    "completedColumnId": "done",
    "defaultTemplatePath": "templates/Basic.md",
    "autoCommitOnTaskUpdate": True,
}


def test_partial_update_keeps_other_settings():
    merged = merge_tasks_settings(SAVED, {"defaultTemplatePath": "templates/Scene.md"})
    assert merged["defaultTemplatePath"] == "templates/Scene.md"
    assert merged["autoCommitOnTaskUpdate"] is True
    assert merged["completedColumnId"] == "done"
    assert merged["columns"] == SAVED["columns"]


def test_column_save_keeps_auto_commit_and_template():
    # The Tasks view's Manage Columns only sends columns and the default column
    cols = [{"id": "draft", "title": "Draft", "color": "bg-blue-500"}]
    merged = merge_tasks_settings(SAVED, {"columns": cols, "defaultColumnId": "draft"})
    assert merged["columns"] == cols
    assert merged["defaultColumnId"] == "draft"
    assert merged["autoCommitOnTaskUpdate"] is True
    assert merged["defaultTemplatePath"] == "templates/Basic.md"


def test_false_is_saved_not_dropped():
    merged = merge_tasks_settings(SAVED, {"autoCommitOnTaskUpdate": False})
    assert merged["autoCommitOnTaskUpdate"] is False


def test_null_clears_a_setting():
    merged = merge_tasks_settings(SAVED, {"defaultTemplatePath": None, "completedColumnId": None})
    assert "defaultTemplatePath" not in merged
    assert "completedColumnId" not in merged
    assert merged["autoCommitOnTaskUpdate"] is True


def test_empty_saved_settings():
    assert merge_tasks_settings({}, {"autoCommitOnTaskUpdate": True}) == {
        "autoCommitOnTaskUpdate": True
    }
    assert merge_tasks_settings(None, {"a": 1}) == {"a": 1}


def test_does_not_mutate_saved_settings():
    saved = dict(SAVED)
    merge_tasks_settings(saved, {"defaultColumnId": "other", "defaultTemplatePath": None})
    assert saved == SAVED
