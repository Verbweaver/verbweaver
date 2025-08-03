import React, { useState, useEffect } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { projectsApi } from '../../api/projects';
import { Button } from '../../components/ui/Button';
import { Save, AlertCircle } from 'lucide-react';

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

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
} 