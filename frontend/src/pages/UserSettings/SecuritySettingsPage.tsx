import React from 'react';
import PasskeyManager from '../../components/Passkey/PasskeyManager';

const SecuritySettingsPage: React.FC = () => {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-6 text-foreground">Security Settings</h1>
      
      <div className="space-y-8">
        {/* Passkey Management Section */}
        <section>
          <h2 className="text-xl font-medium mb-4 text-foreground">Passkeys (WebAuthn)</h2>
          <p className="mb-4 text-muted-foreground">
            Manage your passkeys for passwordless login. Passkeys are a more secure and easier way to sign in.
          </p>
          <PasskeyManager />
        </section>
        
        {/* Other security settings can be added here, e.g., Two-Factor Authentication, Account Activity */}
        {/* 
        <section>
          <h2 className="text-xl font-medium mb-4 text-foreground">Two-Factor Authentication (2FA)</h2>
          <p className="mb-4 text-muted-foreground">
            Add an extra layer of security to your account by enabling 2FA.
          </p>
          {/* 2FA setup component would go here * /}
        </section>
        */}
      </div>
    </div>
  );
};

export default SecuritySettingsPage; 