
import React, { useState, useEffect } from 'react';
// FIX: Corrected import path for UserApp.
import UserApp from './UserApp';
import AdminPortal from './components/AdminPortal';
import { SettingsProvider } from './contexts/SettingsContext';


const App: React.FC = () => {
    const [isAdminView, setIsAdminView] = useState(window.location.hash === '#/adminpannel');

    useEffect(() => {
        const handleHashChange = () => {
            setIsAdminView(window.location.hash === '#/adminpannel');
        };

        window.addEventListener('hashchange', handleHashChange);
        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    if (isAdminView) {
        return <AdminPortal />;
    }

    return (
      <SettingsProvider>
        <UserApp />
      </SettingsProvider>
    );
};

export default App;
