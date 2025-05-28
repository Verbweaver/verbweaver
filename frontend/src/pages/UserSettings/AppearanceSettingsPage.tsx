import React from 'react';
import { useThemeStore, Theme } from '../../store/themeStore'; // Adjusted path

const AppearanceSettingsPage: React.FC = () => {
  const { theme, setTheme } = useThemeStore();

  return (
    <div className="bg-card p-6 rounded-lg shadow-sm border">
      <h2 className="text-xl font-semibold mb-4 text-foreground">Appearance</h2>
      <div className="space-y-4">
        <div>
          <label htmlFor="theme-select" className="block text-sm font-medium mb-2 text-foreground">Theme</label>
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => setTheme(e.target.value as Theme)}
            className="w-full p-2 border rounded-md bg-background text-foreground border-border focus:ring-primary focus:border-primary"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
            <option value="high-contrast">High Contrast</option>
            <option value="colorblind">Colorblind Friendly</option>
          </select>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a color theme for the interface. The colorblind theme uses colors optimized for deuteranopia.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AppearanceSettingsPage; 