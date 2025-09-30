import React, { useState, useEffect } from 'react';
import { AlertTriangle, Download, ExternalLink, CheckCircle, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';

interface Dependency {
  name: string;
  available: boolean;
  version?: string;
  installUrl?: string;
  installInstructions?: string;
  source?: 'bundled' | 'system';
}

export default function DependenciesSettingsPage() {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const isElectron = typeof window !== 'undefined' && (window as any).electronAPI !== undefined;

  useEffect(() => {
    if (isElectron) {
      checkDependencies();
    } else {
      setLoading(false);
    }
  }, [isElectron]);

  const checkDependencies = async () => {
    try {
      setChecking(true);
      const deps = await (window as any).electronAPI.checkDependencies();
      setDependencies(deps);
    } catch (error) {
      console.error('Failed to check dependencies:', error);
    } finally {
      setLoading(false);
      setChecking(false);
    }
  };

  const handleOpenInstallUrl = async (url: string) => {
    try {
      if (isElectron) {
        await (window as any).electronAPI.openInstallUrl(url);
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      console.error('Failed to open install URL:', error);
    }
  };

  if (!isElectron) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dependencies</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Dependency checking is only available in the desktop application.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dependencies</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Checking system dependencies...
          </p>
        </div>
      </div>
    );
  }

  const missingDependencies = dependencies.filter(dep => !dep.available);
  const availableDependencies = dependencies.filter(dep => dep.available);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Dependencies</h2>
          <p className="text-sm text-muted-foreground mt-1">
            System dependencies required for document export and preview features.
          </p>
        </div>
        <Button
          onClick={checkDependencies}
          disabled={checking}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
          {checking ? 'Checking...' : 'Check Again'}
        </Button>
      </div>

      {/* Missing Dependencies */}
      {missingDependencies.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-md font-medium text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Missing Dependencies ({missingDependencies.length})
          </h3>
          <div className="space-y-3">
            {missingDependencies.map((dep) => (
              <div
                key={dep.name}
                className="p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span className="font-medium">{dep.name}</span>
                    {dep.available && dep.source === 'bundled' && (
                      <span className="ml-2 text-xs text-muted-foreground">(using bundled)</span>
                    )}
                  </div>
                </div>
                
                {dep.installInstructions && (
                  <div className="mb-3">
                    <p className="text-sm text-muted-foreground mb-2">
                      {dep.installInstructions}
                    </p>
                    {dep.installUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenInstallUrl(dep.installUrl!)}
                        className="flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Install {dep.name}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Available Dependencies */}
      {availableDependencies.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-md font-medium text-foreground flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-500" />
            Available Dependencies ({availableDependencies.length})
          </h3>
          <div className="space-y-3">
            {availableDependencies.map((dep) => (
              <div
                key={dep.name}
                className="p-4 rounded-lg border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium">{dep.name}</span>
                  </div>
                  {dep.version && (
                    <span className="text-sm text-muted-foreground">
                      v{dep.version}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Dependencies Found */}
      {dependencies.length === 0 && (
        <div className="text-center py-8">
          <AlertTriangle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No dependencies found to check.</p>
        </div>
      )}

      {/* Information Section */}
      <div className="mt-8 p-4 rounded-lg border border-border bg-muted/50">
        <h4 className="font-medium mb-2">About Dependencies</h4>
        <div className="text-sm text-muted-foreground space-y-2">
          <p>
            <strong>Pandoc</strong> is required for document export features including PDF, Word, EPUB, and HTML generation.
            It also powers the live preview functionality in the editor.
          </p>
          <p>
            <strong>LaTeX (xelatex/pdflatex)</strong> is required for PDF export. On Windows with MiKTeX, open MiKTeX Console → Settings → General and set <em>Install missing packages on-the-fly</em> to <strong>Always</strong> to avoid missing package errors (e.g., <code>rerunfilecheck.sty</code>).
          </p>
          <p>
            If you're having trouble installing Pandoc, you can:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>Visit the official installation guide at <a href="https://pandoc.org/installing.html" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">pandoc.org</a></li>
            <li>Use your system's package manager (winget, brew, apt, etc.)</li>
            <li>Download the installer directly from the Pandoc website</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
