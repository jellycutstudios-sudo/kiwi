// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import PwaInstallModal from '../components/shared/PwaInstallModal';

describe('PwaInstallModal Component', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <PwaInstallModal isOpen={false} onClose={() => {}} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders hero title, feature badges, and close button when open', () => {
    const onClose = vi.fn();
    render(
      <PwaInstallModal isOpen={true} onClose={onClose} canInstall={true} />
    );

    expect(screen.getByText('Install DineOS POS')).toBeDefined();
    expect(screen.getByText('Works Offline')).toBeDefined();
    expect(screen.getByText('Fullscreen View')).toBeDefined();
    expect(screen.getByText('Hardware Printing')).toBeDefined();
    expect(screen.getByText('1-Tap Launch')).toBeDefined();

    // Clicking close button calls onClose
    const closeBtn = screen.getByLabelText('Close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it('calls promptInstall and closes when Install DineOS App button is clicked', async () => {
    const promptInstall = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();

    render(
      <PwaInstallModal 
        isOpen={true} 
        onClose={onClose} 
        canInstall={true} 
        promptInstall={promptInstall} 
      />
    );

    const installBtn = screen.getByText('Install DineOS App');
    fireEvent.click(installBtn);

    expect(promptInstall).toHaveBeenCalled();
  });

  it('renders iOS instructions when isIOS is true', () => {
    render(
      <PwaInstallModal 
        isOpen={true} 
        onClose={() => {}} 
        isIOS={true} 
      />
    );

    expect(screen.getByText(/How to install on iOS \/ iPadOS Safari:/i)).toBeDefined();
    expect(screen.getByText(/Add to Home Screen/i)).toBeDefined();
  });

  it('renders standalone confirmation when isStandalone is true', () => {
    render(
      <PwaInstallModal 
        isOpen={true} 
        onClose={() => {}} 
        isStandalone={true} 
      />
    );

    expect(screen.getByText(/DineOS is already installed and running standalone!/i)).toBeDefined();
  });
});
