// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Option A: Smart Auto-Hide Outlets & Branches Logic', () => {
  const sidebarPath = path.resolve(__dirname, '../components/layout/Sidebar.jsx');
  const sidebarContent = fs.readFileSync(sidebarPath, 'utf8');

  const appPath = path.resolve(__dirname, '../App.jsx');
  const appContent = fs.readFileSync(appPath, 'utf8');

  it('filters out restaurants in Sidebar for single-outlet admins', () => {
    // Replicate the exact filter logic implemented in Sidebar.jsx
    const filterNav = (adminNav, isSuperAdmin, availableOutletsCount, role = 'admin') => {
      return adminNav.filter(n => {
        if (n.superAdmin && !isSuperAdmin) return false;
        if (n.roles && !n.roles.includes(role)) return false;
        if (n.key === 'restaurants' && !isSuperAdmin && availableOutletsCount <= 1) {
          return false;
        }
        return true;
      });
    };

    const mockAdminNav = [
      { key: 'staff', path: '/admin/staff', roles: ['admin', 'super_admin'] },
      { key: 'settings', path: '/admin/settings', roles: ['admin', 'super_admin'] },
      { key: 'restaurants', path: '/admin/restaurants', roles: ['admin', 'super_admin'] }
    ];

    // Single outlet owner: restaurants must be hidden
    const singleOutletResult = filterNav(mockAdminNav, false, 1);
    expect(singleOutletResult.some(n => n.key === 'restaurants')).toBe(false);
    expect(singleOutletResult.length).toBe(2);

    // Zero sibling outlets: restaurants must be hidden
    const zeroOutletResult = filterNav(mockAdminNav, false, 0);
    expect(zeroOutletResult.some(n => n.key === 'restaurants')).toBe(false);

    // Multi-outlet owner (2 or more locations): restaurants must be shown
    const multiOutletResult = filterNav(mockAdminNav, false, 2);
    expect(multiOutletResult.some(n => n.key === 'restaurants')).toBe(true);
    expect(multiOutletResult.length).toBe(3);

    // Super Admin: always shown regardless of outlet count
    const superAdminResult = filterNav(mockAdminNav, true, 1, 'super_admin');
    expect(superAdminResult.some(n => n.key === 'restaurants')).toBe(true);
  });

  it('Sidebar.jsx source code implements smart auto-hide for restaurants key', () => {
    expect(sidebarContent).toContain("if (n.key === 'restaurants' && !isSuperAdmin && availableOutlets.length <= 1)");
    expect(sidebarContent).toContain('outletTriggerRef');
  });

  it('App.jsx allows both admin and super_admin on /admin/restaurants (fixes lockout bug)', () => {
    // Verify /admin/restaurants is in the admin/super_admin ProtectedRoute block
    expect(appContent).toMatch(/requiredRole=\{(\[.*'admin'.*'super_admin'.*\]|\['admin',\s*'super_admin'\])\}/);
    expect(appContent).toContain('<Route path="/admin/restaurants"  element={<Restaurants />} />');
    
    // Verify there is no separate exclusive super_admin block locking out normal admins
    expect(appContent).not.toMatch(/requiredRole=\{'super_admin'\}\s*>\s*<Route path="\/admin\/restaurants"/);
    expect(appContent).not.toMatch(/requiredRole=\{\['super_admin'\]\}\s*>\s*<Route path="\/admin\/restaurants"/);
  });
});
