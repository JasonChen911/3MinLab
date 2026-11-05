import {applyPreferences,loadPreferences} from './settings/preferences';
applyPreferences(loadPreferences());
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './style.css';
import './template-cards.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
import './refinements.css';
import './visual-system.css';

import './settings/settings.css';
