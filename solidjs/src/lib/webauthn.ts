// WebAuthn (passkey) utility functions

// Check if the device supports WebAuthn
export const isWebAuthnSupported = (): boolean => {
  return window.PublicKeyCredential !== undefined &&
         typeof window.PublicKeyCredential === 'function';
};

// Check if the device supports biometric authentication
export const isBiometricSupported = async (): Promise<boolean> => {
  if (!isWebAuthnSupported()) return false;
  
  try {
    const result = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    return result;
  } catch (error) {
    console.error('Error checking biometric support:', error);
    return false;
  }
};

// Create a new passkey during login
export const createPasskey = async (userId: string, username: string): Promise<boolean> => {
  try {
    // Convert user ID to ArrayBuffer
    const userIdBuffer = new TextEncoder().encode(userId);
    
    // Challenge should be random and from server in production
    const challenge = window.crypto.getRandomValues(new Uint8Array(32));
    
    // Prepare credential creation options
    const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
      challenge,
      rp: {
        name: 'Your App Name',
        id: window.location.hostname
      },
      user: {
        id: userIdBuffer,
        name: username,
        displayName: username
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 }, // ES256
        { type: 'public-key', alg: -257 } // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        requireResidentKey: true
      },
      timeout: 60000,
      attestation: 'none'
    };
    
    // Create credential
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    });
    
    // In a real app, you would send this credential to your backend
    console.log('Credential created:', credential);
    
    // Save creation state to local storage
    localStorage.setItem('passkey_created', 'true');
    
    return true;
  } catch (error) {
    console.error('Error creating passkey:', error);
    return false;
  }
};

// Verify passkey with fingerprint
export const verifyWithPasskey = async (): Promise<boolean> => {
  try {
    // Challenge should come from server in production
    const challenge = window.crypto.getRandomValues(new Uint8Array(32));
    
    const publicKeyCredentialRequestOptions: PublicKeyCredentialRequestOptions = {
      challenge,
      timeout: 60000,
      userVerification: 'required',
      rpId: window.location.hostname
    };
    
    // Request credential
    const credential = await navigator.credentials.get({
      publicKey: publicKeyCredentialRequestOptions
    });
    
    // In a real app, you would verify this credential on your backend
    console.log('Authentication successful:', credential);
    return true;
  } catch (error) {
    console.error('Error verifying passkey:', error);
    return false;
  }
};