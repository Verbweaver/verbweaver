import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { projectsApi } from '../../api/projects';
import { Button } from '../../components/ui/Button';
import { Save, AlertCircle, RefreshCcw } from 'lucide-react';
import ColumnManager, { KanbanColumn } from '../../components/tasks/ColumnManager';
import { templatesApi, Template } from '../../api/templates';
import { desktopTemplatesApi } from '../../api/desktop-templates';

interface CompilerSettings {
  defaultTemplates?: {
    [format: string]: string;
  };
}

export default function ProjectSettingsPage() {
  const { currentProject } = useProjectStore();
  const [compilerSettings, setCompilerSettings] = useState<CompilerSettings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [reseeding, setReseeding] = useState(false)
  // Tasks/Statuses settings
  const [taskColumns, setTaskColumns] = useState<KanbanColumn[]>([
    { id: 'todo', title: 'To Do', color: 'bg-gray-500' },
    { id: 'in-progress', title: 'In Progress', color: 'bg-blue-500' },
    { id: 'review', title: 'Review', color: 'bg-amber-500' },
    { id: 'done', title: 'Done', color: 'bg-green-500' },
  ]);
  const [defaultColumnId, setDefaultColumnId] = useState<string>('todo');
  const [completedColumnId, setCompletedColumnId] = useState<string | null>(null);
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [defaultTemplatePath, setDefaultTemplatePath] = useState<string | ''>('');
  const [autoCommitOnTaskUpdate, setAutoCommitOnTaskUpdate] = useState<boolean>(false);
  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

  const supportedFormats = [
    { id: 'pdf', name: 'PDF' },
    { id: 'docx', name: 'Word Document' },
    { id: 'html', name: 'HTML' },
    { id: 'markdown', name: 'Markdown' },
    { id: 'epub', name: 'EPUB' },
    { id: 'odt', name: 'OpenDocument' },
  ];

  useEffect(() => {
    if (currentProject) {
      loadCompilerSettings();
      loadTasksSettings();
      loadTemplatesList();
    }
  }, [currentProject]);

  const loadCompilerSettings = async () => {
    if (!currentProject) return;

    try {
      setIsLoading(true);
      setError(null);
      const settings = await projectsApi.getCompilerSettings(currentProject.id);
      setCompilerSettings(settings);
    } catch (err) {
      console.error('Error loading compiler settings:', err);
      setError('Failed to load compiler settings');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!currentProject) return;

    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      await projectsApi.updateCompilerSettings(currentProject.id, compilerSettings);
      setSuccess('Compiler settings saved successfully');
    } catch (err) {
      console.error('Error saving compiler settings:', err);
      setError('Failed to save compiler settings');
    } finally {
      setIsSaving(false);
    }
  };

  const loadTasksSettings = async () => {
    if (!currentProject) return;
    try {
      const ts = await projectsApi.getTasksSettings(currentProject.id);
      if (Array.isArray(ts.columns) && ts.columns.length > 0) {
        setTaskColumns(ts.columns);
      }
      if (ts.defaultColumnId) setDefaultColumnId(ts.defaultColumnId);
      if (typeof ts.completedColumnId !== 'undefined') setCompletedColumnId(ts.completedColumnId || null);
      if (typeof ts.defaultTemplatePath === 'string') setDefaultTemplatePath(ts.defaultTemplatePath);
      if (typeof ts.autoCommitOnTaskUpdate === 'boolean') setAutoCommitOnTaskUpdate(!!ts.autoCommitOnTaskUpdate);
    } catch (e) {
      // Non-fatal; keep defaults
      console.warn('Failed to load tasks settings', e);
    }
  };

  const persistTasksSettings = async (cols: KanbanColumn[], defId: string, compId: string | null) => {
    if (!currentProject) return;
    try {
      setTaskColumns(cols);
      setDefaultColumnId(defId);
      setCompletedColumnId(compId);
      await projectsApi.updateTasksSettings(currentProject.id, {
        columns: cols,
        defaultColumnId: defId,
        completedColumnId: compId,
        defaultTemplatePath: defaultTemplatePath || undefined,
        autoCommitOnTaskUpdate: autoCommitOnTaskUpdate,
      });
    } catch (e) {
      console.error('Failed to save tasks settings', e);
      // Reload to keep UI consistent
      await loadTasksSettings();
    }
  };

  const reseedTemplatesIntoProject = async () => {
    if (!currentProject) return
    setReseeding(true)
    try {
      if (isElectron && (window as any).electronAPI && (useProjectStore.getState().currentProjectPath)) {
        const projectPath = (useProjectStore.getState().currentProjectPath)!
        // Desktop: reseed via IPC so local files get overwritten
        await (window as any).electronAPI.createDirectory(projectPath) // ensure exists
        await (window as any).electronAPI.readDirectory(projectPath) // ensure permissions
        await (window as any).electronAPI.reseedTemplates(projectPath)
      } else {
        await projectsApi.reseedTemplates(currentProject.id)
      }
      setSuccess('Templates re-seeded into this project')
    } catch (e) {
      setError('Failed to re-seed templates');
    } finally {
      setReseeding(false)
    }
  }

  const loadTemplatesList = async () => {
    try {
      if (!currentProject) return;
      if (isElectron && (window as any).electronAPI) {
        const list = await desktopTemplatesApi.listTemplates((useProjectStore.getState().currentProjectPath)!)
        setTemplates(list)
      } else {
        const list = await templatesApi.listTemplates(currentProject.id)
        setTemplates(list)
      }
    } catch (e) {
      console.warn('Failed to load templates', e)
      setTemplates([])
    }
  }

  const handleDefaultTemplateChange = (format: string, templatePath: string) => {
    setCompilerSettings(prev => ({
      ...prev,
      defaultTemplates: {
        ...prev.defaultTemplates,
        [format]: templatePath
      }
    }));
  };

  if (!currentProject) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Project Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            No project is currently selected.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Project Settings</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Loading project settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Project Settings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure settings for project: <strong>{currentProject.name}</strong>
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md text-green-600">
          <Save className="h-4 w-4" />
          <span className="text-sm">{success}</span>
        </div>
      )}

      <div className="space-y-6">
        {/* Tasks section first */}
        <div>
          <h3 className="text-md font-medium text-foreground mb-2">Tasks</h3>
          <p className="text-sm text-muted-foreground mb-3">Manage task statuses (Kanban columns) for this project.</p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsColumnManagerOpen(true)}
              className="flex items-center gap-2"
            >
              Manage Statuses
            </Button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              id="vw-auto-commit"
              type="checkbox"
              checked={autoCommitOnTaskUpdate}
              onChange={async (e) => {
                const next = e.target.checked;
                setAutoCommitOnTaskUpdate(next);
                // Persist immediately alongside existing tasks settings
                if (currentProject) {
                  try {
                    await projectsApi.updateTasksSettings(currentProject.id, {
                      columns: taskColumns,
                      defaultColumnId,
                      completedColumnId,
                      defaultTemplatePath: defaultTemplatePath || undefined,
                      autoCommitOnTaskUpdate: next,
                    })
                  } catch (err) {
                    console.error('Failed to save auto-commit setting', err)
                  }
                }
              }}
            />
            <label htmlFor="vw-auto-commit" className="text-sm select-none">Automatically git commit when Task details change</label>
          </div>
        </div>

        <div>
          <h3 className="text-md font-medium text-foreground mb-2">Default Template</h3>
          <p className="text-sm text-muted-foreground mb-3">
<<<<<<< HEAD
            The template pre-selected when creating a new task/node. If not set, we'll try <code>templates/Empty.md</code> if it exists.
=======
            The template pre-selected when creating a new task/node. If not set, we'll try <code>templates/Basic.md</code> if it exists.
>>>>>>> release-testing
          </p>
          <div className="flex items-center gap-2">
            <select
              className="w-full max-w-lg px-3 py-2 border border-border rounded-md bg-background text-sm"
              value={defaultTemplatePath}
              onChange={async (e) => {
                const val = e.target.value
                setDefaultTemplatePath(val)
                // Persist immediately
                if (currentProject) {
                  try {
                    await projectsApi.updateTasksSettings(currentProject.id, {
                      columns: taskColumns,
                      defaultColumnId,
                      completedColumnId,
                      defaultTemplatePath: val || undefined,
                    })
                  } catch (err) {
                    console.error('Failed to save default template', err)
                  }
                }
              }}
            >
              <option value="">(none)</option>
              {templates.map(t => (
                <option key={t.path} value={t.path}>{t.metadata?.title || t.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <h3 className="text-md font-medium text-foreground mb-2">Templates</h3>
          <p className="text-sm text-muted-foreground mb-3">Copy current global templates (README, node, compiler) into this project again.</p>
          <button onClick={reseedTemplatesIntoProject} className="px-3 py-2 border rounded text-sm flex items-center gap-2" disabled={reseeding}>
            <RefreshCcw className="w-4 h-4"/> {reseeding ? 'Re-seeding…' : 'Re-seed templates into this project'}
          </button>
        </div>

        {/* Divider for compiler-related settings */}
        <div className="border-t border-border my-6" />

        <div>
          <h3 className="text-md font-medium text-foreground mb-4">Compiler Default Templates</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Set default templates for each export format. These will be used when no template is selected during export.
          </p>

          <div className="space-y-4">
            {supportedFormats.map((format) => (
              <div key={format.id} className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div>
                  <label className="text-sm font-medium text-foreground">
                    {format.name}
                  </label>
                  <p className="text-xs text-muted-foreground mt-1">
                    Default template for {format.name} exports
                  </p>
                </div>
                <input
                  type="text"
                  value={compilerSettings.defaultTemplates?.[format.id] || ''}
                  onChange={(e) => handleDefaultTemplateChange(format.id, e.target.value)}
                  placeholder="e.g., templates/compiler/simple.md"
                  className="flex-1 ml-4 px-3 py-2 text-sm border border-border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            ))}
          </div>
        </div>

        {isColumnManagerOpen && (
          <ColumnManager
            columns={taskColumns}
            defaultColumnId={defaultColumnId}
            completedColumnId={completedColumnId}
            onColumnsChange={(cols) => persistTasksSettings(cols, defaultColumnId, completedColumnId)}
            onDefaultChange={(id) => persistTasksSettings(taskColumns, id, completedColumnId)}
            onCompletedChange={(id) => persistTasksSettings(taskColumns, defaultColumnId, id)}
            onClose={() => setIsColumnManagerOpen(false)}
          />
        )}

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Compiler Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
} 