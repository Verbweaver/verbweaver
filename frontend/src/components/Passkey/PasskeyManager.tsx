import React, { useState, useEffect, useCallback } from 'react';
import { useAuthStore, PasskeyDevice } from '../../services/auth'; // Corrected path
import { Button } from '../ui/Button'; // Assuming Button is in components/ui/
import { Trash2, PlusCircle, ShieldCheck, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';

// Helper functions for ArrayBuffer to Base64URL conversion (standard for WebAuthn)
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

// Type for the PublicKeyCredential that navigator.credentials.create() returns
// after we convert ArrayBuffers to base64url strings for sending to the backend.
interface PublicKeyCredentialWithBase64Url {
  id: string; // Base64URL string
  rawId: string; // Base64URL string
  type: 'public-key';
  response: {
    clientDataJSON: string; // Base64URL string
    attestationObject: string; // Base64URL string
    transports?: string[];
  };
  // clientExtensionResults: AuthenticationExtensionsClientOutputs; // Usually not sent to RP for registration verification
}

const PasskeyManager: React.FC = () => {
  const {
    user,
    getPasskeyRegistrationOptions,
    verifyPasskeyRegistration,
    listPasskeyDevices,
    deletePasskeyDevice,
    isLoading,
    error,
    clearError,
  } = useAuthStore();

  const [passkeys, setPasskeys] = useState<PasskeyDevice[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);

  const fetchPasskeys = useCallback(async () => {
    if (!user) return;
    try {
      clearError();
      const devices = await listPasskeyDevices();
      setPasskeys(devices);
    } catch (e: any) {
      toast.error(e.message || 'Failed to load passkeys.');
      // Error is also set in Zustand store, could display it from there too
    }
  }, [user, listPasskeyDevices, clearError]);

  useEffect(() => {
    fetchPasskeys();
  }, [fetchPasskeys]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError(); // Clear error after displaying
    }
  }, [error, clearError]);

  const handleRegisterPasskey = async () => {
    if (!user || !user.email) {
      toast.error('User email is not available. Cannot register passkey.');
      return;
    }

    setIsRegistering(true);
    clearError();
    let registrationOptions;
    try {
      // Use user.name as displayName if available, otherwise email part
      const displayName = user.name || user.email.split('@')[0];
      registrationOptions = await getPasskeyRegistrationOptions(user.email, displayName);
      
      if (!registrationOptions) throw new Error('Failed to get registration options from server.');

    } catch (e: any) {
      toast.error(`Registration options error: ${e.message || 'Unknown error'}`);
      setIsRegistering(false);
      return;
    }

    try {
      // Convert challenge and user.id from base64url to ArrayBuffer for navigator.credentials.create()
      // The `py_webauthn` library's `generate_registration_options` will have user.id as bytes (UTF-8 string of user DB ID)
      // and challenge as bytes. It serializes them to base64url if they are part of the options sent to the client.
      // The options object from the backend should be directly usable if it follows WebAuthn spec for PublicKeyCredentialCreationOptions.
      // Specifically, `challenge` and `user.id` within the options need to be ArrayBuffers.
      // Our backend sends `options_dict = options.to_dict()`, so we need to convert relevant fields back.

      const creationOptions = {
        ...registrationOptions,
        challenge: Uint8Array.from(atob(registrationOptions.challenge.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        user: {
          ...registrationOptions.user,
          id: Uint8Array.from(atob(registrationOptions.user.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        },
        // Ensure pubKeyCredParams are correctly formatted if they were strings
        pubKeyCredParams: registrationOptions.pubKeyCredParams.map((param: any) => ({ ...param })),
        // Ensure excludeCredentials IDs are ArrayBuffers if present
        excludeCredentials: registrationOptions.excludeCredentials?.map((cred: any) => ({
          ...cred,
          id: Uint8Array.from(atob(cred.id.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)),
        })) || [],
      };

      const credential = await navigator.credentials.create({ publicKey: creationOptions }) as PublicKeyCredential | null;

      if (!credential) {
        toast.error('Passkey registration was cancelled or failed.');
        setIsRegistering(false);
        return;
      }

      // Convert ArrayBuffers to Base64URL strings before sending to backend
      const verificationData: PublicKeyCredentialWithBase64Url = {
        id: arrayBufferToBase64Url(credential.rawId), // Use rawId for the id field for verification
        rawId: arrayBufferToBase64Url(credential.rawId),
        type: credential.type as 'public-key',
        response: {
          clientDataJSON: arrayBufferToBase64Url(credential.response.clientDataJSON),
          attestationObject: arrayBufferToBase64Url((credential.response as AuthenticatorAttestationResponse).attestationObject),
          transports: (credential.response as AuthenticatorAttestationResponse).getTransports?.(),
        },
      };
      
      await verifyPasskeyRegistration(verificationData as any); // Cast to any to match PublicKeyCredentialJSON if slightly different
      toast.success('Passkey registered successfully!');
      fetchPasskeys(); // Refresh the list
    } catch (e: any) {
      console.error('Passkey registration process error:', e);
      let errorMessage = 'Passkey registration failed.';
      if (e.name === 'NotAllowedError') {
        errorMessage = 'Passkey operation was cancelled or not allowed.';
      } else if (e.message) {
        errorMessage = e.message;
      }
      toast.error(errorMessage);
    }
    setIsRegistering(false);
  };

  const handleDeletePasskey = async (passkeyId: string) => {
    if (!confirm('Are you sure you want to delete this passkey?')) return;
    try {
      clearError();
      await deletePasskeyDevice(passkeyId);
      toast.success('Passkey deleted successfully!');
      fetchPasskeys(); // Refresh the list
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete passkey.');
    }
  };

  if (isLoading && passkeys.length === 0 && !isRegistering) {
    return <p className="text-muted-foreground">Loading passkeys...</p>;
  }

  return (
    <div className="bg-card p-6 rounded-lg shadow">
      {passkeys.length === 0 && !isLoading && (
        <div className="text-center py-4">
          <ShieldAlert className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground mb-4">You have no passkeys registered.</p>
        </div>
      )}
      {passkeys.length > 0 && (
        <ul className="space-y-3 mb-6">
          {passkeys.map((pk) => (
            <li key={pk.id} className="flex items-center justify-between p-3 bg-background rounded-md">
              <div className="flex items-center">
                <ShieldCheck className="h-5 w-5 text-green-500 mr-3" />
                <div>
                  <span className="font-medium text-foreground">{pk.device_name || 'Unnamed Device'}</span>
                  <p className="text-xs text-muted-foreground">
                    Added: {new Date(pk.created_at).toLocaleDateString()} | Last used: {pk.last_used_at ? new Date(pk.last_used_at).toLocaleDateString() : 'Never'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate max-w-xs">ID: {pk.credential_id_display}</p>
                </div>
              </div>
              <Button variant="destructiveOutline" size="sm" onClick={() => handleDeletePasskey(pk.id)} aria-label="Delete passkey">
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Button 
        onClick={handleRegisterPasskey} 
        disabled={isRegistering || isLoading}
        className="w-full md:w-auto"
      >
        <PlusCircle className="mr-2 h-4 w-4" />
        {isRegistering ? 'Registering...' : 'Add New Passkey'}
      </Button>
      {isLoading && isRegistering && <p className="text-sm text-muted-foreground mt-2">Communicating with authenticator and server...</p>}
    </div>
  );
};

export default PasskeyManager; 