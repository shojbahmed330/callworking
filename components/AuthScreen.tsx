
import React, { useState, useEffect, useCallback } from 'react';
import { AuthMode } from '../types';
import { firebaseService } from '../services/firebaseService';
import Icon from './Icon';
import { getTtsPrompt } from '../constants';
import { useSettings } from '../contexts/SettingsContext';

interface AuthScreenProps {
  onSetTtsMessage: (message: string) => void;
  lastCommand: string | null;
  onCommandProcessed: () => void;
  initialAuthError?: string;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ 
  onSetTtsMessage, lastCommand, onCommandProcessed, initialAuthError
}) => {
  const [mode, setMode] = useState<AuthMode>(AuthMode.LOGIN);
  
  const [identifier, setIdentifier] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');


  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const { language } = useSettings();

  useEffect(() => {
    if (initialAuthError) {
        setAuthError(initialAuthError);
        onSetTtsMessage(initialAuthError);
    }
  }, [initialAuthError, onSetTtsMessage]);

  useEffect(() => {
    if (!initialAuthError) {
        onSetTtsMessage(getTtsPrompt('login_prompt', language));
    }
    setMode(AuthMode.LOGIN); 
  }, [onSetTtsMessage, initialAuthError, language]);

  const resetState = () => {
    setIdentifier('');
    setFullName('');
    setUsername('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setAuthError('');
  };

  const handleModeChange = (newMode: AuthMode) => {
    resetState();
    setMode(newMode);
    if (newMode === AuthMode.LOGIN) {
      onSetTtsMessage(getTtsPrompt('login_prompt', language));
    } else {
      onSetTtsMessage(getTtsPrompt('signup_fullname', language));
    }
  };
  
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setAuthError('');

    try {
      if (mode === AuthMode.LOGIN) {
        await firebaseService.signInWithEmail(identifier, password);
      } else { // Signup
        if (password !== confirmPassword) {
            throw new Error(getTtsPrompt('signup_password_mismatch', language));
        }
        const isTaken = await firebaseService.isUsernameTaken(username);
        if(isTaken) {
            throw new Error(getTtsPrompt('signup_username_invalid', language));
        }
        await firebaseService.signUpWithEmail(email, password, fullName, username);
      }
    } catch (error: any) {
        const errorMessage = error.message || "An unexpected error occurred.";
        setAuthError(errorMessage);
        onSetTtsMessage(errorMessage);
    } finally {
        setIsLoading(false);
    }
  };

  const handleVoiceCommand = useCallback(async (text: string) => {
      // This function can be expanded later if needed, but for now, form is primary
      onSetTtsMessage("Please use the form to log in or sign up.");
  }, [onSetTtsMessage]);

  useEffect(() => {
    if (!lastCommand) return;
    
    const isLoginCommand = ['log in', 'login', 'login koro'].includes(lastCommand.toLowerCase());
    const isSignupCommand = ['sign up', 'signup', 'register'].includes(lastCommand.toLowerCase());

    if (isLoginCommand) {
        handleModeChange(AuthMode.LOGIN);
    } else if (isSignupCommand) {
        handleModeChange(AuthMode.SIGNUP_FULLNAME); // Use a single mode for the signup form
    } else {
        handleVoiceCommand(lastCommand);
    }
    onCommandProcessed();
  }, [lastCommand, onCommandProcessed, language]);
  
  return (
    <div className="flex flex-col items-center justify-center min-h-full text-center text-lime-400 p-4 sm:p-8 bg-black">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(57,255,20,0.3),rgba(255,255,255,0))] opacity-20 pointer-events-none"></div>

      <div className="w-full max-w-sm">
        <Icon name="logo" className="w-20 h-20 text-lime-400 mb-4 mx-auto text-shadow-lg" />
        <h1 className="text-4xl font-bold mb-2 text-shadow-lg">VoiceBook</h1>
        <p className="text-lime-400/80 mb-8">{mode === AuthMode.LOGIN ? 'Welcome Back' : 'Create an Account'}</p>
      
        <form onSubmit={handleFormSubmit} className="space-y-4 text-left">
          {mode !== AuthMode.LOGIN && (
            <>
              <div>
                <label className="text-sm font-medium text-lime-300/80">Full Name</label>
                <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 mt-1 focus:ring-lime-500 focus:border-lime-500"/>
              </div>
              <div>
                <label className="text-sm font-medium text-lime-300/80">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} required className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 mt-1 focus:ring-lime-500 focus:border-lime-500"/>
              </div>
            </>
          )}

          <div>
             <label className="text-sm font-medium text-lime-300/80">{mode === AuthMode.LOGIN ? 'Email or Username' : 'Email'}</label>
             <input type="text" value={mode === AuthMode.LOGIN ? identifier : email} onChange={e => mode === AuthMode.LOGIN ? setIdentifier(e.target.value) : setEmail(e.target.value)} required className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 mt-1 focus:ring-lime-500 focus:border-lime-500"/>
          </div>

          <div>
             <label className="text-sm font-medium text-lime-300/80">Password</label>
             <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 mt-1 focus:ring-lime-500 focus:border-lime-500"/>
          </div>
          
           {mode !== AuthMode.LOGIN && (
             <div>
                <label className="text-sm font-medium text-lime-300/80">Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2.5 mt-1 focus:ring-lime-500 focus:border-lime-500"/>
             </div>
           )}

          {authError && <p className="text-red-400 text-sm text-center">{authError}</p>}
          
          <button type="submit" disabled={isLoading} className="w-full bg-lime-600 hover:bg-lime-500 text-black font-bold py-3 rounded-lg transition-colors disabled:bg-slate-600">
            {isLoading ? 'Processing...' : (mode === AuthMode.LOGIN ? 'Log In' : 'Sign Up')}
          </button>
        </form>

        <div className="mt-6 text-center">
            <button onClick={() => handleModeChange(mode === AuthMode.LOGIN ? AuthMode.SIGNUP_FULLNAME : AuthMode.LOGIN)} className="text-sm text-lime-400/80 hover:text-lime-300 hover:underline">
                {mode === AuthMode.LOGIN ? "Don't have an account? Sign Up" : "Already have an account? Log In"}
            </button>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
