import React from 'react';
import {createRoot} from 'react-dom/client';
import {MobileApp} from '../components/mobile/MobileApp';
import '../components/mobile/mobile.css';
createRoot(document.getElementById('root')!).render(<React.StrictMode><MobileApp /></React.StrictMode>);
