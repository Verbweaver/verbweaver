import React, { useState, useEffect } from 'react';
import { AlertTriangle, Download, ExternalLink, CheckCircle, X } from 'lucide-react';
import { Button } from './ui/Button';

interface Dependency {
  name: string;
  available: boolean;
  version?: string;
  installUrl?: string;
  installInstructions?: string;
<<<<<<< HEAD
=======
  source?: 'bundled' | 'system';
>>>>>>> release-testing
}

interface DependencyCheckerProps {
  onComplete?: () => void;
  showOnStartup?: boolean;
}

export default function DependencyChecker({ onComplete, showOnStartup = false }: DependencyCheckerProps) {
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [hasMissingDependencies, setHasMissingDependencies] = useState(false);

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
      setLoading(true);
      const deps = await (window as any).electronAPI.checkDependencies();
      setDependencies(deps);
<<<<<<< HEAD
      
             const missing = deps.some((dep: Dependency) => !dep.available);
=======
      // If a dependency is available via bundled source, we do not show startup prompt
      const missing = deps.some((dep: Dependency) => !dep.available);
>>>>>>> release-testing
      setHasMissingDependencies(missing);
      
      // Show dialog if there are missing dependencies and we should show on startup
      if (missing && showOnStartup) {
        setShowDialog(true);
      }
    } catch (error) {
      console.error('Failed to check dependencies:', error);
    } finally {
      setLoading(false);
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

  const handleRetry = () => {
    checkDependencies();
  };

  const handleSkip = () => {
    setShowDialog(false);
    onComplete?.();
  };

  if (!isElectron) {
    return null; // Only show in desktop app
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-sm text-muted-foreground">Checking dependencies...</div>
      </div>
    );
  }

  if (!hasMissingDependencies) {
    return null; // All dependencies are available
  }

  return (
    <>
      {/* Floating indicator for missing dependencies */}
      {!showDialog && (
        <div className="fixed bottom-4 right-4 z-50">
          <Button
            onClick={() => setShowDialog(true)}
            variant="destructive"
            size="sm"
            className="flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4" />
            Missing Dependencies
          </Button>
        </div>
      )}

      {/* Dependency dialog */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border border-border rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Missing Dependencies
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="h-8 w-8 p-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Some features require additional software to be installed on your system.
            </p>

            <div className="space-y-3 mb-6">
              {dependencies.map((dep) => (
                <div
                  key={dep.name}
                  className={`p-3 rounded-lg border ${
                    dep.available
                      ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
                      : 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {dep.available ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-600" />
                      )}
                      <span className="font-medium">{dep.name}</span>
<<<<<<< HEAD
=======
                      {dep.available && dep.source === 'bundled' && (
                        <span className="ml-2 text-xs text-muted-foreground">(using bundled)</span>
                      )}
>>>>>>> release-testing
                    </div>
                    {dep.version && (
                      <span className="text-xs text-muted-foreground">
                        v{dep.version}
                      </span>
                    )}
                  </div>
                  
                  {!dep.available && dep.installInstructions && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground mb-2">
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

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={handleSkip}>
                Skip for Now
              </Button>
              <Button onClick={handleRetry}>
                <Download className="w-4 h-4 mr-2" />
                Check Again
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
