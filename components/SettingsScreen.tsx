
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Icon from './Icon';
// FIX: Corrected import path
import { User, ScrollState } from '../types';
// FIX: Corrected import path
import { geminiService } from '../services/geminiService';
// FIX: Corrected import path
import { getTtsPrompt } from '../constants';
// FIX: Corrected import path
import { useSettings } from '../contexts/SettingsContext';
// FIX: Corrected import path
import { t } from '../i18n';

interface SettingsScreenProps {
  currentUser: User;
  onUpdateSettings: (settings: Partial<User>) => Promise<void>;
  onUnblockUser: (user: User) => void;
  onDeactivateAccount: () => void;
  lastCommand: string | null;
  onSetTtsMessage: (message: string) => void;
  scrollState: ScrollState;
  onCommandProcessed: () => void;
