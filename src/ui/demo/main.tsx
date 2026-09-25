import React from 'react';
import { createRoot } from 'react-dom/client';
import { UiKitGallery } from './UiKitGallery';
import './gallery.css';

createRoot(document.getElementById('root')!).render(<React.StrictMode><UiKitGallery /></React.StrictMode>);
